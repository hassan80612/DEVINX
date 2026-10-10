import test from 'node:test';
import assert from 'node:assert/strict';
import {assessIndependentSignalHistory,ENTRY_QUALITY_EPOCH,wilsonInterval} from '../sentinel-trading-lab/agent/src/core/independent-signal-quality.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {EntryResearch} from '../sentinel-trading-lab/agent/src/core/entry-research.mjs';

const t=Date.UTC(2026,9,10,12);
const base={kind:'operational_v3',entryQualityEpoch:ENTRY_QUALITY_EPOCH,qualityProfile:'smart_confluence',
 provider:'iq_option',asset:'EUR/USD OTC',durationMs:30000,settleDurationMs:30000,
 side:'BUY',settlementQuality:'exact'};
const observations=(wins,losses,extra={})=>[
  ...Array.from({length:wins},(_,i)=>({...base,...extra,won:true,createdAt:t-i*36000})),
  ...Array.from({length:losses},(_,i)=>({...base,...extra,won:false,createdAt:t-(i+wins)*36000}))
];
const assess=(outcomes,extra={})=>assessIndependentSignalHistory({
 outcomes,asset:'EUR/USD OTC',provider:'iq_option',durationMs:30000,side:'CALL',payout:.82,...extra
});

test('forward quality: an empty, unproven history cannot claim measured accuracy',()=>{
 const q=assess([]);assert.equal(q.blocked,false);assert.equal(q.samples,0);
 assert.equal(q.winRate,null);assert.equal(q.probabilityValidated,false);
 assert.equal(q.status,'collecting-forward-evidence');
});
test('forward quality: no blocking on a small losing streak',()=>{
 const q=assess(observations(1,9));assert.equal(q.blocked,false);
 assert.equal(q.samples,10);
});
test('forward quality: statistically persistent losing side stops new entries',()=>{
 const q=assess(observations(15,65));
 assert.equal(q.samples,80);assert.equal(q.blocked,true);
 assert.equal(q.status,'historically-underperforming');
 assert.ok(q.upper95 < q.economicBreakEven);
});
test('forward quality: good sample is not rejected and interval is finite',()=>{
 const q=assess(observations(65,15));assert.equal(q.blocked,false);
 assert.ok(q.lower95>0&&q.upper95<1);
 assert.deepEqual(wilsonInterval(0,0),{lower:0,upper:1});
});
test('forward quality: independent side, provider, asset, duration and release epoch never mix',()=>{
 const wrong=[
 ...observations(0,80,{side:'SELL'}),
 ...observations(0,80,{qualityProfile:'different'}),
 ...observations(0,80,{provider:'exnova'}),
 ...observations(0,80,{asset:'GOLD'}),
 ...observations(0,80,{settleDurationMs:60000}),
 ...observations(0,80,{entryQualityEpoch:'old-model'}),
 ...observations(0,80,{settlementQuality:'approx'}),
 ...observations(0,80,{kind:'horizon_decision_v13_3'})
 ];
 const q=assess([...wrong,...observations(3,1)]);
 assert.equal(q.samples,4);assert.equal(q.blocked,false);
});
test('independent operational candidate is blocked by forward loss evidence',()=>{
 const r=new DemoTradingRuntime();
 r.settings.asset='EUR/USD OTC';
 r.settings.forecastHorizonSeconds=120;
 r.settings.orderDurationMs=30000;
 r.settings.futureDisplayThreshold=70;
 r.settings.risk.minConfidence=55;
 r.signalValidation.outcomes=observations(15,65);
 const quotes=[
 {ts:t-2400,price:100.08},{ts:t-600,price:100.012},
 {ts:t-450,price:100},{ts:t-300,price:100.014},
 {ts:t-150,price:100.021},{ts:t,price:100.023}
 ];
 const snap={provider:'iq_option',asset:'EUR/USD OTC',price:quotes.at(-1).price,
   quoteTs:t,quoteHistory:quotes,payout:.82};
 const a={metrics:{
   micro:{delta5:-.02,delta15:-.03,delta2:.005,expected5:.06,expected30:.12},
   shortModel:{ready:true,sr:{support:100,resistance:105},range:.1,
     callScore:80,putScore:20,reversalCallScore:70,reversalPutScore:0,
     callRoomOk:true,putRoomOk:false}
 },entryPlanner:{horizons:{}}};
 const signal=r._operationalSignalState(a,snap,t);
 assert.equal(signal.actionable,false);
 assert.equal(signal.entryAnalyst.candidates[0].blockedBy,'empirical-history');
 assert.equal(signal.entryAnalyst.candidates[0].historicalQuality.blocked,true);
 assert.notEqual(signal.entryAnalyst.signal.state,'ENTRADA');
});
test('independent operational signals save technical confidence without guessed odds',()=>{
 const r=new DemoTradingRuntime();
 r.settings.asset='EUR/USD OTC';r.validationProvider='iq_option';
 r._queueSignalCandidate({kind:'operational_v3',side:'BUY',confidence:85,
   referencePrice:100,asset:'EUR/USD OTC',durationMs:30000,
   strategy:'test',now:t,probability:null});
 const p=r.signalValidation.pending[0];
 assert.equal(p.confidence,85);assert.equal(p.probability,null);
 assert.equal(p.entryQualityEpoch,ENTRY_QUALITY_EPOCH);
});

test('learning can become eligible after forward evidence without pretending 10:2 was achieved',()=>{
 const e=new EntryResearch(),context={provider:'iq_option',asset:'EUR/USD OTC',durationMs:30000,
   kind:'reversal',side:'CALL',regime:'range',combo:'learning',payout:.82};
 const key=e.key(context);
 e.models[key]={bias:.7,weights:[0],updates:120};
 e.outcomes=Array.from({length:120},(_,i)=>({
   id:'p'+i,key,createdAt:t+(i%3)*86400000,won:i<80,
   modelLoss:.1,baselineLoss:.3
 }));
 const p=e.predict(context,[1],.65);
 assert.equal(p.samples,120);
 assert.equal(p.qualified,true,'forward model should not require arbitrary 83% baseline win rate');
 assert.equal(p.targetMet,false,'model eligibility must never claim 10:2 success');
});
test('learned model with statistically poor baseline remains unqualified',()=>{
 const e=new EntryResearch(),context={provider:'iq_option',asset:'EUR/USD OTC',durationMs:30000,
   kind:'reversal',side:'CALL',regime:'range',combo:'learning',payout:.82};
 const key=e.key(context);e.models[key]={bias:.7,weights:[0],updates:120};
 e.outcomes=Array.from({length:120},(_,i)=>({
   id:'q'+i,key,createdAt:t+(i%3)*86400000,won:i<55,
   modelLoss:.1,baselineLoss:.3
 }));
 assert.equal(e.predict(context,[1],.65).qualified,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../src/core/runtime.mjs';
import {parseBrokerExpiry} from '../src/core/expiry-parser.mjs';
import {analyzeMarket} from '../src/core/strategy.mjs';
import {engineCycle} from '../src/core/engine.mjs';

const NOW=new Date(2026,9,5,20,0,0).getTime();
const snapshot=(price=100)=>({price,feedValidated:true,brokerExpirationDurationMs:60000,brokerExpirationRaw:'1 min',brokerExpirationKind:'duration',brokerExpirationConfidence:40,brokerExpirationUpdatedAt:NOW});
const analysis=(extra={})=>({generalConsensus:{side:'CALL',state:'ALINHADO',strength:85,edge:50},entryPlanner:{horizons:{'60':{basis:'rompimento + confirmação',callTrigger:101,putTrigger:99,callInvalidation:98,putInvalidation:102,expectedMove:1,bias:'CALL',outlookReady:true}}},quality:{entryReady:true,entrySide:'BUY'},...extra});

test('30s and 60s candidates use their actual horizon, not a null converted to 10s',()=>{
  const rt=new DemoTradingRuntime();
  for(const durationMs of [30000,60000]){rt._queueSignalCandidate({kind:'confirmed',side:'BUY',confidence:80,referencePrice:100,asset:'TEST',durationMs,strategy:'trend',now:NOW});assert.equal(rt.signalValidation.pending.at(-1).dueAt-NOW,durationMs)}
});
test('a reversal remains a reversal after scenario merging and needs a touch plus reaction',()=>{
  const rt=new DemoTradingRuntime(),a=analysis();const p=a.entryPlanner.horizons['60'];p.basis='reação em suporte/resistência';p.callTrigger=99;
  rt._mergeScenarioConfluence(a,{});assert.equal(p.basis,'reação em suporte/resistência');
  assert.equal(rt._operationalSignalState(a,snapshot(100),NOW).ready,false);
  assert.equal(rt._operationalSignalState(a,snapshot(99),NOW+1000).ready,false);
  assert.equal(rt._operationalSignalState(a,snapshot(99.2),NOW+2000).state,'ENTRADA');
});
test('an unready horizon never releases an entry',()=>{const rt=new DemoTradingRuntime(),a=analysis();a.entryPlanner.horizons['60'].outlookReady=false;assert.equal(rt._operationalSignalState(a,snapshot(102),NOW).ready,false)});
test('invalidated setups have a fixed cooldown rather than an endlessly extended expiry',()=>{
  const rt=new DemoTradingRuntime(),a=analysis();rt._operationalSignalState(a,snapshot(),NOW);rt._operationalSignalState(a,snapshot(97),NOW+1000);const expires=rt.operationalSetup.expiresAt;
  for(let i=2;i<=5;i++){rt._operationalSignalState(a,snapshot(97),NOW+i*1000);assert.equal(rt.operationalSetup.expiresAt,expires)}
  rt._operationalSignalState(a,snapshot(100),NOW+6000);assert.equal(rt.operationalSetup.invalidated,false);
});
test('an entry disappears if its live price trigger is lost',()=>{
  const rt=new DemoTradingRuntime(),a=analysis();assert.equal(rt._operationalSignalState(a,snapshot(102),NOW).ready,true);assert.equal(rt._operationalSignalState(a,snapshot(100),NOW+1000).ready,false);
});
test('the principal signal respects the configured filter',()=>{const rt=new DemoTradingRuntime(),a=analysis();rt.settings.risk.minConfidence=90;assert.equal(rt._operationalSignalState(a,snapshot(102),NOW).ready,false)});
test('a verified absolute expiration stays aligned as its remaining time decreases',()=>{
  const rt=new DemoTradingRuntime(),a=analysis(),s={...snapshot(),brokerExpirationKind:'clock',brokerExpirationRaw:'20:01'};
  assert.equal(rt._operationalSignalState(a,s,NOW).expiration.match,true);
  const updated={...s,brokerExpirationDurationMs:40000,brokerExpirationUpdatedAt:NOW+20000};
  const state=rt._operationalSignalState(a,updated,NOW+20000);assert.equal(state.expiration.match,true);assert.equal(state.expiration.targetAt,NOW+60000);
});
test('an unknown, stale or too-short expiration cannot release an entry',()=>{
  for(const patch of [{brokerExpirationDurationMs:null},{brokerExpirationConfidence:0},{brokerExpirationUpdatedAt:NOW-20000},{brokerExpirationDurationMs:5000}])assert.equal(new DemoTradingRuntime()._operationalSignalState(analysis(),{...snapshot(102),...patch},NOW).ready,false);
});
test('unitless minute selectors, explicit seconds and absolute times parse correctly',()=>{
  assert.equal(parseBrokerExpiry('1','duration',NOW).ms,60000);assert.equal(parseBrokerExpiry('30','duration seconds',NOW).ms,30000);assert.equal(parseBrokerExpiry('1 min','expiration',NOW).ms,60000);
  assert.equal(parseBrokerExpiry('20:01','expiration',NOW).kind,'clock');assert.equal(parseBrokerExpiry('00:30','duration',NOW).ms,30000);assert.equal(parseBrokerExpiry('20:99','expiration',NOW),null);
});
test('old or unclassified settlement samples do not contaminate the new internal diagnostics',()=>{
  const rt=new DemoTradingRuntime();rt.signalValidation.outcomes=[{key:'k',won:true},{key:'k',won:true,settlementQuality:'approx'},{key:'k',won:true,settlementQuality:'exact'}];assert.equal(rt._validationStats('k').samples,1);assert.match(rt._validationKey('operational','TEST',60000,'trend'),/^micro-v5/);
});
test('history never blocks a valid operational signal',()=>{
  const rt=new DemoTradingRuntime();const key=rt._validationKey('operational',rt.settings.asset,60000,rt._strategyComboKey());rt.signalValidation.outcomes=Array.from({length:40},()=>({key,won:false,settlementQuality:'exact'}));assert.equal(rt._operationalSignalState(analysis(),snapshot(102),NOW).ready,true);
});
test('one selected strategy can form a consensus, missing numbers are not treated as zeros',()=>{
  const rt=new DemoTradingRuntime(),a={metrics:{shortModel:{ready:true,callScore:90,putScore:10}}};assert.equal(rt._generalConsensus(a,{confluence:{side:'CALL',callPct:90,putPct:10,activeCount:1}}).side,'CALL');assert.equal(rt._generalConsensus({},{}).strength,0);
});
test('switching asset clears the old analysis and setup',()=>{
  const rt=new DemoTradingRuntime();rt.setExternalMarket({provider:'iq_option',symbol:'OLD',brokerMode:'real',candles:[]});rt.lastResult={analysis:{side:'BUY'}};rt.operationalSetup={key:'OLD'};rt.setExternalMarket({provider:'iq_option',symbol:'NEW',brokerMode:'real',candles:[]});assert.equal(rt.lastResult.analysis.side,'WAIT');assert.equal(rt.operationalSetup,null);
});
test('pending broker orders do not acquire another asset price or an invented payout',()=>{
  const rt=new DemoTradingRuntime();rt.settings.asset='NEW';rt.setExternalMarket({provider:'iq_option',symbol:'NEW',quote:200,candles:[]});rt.pending=[{external:true,orderId:'test',asset:'OLD',side:'BUY',amount:10,referencePrice:100,settleAt:NOW,openedAt:new Date(NOW-60000).toISOString()}];rt._settleDue(NOW+20000);assert.equal(rt.trades[0].status,'unverified');assert.equal(rt.trades[0].won,null);assert.equal(rt.trades[0].pnl,null);
});
test('schedule blocks execution but still computes the current analysis',async()=>{
  const rt=new DemoTradingRuntime();rt.settings.schedule.enabled=false;let placed=false;
  const result=await engineCycle({feed:rt.feed,broker:{placeOrder:async()=>{placed=true}},settings:rt.settings,state:{},now:Date.now()});assert.ok(result.analysis);assert.equal(result.action,'WAIT');assert.equal(placed,false);
});
test('shared indicator preparation gives identical results to independent calculation',()=>{
  const rt=new DemoTradingRuntime(),snap=rt.feed.snapshot(),now=Date.now();const base={...snap,candles:snap.candles,quoteTs:now,now};const primary=analyzeMarket({...base,strategy:'smart_confluence'});for(const strategy of ['trend','support_resistance','mean_reversion']){const full=analyzeMarket({...base,strategy}),shared=analyzeMarket({...base,strategy,preparedMetrics:primary.metrics});assert.equal(shared.side,full.side);assert.equal(shared.confidence,full.confidence);assert.deepEqual(shared.entryPlanner,full.entryPlanner)}
});

test('repeated consensus merging preserves the original horizon side',()=>{
  const rt=new DemoTradingRuntime(),a=analysis();a.entryPlanner.horizons['60'].bias='PUT';rt._mergeScenarioConfluence(a,{});rt._mergeScenarioConfluence(a,{});assert.equal(a.entryPlanner.horizons['60'].rawBias,'PUT');assert.equal(rt._operationalSignalState(a,snapshot(102),NOW).ready,false);
});
test('missing trigger levels are not interpreted as zero',()=>{
  const rt=new DemoTradingRuntime(),a=analysis();a.entryPlanner.horizons['60'].callTrigger=null;assert.equal(rt._operationalSignalState(a,snapshot(102),NOW).ready,false);
});
test('a clock beyond the plausible expiry range is not reinterpreted as a duration',()=>{assert.equal(parseBrokerExpiry('22:01','expiration',NOW),null)});

test('unvalidated broker DEMO controls do not create an internal simulated order',async()=>{
  const rt=new DemoTradingRuntime();rt.settings.mode='demo';rt.stateName='running';rt.setExternalMarket({provider:'iq_option',symbol:'TEST',quote:102,quoteTs:NOW,balance:200,candles:rt.feed.snapshot().candles,feedValidated:true,executionReady:false});
  rt._signalValidationGate=()=>({allowed:true,analysis:{side:'BUY',confidence:85,metrics:{last:102},operationalSignal:{ready:true,side:'CALL',strength:85,expiration:{brokerMs:60000}}}});
  await rt.tick(NOW);assert.equal(rt.broker.orders.length,0);assert.equal(rt.pending.length,0);assert.equal(rt.lastResult.action,'WAIT');
});

test('late quotes keep independently calculated strategy scores and block execution',async()=>{
 const rt=new DemoTradingRuntime(),candles=rt.feed.snapshot().candles,now=Date.now();
 const base={candles,quoteTs:now,now,durationMs:60000,freshnessMs:2500,strategy:'smart_confluence'};const fresh=analyzeMarket(base),late=analyzeMarket({...base,now:now+4800});
 assert.equal(late.feedFresh,false);assert.equal(late.side,'WAIT');assert.equal(late.metrics.rawBuyScore,fresh.metrics.rawBuyScore);assert.equal(late.metrics.rawSellScore,fresh.metrics.rawSellScore);assert.ok(late.confidence>0);
 const result=await engineCycle({feed:{snapshot:()=>({candles,price:candles.at(-1).close,quoteTs:now})},broker:{placeOrder:()=>{throw new Error('late data must not execute')}},settings:rt.settings,state:{},now:now+4800});assert.equal(result.action,'WAIT');assert.ok(result.analysis.metrics.rsi!==undefined);assert.equal(result.analysis.feedFresh,false);
 const a=analysis({feedFresh:false});assert.equal(rt._operationalSignalState(a,snapshot(102),NOW).ready,false);assert.equal(rt._operationalSignalState(a,snapshot(102),NOW).state,'ATUALIZANDO PREÇO');
});
test('an unconfirmed visible chart cannot use another open tab market as current',()=>{
 const rt=new DemoTradingRuntime();rt.setExternalMarket({provider:'iq_option',symbol:'OLD',assetConfirmed:false,quote:102,quoteTs:Date.now(),candles:rt.feed.snapshot().candles,feedValidated:true});assert.equal(rt._marketSnapshot().waitingLive,true);
});

test('English broker duration labels use their displayed units',()=>{assert.equal(parseBrokerExpiry('30 sec','expiration').ms,30000);assert.equal(parseBrokerExpiry('30 seconds','expiration').ms,30000);assert.equal(parseBrokerExpiry('1 minute','expiration').ms,60000)});

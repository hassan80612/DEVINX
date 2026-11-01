import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluateHybridFamilyProof,reviewHybridFamilyProof,usesLegacy207OpportunityAdmission} from '../sentinel-trading-lab/agent/src/core/hybrid-family-proof-213.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const AT=1800000037000,PRICE=1.2;
function sample({reason='confirmed-level-structure-reversal',side='CALL',ms=60000,
 minute=-.0002,againstBar=true,stale=0}={}){
 const sign=side==='CALL'?1:-1,prior=PRICE-sign*minute;
 const q=Array.from({length:61},(_,i)=>({ts:AT-60000+i*1000,
   price:prior+(PRICE-prior)*i/60,receivedAt:AT-60000+i*1000}));
 const candleTo=Math.floor(AT/60000)*60000;
 const barOpen=PRICE+(againstBar?sign*.0004:-sign*.0004);
 const barClose=PRICE;
 const candles=[{from:(candleTo-60000)/1000,to:candleTo/1000,
  open:barOpen,close:barClose,high:Math.max(barOpen,barClose),low:Math.min(barOpen,barClose),
  receivedAt:candleTo}];
 const candidate={ready:true,side,reason,observedAt:AT,entryPrice:PRICE};
 return{candidate,quoteHistory:q,candles,price:PRICE,quoteAt:AT,now:AT+stale,durationMs:ms};
}
test('213: 207 impulse and confirmed structural entry retain the original opportunity policy, fast 212 is unchanged',()=>{
 assert.equal(usesLegacy207OpportunityAdmission({reason:'closed-structure-and-live-impulse'}),true);
 assert.equal(usesLegacy207OpportunityAdmission({reason:'confirmed-level-structure-reversal'}),true);
 for(const reason of ['confirmed-fast-level-reversal','historical-level-breakout','failed-breakout-structure-change',
  'break-retest-continuation','rejection-followthrough-clear-room']){
  assert.equal(usesLegacy207OpportunityAdmission({reason}),false,reason);
 }
 const runtime=read('sentinel-trading-lab/agent/src/core/runtime.mjs');
 // 215: legacy 207 remains unchanged in its core, but repeated physical
 // opportunities are now checked for all eligible 30s/1m signal families.
 assert.ok(runtime.includes('eligible=reviewDistinctOpportunity({'));
 assert.ok(!runtime.includes('if(!usesLegacy207OpportunityAdmission(eligible))'));
 assert.ok(runtime.indexOf('eligible=reviewHybridFamilyProof(')>runtime.indexOf('eligible=reviewDistinctOpportunity('));
 assert.ok(runtime.indexOf('eligible=reviewHybridFamilyProof(')<runtime.indexOf('let next=advanceNowOpportunity('));
});
test('213: 207 analytic core and 212 successful rapid-reversal / level-breakout routes have identical blob SHA',()=>{
 for(const [path,sha] of [
  ['sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs','2ea7af14e969b684665ccbc8804f7afde31ce316'],
  ['sentinel-trading-lab/agent/src/core/entry-family.mjs','fe086df157758c8ba2150902fc088c3996f8a6c6'],
  ['sentinel-trading-lab/agent/src/core/early-reversal-transition.mjs','e3109dab00dc406d95296feede07b9400fab8fd8'],
  ['sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs','c876378ae8cc56099ef3a304df5617cbe0c69818'],
  ['sentinel-trading-lab/agent/src/core/late-breakout-transition-review.mjs','b16fa7911fc5101aa1c9d454f7f5cafc6aca79be'],
  ['sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs','be2aa95874922b94564400979aad4dedd1d61485'],
  ['sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs','a59968654723e4c8124164844745eee30ef89655'],
  ['sentinel-trading-lab/agent/worker/index.mjs','a376e187ae5d8456ca7500439317727fc9afb861'],
  ['sentinel-trading-lab/src/components/LiveScenarioCard.tsx','c8a71e287acaa552dc871b028e8142c35a81d383']
 ]) assert.equal(blob(read(path)),sha,path);
});
test('213: structural reversal rejects only a combined contrary closed candle AND contrary observed minute',()=>{
 for(const side of ['CALL','PUT']){
  const bad=sample({side});
  const copy=structuredClone(bad);
  const veto=reviewHybridFamilyProof(bad);
  assert.equal(veto.ready,false);assert.equal(veto.side,null);
  assert.equal(veto.provisionalSide,side);
  assert.deepEqual(veto.entryRisk.reasons,['structural-turn-against-last-closed-bar-and-minute']);
  assert.deepEqual(bad,copy,'no input mutation');
  for(const variant of [{againstBar:false},{minute:.0002},{minute:.0002,againstBar:false}]){
   const ok=sample({side,...variant});
   assert.strictEqual(reviewHybridFamilyProof(ok),ok.candidate);
  }
 }
});
test('213: failed breakout against the last minute is held; fresh confirmed minute remains intact',()=>{
 for(const side of ['CALL','PUT']){
  const bad=sample({side,reason:'failed-breakout-structure-change'});
  assert.deepEqual(evaluateHybridFamilyProof(bad).reasons,['failed-breakout-without-minute-reclaim']);
  const good=sample({side,reason:'failed-breakout-structure-change',minute:.0002});
  assert.strictEqual(reviewHybridFamilyProof(good),good.candidate);
 }
});
test('213: 207 impulse, 212 rapid reversal and 212 level breakouts are unaffected in all durations',()=>{
 for(const reason of ['closed-structure-and-live-impulse','confirmed-fast-level-reversal',
  'historical-level-breakout','historical-level-rejection']){
  const i=sample({reason});
  assert.strictEqual(reviewHybridFamilyProof(i),i.candidate,reason);
 }
 for(const ms of [30000,300000]){
  const i=sample({ms});assert.strictEqual(reviewHybridFamilyProof(i),i.candidate);
 }
});
test('213: retest is not vetoed by opposite EMA or minute alone; only new opposing structural pivot',()=>{
 const s=sample({reason:'break-retest-continuation'});
 assert.strictEqual(reviewHybridFamilyProof(s),s.candidate);
 const oppositeMinute=sample({reason:'break-retest-continuation',minute:.0002});
 assert.strictEqual(reviewHybridFamilyProof(oppositeMinute),oppositeMinute.candidate);
});
test('213: no veto on stale/mismatched/missing/future or unreceived data',()=>{
 const i=sample();const c=i.candidate;
 for(const v of [
  {...i,now:AT+1951},
  {...i,quoteHistory:i.quoteHistory.slice(-20)},
  {...i,quoteHistory:i.quoteHistory.map(q=>({...q,receivedAt:AT+5000}))},
  {...i,candles:[]},
  {...i,candidate:{...c,entryPrice:1.199}},
  {...i,candidate:{...c,ready:false}}
 ]){
  assert.strictEqual(reviewHybridFamilyProof(v),v.candidate);
 }
 const future={...i,quoteHistory:[...i.quoteHistory,{ts:AT+1000,receivedAt:AT+1000,price:PRICE+1}]};
 assert.deepEqual(evaluateHybridFamilyProof(future),evaluateHybridFamilyProof(i));
});
test('213: no timers, broker access, opposite-direction trade or added fixed candle wait',()=>{
 const source=read('sentinel-trading-lab/agent/src/core/hybrid-family-proof-213.mjs');
 assert.doesNotMatch(source,/setTimeout\(|setInterval\(|sleep\(|waitFor|click\(|setNativeExpiry|orderDurationMs\s*=/);
 const original=sample({side:'PUT'}),after=reviewHybridFamilyProof(original);
 assert.notEqual(after.side,'CALL');
});

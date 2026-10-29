import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewEntryPrice,stretchedImpulse} from '../sentinel-trading-lab/agent/src/core/entry-price-timing.mjs';
import {marketReading,marketDataStatus} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
import {observedLevelSequence,applyObservedLevelSequence,confirmedLevelReversal} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {reviewDirectionalPersistence} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const T=1800000000000;
const input=(rows,mirror=false,durationMs=30000)=>({quoteHistory:rows,quoteAt:rows.at(-1).ts,now:rows.at(-1).ts,
 price:rows.at(-1).price,durationMs,candidate:{ready:true,side:mirror?'PUT':'CALL',reason:'closed-structure-and-live-impulse',
 observedAt:rows.at(-1).ts,entryPrice:rows.at(-1).price}});
function extended(mirror=false){return Array.from({length:71},(_,i)=>({ts:T-70000+i*1000,price:mirror?200-(100+i*.02+(i>65?.15*(i-65):0)):100+i*.02+(i>65?.15*(i-65):0)}));}
test('the 160 rebuild has no queued review, per-side lock, review deadline or rearming state',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 assert.equal(runtime.lateImpulseReview,undefined);
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const rows=extended(mirror);
  for(let i=0;i<32;i++){
   if(i)rows.push({ts:T+i*1000,price:rows.at(-1).price+(mirror?-.1:.1)});
   const a=input(rows,mirror,durationMs),out=reviewEntryPrice(a);
   assert.equal(out.ready,false);assert.equal(out.side,null);
   assert.equal(out.entryTiming.detectedAt,undefined);assert.equal(out.entryTiming.expiresAt,undefined);
   assert.deepEqual(reviewEntryPrice(a),out,'same price evidence cannot create a new window');
  }
 }
});
test('a newly qualified normal price is admitted immediately, independent of previously rejected quotes',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  reviewEntryPrice(input(extended(mirror),mirror,durationMs));
  const rows=Array.from({length:71},(_,i)=>({ts:T+1000+i*1000,price:mirror?100-i*.02:100+i*.02})),a=input(rows,mirror,durationMs);
  assert.equal(stretchedImpulse({...a,side:a.candidate.side}),null);
  assert.equal(reviewEntryPrice(a),a.candidate);
 }
});
test('a received current pivot break confirms a genuine reversal without a second retest',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const rows=Array.from({length:71},(_,i)=>({ts:T-70000+i*1000,price:100+i*.005}));
  const path=[100.2,100,100.3,100.6,100.4,100.6,100.9,101.3,100.9,101,101.1,101.32];
  path.forEach((price,i)=>{rows[rows.length-path.length+i].price=price;});if(mirror)rows.forEach(q=>{q.price=200-q.price;});
  const a=input(rows,mirror,durationMs),p=mirror?99.6:100.4;
  const map={observedCandles:100,asOf:T-60000,tolerance:.05,levels:[{level:p,low:p-.05,high:p+.05,confirmedPivots:2,independentTests:3,
   supportPivots:mirror?0:2,supportRejections:mirror?0:3,resistancePivots:mirror?2:0,resistanceRejections:mirror?3:0}]};
  const proof=confirmedLevelReversal({...a,map});assert.equal(proof.side,a.candidate.side);
  a.candidate={...a.candidate,reason:proof.kind,priceStructure:{confirmedReversal:proof}};
  assert.equal(reviewEntryPrice(a).ready,true);
 }
});
test('changing a setup name cannot bypass an extended short entry; 5m preserves its own admission',()=>{
 const a=input(extended());for(const reason of ['historical-level-breakout','confirmed-level-structure-reversal','failed-breakout-structure-change']){
  assert.equal(reviewEntryPrice({...a,candidate:{...a.candidate,reason}}).ready,false);
 }
 assert.equal(reviewEntryPrice({...a,durationMs:300000}),a.candidate);
});
test('a range-turn label cannot contradict an explicit unsupported latest price move',()=>{
 const quoteHistory=Array.from({length:71},(_,i)=>({ts:T-70000+i*1000,price:100+(i%2)*.1}));
 for(const side of ['CALL','PUT']){
  const args={quoteHistory,quoteAt:T,now:T,price:quoteHistory.at(-1).price,durationMs:60000};
  const candidate={ready:true,side,reason:'closed-range-extreme-reversal-confirmed',priceStructure:{reactionProof:{confirmed:false,reason:'last-move-not-supporting'}}};
  assert.equal(reviewDirectionalPersistence({...args,candidate}).ready,false);
  for(const proof of [null,{confirmed:true},{confirmed:false,reason:'not-away-from-confirmed-level'}]){
   assert.equal(reviewDirectionalPersistence({...args,candidate:{...candidate,priceStructure:{reactionProof:proof}}}).ready,true);
  }
 }
});
test('one break/retest has one first confirmation; later ticks do not restamp the old event',()=>{
 const vertices=[102,100.4,100.9,99,100,99.7,98.6],rows=[];
 for(let k=0;k<vertices.length-1;k++)for(let j=0;j<10;j++)rows.push({ts:T+rows.length*100,price:vertices[k]+(vertices[k+1]-vertices[k])*j/10});
 rows.push({ts:T+rows.length*100,price:vertices.at(-1)});
 const map={observedCandles:100,asOf:T-60000,tolerance:.15,levels:[{level:100,low:100,high:100,confirmedPivots:2,independentTests:3}]};
 const a={map,quoteHistory:rows,quoteAt:rows.at(-1).ts,now:rows.at(-1).ts,price:rows.at(-1).price,durationMs:60000};
 const event=observedLevelSequence(a).structureChange;assert.equal(event.kind,'break-retest-continuation');
 for(let j=1;j<=30;j++)rows.push({ts:a.now+j*100,price:98.6-j*.01});
 const b={...a,quoteAt:rows.at(-1).ts,now:rows.at(-1).ts,price:rows.at(-1).price};
 assert.equal(observedLevelSequence(b).structureChange.confirmedAt,event.confirmedAt);
 assert.notEqual(applyObservedLevelSequence({...b,candidate:{ready:true,side:'PUT',reason:'own-current-structure'}}).reason,'break-retest-continuation');
});
test('the market reading stays about phase and direction, independently of admission codes',()=>{
 for(const reason of ['late-quote-no-entry','insufficient-quote-variation','extended-move-without-current-entry-confirmation']){
  assert.equal(marketReading({phase:'weakening',label:'CONTINUIDADE PERDENDO FORÇA',trendSide:'CALL',quoteAt:T,now:T+400,candidate:{ready:false,reason}}),'CONTINUIDADE PERDENDO FORÇA · CALL');
 }
 assert.equal(marketReading({phase:'reversal-testing',trendSide:'CALL',quoteAt:T,now:T}),'REVERSÃO EM TESTE · PUT');
 assert.equal(marketReading({phase:'continuing',label:'CONTINUIDADE',trendSide:'PUT',quoteAt:T,now:T+4000}),'CONTINUIDADE · PUT');
 assert.match(marketDataStatus({quoteAt:T,evaluatedAt:T,now:T+4000}),/^COTAÇÃO ATRASADA/);
});
test('PC market interpretation survives the mobile broadcast unchanged',()=>{
 const reading='CONTINUIDADE PERDENDO FORÇA · CALL';
 const snap=analystSnapshot({settings:{engine:'automatic'},lastResult:{analysis:{vnext:{mode:'now',nowObservation:{marketReading:reading}}}}},{});
 assert.equal(snap.lastResult.analysis.vnext.nowObservation.marketReading,reading);
});
test('expiry code and protections are preserved independently of the rebuilt market engine',()=>{
 const keeper=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs',import.meta.url),'utf8');
 assert.match(keeper,/revision:14/);assert.match(keeper,/beforeunload/);
 assert.doesNotMatch(readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8'),/LateImpulseReview|entryTimingReview/);
});

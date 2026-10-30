import test from 'node:test';
import assert from 'node:assert/strict';
import {continuationRoomRisk} from '../sentinel-trading-lab/agent/src/core/continuation-room-risk.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {readFileSync} from 'node:fs';
const T=1800000000000;
function scenario(durationMs=60000,mirror=false){
 const p=x=>mirror?200-x:x;
 const quoteHistory=Array.from({length:10},(_,i)=>({ts:T-9000+i*1000,
  receivedAt:T-9000+i*1000,price:p(100+(i/9)**2*.336)}));
 const price=quoteHistory.at(-1).price;
 const wall=mirror?{low:99.60,high:99.62,level:99.61,supportPivots:2,supportRejections:3,resistancePivots:0,resistanceRejections:0}:
  {low:100.38,high:100.40,level:100.39,resistancePivots:2,resistanceRejections:3,supportPivots:0,supportRejections:0};
 return {candidate:{ready:true,side:mirror?'PUT':'CALL',reason:'historical-level-breakout',observedAt:T,entryPrice:price},
  structure:{tolerance:.035,candleLevelMap:{observedCandles:100,asOf:T-500,tolerance:.035,levels:[wall]}},
  quoteHistory,quoteAt:T,now:T,price,durationMs};
}
for(const ms of [30000,60000])for(const mirror of [false,true]){
 test(ms+' '+(mirror?'PUT':'CALL')+': accelerating historical breakout still needs clearance before a proven opposing wall',()=>{
  const a=scenario(ms,mirror),before=structuredClone(a),risk=continuationRoomRisk(a);
  assert.equal(risk?.kind,'short-horizon-entry-without-clearance-to-opposing-wall');
  assert.ok(risk.gap>=0&&risk.gap<risk.roomNeeded);
  assert.equal(risk.historicalPivots,2);assert.equal(risk.historicalRejections,3);
  assert.deepEqual(a,before,'review must not alter its inputs or create a candidate');
  assert.deepEqual(continuationRoomRisk(a),risk,'identical observations cannot rearm or create a timed state');
 });
}
test('the added review is specific to historical breakouts; it does not spread to ordinary impulse or reversal families',()=>{
 for(const mirror of [false,true])for(const reason of ['closed-structure-and-live-impulse',
  'confirmed-fast-level-reversal','failed-breakout-structure-change','historical-level-rejection',
  'closed-range-extreme-reversal-confirmed','multiscale-candle-rejection']){
  const a=scenario(60000,mirror);a.candidate.reason=reason;
  assert.equal(continuationRoomRisk(a),null,reason);
 }
});
test('5m keeps its existing policy; the new short breakout review does not run',()=>{
 for(const mirror of [false,true])assert.equal(continuationRoomRisk(scenario(300000,mirror)),null);
});
test('a cleared, distant, unconfirmed or wrong-role wall cannot create a new veto',()=>{
 for(const mirror of [false,true])for(const mode of ['cleared','distant','no-pivot','one-rejection','wrong-role']){
  const a=scenario(60000,mirror),w=a.structure.candleLevelMap.levels[0],role=mirror?'support':'resistance';
  if(mode==='cleared'){w.low=mirror?a.price+1:a.price-2;w.high=w.low+.02;w.level=(w.low+w.high)/2;}
  if(mode==='distant'){w.low=mirror?a.price-2:a.price+1;w.high=w.low+.02;w.level=(w.low+w.high)/2;}
  if(mode==='no-pivot')w[role+'Pivots']=0;
  if(mode==='one-rejection')w[role+'Rejections']=1;
  if(mode==='wrong-role'){w[role+'Pivots']=0;w[role+'Rejections']=0;w[(mirror?'resistance':'support')+'Pivots']=4;w[(mirror?'resistance':'support')+'Rejections']=4;}
  assert.equal(continuationRoomRisk(a),null,mode+' mirrored='+mirror);
 }
});
test('an opposite six-second move is not misrepresented as a directional approach to the wall',()=>{
 const a=scenario();a.quoteHistory[3].price=100.38;
 assert.equal(continuationRoomRisk(a),null);
});
test('future inputs cannot authorize a new wall veto; stale or interrupted inputs do not fabricate evidence',()=>{
 const a=scenario(),expected=continuationRoomRisk(a);
 assert.deepEqual(continuationRoomRisk({...a,quoteHistory:[...a.quoteHistory,{ts:T+1000,receivedAt:T+1000,price:1}]}),expected);
 assert.equal(continuationRoomRisk({...a,now:T+1451}),null);
 assert.equal(continuationRoomRisk({...a,quoteHistory:a.quoteHistory.map(q=>({...q,receivedAt:T+1000}))}),null);
 assert.equal(continuationRoomRisk({...a,quoteHistory:a.quoteHistory.filter(q=>q.ts!==T-3000&&q.ts!==T-4000)}),null);
 const b=structuredClone(a);b.structure.candleLevelMap.asOf=T+1000;assert.equal(continuationRoomRisk(b),null);
});
test('the shared runtime declines the recorded near-wall breakout through its existing review path',()=>{
 const d=JSON.parse(readFileSync(new URL('./fixtures/sentinel-180-breakout-snapshot.json',import.meta.url)));
 const q=d.marketReplay.quotes.map(([ts,price,receivedAt])=>({ts,price,receivedAt})),
  candles=d.marketReplay.candles.map(([from,to,open,high,low,close,volume])=>({from,to,open,high,low,close,volume}));
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1',precisionProfile:'horizon-balanced-v148'});
 rt.patchSettings({engine:d.engine,asset:d.asset,orderDurationMs:d.durationMs},'clearance-test');
 const out=rt._signalValidationGate({analysis:{},settings:rt.settings,now:d.signalAt,
  snap:{provider:d.provider,price:d.snapshotQuote,quoteTs:d.snapshotQuoteAt,quoteHistory:q,candles,historicalCandlesVerified:true,payout:null}}).analysis.vnext;
 assert.notEqual(out.futureEntryAnchor?.phase,'fired');
 assert.equal(out.nowObservation.reason,'shared-base-continuation-wall-pressure');
});

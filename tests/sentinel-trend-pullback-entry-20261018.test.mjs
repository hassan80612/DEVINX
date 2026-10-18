import test from 'node:test';
import assert from 'node:assert/strict';
import {trendPullbackContext,qualifyTrendPullback} from '../experiments/trend-pullback-entry-20261018.mjs';
const T=1792364400000;
function input(sign=1,pullback=true){
 const quoteHistory=Array.from({length:91},(_,i)=>{
  const relative=i-90,logMove=relative<=-6?relative*.00001:
   -.00006+(relative+6)*(pullback?-.00003:.00001);
  return{ts:T+relative*1000,receivedAt:T+relative*1000,price:100*Math.exp(sign*logMove)};
 });
 return{quoteHistory,quoteAt:T,now:T,price:quoteHistory.at(-1).price,durationMs:30000};
}
test('a material opposing pullback withholds the trend-following side symmetrically',()=>{
 for(const sign of [-1,1]){
  const args=input(sign),side=sign>0?'CALL':'PUT',context=trendPullbackContext(args);
  assert.equal(context.identified,true);assert.equal(context.pullback,true);assert.equal(context.trendSide,side);
  const result=qualifyTrendPullback({...args,candidate:{ready:true,side,reason:'base',entryPrice:args.price}});
  assert.equal(result.ready,false);assert.equal(result.side,null);assert.equal(result.provisionalSide,side);
 }
});
test('current resumed trend keeps the original candidate without a collection wait',()=>{
 for(const sign of [-1,1]){
  const args=input(sign,false),candidate={ready:true,side:sign>0?'CALL':'PUT'};
  assert.equal(trendPullbackContext(args).pullback,false);assert.strictEqual(qualifyTrendPullback({...args,candidate}),candidate);
 }
});
test('a countertrend decision is outside this narrow hypothesis',()=>{
 const args=input(),candidate={ready:true,side:'PUT'};assert.strictEqual(qualifyTrendPullback({...args,candidate}),candidate);
});
test('unknown data, WAIT and other durations retain the existing decision',()=>{
 const args=input(),candidate={ready:true,side:'CALL'};
 for(const changes of [{durationMs:15000},{quoteHistory:[]},{now:T+1500}])
  assert.strictEqual(qualifyTrendPullback({...args,...changes,candidate}),candidate);
 const waiting={ready:false,side:null};assert.strictEqual(qualifyTrendPullback({...args,candidate:waiting}),waiting);
});
test('future and not-yet-received observations cannot alter the trend or pullback',()=>{
 const args=input(),expected=trendPullbackContext(args);
 assert.deepEqual(trendPullbackContext({...args,quoteHistory:[...args.quoteHistory,
  {ts:T+1,receivedAt:T+1,price:1},{ts:T-1000,receivedAt:T+1,price:999}]}),expected);
});

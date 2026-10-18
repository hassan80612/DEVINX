import test from 'node:test';
import assert from 'node:assert/strict';
import {observedExpiryQuote} from '../experiments/observed-expiry-quote-20261018.mjs';
import {CompletedExpiryDirection as ReleasedSelector} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {DemoTradingRuntime as ReleasedRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {binaryObjectiveResearchRuntime} from '../experiments/binary-objective-research-runtime-20261018.mjs';
const T=1792250040000,due=T+30000;
const q=(ts,price,receivedAt=ts)=>({ts,price,receivedAt});
const c=await binaryObjectiveResearchRuntime({vote:false,expiryScoring:'asof'});
test.after(()=>c.cleanup());
test('expiry grading uses the last source quote at the deadline, not a later reversal',()=>{
 const history=[q(due-500,100.1),q(due-100,101),q(due+500,99)];
 assert.deepEqual(observedExpiryQuote({quoteHistory:history,dueAt:due,now:due+500}),q(due-100,101));
 assert.deepEqual(observedExpiryQuote({quoteHistory:[...history].reverse(),dueAt:due,now:due+500}),q(due-100,101));
});
test('future and late-arriving observations cannot contaminate a matured sample',()=>{
 const history=[q(due-100,101),q(due-1,99,due+1000),q(due+1,90)];
 assert.deepEqual(observedExpiryQuote({quoteHistory:history,dueAt:due,now:due+500}),q(due-100,101));
 assert.equal(observedExpiryQuote({quoteHistory:history,dueAt:due,now:due-1}),null);
});
test('a stale or absent pre-expiry observation cannot be graded by borrowing a later price',()=>{
 assert.equal(observedExpiryQuote({quoteHistory:[q(due-1001,101),q(due+1,99)],dueAt:due,now:due+500}),null);
 assert.deepEqual(observedExpiryQuote({quoteHistory:[q(due-1000,101)],dueAt:due,now:due+500}),q(due-1000,101));
});
test('an explicitly supplied current quote at the exact deadline is a valid observed source',()=>{
 assert.deepEqual(observedExpiryQuote({quoteHistory:[],currentQuote:q(due,101),dueAt:due,now:due}),q(due,101));
 assert.equal(observedExpiryQuote({quoteHistory:[],currentQuote:q(due+1,101),dueAt:due,now:due+1}),null);
 const history=[q(due-100,101)];
 assert.deepEqual(observedExpiryQuote({quoteHistory:history,currentQuote:q(due+500,99),dueAt:due,now:due+500}),q(due-100,101));
});
function selectorInput(Constructor,spot=99){
 const r=new Constructor();r.reset('test');
 r.pending=[{at:T,dueAt:due,price:100,base:'CALL',wide:'PUT'}];
 const quoteAt=due+500;
 const input={context:'test',quoteAt,now:quoteAt,price:spot,
  quoteHistory:[q(due-100,101),q(quoteAt,spot)],baseline:{ready:false,side:null}};
 return {r,input};
}
test('model selection learns the correct deadline label even when the next quote reverses',()=>{
 const old=selectorInput(ReleasedSelector),fixed=selectorInput(c.CompletedExpiryDirection);
 old.r.observe(old.input);fixed.r.observe(fixed.input);
 assert.ok(Math.abs(old.r.loss.base-.6)<1e-12);assert.ok(Math.abs(old.r.loss.wide-.4)<1e-12);
 assert.ok(Math.abs(fixed.r.loss.base-.4)<1e-12);assert.ok(Math.abs(fixed.r.loss.wide-.6)<1e-12);
 assert.equal(fixed.r.completed,1);assert.equal(fixed.r.pending.length,0);
});
test('a missed evaluation can grade an available historical deadline quote without adding a wait',()=>{
 const {r,input}=selectorInput(c.CompletedExpiryDirection);
 r.observe({...input,quoteAt:due+5000,now:due+5000,quoteHistory:[...input.quoteHistory,q(due+5000,99)]});
 assert.equal(r.completed,1);assert.ok(Math.abs(r.loss.base-.4)<1e-12);assert.ok(Math.abs(r.loss.wide-.6)<1e-12);
});
test('ties and missing deadline quotes do not manufacture a training success',()=>{
 for(const history of [[q(due,100),q(due+500,99)],[q(due-2000,101),q(due+500,99)]]){
  const {r,input}=selectorInput(c.CompletedExpiryDirection);r.observe({...input,quoteHistory:history});
  assert.equal(r.completed,0);assert.deepEqual(r.loss,{base:.5,wide:.5});
 }
});
test('observed runtime score uses the same deadline reference and remains quote-based',()=>{
 const run=Constructor=>{
  const r=new Constructor({enableVNext:true,forecastModel:'now-structural-v1'});
  r.vnextWindowOutcomes=[{windowId:T,asset:'EUR/USD',engineId:'automatic',forecastMode:'now',
   periodSeconds:30,side:'CALL',entryAt:T,exitAt:due,entryPrice:100,verified:false}];
  return r._signalValidationGate({analysis:{asset:'EUR/USD'},settings:r.settings,now:due+500,
   snap:{provider:'iq_option',price:99,quoteTs:due+500,quoteHistory:[q(due-100,101),q(due+500,99)],candles:[]}}).analysis.vnext.outcomeQuality;
 };
 const old=run(ReleasedRuntime),fixed=run(c.DemoTradingRuntime);
 assert.equal(old.failed,1);assert.equal(fixed.correct,1);assert.equal(fixed.failed,0);
 assert.equal(fixed.source,'observed-broker-quotes-not-trade-settlements');
});

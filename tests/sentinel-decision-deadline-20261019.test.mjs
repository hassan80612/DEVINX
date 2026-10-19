import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {decisionDeadlineRuntime} from '../experiments/decision-deadline-runtime-20261019.mjs';
import {thirtySecondCycleForecast as original} from './fixtures/sentinel-13944-quote-clock-forecast.mjs';
const fixed=await decisionDeadlineRuntime();after(()=>fixed.cleanup());
const T=1792380000000,quotes=Array.from({length:181},(_,i)=>({ts:T-(180-i)*1000,price:Math.exp(.0001*Math.sin(i/8)+i*.0000005)}));
const args={quoteHistory:quotes,quoteAt:T,price:quotes.at(-1).price,now:T+1100,durationMs:30000};
test('forecast targets 30 seconds after the decision, including source quote age',()=>{
 const before=original(args),actual=fixed.thirtySecondCycleForecast(args);
 assert.equal(before.horizonMs,30000);assert.equal(actual.horizonMs,31100);
 const {projectionTargetAt,...explicit}=fixed.thirtySecondCycleForecast({...args,projectionTargetAt:args.now+30000});
 assert.equal(projectionTargetAt,args.now+30000);assert.deepEqual(actual,explicit);
});
test('an explicit broker deadline and a zero-age quote retain their existing result',()=>{
 assert.deepEqual(fixed.thirtySecondCycleForecast({...args,projectionTargetAt:T+45000}),original({...args,projectionTargetAt:T+45000}));
 assert.deepEqual(fixed.thirtySecondCycleForecast({...args,now:T}),original({...args,now:T}));
 assert.equal(fixed.thirtySecondCycleForecast({...args,now:T+1500}).ready,false);
});
test('completed model comparison queues and grades the same decision deadline',()=>{
 const c=new fixed.CompletedExpiryDirection(),baseline=fixed.thirtySecondCycleForecast(args);
 c.observe({...args,baseline,context:'exnova|EUR/GBP OTC|30000'});
 assert.equal(c.pending[0].dueAt,T+31100);
 const follow=[...quotes,{ts:T+30000,price:1.5},{ts:T+31100,price:.5}];
 c.observe({context:c.context,quoteHistory:follow,quoteAt:T+30000,now:T+30000,price:1.5,baseline:{ready:false}});
 assert.equal(c.completed,0);assert.equal(c.pending.length,1);
 c.observe({context:c.context,quoteHistory:follow,quoteAt:T+31100,now:T+31100,price:.5,baseline:{ready:false}});
 assert.equal(c.completed,1);assert.equal(c.pending.length,0);
});
test('same source quote at a new decision time cannot reuse an old forecast deadline',()=>{
 const c=new fixed.CompletedExpiryDirection(),baseline=fixed.thirtySecondCycleForecast(args);
 c.observe({...args,baseline,context:'iq_option|EUR/GBP OTC|30000'});const key=c.cache.key;
 c.observe({...args,now:T+1200,baseline,context:c.context});
 assert.notEqual(c.cache.key,key);assert.equal(c.cache.forecast.horizonMs,31200);
});
test('common analyst passes the same deadline to selected and narrow projections',()=>{
 const calls=[],selector={observe:a=>{calls.push(a);return a.baseline;}};
 fixed.analyzeNowOpportunity({...args,engineId:'automatic',qualityPolicy:'adaptive-market-v17',expiryDirectionSelector:selector});
 assert.equal(calls.length,1);assert.equal(calls[0].projectionTargetAt,args.now+30000);
 const selected=fixed.thirtySecondCycleForecast({...args,projectionTargetAt:calls[0].projectionTargetAt});
 assert.equal(selected.horizonMs,31100);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {thirtySecondCycleForecast as released} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
import {observedSamplingResearchRuntime} from '../experiments/observed-sampling-research-runtime-20261017.mjs';
import {expiryQuote} from '../experiments/replay-expiry-quote-20261017.mjs';
const T=1792250040000;
const history=Array.from({length:181},(_,i)=>({ts:T+(i-180)*1000,price:1.1+.0003*Math.sin((i-180)/19)}));
function args(offset=750){const price=history.at(-1).price,quoteAt=T+offset;return {quoteHistory:[...history,{ts:quoteAt,price}],price,quoteAt,now:quoteAt};}
test('the released 500ms historical grid rejects a valid 1Hz series at one millisecond phase',()=>{
 assert.equal(released(args(250)).ready,true);
 assert.equal(released(args(750)).reason,'insufficient-observed-cycle-history');
});
for(const mode of ['one-second','bucket'])test(`${mode}: valid 1Hz history remains available at both quote phases and real gaps remain rejected`,async()=>{
 const {thirtySecondCycleForecast:forecast,cleanup}=await observedSamplingResearchRuntime({mode});
 try{
  assert.equal(forecast(args(250)).ready,true);assert.equal(forecast(args(750)).ready,true);
  const a=args(750);a.quoteHistory=a.quoteHistory.filter(q=>q.ts<T-80000||q.ts>T-70000);
  assert.equal(forecast(a).reason,'observed-cycle-history-gap');
 }finally{cleanup();}
});
test('bucket sampling preserves one real point per second and its direction under a common timestamp shift',async()=>{
 const {thirtySecondCycleForecast:forecast,cleanup}=await observedSamplingResearchRuntime();
 try{
  const xs=history.map(q=>({...q,ts:q.ts+250})),a={quoteHistory:xs,quoteAt:xs.at(-1).ts,now:xs.at(-1).ts,price:xs.at(-1).price};
  const ys=xs.map(q=>({...q,ts:q.ts+500})),b={quoteHistory:ys,quoteAt:ys.at(-1).ts,now:ys.at(-1).ts,price:ys.at(-1).price};
  const x=forecast(a),y=forecast(b);assert.equal(x.ready,true);assert.equal(x.observedPoints,xs.length);
  assert.equal(y.side,x.side);assert.ok(Math.abs(y.expectedLogMove-x.expectedLogMove)<1e-15);
 }finally{cleanup();}
});
test('future ticks and data received after the current evaluation cannot change a bucket projection',async()=>{
 const {thirtySecondCycleForecast:forecast,cleanup}=await observedSamplingResearchRuntime();
 try{
  const a=args(750),b={...a,quoteHistory:[...a.quoteHistory,
   {ts:a.quoteAt+1000,price:8,receivedAt:a.now+1000},
   {ts:T-500,price:9,receivedAt:a.now+2000}]};
  assert.deepEqual(forecast(a),forecast(b));
 }finally{cleanup();}
});
test('the corrected sampler preserves released forecasts on regular aligned 1Hz paths',async()=>{
 const {thirtySecondCycleForecast:forecast,cleanup}=await observedSamplingResearchRuntime();
 try{
  for(let path=0;path<12;path++){
   const quotes=history.map((q,i)=>({ts:q.ts,price:1.1*Math.exp(
    (path%2?1:-1)*(i*.0000002+.0003*Math.sin(i/(4+path))+.00002*Math.cos(i/(2+path))))}));
   const a={quoteHistory:quotes,quoteAt:T,now:T,price:quotes.at(-1).price};
   assert.deepEqual(forecast(a),released(a),`aligned path ${path}`);
  }
 }finally{cleanup();}
});
test('complete quote streams are scored at the published bid as of expiry, not a later price',()=>{
 const quotes=[{ts:T,price:100},{ts:T+29990,price:101},{ts:T+30020,price:99}];
 assert.equal(expiryQuote(quotes,T+30000,'asof-complete-bid-stream').price,101);
 assert.equal(expiryQuote(quotes,T+30000).price,99);
 assert.equal(expiryQuote(quotes,T+31000,'asof-complete-bid-stream'),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {observedQuoteWindow} from '../sentinel-trading-lab/agent/src/core/observed-quote-window.mjs';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
import {reviewChangedOpportunitySide} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000;
test('canonical quote window exactly matches prior causal ordering, duplicate and receipt semantics',()=>{
 let seed=918;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
 for(let trial=0;trial<100;trial++){
  const history=Array.from({length:100},(_,i)=>({ts:T-Math.floor(random()*100)*1000,receivedAt:T+(random()<.1?1000:-Math.floor(random()*120000)),price:1+random()}));
  if(trial%2===0)history.sort((a,b)=>a.ts-b.ts);
  const map=new Map();
  for(const q of history)if(q.ts>=T-60000&&q.ts<=T&&q.receivedAt<=T){
   if(!map.has(q.ts)||q.receivedAt<map.get(q.ts).receivedAt)map.set(q.ts,q);
  }
  assert.deepEqual(observedQuoteWindow({history,at:T,windowMs:60000}),[...map.values()].sort((a,b)=>a.ts-b.ts));
 }
});
test('all probability horizons ignore prices received after the decision',()=>{
 const quotes=Array.from({length:201},(_,i)=>({ts:T-200000+i*1000,price:1.1+i*.00001}));
 for(const durationMs of [30000,60000,120000,300000]){
  const input={quoteHistory:quotes,quoteAt:T,price:quotes.at(-1).price,now:T,durationMs};
  const withheld=quotes.slice(0,-1).map(q=>({...q,price:1,receivedAt:T+1000}));
  assert.deepEqual(shortProbability({...input,quoteHistory:[...withheld,...quotes]}),shortProbability(input));
  assert.equal(shortProbability({...input,quoteHistory:[...quotes.slice(0,-1),{...quotes.at(-1),receivedAt:T+1}]}).ready,false);
 }
});
test('every expiry rechecks a changed final CALL/PUT against actual confirmed pivots',()=>{
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000])for(const direction of [-1,1]){
  const quoteHistory=Array.from({length:181},(_,i)=>({ts:T-180000+i*1000,
   price:1+direction*.000008*i+.00055*Math.sin((i+(direction>0?12:24))*Math.PI*2/30)+.000006*Math.sin(i*1.4)}));
  const side=direction>0?'PUT':'CALL',price=quoteHistory.at(-1).price;
  const candidate={ready:true,side,reason:'observed-multi-interval-trend-correction',observedAt:T,entryPrice:price};
  const result=reviewChangedOpportunitySide({candidate,previousSide:direction>0?'CALL':'PUT',quoteHistory,quoteAt:T,now:T,price,durationMs});
  assert.equal(result.ready,false);assert.equal(result.reason,'final-side-countertrend-pivot-risk');
  assert.equal(reviewChangedOpportunitySide({candidate,previousSide:side}),candidate,'unchanged side adds no repeated work');
 }
});

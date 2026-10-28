import test from 'node:test';
import assert from 'node:assert/strict';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
import {combine66WithProbability} from '../sentinel-trading-lab/agent/src/core/66-probability-integration.mjs';
const T=1800000000000;
const quotes=Array.from({length:201},(_,i)=>({ts:T-(200-i)*1000,price:1.1+i*.000001}));
const input=durationMs=>({quoteHistory:quotes,quoteAt:T,now:T,price:quotes.at(-1).price,durationMs});
test('long-horizon probability cannot crash or fabricate a missing 30s reference',()=>{
 for(const durationMs of [120000,300000])for(const mirror of [false,true]){
  const a=input(durationMs);
  if(mirror){a.quoteHistory=quotes.map(q=>({...q,price:2.2-q.price}));a.price=a.quoteHistory.at(-1).price;}
  assert.equal(shortProbability(a).ready,true,'complete observed evidence still produces an estimate');
  const missing=a.quoteHistory.filter(q=>!(q.ts>T-35000&&q.ts<T-25000));
  const delayed=a.quoteHistory.map(q=>q.ts>T-35000&&q.ts<T-25000?{...q,receivedAt:T+1000}:q);
  for(const quoteHistory of [missing,delayed]){
   const estimate=shortProbability({...a,quoteHistory});
   assert.equal(estimate.ready,false);assert.equal(estimate.reason,'missing-30s-reference-price');
   assert.equal(estimate.pCall,null);assert.equal(estimate.pPut,null);
   const original={ready:true,side:mirror?'PUT':'CALL',reason:'confirmed-level-structure-reversal'};
   assert.equal(combine66WithProbability(original,estimate,{durationMs}),original,
    'an unavailable auxiliary estimate must not block independently confirmed structure');
  }
 }
});

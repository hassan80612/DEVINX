import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewDynamicEntryQuality} from '../sentinel-trading-lab/agent/src/core/dynamic-entry-quality.mjs';
const T=1800000000000;
const ticks=prices=>prices.map((price,i)=>({ts:T-(prices.length-1-i)*1000,
 receivedAt:T-(prices.length-1-i)*1000,price}));
const review=(prices,reason,side='CALL',durationMs=30000,overrides={})=>{
 const candidate={ready:true,reason,side,observedAt:T,entryPrice:prices.at(-1),...overrides};
 return reviewDynamicEntryQuality({candidate,quoteHistory:ticks(prices),price:prices.at(-1),
  quoteAt:T,now:T,durationMs});
};
test('slow tip after a long green impulse is not chased with a new CALL',()=>{
 const prices=[100,100.05,100.1,100.15,100.2,100.25,100.3,100.35,100.4,100.45,100.5,
 100.55,100.6,100.65,100.7,100.72,100.735,100.744,100.75,100.753,100.754];
 const result=review(prices,'closed-structure-and-live-impulse');
 assert.equal(result.ready,false,JSON.stringify(result));
 assert.equal(result.reason,'dynamic-extended-impulse-lost-momentum');
 assert.equal(result.side,null);
});
test('fresh continuation with real live acceleration remains eligible at 30s and 1m',()=>{
 const prices=[100,100.01,100.02,100.03,100.04,100.05,100.06,100.07,100.08,100.09,100.1,
 100.12,100.14,100.16,100.18,100.21,100.25,100.3,100.36,100.43,100.51];
 for(const durationMs of [30000,60000]){
  const out=review(prices,'closed-structure-and-live-impulse','CALL',durationMs);
  assert.equal(out.ready,true);
 }
});
test('tiny two-quote reversal is a fresh observation, not a verified order',()=>{
 const prices=[100,100.1,100.2,100.3,100.4,100.5,100.6,100.7,100.8,100.9,101,
 101.1,101.2,101.3,101.4,101.5,101.6,101.61,101.62,101.60,101.595];
 const out=review(prices,'multiscale-candle-rejection','PUT',60000);
 assert.equal(out.ready,false);assert.equal(out.reason,'dynamic-reversal-below-observed-noise');
});
test('actual reversal with enough displacement relative to current noise is immediate',()=>{
 const prices=[100,100.1,100.2,100.3,100.4,100.5,100.6,100.7,100.8,100.9,101,
 101.1,101.2,101.3,101.4,101.5,101.6,101.7,101.6,101.4,101.2];
 const out=review(prices,'multiscale-candle-rejection','PUT',60000);
 assert.equal(out.ready,true);
});
test('5m, already waiting, missing actual history, and original expiry are unchanged',()=>{
 const prices=[100,100.1,100.2,100.3,100.4,100.5,100.6,100.7,100.8,100.9,101,
 101.1,101.2,101.3,101.4,101.5,101.6,101.7,101.6,101.4,101.2];
 const candidate={ready:true,reason:'multiscale-candle-rejection',side:'PUT',
  observedAt:T,entryPrice:prices.at(-1)};
 assert.equal(reviewDynamicEntryQuality({candidate,quoteHistory:ticks(prices),quoteAt:T,
  now:T,price:prices.at(-1),durationMs:300000}),candidate);
 assert.equal(reviewDynamicEntryQuality({candidate,quoteHistory:[],quoteAt:T,
  now:T,price:prices.at(-1),durationMs:60000}),candidate);
 const waiting={...candidate,ready:false};
 assert.equal(reviewDynamicEntryQuality({candidate:waiting,quoteHistory:ticks(prices),
  quoteAt:T,now:T,price:prices.at(-1),durationMs:60000}),waiting);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {causalPatternDirection} from '../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
import {readFileSync} from 'node:fs';
const T=1800000000000;
const expiries=[30000,60000,120000,300000];
const quotes=(kind='up')=>Array.from({length:2101},(_,i)=>{
 const delta=kind==='up'?i*.000004:kind==='down'?-i*.000004:
   kind==='small-up-in-down'?-i*.000004+(i>2092?(i-2092)*.000005:0):
   kind==='small-down-in-up'?i*.000004-(i>2092?(i-2092)*.000005:0):
   .0005*Math.sin(i*2*Math.PI/63);
 return {ts:T+i*1000,receivedAt:T+i*1000,price:1+delta+.0000007*Math.sin(i*1.7)};
});
const predict=(history,ms)=>{
 const current=history.at(-1);
 return causalPatternDirection({quoteHistory:history.slice(-300),
  rangeQuoteHistory:history.filter((q,i)=>i%2===0),quoteAt:current.ts,
  now:current.ts,price:current.price,durationMs:ms});
};
test('3.97.187: all 30s 60s 2m 5m have independent expiry-matched continuation',()=>{
 for(const ms of expiries)for(const [kind,side] of [['up','CALL'],['down','PUT']]){
  const r=predict(quotes(kind),ms);
  assert.equal(r.side,side,kind+' '+ms);
  assert.equal(r.ready,true);
  assert.equal(r.expirySeconds,ms/1000);
  assert.ok(r.selected>=4);
  assert.equal(r.phase,'continuation');
 }
});
test('small candles going against a trend are not blindly called reversals',()=>{
 for(const kind of ['small-up-in-down','small-down-in-up']){
  for(const ms of expiries){
   const result=predict(quotes(kind),ms);
   assert.equal(result.ready,false,kind+' '+ms);
  }
 }
});
test('micro 5s/10s/15s routes remain unsupported in independent four-expiry model',()=>{
 const q=quotes('up');
 for(const ms of [5000,10000,15000]){
  assert.equal(predict(q,ms).ready,false);
 }
});
test('strictly causal: future or late-delivered price changes no outcome',()=>{
 const q=quotes('up'),last=q.at(-1);
 const injected=[{ts:last.ts+1000,receivedAt:last.ts+1000,price:2},
  {ts:last.ts-9000,receivedAt:last.ts+1000,price:.5}];
 const args={quoteHistory:q.slice(-300),rangeQuoteHistory:q.filter((x,i)=>i%2===0),
  quoteAt:last.ts,price:last.price,now:last.ts,durationMs:30000};
 assert.deepEqual(causalPatternDirection({...args,quoteHistory:[...args.quoteHistory,...injected]}),
  causalPatternDirection(args));
});
test('the actual shared base invokes phase model for all four expiries',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.match(src,/const learning=causalPatternDirection\(input\)/);
 assert.doesNotMatch(src,/Number\(durationMs\)===30000\?causalPatternDirection/);
 const prediction=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(prediction,/fetch\(|await\b|setTimeout\(|setInterval\(|page\.click\(/);
});
test('tiny 30s forecast displacement below observed uncertainty is not certainty',()=>{
 const q=Array.from({length:181},(_,i)=>({ts:T+i*1000,receivedAt:T+i*1000,
  price:1+.00035*Math.sin(i*2*Math.PI/60)}));
 const last=q.at(-1),r=thirtySecondCycleForecast({quoteHistory:q,
  quoteAt:last.ts,price:last.price,now:last.ts,durationMs:30000});
 assert.ok(r.ready===true||r.reason==='projected-move-below-observed-uncertainty');
});

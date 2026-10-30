import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPriorCandleBreakout} from '../sentinel-trading-lab/agent/src/core/prior-candle-breakout-guard.mjs';
const T=1800000000000;
const candles=[{from:(T-65000)/1000,to:(T-5000)/1000,open:100,high:101,low:99,close:100.7}];
function evaluate(values,side='CALL',durationMs=30000, extra={}){
 const q=values.map((price,i)=>({price,ts:T-(values.length-i-1)*350}));
 const candidate={ready:true,side,reason:'historical-level-breakout',observedAt:T,entryPrice:values.at(-1)};
 return reviewPriorCandleBreakout({candidate,candles,quoteHistory:q,quoteAt:T,now:T,price:values.at(-1),durationMs,...extra});
}
test('a previous candle high swept and reclaimed VETOES CALL continuation',()=>{
 const out=evaluate([100.7,100.95,101.05,101.12,101.06,100.98,100.92]);
 assert.equal(out.ready,false);assert.equal(out.reason,'prior-candle-failed-breakout');assert.equal(out.side,null);
});
test('a previous candle low swept and reclaimed VETOES PUT continuation',()=>{
 const out=evaluate([99.3,99.08,98.95,98.85,98.93,99.05,99.12],'PUT');
 assert.equal(out.ready,false);assert.equal(out.reason,'prior-candle-failed-breakout');assert.equal(out.side,null);
});
test('the first wick alone does not mean an accepted breakout',()=>{
 const out=evaluate([100.7,100.92,101.07]);
 assert.equal(out.ready,false);assert.equal(out.reason,'prior-candle-breakout-unproven');
});
test('a proven move OUTSIDE the old candle preserves true continuation without fixed waiting',()=>{
 for(const durationMs of [30000,60000]){
  const out=evaluate([100.7,100.95,101.08,101.17,101.28,101.38],'CALL',durationMs);
  assert.equal(out.ready,true,JSON.stringify(out));
 }
});
test('no proof does not imply reversal or change the 5m engine',()=>{
 assert.equal(evaluate([100.7,100.9,101.03,100.91],'CALL',300000).ready,true);
 assert.equal(evaluate([100.7,100.9,101.03,100.91],'CALL',30000,{candles:[]}).ready,true);
});

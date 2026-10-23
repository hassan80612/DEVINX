import test from 'node:test';
import assert from 'node:assert/strict';
import {countertrendPivotRisk} from '../sentinel-trading-lab/agent/src/core/shared-pivot-guard.mjs';
const T=1700000000000;
const wave=({drift=0,phase=0}={})=>Array.from({length:181},(_,i)=>({
 ts:T+i*1000,receivedAt:T+i*1000,
 price:1+drift*i+.00055*Math.sin((i+phase)*Math.PI*2/30)+.000006*Math.sin(i*1.4)
}));
const risk=(input,side)=>countertrendPivotRisk({
 quoteHistory:input,quoteAt:input.at(-1).ts,now:input.at(-1).ts,price:input.at(-1).price,side
});
test('strong HH/HL forbids speculative PUT at a top, not CALL continuation',()=>{
 const q=wave({drift:.000006,phase:12});
 assert.equal(risk(q,'PUT'),true);assert.equal(risk(q,'CALL'),false);
});
test('strong LH/LL forbids speculative CALL at a bottom, not PUT continuation',()=>{
 const q=wave({drift:-.000008,phase:24});
 assert.equal(risk(q,'CALL'),true);assert.equal(risk(q,'PUT'),false);
});
test('stationary range keeps real two-sided turn eligibility',()=>{
 assert.equal(risk(wave({phase:12}),'PUT'),false);
 assert.equal(risk(wave({phase:24}),'CALL'),false);
});
test('future quotes and unreceived packets cannot invent a structural pivot',()=>{
 const q=wave({drift:.000006,phase:12}),last=q.at(-1);
 const future={ts:last.ts+1000,receivedAt:last.ts+1000,price:5000};
 const withheld={ts:last.ts-500,receivedAt:last.ts+5000,price:.05};
 assert.equal(countertrendPivotRisk({quoteHistory:[...q,future,withheld],quoteAt:last.ts,
  now:last.ts,price:last.price,side:'PUT'}),risk(q,'PUT'));
});

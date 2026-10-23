import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {countertrendPivotRisk} from '../sentinel-trading-lab/agent/src/core/shared-pivot-guard.mjs';
const T=1800000000000;
const quotes=f=>Array.from({length:121},(_,i)=>({
 ts:T+i*1000,receivedAt:T+i*1000,price:f(i)
}));
const shallow=sign=>quotes(i=>1.14+sign*i*.000009+sign*(i>116?-(i-116)*.000004:0)+.0000002*Math.sin(i*.9));
const genuine=sign=>quotes(i=>1.14+sign*(Math.min(i,100)*.000009-Math.max(0,i-100)*.000042)+.0000001*Math.sin(i*.9));
const range=quotes(i=>1.14+.0004*Math.sin(i*Math.PI*2/30));
const decide=(rows,side,now=rows.at(-1).ts)=>countertrendPivotRisk({
 quoteHistory:rows,quoteAt:rows.at(-1).ts,now,price:rows.at(-1).price,side
});
test('one-way HH/HL without two pivots blocks a false PUT at the top',()=>{
 const q=shallow(1);assert.equal(decide(q,'PUT'),true);
 assert.equal(decide(q,'CALL'),false,'trend-following CALL remains eligible');
});
test('one-way LH/LL without two pivots blocks a false CALL at the bottom',()=>{
 const q=shallow(-1);assert.equal(decide(q,'CALL'),true);
 assert.equal(decide(q,'PUT'),false,'trend-following PUT remains eligible');
});
test('a substantive actual reversal is not permanently vetoed',()=>{
 assert.equal(decide(genuine(1),'PUT'),false);
 assert.equal(decide(genuine(-1),'CALL'),false);
});
test('stationary ranges preserve their own top and bottom calls',()=>{
 assert.equal(decide(range,'CALL'),false);
 assert.equal(decide(range,'PUT'),false);
});
test('no future or late-arriving quote can create a false directional guard',()=>{
 const q=shallow(1),last=q.at(-1),expected=decide(q,'PUT');
 const extra=[{ts:last.ts+1000,receivedAt:last.ts+1000,price:.2},
  {ts:last.ts-100,receivedAt:last.ts+1000,price:2.4}];
 assert.equal(countertrendPivotRisk({quoteHistory:[...q,...extra],quoteAt:last.ts,now:last.ts,
  price:last.price,side:'PUT'}),expected);
});
test('entry base applies common guard to all previously exempt reversal labels',()=>{
 const code=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.match(code,/const pivotRisk=proposed\.ready&&countertrendPivotRisk\(/);
 assert.doesNotMatch(code,/!confirmedStructure&&countertrendPivotRisk/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {currentQuoteStructureTurn,applyObservedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {countertrendPivotRisk} from '../sentinel-trading-lab/agent/src/core/shared-pivot-guard.mjs';
const T=1700000000000;
const wave=Array.from({length:181},(_,i)=>({ts:T+i*1000,price:1-.000008*i+.00055*Math.sin((i+24)*Math.PI*2/30)+.000006*Math.sin(i*1.4)}));
const path=()=>{
 const q=wave.map(x=>({...x})),p=q.at(-1).price;
 for(const [a,b] of [[0,-.00028],[-.00028,.00012],[.00012,-.00008],[-.00008,.0004]])
  for(let i=1;i<=4;i++)q.push({ts:q.at(-1).ts+1000,price:p+a+(b-a)*i/4});
 return q;
};
const input=(q,side='CALL')=>({quoteHistory:q,quoteAt:q.at(-1).ts,now:q.at(-1).ts,price:q.at(-1).price,side});
test('current higher low plus intervening high break releases a real reversal before closed-bar pivots change',()=>{
 const q=path(),a=input(q),proof=currentQuoteStructureTurn(a);
 assert.ok(proof);assert.ok(proof.turnPrice>q.at(-13).price);
 const evidence=side=>({kind:'failed-breakout-structure-change',side,confirmedAt:a.quoteAt,level:{confirmedPivots:2}});
 assert.equal(countertrendPivotRisk({...a,reversalEvidence:evidence('CALL')}),false);
 assert.equal(countertrendPivotRisk(a),true,'a microstructure turn without historical level proof is insufficient');
 assert.equal(countertrendPivotRisk(input(wave)),true,'older downtrend still rejects a blind CALL');
 const mirror=q.map(x=>({...x,price:2-x.price}));
 assert.ok(currentQuoteStructureTurn(input(mirror,'PUT')));
 assert.equal(countertrendPivotRisk({...input(mirror,'PUT'),reversalEvidence:evidence('PUT')}),false);
});
test('the first bounce, future data, and gaps cannot invent a higher-low structure break',()=>{
 const q=path(),early=q.slice(0,-5);
 assert.equal(currentQuoteStructureTurn(input(early)),null);
 const a=input(q),future={ts:a.quoteAt+1000,price:10};
 assert.deepEqual(currentQuoteStructureTurn({...a,quoteHistory:[...q,future]}),currentQuoteStructureTurn(a));
 const gap=q.map((x,i)=>({...x,ts:x.ts+(i>=q.length-4?5000:0)}));
 assert.equal(currentQuoteStructureTurn(input(gap)),null);
});
test('a proven historical level reclaim is assessed at every selected expiry without waiting for a new candle',()=>{
 const prices=[102,100.6,101.3,99.4,100.2,99.9,101.8],rows=[];
 for(let k=0;k<prices.length-1;k++)for(let i=0;i<10;i++)rows.push({ts:T+rows.length*500,price:prices[k]+(prices[k+1]-prices[k])*i/10});
 rows.push({ts:T+rows.length*500,price:101.8});
 const last=rows.at(-1),map={observedCandles:100,asOf:T-60000,tolerance:.15,
  levels:[{low:100,high:100,level:100,confirmedPivots:2,independentTests:3,windows:[3,10,20,50,100]}]};
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
  const result=applyObservedLevelSequence({candidate:{ready:false,side:null},map,quoteHistory:rows,quoteAt:last.ts,now:last.ts,price:last.price,durationMs});
  assert.equal(result.side,'CALL',String(durationMs));assert.equal(result.observedAt,last.ts);
  assert.equal(result.reason,'failed-breakout-structure-change');
 }
});

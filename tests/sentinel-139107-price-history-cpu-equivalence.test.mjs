import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHistoricalPriceStructure as oldApply} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.baseline.mjs';
import {applyHistoricalPriceStructure as newApply} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
const T=1800000000000;
const QUOTES=Array.from({length:6000},(_,i)=>({ts:T-300000+i*50,receivedAt:T-300000+i*50,
 price:100+Math.sin(i*.035)*.11+Math.sin(i*.002)*.23}));
const cand={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
const structure={candles:100,periodMs:60000,atr:.3,tolerance:.03,
 averages:[{value:100.2,slope:.01,period:20}],zones:[
  {low:99.6,high:99.62,level:99.61,touches:4,pivots:2,
   confirmedPivots:2,independentRejections:2,ages:[2,5]},
  {low:100.4,high:100.42,level:100.41,touches:3,pivots:2,
   confirmedPivots:1,independentRejections:1,ages:[2,6]}
 ]};
const invoke=(fn,quotes,now,durationMs)=>fn({candidate:cand,structure,quoteHistory:quotes,
 quoteAt:now,now,price:quotes.findLast(x=>x.ts<=now)?.price,durationMs});
const comparable=x=>({ready:x.ready,side:x.side,reason:x.reason,
 observedAt:x.observedAt,entryPrice:x.entryPrice});
test('unchanged 5/15/30s ENTRY decision versus exact 13.9.106 on a dense real-time-shaped quote tape',()=>{
 for(const d of [5000,15000,30000]){
  for(let i=1000;i<QUOTES.length;i+=57){
   const q=QUOTES.slice(0,i+1),now=q.at(-1).ts;
   assert.deepEqual(comparable(invoke(newApply,q,now,d)),
    comparable(invoke(oldApply,q,now,d)),JSON.stringify({d,i}));
  }
 }
});
test('breakouts and independent continuation remain identical for any holding period',()=>{
 for(const d of [60000,120000,300000]){
  for(let i=1000;i<QUOTES.length;i+=89){
   const q=QUOTES.slice(0,i+1),now=q.at(-1).ts;
   const a=invoke(oldApply,q,now,d),b=invoke(newApply,q,now,d);
   if(a.reason!=='historical-level-rejection')
    assert.deepEqual(comparable(a),comparable(b),JSON.stringify({d,i}));
  }
 }
});
test('fast recent-history traversal reduces level-calculation work without any browser access',()=>{
 const q=QUOTES,now=q.at(-1).ts,rounds=200;
 const time=(fn)=>{
  const before=performance.now();
  for(let i=0;i<rounds;i++)invoke(fn,q,now,30000);
  return performance.now()-before;
 };
 time(oldApply);time(newApply);
 const oldMs=time(oldApply),newMs=time(newApply);
 console.log('HISTORICAL_LEVEL_CPU '+JSON.stringify({calls:rounds,
  baselineMs:+oldMs.toFixed(3),newMs:+newMs.toFixed(3),
  ratio:+(oldMs/newMs).toFixed(2)}));
 assert.ok(oldMs>0&&newMs>0);
});

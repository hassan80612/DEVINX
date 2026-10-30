import test from 'node:test';
import assert from 'node:assert/strict';
import {formingCandleContinuation} from '../sentinel-trading-lab/agent/src/core/forming-candle-continuation.mjs';
import {historicalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
function scenario(mirror=false,durationMs=60000){
 const invert=p=>mirror?200-p:p;
 const candles=Array.from({length:100},(_,i)=>{
  const open=100+i*.02;
  const bar=i===99?{open:101.98,high:102.04,low:101.78,close:101.805}:
   {open,high:open+.04,low:open-.025,close:open+.015};
  return {from:T-(100-i)*60000,to:T-(99-i)*60000,
   open:invert(bar.open),close:invert(bar.close),high:invert(mirror?bar.low:bar.high),low:invert(mirror?bar.high:bar.low)};
 });
 const quoteHistory=Array.from({length:35},(_,i)=>({ts:T-35000+i*1000,
  price:invert(101.805+(i%2)*.004+.001*Math.sin(i)),receivedAt:T-35000+i*1000}));
 for(let i=0;i<3;i++)quoteHistory.push({ts:T+i*1000,receivedAt:T+i*1000,price:invert(101.805+i*.005)});
 const last=quoteHistory.at(-1);
 return {candles,quoteHistory,quoteAt:last.ts,now:last.ts,price:last.price,durationMs,
  structure:historicalPriceStructure({candles,now:last.ts})};
}
for(const durationMs of [30000,60000])for(const mirror of [false,true]){
 test(durationMs+' mirrored='+mirror+': resumes in the first observed candle movement, before the old swing edge',()=>{
  const a=scenario(mirror,durationMs),out=formingCandleContinuation(a);
  assert.equal(out?.ready,true,JSON.stringify({structure:a.structure.averages,out}));
  assert.equal(out.side,mirror?'PUT':'CALL');assert.equal(out.reason,'forming-candle-pullback-continuation');
  assert.equal(out.formingContinuation.candleFrom,T);
  assert.equal(a.quoteAt-T,2000,'example confirms after two seconds of actual quotes, not a fixed two-second rule');
  assert.ok(out.formingContinuation.room>=out.formingContinuation.requiredRoom);
  assert.ok((mirror?-1:1)*(out.formingContinuation.previousSwingEdge-a.price)>0,'entry is BEFORE the old high/low');
  assert.equal(out.observedAt,a.quoteAt);assert.equal(out.entryPrice,a.price);
 });
 test(durationMs+' mirrored='+mirror+': one/two quotes, exhausted body, wrong trend and late attachment do not create an early entry',()=>{
  const a=scenario(mirror,durationMs);
  for(const count of [1,2]){
   const q=a.quoteHistory.slice(0,35+count),last=q.at(-1);
   assert.equal(formingCandleContinuation({...a,quoteHistory:q,quoteAt:last.ts,now:last.ts,price:last.price}),null);
  }
  const q=a.quoteHistory.map(x=>({...x}));q.at(-1).price+=(mirror?-1:1)*.15;
  assert.equal(formingCandleContinuation({...a,quoteHistory:q,price:q.at(-1).price}),null,'waiting for a large extension cannot renew the setup');
  assert.equal(formingCandleContinuation({...a,structure:{...a.structure,averages:a.structure.averages.map(x=>({...x,slope:-x.slope}))}}),null);
  assert.equal(formingCandleContinuation({...a,durationMs:300000}),null,'5m remains reversal-only');
 });
 test(durationMs+' mirrored='+mirror+': future OHLC/ticks cannot authorize the current forming candle',()=>{
  const a=scenario(mirror,durationMs),expected=formingCandleContinuation(a);
  const futureCandle={from:T,to:T+60000,open:a.price,close:1000,high:1000,low:1};
  const next={ts:a.quoteAt+1000,receivedAt:a.now+1000,price:1};
  assert.deepEqual(formingCandleContinuation({...a,candles:[...a.candles,futureCandle],quoteHistory:[...a.quoteHistory,next]}),expected);
  assert.equal(formingCandleContinuation({...a,quoteHistory:a.quoteHistory.map((q,i)=>i===a.quoteHistory.length-1?{...q,receivedAt:a.now+1000}:q)}),null);
 });
}
test('the shared runtime can release a 1m continuation before the current candle closes',()=>{
 const a=scenario(),rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1',precisionProfile:'horizon-balanced-v148'});
 rt.patchSettings({engine:'automatic',asset:'EUR/USD OTC',orderDurationMs:60000},'forming-candle-test');
 const out=rt._signalValidationGate({analysis:{},settings:rt.settings,now:a.now,
  snap:{provider:'exnova',price:a.price,quoteTs:a.quoteAt,quoteHistory:a.quoteHistory,candles:a.candles,historicalCandlesVerified:true,payout:null}}).analysis.vnext;
 assert.equal(out.futureEntryAnchor?.phase,'fired',JSON.stringify(out.nowObservation));
 assert.equal(out.futureEntryAnchor.side,'CALL');
 assert.equal(out.nowObservation.reason,'forming-candle-pullback-continuation');
});

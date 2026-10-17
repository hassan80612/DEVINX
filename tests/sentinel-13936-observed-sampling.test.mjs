import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {thirtySecondCycleForecast as forecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
const T=1792250040000;
const history=Array.from({length:181},(_,i)=>({ts:T+(i-180)*1000,price:1.1+.0003*Math.sin((i-180)/19)}));
const args=(offset=750)=>{const price=history.at(-1).price,quoteAt=T+offset;return {quoteHistory:[...history,{ts:quoteAt,price}],price,quoteAt,now:quoteAt};};
test('valid 1Hz history remains available on either side of the previous 500ms boundary',()=>{
 for(const ms of [0,250,499,500,501,750,999])assert.equal(forecast(args(ms)).ready,true,`quote phase ${ms}`);
});
test('real gaps remain rejected instead of being filled by stale prices',()=>{
 const a=args();a.quoteHistory=a.quoteHistory.filter(q=>q.ts<T-80000||q.ts>T-70000);
 assert.equal(forecast(a).reason,'observed-cycle-history-gap');
});
test('the actual timestamps retain a regular forecast under a common subsecond time shift',()=>{
 const xs=history.map(q=>({...q,ts:q.ts+250})),ys=xs.map(q=>({...q,ts:q.ts+500}));
 const run=quoteHistory=>forecast({quoteHistory,quoteAt:quoteHistory.at(-1).ts,now:quoteHistory.at(-1).ts,price:quoteHistory.at(-1).price});
 const x=run(xs),y=run(ys);assert.equal(x.ready,true);assert.equal(x.observedPoints,xs.length);
 assert.equal(y.side,x.side);assert.ok(Math.abs(y.expectedLogMove-x.expectedLogMove)<1e-15);
});
test('future quotes and quotes received after evaluation cannot enter the projection',()=>{
 const a=args(),b={...a,quoteHistory:[...a.quoteHistory,{ts:a.quoteAt+1000,price:8,receivedAt:a.now+1000},{ts:T-500,price:9,receivedAt:a.now+2000}]};
 assert.deepEqual(forecast(b),forecast(a));
});
test('each second retains only its last actually observed quote',()=>{
 const quotes=history.flatMap(q=>[{ts:q.ts,price:q.price*.99},{ts:q.ts+250,price:q.price}]);
 const retained=quotes.filter(q=>q.ts%1000===250),run=quoteHistory=>forecast({quoteHistory,quoteAt:quotes.at(-1).ts,now:quotes.at(-1).ts,price:quotes.at(-1).price});
 assert.deepEqual(run(quotes),run(retained));assert.equal(run(quotes).observedPoints,181);
});
test('quote freshness and verified-current-price requirements remain enforced',()=>{
 const a=args();assert.equal(forecast({...a,now:a.quoteAt+1451}).reason,'invalid-30s-input');
 assert.equal(forecast({...a,price:a.price+.01}).reason,'unverified-live-quote');
});
test('all 12 aligned 1Hz reference paths preserve the released 13.9.35 forecast exactly',()=>{
 const reference=JSON.parse(readFileSync(new URL('./fixtures/sentinel-13935-aligned-forecast-reference.json',import.meta.url)));
 for(const {path,forecast:expected} of reference.fixtures){
  const quoteHistory=Array.from({length:181},(_,i)=>({ts:T+(i-180)*1000,price:1.1*Math.exp((path%2?1:-1)*(i*.0000002+.0003*Math.sin(i/(4+path))+.00002*Math.cos(i/(2+path))))}));
  assert.deepEqual(forecast({quoteHistory,quoteAt:T,now:T,price:quoteHistory.at(-1).price}),expected,`aligned path ${path}`);
 }
});

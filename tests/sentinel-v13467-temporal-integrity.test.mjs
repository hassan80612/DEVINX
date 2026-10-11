import test from 'node:test';
import assert from 'node:assert/strict';
import {specialistForwardPrediction}
 from '../sentinel-trading-lab/agent/src/core/specialist-forward-models.mjs';
import {
 compressTemporalQuotes,temporalQuoteProfile,BoundedTemporalQuoteArchive
} from '../sentinel-trading-lab/agent/src/core/vnext-temporal-evidence-research.mjs';

const BASE=1800000000000;
const one=Array.from({length:3000},(_,i)=>({
 ts:BASE+i*1000,
 price:1.1+.00014*Math.sin(i/36)+.000017*Math.sin(i/6)+i*.000000015
}));
const multiple=one.flatMap(r=>[0,250,500,750].map(shift=>({
 ts:r.ts+shift,price:r.price
})));
const asOf=one.at(-1).ts;
test('the SAME price trajectory should not depend on quote refresh rate',()=>{
 const original1=specialistForwardPrediction({
  engineId:'price_action',quoteHistory:one,asOf,selectedSeconds:30
 });
 const original4=specialistForwardPrediction({
  engineId:'price_action',quoteHistory:multiple,asOf,selectedSeconds:30
 });
 // Defect reproduction: price-action currently uses sample COUNT as time.
 assert.notEqual(original1.prediction.projectedPrice,original4.prediction.projectedPrice,
  'test must first reproduce 13.4.67 quote-density defect');
 const normalized1=compressTemporalQuotes({quoteHistory:one,asOf,maxPoints:4096});
 const normalized4=compressTemporalQuotes({quoteHistory:multiple,asOf,maxPoints:4096});
 assert.deepEqual(normalized1,normalized4);
 for(const h of [5,10,30,60,120,300]){
  for(const engineId of ['price_action','mean_reversion','trend','support_resistance',
     'breakout','trendline_breakout','fibonacci_retest','smart_confluence']){
   const first=specialistForwardPrediction({
    engineId,quoteHistory:normalized1,asOf,selectedSeconds:h
   });
   const second=specialistForwardPrediction({
    engineId,quoteHistory:normalized4,asOf,selectedSeconds:h
   });
   assert.equal(first.prediction?.projectedPrice,second.prediction?.projectedPrice,
    'identical history must mean identical future projection '+engineId+' '+h);
  }
 }
});
test('2,400 quotes are NOT 2,400 seconds when broker refreshes 4 times per second',()=>{
 const p1=temporalQuoteProfile(one.slice(-2400),asOf);
 const p4=temporalQuoteProfile(multiple.slice(-2400),asOf);
 assert.equal(p1.quotesPerSecond,1);
 assert.ok(p4.quotesPerSecond>3.9);
 assert.ok(p1.spanMs>=2399000);
 assert.ok(p4.spanMs<=601000);
 assert.equal(p1.adequateToCover[300],true);
 assert.equal(p4.adequateToCover[300],false);
});
test('bounded sidecar retains temporal memory and newest quote without Supabase',()=>{
 const archive=new BoundedTemporalQuoteArchive({maxPoints:2500,maxAgeSeconds:8000});
 const batch=multiple;
 for(let j=0;j<batch.length;j+=800){
  const b=batch.slice(j,j+800);
  archive.ingest(b,b.at(-1).ts);
 }
 const snap=archive.snapshot(multiple.at(-1).ts);
 const p=archive.profile(multiple.at(-1).ts);
 assert.ok(snap.length<=2500);
 assert.equal(snap.at(-1).ts,multiple.at(-1).ts);
 assert.ok(p.spanMs>2200000,'bucketed history should outlive 2,400 raw at 4Hz');
 assert.equal(p.quoteAgeMs,0);
});
test('no invented ticks, no future labels and time ordered actual quote timestamps',()=>{
 const impossible={ts:asOf+10000,price:199};
 const result=compressTemporalQuotes({
  quoteHistory:[...multiple,impossible],asOf,maxPoints:1600
 });
 assert.equal(result.at(-1).ts,asOf);
 assert.ok(result.length<=1600);
 for(const q of result){
  assert.ok(q.ts<=asOf);
  assert.ok(multiple.some(x=>x.ts===q.ts&&x.price===q.price));
 }
 for(let i=1;i<result.length;i++)assert.ok(result[i].ts>result[i-1].ts);
});

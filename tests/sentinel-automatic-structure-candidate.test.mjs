import test from 'node:test';
import assert from 'node:assert/strict';
import {structureForecast} from '../sentinel-trading-lab/agent/src/core/automatic-structure-forecast.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
const start=1700000000000;
const history=(kind='cycle')=>Array.from({length:2400},(_,i)=>({ts:start+i*1000,price:Math.exp(kind==='trend'?i*.00001:.001*Math.sin(i/50))}));
test('future quotes and not-yet-arrived backfills cannot change the candidate',()=>{
 const qs=history(),asOf=qs.at(-1).ts,input={quoteHistory:qs,asOf,selectedSeconds:60};
 const baseline=structureForecast(input);
 assert.deepEqual(structureForecast({...input,quoteHistory:[...qs,{ts:asOf+1000,price:10000},{ts:asOf-500,price:10000,receivedAt:asOf+1000}]}),baseline);
 assert.equal(structureForecast({...input,quoteHistory:qs.map(q=>({...q,receivedAt:asOf}))}),null);
 assert.ok(baseline.latestTrainingOutcomeAt<=asOf);
});
test('pure linear movement is not evidence of a price cycle',()=>{
 const qs=history('trend');const r=structureForecast({quoteHistory:qs,asOf:qs.at(-1).ts,selectedSeconds:60});
 assert.equal(r.cycle,null);
});
test('stale or short observable history produces no specialized forecast',()=>{
 const qs=history(),asOf=qs.at(-1).ts;
 assert.equal(structureForecast({quoteHistory:qs,asOf:asOf+5000,selectedSeconds:60}),null);
 assert.equal(structureForecast({quoteHistory:qs.slice(-40),asOf,selectedSeconds:60}),null);
});
test('opt-in adapter owns exact horizon and keeps original fallback/default intact',()=>{
 for(const kind of ['cycle','trend']){
  const qs=history(kind),now=qs.at(-1).ts,settings={engine:'automatic',asset:'TEST',orderDurationMs:60000};
  const snap={quoteHistory:qs,quoteTs:now,price:qs.at(-1).price};
  const normal=singleEngineForecast({settings,snap,now});
  const explicit=singleEngineForecast({settings,snap,now,forecastModel:'original-67'});
  assert.deepEqual(normal,explicit);
  const result=singleEngineForecast({settings,snap,now,forecastModel:'structure-context-v2'});
  if(result.receipt){assert.equal(result.receipt.targetAt,now+60000);assert.equal(result.receipt.side,result.receipt.projectedPrice>result.receipt.referencePrice?'CALL':'PUT');}
  else assert.equal(result.operational.actionable,false,'weak projection may not be promoted to a signal');
  if(kind==='trend')assert.deepEqual(result,normal);
  else{
   const raw=structureForecast({quoteHistory:qs,asOf:now,selectedSeconds:60});
   assert.equal(result.modelVersion,'structure-context-v2');
   if(result.receipt){assert.equal(result.receipt.side,raw.side);assert.equal(result.receipt.projectedPrice,raw.projectedPrice);}
   else assert.equal(result.operational.actionable,false);
  }
 }
});

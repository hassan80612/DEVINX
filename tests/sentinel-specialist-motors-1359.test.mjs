import test from 'node:test';
import assert from 'node:assert/strict';
import {specialistForwardPrediction,SPECIALIST_FORECASTS} from '../sentinel-trading-lab/agent/src/core/specialist-forward-models.mjs';
const t=1800000000000;
const qs=Array.from({length:320},(_,i)=>({
 ts:t-(319-i)*1000,price:1.1+i*.000001+Math.sin(i/9)*.000025+Math.cos(i/31)*.000018
}));
test('every specialist computes independently from historical quote data',()=>{
 const projections=[];
 for(const engineId of Object.keys(SPECIALIST_FORECASTS)){
  const r=specialistForwardPrediction({engineId,quoteHistory:qs,asOf:t,selectedSeconds:30});
  assert.equal(r.status,'candidate-forward-prediction',engineId);
  assert.equal(r.calibrated,false);
  assert.ok(r.prediction.projectedPrice>0);
  assert.ok(r.prediction.expectedLow<=r.prediction.expectedHigh);
  assert.equal(r.prediction.modelConfidence,null);
  assert.equal(r.diagnostic.horizonSeconds,30);
  projections.push(r.prediction.projectedPrice);
 }
 assert.ok(new Set(projections).size>=5,'different motors must actually produce different price targets, not identical renamed outputs');
});
test('five second target differs from 60 second target for every distinct motor',()=>{
 for(const engineId of Object.keys(SPECIALIST_FORECASTS)){
  const five=specialistForwardPrediction({engineId,quoteHistory:qs,asOf:t,selectedSeconds:5});
  const sixty=specialistForwardPrediction({engineId,quoteHistory:qs,asOf:t,selectedSeconds:60});
  assert.equal(five.diagnostic.horizonSeconds,5);
  assert.equal(sixty.diagnostic.horizonSeconds,60);
  assert.notEqual(five.prediction.expectedHigh,sixty.prediction.expectedHigh,engineId);
 }
});
test('future quote leakage and other engine fields cannot affect forecast',()=>{
 for(const engineId of Object.keys(SPECIALIST_FORECASTS)){
  const input={engineId,quoteHistory:qs,asOf:t,selectedSeconds:15};
  const a=specialistForwardPrediction(input),b=specialistForwardPrediction({
   ...input,quoteHistory:[...qs,{ts:t+100,price:99},{ts:t+1000,price:.1}],
   otherEngine:{side:'PUT',confidence:99},formingCandle:{side:'CALL'}
  });
  assert.deepEqual(a,b,engineId);
 }
});

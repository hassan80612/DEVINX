import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticForwardPrediction} from '../sentinel-trading-lab/agent/src/core/automatic-forward-model.mjs';
import {recordForwardForecast,evaluateForwardForecast} from '../sentinel-trading-lab/agent/src/core/forward-forecast-receipt.mjs';
import {selectedEngineForecastRequest} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
const t=1800000000000;
const sample=(n=240,base=1.1000,step=.000002)=>
 Array.from({length:n},(_,i)=>({ts:t-(n-i-1)*1000,price:Number((base+i*step+(i%7-3)*.000001).toFixed(7))}));
test('automatic model computes real price-price projection from historical quote path, not a timer',()=>{
 const quotes=sample(),o=automaticForwardPrediction({quoteHistory:quotes,asOf:t,selectedSeconds:5});
 assert.equal(o.status,'candidate-forward-prediction');
 assert.equal(o.calibrated,false);
 assert.ok(o.prediction.projectedPrice>0);
 assert.ok(o.prediction.expectedLow<=o.prediction.projectedPrice);
 assert.ok(o.prediction.expectedHigh>=o.prediction.projectedPrice);
 assert.ok(o.diagnostic.samples>=200);
 assert.equal(o.prediction.modelConfidence,null);
 assert.ok(o.prediction.evidence.every(x=>typeof x==='string'));
});
test('changing expiry changes projected endpoint, range and horizon computation, not just countdown text',()=>{
 const qs=sample();
 const five=automaticForwardPrediction({quoteHistory:qs,asOf:t,selectedSeconds:5});
 const ten=automaticForwardPrediction({quoteHistory:qs,asOf:t,selectedSeconds:10});
 const sixty=automaticForwardPrediction({quoteHistory:qs,asOf:t,selectedSeconds:60});
 assert.notEqual(five.prediction.projectedPrice,sixty.prediction.projectedPrice);
 assert.notEqual(five.prediction.expectedHigh,sixty.prediction.expectedHigh);
 assert.notEqual(ten.prediction.expectedHigh,sixty.prediction.expectedHigh);
 assert.equal(five.diagnostic.horizonSeconds,5);
 assert.equal(ten.diagnostic.horizonSeconds,10);
});
test('future ticks and forming/future candle data cannot contaminate the prediction',()=>{
 const quotes=sample(),a=automaticForwardPrediction({quoteHistory:quotes,asOf:t,selectedSeconds:15});
 const b=automaticForwardPrediction({
  quoteHistory:[...quotes,{ts:t+100,price:200},{ts:t+5000,price:.1}],
  asOf:t,selectedSeconds:15
 });
 assert.deepEqual(a,b);
});
test('a flat quote path is not falsely presented as directional knowledge',()=>{
 const quotes=sample(100,1.1,0).map(q=>({...q,price:1.1}));
 const a=automaticForwardPrediction({quoteHistory:quotes,asOf:t,selectedSeconds:5});
 assert.equal(a.prediction.side,'NEUTRAL');
 const request=selectedEngineForecastRequest({settings:{engine:'automatic',orderDurationMs:5000},now:t});
 assert.equal(recordForwardForecast({request,referenceQuote:{price:1.1,at:t},prediction:a.prediction,createdAt:t}).status,'no-measurable-forward-forecast');
});
test('automatic model ignores broker expiration and any other strategy selection',()=>{
 const q=sample();
 const a=automaticForwardPrediction({quoteHistory:q,asOf:t,selectedSeconds:10,brokerExpiresAt:t+60000,strategy2:'breakout'});
 const b=automaticForwardPrediction({quoteHistory:q,asOf:t,selectedSeconds:10,brokerExpiresAt:t+5000,strategy2:'trend'});
 assert.deepEqual(a,b);
});
test('automatic forward projection can be locked and evaluated without rewriting past',()=>{
 const q=sample(),model=automaticForwardPrediction({quoteHistory:q,asOf:t,selectedSeconds:10});
 const req=selectedEngineForecastRequest({settings:{engine:'automatic',orderDurationMs:10000},now:t});
 const receipt=recordForwardForecast({
   request:{...req,asset:'EUR/USD OTC',provider:'iq_option'},
   referenceQuote:{price:q.at(-1).price,at:q.at(-1).ts},
   prediction:model.prediction,createdAt:t
 });
 assert.equal(receipt.status,'forecast-created');
 assert.equal(receipt.receipt.targetAt,t+10000);
 const result=evaluateForwardForecast({
   receipt:receipt.receipt,actualQuote:{at:t+10400,price:1.10025}
 });
 assert.equal(result.status,'evaluated-market-price');
 assert.equal(result.source,'market-quote-not-broker-settlement');
});

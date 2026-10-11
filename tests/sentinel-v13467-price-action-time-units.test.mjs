import test from 'node:test';
import assert from 'node:assert/strict';
import {specialistForwardPrediction}
 from '../sentinel-trading-lab/agent/src/core/specialist-forward-models.mjs';
const BASE=1800000000000;
const prices=Array.from({length:950},(_,i)=>({
 ts:BASE+i*1000,price:1.1+.00009*Math.sin(i/27)+.00006*Math.sin(i/7)+i*.00000002
}));
const quadruple=prices.flatMap(q=>[0,250,500,750].map(k=>({
 ts:q.ts+k,price:q.price
})));
const now=prices.at(-1).ts;
const compute=(data,h)=>specialistForwardPrediction({
 engineId:'price_action',quoteHistory:data,asOf:now,selectedSeconds:h
});
test('Price Action leg uses elapsed time instead of quote count: same movement with 1Hz and 4Hz',()=>{
 const outcomes={};
 for(const h of [5,10,15,30,45,60,120,180,300]){
  const one=compute(prices,h),four=compute(quadruple,h);
  assert.equal(one.status,'candidate-forward-prediction');
  assert.equal(four.status,'candidate-forward-prediction');
  const p1=Number(one.prediction.projectedPrice),
   p4=Number(four.prediction.projectedPrice);
  const normalizedDifference=Math.abs(Math.log(p4/p1));
  // Tick arrival times and the end-of-hour boundary may produce up to one
  // second of leg misalignment; any leftover must remain tiny.
  assert.ok(normalizedDifference<.000035,
   'sample-frequency sensitivity at '+h+'s: '+normalizedDifference);
  outcomes[h]={one:p1,four:p4,logError:normalizedDifference};
 }
 console.log('PRICE_ACTION_TIME_UNIT_PARITY='+JSON.stringify(outcomes));
});
test('Price Action remains a single-engine independent prediction, no call/put gate introduced',()=>{
 const report=compute(prices,30);
 assert.equal(report.engineId,'price_action');
 assert.equal(report.calibrated,false);
 assert.equal(report.prediction.modelConfidence,null);
 assert.ok(['CALL','PUT','NEUTRAL'].includes(report.prediction.side));
});

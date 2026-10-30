import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOneMinuteRejectionProof} from '../sentinel-trading-lab/agent/src/core/one-minute-rejection-admission.mjs';
const T=1793398726000;
const scenarios=[
 {side:'CALL',price:.829685,reason:'multiscale-candle-rejection',proof:'not-away-from-confirmed-level',result:'win'},
 {side:'CALL',price:.829715,reason:'closed-range-extreme-reversal-confirmed',proof:'not-away-from-confirmed-level',result:'loss'},
 {side:'CALL',price:.829715,reason:'multiscale-candle-rejection',proof:'last-move-not-supporting',result:'win'},
 {side:'PUT',price:.830375,reason:'multiscale-candle-rejection',proof:'missing-past-horizon',result:'loss'},
 {side:'PUT',price:.830415,reason:'multiscale-candle-rejection',proof:'not-away-from-confirmed-level',result:'loss'},
 {side:'PUT',price:.830515,reason:'multiscale-candle-rejection',proof:'last-move-not-supporting',result:'loss'},
 {side:'CALL',price:.830375,reason:'multiscale-candle-rejection',proof:'not-away-from-confirmed-level',result:'loss'},
 {side:'PUT',price:.830335,reason:'multiscale-candle-rejection',proof:'medium-path-not-supporting',result:'loss'},
 {side:'CALL',price:.830605,reason:'closed-range-extreme-reversal-confirmed',proof:'not-away-from-confirmed-level',result:'loss'},
 {side:'PUT',price:.829775,reason:'multiscale-candle-rejection',proof:'last-move-not-supporting',result:'loss'}
];
const candidate=(r)=>({
 ready:true,side:r.side,reason:r.reason,
 entryPrice:r.price,observedAt:T,
 priceStructure:{reactionProof:{confirmed:false,reason:r.proof,durationMs:60000}}
});
test('197: actual 196 log rejections with FALSE expiry proof may not be labelled confirmed 1m orders',()=>{
 let rejectedLoss=0,rejectedWin=0;
 for(const scenario of scenarios){
  const item=candidate(scenario);
  const old=structuredClone(item);
  const result=reviewOneMinuteRejectionProof({candidate:item,durationMs:60000,
   quoteAt:T,now:T+280,price:scenario.price});
  assert.equal(result.ready,false);
  assert.equal(result.side,null,'never invert an entry');
  assert.equal(result.provisionalSide,scenario.side);
  assert.equal(result.entryRisk.kind,'one-minute-level-rejection-unconfirmed');
  assert.deepEqual(item,old,'pure verdict, no mutation of candle data or bot state');
  if(scenario.result==='loss')rejectedLoss++;
  else rejectedWin++;
 }
 assert.equal(rejectedLoss,8);
 assert.equal(rejectedWin,2);
});
test('197: confirmed level reversals and non-rejection/continuation reasons stay eligible',()=>{
 for(const reason of ['historical-level-rejection','confirmed-fast-level-reversal',
  'failed-breakout-structure-change','break-retest-continuation',
  'closed-structure-and-live-impulse','historical-level-breakout']){
  const item={...candidate(scenarios[0]),reason};
  assert.equal(reviewOneMinuteRejectionProof({candidate:item,durationMs:60000,
   quoteAt:T,now:T+100,price:item.entryPrice}),item,reason);
 }
 const confirmed=candidate(scenarios[0]);
 confirmed.priceStructure.reactionProof.confirmed=true;
 assert.equal(reviewOneMinuteRejectionProof({candidate:confirmed,durationMs:60000,
  quoteAt:T,now:T+100,price:confirmed.entryPrice}),confirmed);
});
test('197: do not freeze analyst for absent proof, non-1m horizon or no actual quote',()=>{
 for(const durationMs of [30000,300000]){
  const item=candidate(scenarios[0]);
  assert.equal(reviewOneMinuteRejectionProof({candidate:item,durationMs,
   quoteAt:T,now:T+100,price:item.entryPrice}),item);
 }
 const missing=candidate(scenarios[0]);delete missing.priceStructure.reactionProof;
 assert.equal(reviewOneMinuteRejectionProof({candidate:missing,durationMs:60000,
  quoteAt:T,now:T+100,price:missing.entryPrice}),missing);
 const mismatch=candidate(scenarios[0]);
 assert.equal(reviewOneMinuteRejectionProof({candidate:mismatch,durationMs:60000,
  quoteAt:T,now:T+100,price:mismatch.entryPrice+.001}),mismatch);
});

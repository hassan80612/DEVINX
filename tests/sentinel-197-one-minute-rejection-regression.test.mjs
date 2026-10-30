import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOneMinuteRejectionProof} from '../sentinel-trading-lab/agent/src/core/one-minute-rejection-admission.mjs';
const T=1793398726000;
// These are the exact reported signal price / side / reason / horizon-proof
// fields from the user's 13.9.196 EUR/GBP OTC ZIP, in execution order.
// The outcomes are not used to select or tune the gate. They are not a live
// experiment: tests verify proof-handling, not actual WIN-rate predictions.
const decisions=[
 ['CALL',.830485,'break-retest-continuation',null],
 ['PUT',.829975,'failed-breakout-structure-change',null],
 ['CALL',.829685,'multiscale-candle-rejection','not-away-from-confirmed-level'],
 ['CALL',.829715,'closed-range-extreme-reversal-confirmed','not-away-from-confirmed-level'],
 ['CALL',.829535,'failed-breakout-structure-change','not-away-from-confirmed-level'],
 ['CALL',.829715,'multiscale-candle-rejection','last-move-not-supporting'],
 ['PUT',.830375,'multiscale-candle-rejection','missing-past-horizon'],
 ['PUT',.830455,'historical-level-rejection','confirmed'],
 ['CALL',.830655,'closed-structure-and-live-impulse',null],
 ['PUT',.830365,'closed-structure-and-live-impulse',null],
 ['PUT',.830415,'multiscale-candle-rejection','not-away-from-confirmed-level'],
 ['PUT',.830515,'multiscale-candle-rejection','last-move-not-supporting'],
 ['PUT',.830715,'multiscale-candle-rejection','not-away-from-confirmed-level'],
 ['CALL',.830485,'failed-breakout-structure-change',null],
 ['PUT',.830445,'multiscale-candle-rejection','not-away-from-confirmed-level'],
 ['CALL',.830375,'multiscale-candle-rejection','not-away-from-confirmed-level'],
 ['CALL',.830465,'historical-level-breakout',null],
 ['PUT',.830515,'historical-level-rejection','confirmed'],
 ['CALL',.830335,'multiscale-candle-rejection','not-away-from-confirmed-level'],
 ['PUT',.830335,'multiscale-candle-rejection','medium-path-not-supporting'],
 ['CALL',.830495,'historical-level-rejection','confirmed'],
 ['CALL',.830825,'historical-level-breakout',null],
 ['CALL',.830605,'closed-range-extreme-reversal-confirmed','not-away-from-confirmed-level'],
 ['CALL',.830355,'multiscale-candle-rejection','not-away-from-confirmed-level'],
 ['PUT',.829905,'closed-structure-and-live-impulse',null],
 ['CALL',.829905,'multiscale-candle-rejection','last-move-not-supporting'],
 ['PUT',.829775,'multiscale-candle-rejection','last-move-not-supporting'],
 ['PUT',.830005,'multiscale-candle-rejection','not-away-from-confirmed-level'],
 ['PUT',.830095,'confirmed-fast-level-reversal','not-away-from-confirmed-level']
];
const candidate=(row,ms=60000)=>({
 ready:true,side:row[0],reason:row[2],observedAt:T,entryPrice:row[1],
 priceStructure:row[3]?{reactionProof:{confirmed:row[3]==='confirmed',
  durationMs:ms,reason:row[3]}}:{}
});
test('197: replay ALL 29 original 196 decisions, veto documented contradictory 1m rejection proof only',()=>{
 assert.equal(decisions.length,29);
 let vetoed=0,failedProof=0,missingPreserved=0,otherReversalsPreserved=0;
 for(const row of decisions){
  const c=candidate(row),copy=structuredClone(c);
  const got=reviewOneMinuteRejectionProof({candidate:c,original:c,durationMs:60000,
   quoteAt:T,now:T+300,price:row[1]});
  assert.deepEqual(c,copy,'no input/cached decision mutation');
  if(row[3]&&row[3]!=='confirmed')failedProof++;
  if(got.ready===false){
   vetoed++;
   assert.equal(got.side,null,'no guessed opposite direction');
   assert.equal(got.provisionalSide,row[0]);
   assert.equal(got.entryRisk?.durationMs,60000);
  }else{
   assert.equal(got,c,'existing admission remains authorized');
   if(row[3]==='missing-past-horizon')missingPreserved++;
   if(['failed-breakout-structure-change','confirmed-fast-level-reversal'].includes(row[2]))
    otherReversalsPreserved++;
  }
 }
 assert.equal(failedProof,18);
 assert.equal(vetoed,15);
 assert.equal(missingPreserved,1);
 assert.equal(otherReversalsPreserved,4);
});
test('197: a confirmed or absent 30s/1m/5m proof cannot create a wait or reverse an entry',()=>{
 for(const ms of [30000,60000,300000]){
  for(const reason of ['closed-range-extreme-reversal-confirmed','historical-level-rejection','confirmed-level-structure-reversal','confirmed-fast-level-reversal']){
   const c={...candidate(['CALL',.83042,reason,'confirmed'],ms)};
   assert.equal(reviewOneMinuteRejectionProof({candidate:c,durationMs:ms,
    quoteAt:T,now:T+200,price:c.entryPrice}),c);
   const absent={...c,priceStructure:{}};
   assert.equal(reviewOneMinuteRejectionProof({candidate:absent,durationMs:ms,
    quoteAt:T,now:T+200,price:c.entryPrice}),absent);
  }
 }
});
test('197: 30s and 5m independently reject CURRENT negative price evidence when real history exists',()=>{
 const q=Array.from({length:85},(_,i)=>({ts:T-21000+i*250,
  receivedAt:T-21000+i*250,price:1.202-i*.000015}));
 for(const ms of [30000,60000,300000]){
  const c={ready:true,side:'CALL',reason:'confirmed-level-structure-reversal',
   observedAt:T,entryPrice:q.at(-1).price,priceStructure:{}};
  const out=reviewOneMinuteRejectionProof({candidate:c,durationMs:ms,
   quoteHistory:q,quoteAt:T,now:T+80,price:c.entryPrice});
  assert.equal(out.ready,false,'contradicted live reversal '+ms);
  assert.equal(out.entryRisk.failedProof,'current-price-opposes-reversal');
  assert.equal(out.side,null);
 }
});
test('197: genuinely rising quote route stays eligible; no extra time collection or mandatory 100 candles',()=>{
 const rising=Array.from({length:85},(_,i)=>({ts:T-21000+i*250,
  receivedAt:T-21000+i*250,price:1.201+i*.000015}));
 for(const ms of [30000,60000,300000]){
  const c={ready:true,side:'CALL',reason:'confirmed-level-structure-reversal',
   observedAt:T,entryPrice:rising.at(-1).price};
  assert.equal(reviewOneMinuteRejectionProof({candidate:c,durationMs:ms,
   quoteHistory:rising,quoteAt:T,now:T+100,price:c.entryPrice}),c);
 }
});
test('197: 5m true contradicting level proof vetoes but missing history never freezes',()=>{
 for(const ms of [30000,60000,300000]){
  const c=candidate(['PUT',.83012,'historical-level-rejection','medium-path-not-supporting'],ms);
  const out=reviewOneMinuteRejectionProof({candidate:c,durationMs:ms,
   quoteAt:T,now:T+150,price:c.entryPrice});
  assert.equal(out.ready,false);
  const missing=candidate(['PUT',.83012,'historical-level-rejection','missing-past-horizon'],ms);
  assert.equal(reviewOneMinuteRejectionProof({candidate:missing,durationMs:ms,
   quoteAt:T,now:T+150,price:missing.entryPrice}),missing);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSpikeExhaustion242,reviewBoldSpikeReversal242} from '../sentinel-trading-lab/agent/src/core/spike-exhaustion-counterturn-242.mjs';
import {reviewFirstWaveCounterturn} from '../sentinel-trading-lab/agent/src/core/first-wave-counterturn-237.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
const T=1800000000000;
const prices=[0,1,3,5,7,10,14,20,29,40,50,57,60,58,55,52];
const quotes=arr=>arr.map((x,i)=>{const ts=T-(arr.length-1-i)*1000;return {ts,receivedAt:ts,price:1.10000+x*.00001}});
const context=(q,ms=30000,side='CALL')=>({candidate:{ready:true,side,reason:'historical-level-breakout',observedAt:q.at(-1).ts,entryPrice:q.at(-1).price},
  quoteHistory:q,quoteAt:q.at(-1).ts,now:q.at(-1).ts,price:q.at(-1).price,durationMs:ms});
test('242: 30s and 1m: first peak rejection reverses in the middle of the chart, not only at historical extremes',()=>{
 for(const ms of [30000,60000]){
  const arg=context(quotes(prices),ms);
  const evidence=assessSpikeExhaustion242(arg);
  assert.equal(evidence.kind,'flip');assert.equal(evidence.side,'PUT');assert.equal(evidence.nearWall,false);
  const entry=reviewBoldSpikeReversal242(arg);
  assert.equal(entry.side,'PUT');assert.equal(entry.originalDecisionSide,'CALL');
  assert.equal(marketReading({candidate:entry}),'REVERSÃO CONFIRMADA · PUT');
  assert.equal(entry.reason,'observed-spike-exhaustion-reversal-242');
  assert.strictEqual(reviewBoldSpikeReversal242({...arg,candidate:entry}),entry);
 }
});
test('242: fast falling exhaustion votes the opposite CALL symmetrically',()=>{
 const arg=context(quotes(prices.map(v=>-v)),60000,'PUT');
 assert.equal(assessSpikeExhaustion242(arg).side,'CALL');
});
test('242: an unbroken spike or a single tiny correction is not a reversal',()=>{
 for(const arr of [prices.slice(0,13),prices.slice(0,14),[...prices.slice(0,13),58,55,62]]){
  const arg=context(quotes(arr)),entry=reviewBoldSpikeReversal242(arg);
  assert.equal(entry.side,'CALL');
 }
});
test('242: 5m, unready candidates, stale observations and already qualified reversals are untouched',()=>{
 const q=quotes(prices),arg=context(q),noLevel={observedCandles:65,asOf:T-60000,tolerance:.00012,levels:[]};
 assert.equal(reviewFirstWaveCounterturn({...arg,map:noLevel}).ready,true);
 const five={...arg,durationMs:300000};
 assert.strictEqual(reviewBoldSpikeReversal242(five),arg.candidate);
 const wait={...arg,candidate:{ready:false,side:null}};
 assert.strictEqual(reviewBoldSpikeReversal242(wait),wait.candidate);
 const late={...arg,now:T+3000};
 assert.equal(assessSpikeExhaustion242(late).kind,'none');
 const rev={...arg,candidate:{...arg.candidate,side:'PUT',reason:'confirmed-level-structure-reversal'}};
 assert.strictEqual(reviewBoldSpikeReversal242(rev),rev.candidate);
});

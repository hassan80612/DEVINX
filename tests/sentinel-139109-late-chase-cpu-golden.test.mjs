import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {verifiedWallExhaustionRisk as baseline} from '../sentinel-trading-lab/agent/src/core/verified-wall-exhaustion.baseline.mjs';
import {verifiedWallExhaustionRisk as revised} from '../sentinel-trading-lab/agent/src/core/verified-wall-exhaustion.mjs';

const T=1800000000000;
const ending=[1.10070,1.10074,1.10080,1.10087,1.10092,1.10094,1.100944,1.100945];
const oldTicks=Array.from({length:6000},(_,i)=>({
 ts:T-6007000+i*1000,receivedAt:T-6007000+i*1000,price:1.08+i*.000001
}));
const ticks=[...oldTicks,...ending.map((price,i)=>({
 ts:T-7000+i*1000,receivedAt:T-7000+i*1000,price
}))];
const make=reason=>({
 candidate:{ready:true,side:'CALL',reason,observedAt:T,entryPrice:ending.at(-1)},
 structure:{tolerance:.00005,candleLevelMap:{observedCandles:60,asOf:T-1000,levels:[{
  low:1.10098,high:1.10102,level:1.101,confirmedPivots:2,
  independentRejections:2,resistanceWick:.8,supportWick:0
 }]}},
 quoteHistory:ticks,quoteAt:T,now:T,price:ending.at(-1)
});
test('original already-supported nonconfirmed direction and late wall verdict stay exactly equal',()=>{
 for(const reason of ['observed-trend-and-30s-cycle-projection','independently-confirmed-continuation']){
  const input=make(reason);
  assert.deepEqual(revised(input),baseline(input));
 }
});
test('both formerly bypassed historical labels now guard only the proven exhausted approach',()=>{
 for(const reason of ['historical-level-rejection','historical-level-breakout']){
  const input=make(reason);
  assert.equal(baseline(input),null);
  assert.equal(revised(input)?.kind,'verified-historical-late-entry-exhaustion');
 }
});
test('bounded recent-quote scanning uses less CPU than three complete tape scans',()=>{
 const input=make('observed-trend-and-30s-cycle-projection');
 const time=(fn,n=300)=>{const t=performance.now();for(let i=0;i<n;i++)fn(input);
  return performance.now()-t};
 time(baseline,30);time(revised,30);
 const oldMs=time(baseline),newMs=time(revised);
 console.log('EXHAUSTION_CPU '+JSON.stringify({calls:300,
  oldMs:+oldMs.toFixed(3),newMs:+newMs.toFixed(3),
  factor:+(oldMs/newMs).toFixed(2)}));
 assert.ok(oldMs>0&&newMs>0);
 assert.ok(newMs<oldMs*.80,'recent-window market guard must not slow the Agent');
});

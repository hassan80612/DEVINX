import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observedImpulsePhase,reviewFirstImpulseReversal}
 from '../sentinel-trading-lab/agent/src/core/impulse-lifecycle-227.mjs';
import {reviewH207UnifiedAdmission}
 from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {unifiedMarketEvidence227}
 from '../sentinel-trading-lab/agent/src/core/unified-market-evidence-227.mjs';
import {reviewLastMileEvidence}
 from '../sentinel-trading-lab/agent/worker/last-mile-evidence-222.mjs';
const T=1800000000000;
const timeline=[100.001,100.0009,100.0008,100.00068,100.00050,100.00030,
 100.00004,100.00009,100.00013,100.00018,100.00023,100.00029,100.00035,100.0004];
const tape=(values,now=T)=>values.map((price,i)=>({
 ts:now-(values.length-i-1)*1000,receivedAt:now-(values.length-i-1)*1000,price
}));
const map={
 observedCandles:80,asOf:T-60000,tolerance:.0003,
 levels:[{level:100,low:99.9998,high:100.0002,
  supportPivots:2,supportRejections:2,resistancePivots:0,resistanceRejections:0,
  independentTests:4,tests:[{age:40,independent:true}]}]
};
const c=()=>({ready:true,side:'PUT',reason:'closed-structure-and-live-impulse',
 observedAt:T,entryPrice:timeline.at(-1)});
test('227: observed violent impulse is not an automatic instruction to trade its own direction',()=>{
 const ticks=tape(timeline);
 const phase=observedImpulsePhase({quoteHistory:ticks,quoteAt:T,now:T,
  price:timeline.at(-1),durationMs:60000});
 assert.equal(phase.ready,true);
 assert.equal(phase.impulseSide,'PUT');
 assert.equal(phase.phase,'reversal-observed');
 assert.equal(phase.turnSide,'CALL');
});
test('227: a verified old support and new accelerating first turn can displace stale PUT in 30s/1m',()=>{
 for(const ms of [30000,60000]){
  const ticks=tape(timeline);
  const candidate=c();
  const p=reviewFirstImpulseReversal({candidate,map,quoteHistory:ticks,quoteAt:T,
   now:T,price:timeline.at(-1),durationMs:ms});
  assert.equal(p.ready,true,JSON.stringify(p));
  assert.equal(p.side,'CALL');
  assert.equal(p.reason,'confirmed-level-structure-reversal');
  const h=reviewH207UnifiedAdmission({candidate:p,quoteHistory:ticks,
   quoteAt:T,now:T,price:timeline.at(-1),durationMs:ms,allowVerifiedEarlyReversal:true});
  assert.equal(h.ready,true,JSON.stringify(h));
 }
});
test('227: no old verified support, no reversal; late stale quote and 5m stay unchanged',()=>{
 const original=c(),q=tape(timeline),spot=timeline.at(-1);
 const input={candidate:original,map,quoteHistory:q,quoteAt:T,now:T,price:spot};
 assert.strictEqual(reviewFirstImpulseReversal({...input,map:{...map,levels:[]},durationMs:60000}),original);
 assert.strictEqual(reviewFirstImpulseReversal({...input,now:T+2600,durationMs:60000}),original);
 assert.strictEqual(reviewFirstImpulseReversal({...input,durationMs:300000}),original);
 assert.strictEqual(reviewFirstImpulseReversal({...input,
  quoteHistory:q.slice(0,-1),durationMs:60000}),original);
 assert.strictEqual(reviewFirstImpulseReversal({...input,
  quoteHistory:tape([100.0001,100.0002,100.0001,100.00015,100.0001,100.00018,
   100.00019,100.00012,100.00020,100.00019,100.00021,100.00019,100.00020,100.00021]),
  durationMs:60000}),original,'small alternating ticks are not a turning structure');
});
test('227: late 222 warning is still diagnosable but not an extra required permission',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/worker/signal-executor.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/s\.lastMileAdvisory=lastMile.reason/);
 assert.doesNotMatch(src,/entrada descartada: confirmação de reversão contrária ao vencimento/);
 const res=reviewLastMileEvidence({signal:{at:T,durationMs:60000,side:'PUT'},
  evidence:{source:'now-structural-v1',signalAt:T,finalSide:'PUT',
   finalReason:'confirmed-fast-level-reversal',levelReaction:'rejection',
   levelExpiryProof:{confirmed:false,durationMs:60000}}});
 assert.equal(res.allowed,false,'diagnostic still knows the disagreement');
});
test('227: three-card patch retains last validated values and labels stale readings',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/worker/market-totals-readout.mjs',import.meta.url),'utf8');
 assert.match(src,/__sentinelLastConfirmedMarketTotals/);
 assert.match(src,/ÚLTIMA LEITURA/);
 assert.match(src,/contextKey/);
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(driver,/__sentinelMarketTotalsCache/);
});

test('227: EMA RSI ADX DMI and structure are shared evidence from past, not just last candle',()=>{
 const first=T-80*60000;
 const candles=Array.from({length:80},(_,i)=>{
  const value=100+i*.002;
  return {from:first+i*60000,to:first+(i+1)*60000,
   open:value-.001,close:value,high:value+.002,low:value-.003,
   receivedAt:first+(i+1)*60000};
 });
 const ticks=Array.from({length:185},(_,i)=>({
  ts:T-185000+i*1000,receivedAt:T-185000+i*1000,
  price:100+i*.00011
 }));
 ticks.push({ts:T,receivedAt:T,price:100+185*.00011});
 const result=unifiedMarketEvidence227({candles,quoteHistory:ticks,quoteAt:T,
  now:T,price:ticks.at(-1).price,proposedSide:'CALL',reversalSide:'PUT'});
 assert.equal(result.ready,true);
 assert.equal(result.trendSide,'CALL');
 assert.ok(Number.isFinite(result.rsi));
 assert.ok(result.evidenceCount>=2);
 assert.ok(result.continuationScore>result.reversalScore);
 const future=[...candles,{from:T+60000,to:T+120000,open:60,high:70,low:50,close:61}];
 const after=unifiedMarketEvidence227({candles:future,quoteHistory:ticks,
  quoteAt:T,now:T,price:ticks.at(-1).price,proposedSide:'CALL',reversalSide:'PUT'});
 assert.equal(after.trendSide,result.trendSide,'future candle cannot enter trend decisions');
 assert.equal(after.rsi,result.rsi,'future candle cannot enter RSI');
});

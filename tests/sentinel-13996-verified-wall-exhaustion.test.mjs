import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedWallExhaustionRisk as check} from '../sentinel-trading-lab/agent/src/core/verified-wall-exhaustion.mjs';
const T=1800000000000;
const up=[1.10070,1.10074,1.10080,1.10087,1.10092,1.10094,1.100944,1.100945];
function args(prices,side='CALL',reason='observed-trend-and-30s-cycle-projection'){
 const quoteHistory=prices.map((price,i)=>({ts:T-7000+i*1000,receivedAt:T-7000+i*1000,price}));
 const z=side==='CALL'?
  {low:1.10098,high:1.10102,level:1.101,confirmedPivots:2,independentRejections:2,resistanceWick:.8,supportWick:0}:
  {low:1.09898,high:1.09902,level:1.099,confirmedPivots:2,independentRejections:2,resistanceWick:0,supportWick:.8};
 const price=prices.at(-1);
 return {candidate:{ready:true,side,reason,observedAt:T,entryPrice:price},
  structure:{tolerance:.00005,candleLevelMap:{observedCandles:60,asOf:T-1000,levels:[z]}},
  quoteHistory,price,quoteAt:T,now:T};
}
test('a repeatedly rejected resistance only rejects a decelerating CALL approach',()=>{
 const risk=check(args(up));assert.equal(risk?.kind,'verified-level-fading-approach');
 assert.equal(risk?.level,1.101);
});
test('PUT at a confirmed support is symmetric',()=>{
 const prices=up.map(x=>2.2-x);
 assert.equal(check(args(prices,'PUT'))?.kind,'verified-level-fading-approach');
});
test('an accelerating continuation and completed breakout are retained',()=>{
 const accelerated=[1.10070,1.10072,1.10074,1.10076,1.10079,1.10082,1.10088,1.100945];
 assert.equal(check(args(accelerated)),null);
 assert.equal(check(args([1.10070,1.10074,1.10080,1.10087,1.10092,1.10106,1.101085,1.10110])),null);
});
test('completed confirmed structural turns and retests remain protected without weakening risk gate',()=>{
 for(const reason of ['multiscale-candle-rejection','failed-breakout-structure-change',
  'break-retest-continuation','rejection-followthrough-clear-room',
  'closed-range-extreme-reversal-confirmed'])
  assert.equal(check(args(up,'CALL',reason)),null,reason);
});
test('historical rejection and breakout no longer bypass an independently confirmed fading wall',()=>{
 for(const reason of ['historical-level-rejection','historical-level-breakout']){
  const risk=check(args(up,'CALL',reason));
  assert.equal(risk?.kind,'verified-historical-late-entry-exhaustion',reason);
  const put=check(args(up.map(p=>2.2-p),'PUT',reason));
  assert.equal(put?.kind,'verified-historical-late-entry-exhaustion',reason);
 }
});
test('directional continuation, already-cleared breakout and unconfirmed nearby levels are not blocked',()=>{
 const accelerated=[1.10070,1.10072,1.10074,1.10076,1.10079,1.10082,1.10088,1.100945];
 for(const reason of ['historical-level-rejection','historical-level-breakout']){
  assert.equal(check(args(accelerated,'CALL',reason)),null,reason);
  assert.equal(check(args([1.10070,1.10074,1.10080,1.10087,1.10092,1.10106,1.101085,1.10110],'CALL',reason)),null,reason);
  const a=args(up,'CALL',reason);a.structure.candleLevelMap.levels[0].confirmedPivots=0;
  assert.equal(check(a),null);
  const b=args(up,'CALL',reason);b.structure.candleLevelMap.levels[0].independentRejections=1;
  assert.equal(check(b),null);
 }
});
test('old movement alone is insufficient: too much available runway lets real entries pass',()=>{
 const a=args(up,'CALL','historical-level-breakout');
 a.structure.candleLevelMap.levels[0].low=1.10116;
 a.structure.candleLevelMap.levels[0].high=1.10120;
 a.structure.candleLevelMap.levels[0].level=1.10118;
 assert.equal(check(a),null);
});
test('near-term feed is causal and a 6,000-tick tape does not require whole-history sampling',()=>{
 const a=args(up,'CALL','historical-level-breakout');
 const early=Array.from({length:6000},(_,i)=>({
  ts:T-6007000+i*1000,receivedAt:T-6007000+i*1000,price:1.1
 }));
 assert.equal(check({...a,quoteHistory:[...early,...a.quoteHistory]})?.kind,
  'verified-historical-late-entry-exhaustion');
 const late={...a,quoteHistory:a.quoteHistory.map(q=>({...q,receivedAt:T+10}))};
 assert.equal(check(late),null);
 const missing={...a,quoteHistory:a.quoteHistory.filter(q=>q.ts!==T-3000)};
 assert.equal(check(missing),null);
});
test('unconfirmed historical wall cannot veto any candidate',()=>{
 for(const key of ['confirmedPivots','independentRejections']){
  const a=args(up);a.structure.candleLevelMap.levels[0][key]=key==='confirmedPivots'?0:1;
  assert.equal(check(a),null);
 }
 const a=args(up);a.structure.candleLevelMap.observedCandles=7;
 assert.equal(check(a),null);
});
test('directionally wrong wick history never masquerades as the blocking side',()=>{
 const a=args(up);a.structure.candleLevelMap.levels[0].resistanceWick=0;
 assert.equal(check(a),null);
 const b=args(up.map(p=>2.2-p),'PUT');
 b.structure.candleLevelMap.levels[0].supportWick=0;
 assert.equal(check(b),null);
});
test('a stale or unverified market frame never creates a veto',()=>{
 const a=args(up);
 assert.equal(check({...a,now:T+1500}),null);
 assert.equal(check({...a,candidate:{...a.candidate,observedAt:T-1000}}),null);
 assert.equal(check({...a,quoteHistory:a.quoteHistory.slice(0,-1)}),null);
 assert.equal(check({...a,quoteHistory:a.quoteHistory.map(q=>({...q,receivedAt:T+1000}))}),null);
 assert.equal(check({...a,structure:{...a.structure,candleLevelMap:{...a.structure.candleLevelMap,asOf:T+1000}}}),null);
});
test('one synchronous shared-market-base integration only; unchanged 13.9.96 and no new waits',()=>{
 const read=p=>readFileSync(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');
 const motor=read('agent/src/core/now-opportunity-engine.mjs');
 assert.match(motor,/const wallRisk=!pivotRisk&&proposed\.ready\?verifiedWallExhaustionRisk/);
 assert.match(motor,/reason:'shared-base-verified-wall-exhaustion'/);
 assert.doesNotMatch(read('agent/src/core/verified-wall-exhaustion.mjs'),/\bawait\b|setTimeout\s*\(|setInterval\s*\(|fetch\s*\(/);
 assert.equal(JSON.parse(read('package.json')).version,'13.9.109');
 const release=JSON.parse(read('agent/release.json'));
 assert.equal(release.version,'13.9.109');
 assert.equal(release.build,'13.9.109-stable107-late-fast');
 assert.equal(JSON.parse(read('agent/package.json')).version,release.version);
});

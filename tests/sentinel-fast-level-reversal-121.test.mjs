import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedFastLevelReversal,verifiedFastLevelReversal} from '../sentinel-trading-lab/agent/src/core/fast-level-reversal.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
function fixture(mirror=false,scale=1){
 const transform=p=>(mirror?200-p:p)*scale;
 const q=Array.from({length:720},(_,i)=>({ts:T-180000+i*250,price:transform(106-(106-100.11)*i/720)}));
 for(const [i,p] of [100.11,100.07,100.025,99.99,100.018,100.044,100.065].entries())q.push({ts:T+i*250,price:transform(p)});
 const level=(p,role)=>({low:transform(p),high:transform(p),level:transform(p),touches:3,pivots:1,tests:[{age:1},{age:3}],windows:[3,10,20,50,100],confirmedPivots:1,independentTests:3,independentRejections:2,
  supportPivots:role==='support'?1:0,resistancePivots:role==='resistance'?1:0,supportRejections:role==='support'?2:0,resistanceRejections:role==='resistance'?2:0,supportWick:role==='support'?.8:0,resistanceWick:role==='resistance'?.8:0});
 const zs=[level(100,mirror?'resistance':'support'),level(101,mirror?'support':'resistance')];
 const map={observedCandles:100,asOf:T-60000,tolerance:.07*scale,windows:[],levels:zs};
 return {q,map,side:mirror?'PUT':'CALL'};
}
const input=f=>({map:f.map,quoteHistory:f.q,quoteAt:f.q.at(-1).ts,now:f.q.at(-1).ts,price:f.q.at(-1).price});
function runtime(f,engine,durationMs){
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 r.patchSettings({engine,asset:'EUR/USD',orderDurationMs:durationMs},'controlled-fast-reversal');
 r.structureCache={get:()=>({candles:100,asOf:f.map.asOf,periodMs:60000,tolerance:f.map.tolerance,atr:f.map.tolerance*10,averages:[],zones:f.map.levels,candleLevelMap:f.map})};
 return r;
}
const gate=(r,q)=>r._signalValidationGate({analysis:{},settings:r.settings,now:q.at(-1).ts,snap:{provider:'exnova',price:q.at(-1).price,quoteTs:q.at(-1).ts,quoteHistory:q,candles:[],historicalCandlesVerified:true,payout:null}}).analysis.vnext;
test('a meaningful fast V at a pre-existing respected support/resistance qualifies without a second pullback, symmetrically at different price scales',()=>{
 for(const mirror of [false,true])for(const scale of [.01,1,20]){
  const f=fixture(mirror,scale),proof=confirmedFastLevelReversal(input(f));
  assert.equal(proof?.side,f.side);assert.ok(proof.confirmedAt<=f.q.at(-1).ts);
  assert.equal(verifiedFastLevelReversal({...input(f),side:f.side,reversalEvidence:proof}),true);
 }
});
test('the actual full runtime keeps the confirmed fast side through probability/final review for every strategy and supported expiry',()=>{
 for(const mirror of [false,true])for(const engine of ['automatic','trend','support_resistance','fibonacci_retest','smart_confluence'])for(const ms of [30000,60000,300000]){
  const f=fixture(mirror),r=runtime(f,engine,ms),v=gate(r,f.q);
  assert.equal(v.futureEntryAnchor?.side,f.side,JSON.stringify({mirror,engine,ms,reason:v.nowObservation?.reason}));
  assert.equal(v.futureEntryAnchor.exitAt,f.q.at(-1).ts+ms);
  assert.equal(v.nowObservation.reason,'confirmed-fast-level-reversal');
 }
});
test('weak reactions, wrong directional roles and a nearby opposite wall cannot qualify a fast reversal',()=>{
 const f=fixture();const weak={...f,q:f.q.map(q=>({...q}))};
 weak.q.at(-1).price=100.015;assert.equal(confirmedFastLevelReversal(input(weak)),null);
 const role={...f,map:{...f.map,levels:f.map.levels.map(z=>({...z,supportRejections:0}))}};
 assert.equal(confirmedFastLevelReversal(input(role)),null);
 const wall={...f,map:{...f.map,levels:[f.map.levels[0],{...f.map.levels[1],low:100.1,high:100.1,level:100.1}]}};
 assert.equal(confirmedFastLevelReversal(input(wall)),null);
 const early={...f,q:f.q.slice(0,-2)};assert.equal(confirmedFastLevelReversal(input(early)),null);
});
test('unreceived future quotes, unordered ticks, gaps, and old confirmations never fabricate a new V entry',()=>{
 const f=fixture(),a=input(f),proof=confirmedFastLevelReversal(a);
 assert.deepEqual(confirmedFastLevelReversal({...a,quoteHistory:[...f.q,{ts:a.quoteAt+1000,price:1}]}),proof);
 const missing=f.q.map(q=>({...q}));missing.at(-1).receivedAt=a.now+1000;
 assert.equal(confirmedFastLevelReversal({...a,quoteHistory:missing}),null);
 const gap=f.q.map((q,i)=>({...q,ts:q.ts-(i<f.q.length-2?3000:0)}));
 assert.equal(confirmedFastLevelReversal({...a,quoteHistory:gap}),null);
 assert.equal(confirmedFastLevelReversal({...a,now:a.now+2000}),null);
 assert.equal(verifiedFastLevelReversal({...a,side:'CALL',reversalEvidence:{...proof,confirmedAt:a.now-10000}}),false);
});
test('skipped late-floor PUT leaves the way open for a later proven CALL reversal',()=>{
 const f=fixture(),r=runtime(f,'automatic',60000),before=f.q.filter(q=>q.ts<=T-10000);
 const first=gate(r,before);
 assert.notEqual(first.futureEntryAnchor?.side,'PUT','do not chase an unverified downside impulse at the floor');
 const second=gate(r,f.q);
 assert.equal(second.nowObservation.side,'CALL');
 assert.equal(second.futureEntryAnchor?.side,'CALL','confirmed fast turn can be acted on');
});

test('5m at a respected extreme takes only a proven fast turn, not a late continuation',()=>{
 for(const mirror of [false,true]){
  const f=fixture(mirror),r=runtime(f,'automatic',300000);
  const last=f.q.at(-1);
  const v=gate(r,f.q);
  assert.equal(v.nowObservation.ready,true,mirror?'resistance must allow PUT':'support must allow CALL');
  assert.equal(v.nowObservation.side,f.side);
  assert.equal(v.nowObservation.reason,'confirmed-fast-level-reversal');
  assert.equal(v.futureEntryAnchor?.side,f.side);
  assert.equal(v.futureEntryAnchor?.exitAt-last.ts,300000,'5m order must expire in 5 minutes');
  const stale=f.q.map((q,i)=>i===f.q.length-1?{...q,receivedAt:last.ts+2000}:q);
  assert.equal(confirmedFastLevelReversal({...input(f),quoteHistory:stale}),null,
   'an unreceived quote must never fabricate a reversal');
 }
});

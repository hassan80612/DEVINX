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
function oneMinuteFixture(f){
 const q=[...f.q],raw=f.side==='PUT'?[200-100.085,200-100.105]:[100.085,100.105];
 for(const [i,p] of raw.entries())q.push({ts:T+1750+i*250,price:p});
 const last=q.at(-1);return {...f,q,quoteHistory:q,quoteAt:last.ts,now:last.ts,price:last.price};
}
test('a meaningful fast V at a pre-existing respected support/resistance qualifies without a second pullback, symmetrically at different price scales',()=>{
 for(const mirror of [false,true])for(const scale of [.01,1,20]){
  const f=fixture(mirror,scale),proof=confirmedFastLevelReversal(input(f));
  assert.equal(proof?.side,f.side);assert.ok(proof.confirmedAt<=f.q.at(-1).ts);
  assert.equal(verifiedFastLevelReversal({...input(f),side:f.side,reversalEvidence:proof}),true);
 }
});
test('short expiries reject a two-tick bounce while the 5m rule remains unchanged',()=>{
 for(const mirror of [false,true]){
  const f=fixture(mirror),q=f.q.filter(x=>x.ts<=T+1250).map(x=>({...x}));
  for(const row of q){
   if(row.ts===T+1000)row.price=(mirror?200-100.05:100.05);
   if(row.ts===T+1250)row.price=(mirror?200-100.11:100.11);
  }
  const a={...input(f),quoteHistory:q,quoteAt:q.at(-1).ts,now:q.at(-1).ts,price:q.at(-1).price};
  assert.equal(confirmedFastLevelReversal({...a,durationMs:30000}),null);
  assert.equal(confirmedFastLevelReversal({...a,durationMs:60000}),null);
  assert.equal(confirmedFastLevelReversal({...a,durationMs:300000})?.side,f.side);
  const threeSteps=f.q.filter(x=>x.ts<=T+1500).map(x=>({...x}));
  const b={...a,quoteHistory:threeSteps,quoteAt:threeSteps.at(-1).ts,now:threeSteps.at(-1).ts,price:threeSteps.at(-1).price};
  assert.equal(confirmedFastLevelReversal({...b,durationMs:30000})?.side,f.side);
  assert.equal(confirmedFastLevelReversal({...b,durationMs:60000}),null,'1m requires 1.2s after the level touch');
 }
});
test('the actual full runtime keeps the confirmed fast side through probability/final review for every strategy and supported expiry',()=>{
 for(const mirror of [false,true])for(const engine of ['automatic','trend','support_resistance','fibonacci_retest','smart_confluence'])for(const ms of [30000,60000,300000]){
  const base=fixture(mirror),f=ms===60000?oneMinuteFixture(base):base,
   r=runtime(f,engine,ms),v=gate(r,f.q);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedFastLevelReversal,verifiedFastLevelReversal} from '../sentinel-trading-lab/agent/src/core/fast-level-reversal.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
const level=(price,role)=>({low:price,high:price,level:price,tests:[{age:1},{age:3},{age:5}],windows:[3,10,20,50,100],confirmedPivots:1,independentRejections:2,
 supportPivots:role==='support'?1:0,resistancePivots:role==='resistance'?1:0,
 supportRejections:role==='support'?2:0,resistanceRejections:role==='resistance'?2:0});
function fixture(mirror=false){
 const quoteHistory=Array.from({length:720},(_,i)=>({ts:T-180000+i*250,price:106-5.89*i/720}));
 for(const [i,price] of [100.11,100.07,100.025,99.99,100.018,100.044,100.065].entries())quoteHistory.push({ts:T+i*250,price});
 if(mirror)for(const q of quoteHistory)q.price=200-q.price;
 const levels=mirror?[level(100,'resistance'),level(99,'support')]:[level(100,'support'),level(101,'resistance')];
 const last=quoteHistory.at(-1),map={observedCandles:100,asOf:T-60000,tolerance:.07,levels,windows:[]};
 return {map,quoteHistory,quoteAt:last.ts,now:last.ts,price:last.price,side:mirror?'PUT':'CALL'};
}
function oneMinuteFixture(f){
 const quoteHistory=[...f.quoteHistory],raw=f.side==='PUT'?[200-100.085,200-100.105]:[100.085,100.105];
 for(const [i,price] of raw.entries())quoteHistory.push({ts:T+1750+i*250,price});
 const last=quoteHistory.at(-1);return {...f,quoteHistory,quoteAt:last.ts,now:last.ts,price:last.price};
}
test('rapid V at a level is not a 30s/1m priority setup; strict 5m reversal path remains',()=>{
 for(const mirror of [false,true])for(const engine of ['automatic','trend','support_resistance','smart_confluence','fibonacci_retest'])for(const durationMs of [30000,60000,300000]){
  const base=fixture(mirror),f=durationMs===60000?oneMinuteFixture(base):base,
   rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
  rt.patchSettings({engine,asset:'EUR/USD',orderDurationMs:durationMs},'test');
  rt.structureCache={get:()=>({candles:100,asOf:f.map.asOf,tolerance:.07,atr:.7,averages:[],zones:f.map.levels,candleLevelMap:f.map})};
  const out=rt._signalValidationGate({analysis:{},settings:rt.settings,now:f.now,snap:{provider:'exnova',price:f.price,quoteTs:f.quoteAt,quoteHistory:f.quoteHistory,candles:[],historicalCandlesVerified:true}});
  const anchor=out.analysis.vnext.futureEntryAnchor;
  if(durationMs===300000)assert.equal(anchor?.side,f.side,engine+' '+durationMs+' '+f.side);
  else{
   assert.notEqual(anchor?.side,f.side,engine+' '+durationMs+' '+f.side);
   assert.equal(out.analysis.vnext.nowObservation.reason,'short-horizon-setup-not-eligible');
  }
 }
});
test('future prices and receipt times never confirm or revise the current reversal',()=>{
 const f=fixture(),e=confirmedFastLevelReversal(f);assert.ok(e);
 const future={ts:f.quoteAt+250,receivedAt:f.now+250,price:105};
 assert.deepEqual(confirmedFastLevelReversal({...f,quoteHistory:[...f.quoteHistory,future]}),e);
 const delayed=f.quoteHistory.map((q,i)=>i===f.quoteHistory.length-1?{...q,receivedAt:f.now+1}:q);
 assert.equal(confirmedFastLevelReversal({...f,quoteHistory:delayed}),null);
 assert.equal(verifiedFastLevelReversal({...f,reversalEvidence:{...e,side:'PUT'}}),false);
});
test('a single uptick, weak bounce, unknown level, wrong level role, or missing forward room is not a reversal',()=>{
 const f=fixture();
 const one=f.quoteHistory.slice(0,-2);assert.equal(confirmedFastLevelReversal({...f,quoteHistory:one,quoteAt:one.at(-1).ts,price:one.at(-1).price}),null);
 const weak=f.quoteHistory.map((q,i)=>i>f.quoteHistory.length-4?{...q,price:99.99+(i-f.quoteHistory.length+4)*.005}:q);
 assert.equal(confirmedFastLevelReversal({...f,quoteHistory:weak,price:weak.at(-1).price}),null);
 for(const levels of [[],[level(100,'support')],[level(100,'resistance'),level(101,'resistance')],[level(100,'support'),level(100.1,'resistance')]])
  assert.equal(confirmedFastLevelReversal({...f,map:{...f.map,levels}}),null);
});
test('stale, gapped, out-of-order, late and invalidated reversals cannot enter through the fast path',()=>{
 const f=fixture();assert.equal(confirmedFastLevelReversal({...f,now:f.now+1500}),null);
 for(const variant of [
  {...f,quoteHistory:f.quoteHistory.map((q,i)=>i===f.quoteHistory.length-2?{...q,ts:q.ts-2000}:q)},
  {...f,quoteHistory:[...f.quoteHistory,{ts:f.now+250,price:99.9}],quoteAt:f.now+250,now:f.now+250,price:99.9},
  {...f,map:{...f.map,asOf:f.now}}
 ])assert.equal(confirmedFastLevelReversal(variant),null);
 const extended=[...f.quoteHistory];for(let i=1;i<=8;i++)extended.push({ts:f.now+i*250,price:f.price+i*.012});
 assert.equal(confirmedFastLevelReversal({...f,quoteHistory:extended,quoteAt:extended.at(-1).ts,now:extended.at(-1).ts,price:extended.at(-1).price}),null);
});

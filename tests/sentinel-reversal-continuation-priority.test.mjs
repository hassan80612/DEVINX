import test from 'node:test';
import assert from 'node:assert/strict';
import {observedLevelSequence,confirmedLevelReversal,applyObservedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
function fixture(mirror=false){
 const vertices=[102,100.4,100.9,99,100,99.7,98.2,98.7,98.4,98.95],rows=[];
 for(let k=0;k<vertices.length-1;k++)for(let i=0;i<10;i++)rows.push({ts:T+rows.length*100,price:vertices[k]+(vertices[k+1]-vertices[k])*i/10});
 rows.push({ts:T+rows.length*100,price:vertices.at(-1)});rows.push({...rows.at(-1),ts:rows.at(-1).ts+100});
 let levels=[{low:100,high:100,level:100,confirmedPivots:2,independentTests:3},
  {low:98.2,high:98.2,level:98.2,confirmedPivots:2,supportPivots:2,supportRejections:2,resistancePivots:0,resistanceRejections:0}];
 if(mirror){for(const q of rows)q.price=200-q.price;levels=levels.map(z=>({...z,low:200-z.high,high:200-z.low,level:200-z.level,...(z.supportPivots!==undefined?{supportPivots:z.resistancePivots,supportRejections:z.resistanceRejections,resistancePivots:z.supportPivots,resistanceRejections:z.supportRejections}:{})}));}
 for(const z of levels){z.tests=[{age:1},{age:3},{age:5}];z.windows=[3,10,20,50,100];}
 const q=rows.at(-1);return {map:{observedCandles:100,asOf:T-60000,tolerance:.15,windows:[],levels},quoteHistory:rows,quoteAt:q.ts,now:q.ts,price:q.price};
}
test('a verified current structural reversal is evaluated even when an older continuation sequence still exists',()=>{
 for(const mirror of [false,true])for(const durationMs of [5000,10000,15000,30000,60000,120000,300000])for(const ready of [false,true]){
  const a=fixture(mirror),continuation=observedLevelSequence(a).structureChange,reversal=confirmedLevelReversal(a);
  assert.equal(continuation.kind,'break-retest-continuation');assert.equal(continuation.side,mirror?'CALL':'PUT');
  assert.equal(reversal.side,mirror?'PUT':'CALL');
  const out=applyObservedLevelSequence({...a,durationMs,candidate:{ready,side:ready?continuation.side:null,reason:'own-expiry-continuation'}});
  assert.equal(out.ready,true);assert.equal(out.side,reversal.side);
  assert.equal(out.reason,'confirmed-level-structure-reversal');
  assert.equal(out.priceStructure.confirmedReversal.confirmedAt,reversal.confirmedAt);
 }
});

test('the full runtime issues the verified reversal through final review for each expiry and strategy',()=>{
 for(const mirror of [false,true])for(const durationMs of [5000,10000,15000,30000,60000,120000,300000])
 for(const engine of ['automatic','trend','support_resistance','smart_confluence','fibonacci_retest']){
  const a=fixture(mirror),rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
  rt.patchSettings({engine,orderDurationMs:durationMs},'reversal-priority');
  rt.structureCache={get:()=>({candles:100,asOf:a.map.asOf,tolerance:a.map.tolerance,atr:1.5,averages:[],zones:a.map.levels,candleLevelMap:a.map})};
  const result=rt._signalValidationGate({analysis:{},settings:rt.settings,now:a.now,
   snap:{provider:'exnova',price:a.price,quoteTs:a.quoteAt,quoteHistory:a.quoteHistory,candles:[],historicalCandlesVerified:true}});
  assert.equal(result.analysis.vnext.futureEntryAnchor?.side,mirror?'PUT':'CALL',[mirror,durationMs,engine].join('|'));
 }
});

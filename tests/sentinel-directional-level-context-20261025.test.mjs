import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHistoricalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {verifiedWallExhaustionRisk as check} from '../sentinel-trading-lab/agent/src/core/verified-wall-exhaustion.mjs';
import {confirmedLevelReversal,applyObservedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
const level=(price,role)=>({low:price,high:price,level:price,touches:3,pivots:1,ages:[1,3,5],confirmedPivots:1,independentRejections:0,
 supportPivots:role==='support'?1:0,resistancePivots:role==='resistance'?1:0,supportRejections:0,resistanceRejections:0,supportWick:0,resistanceWick:0});
test('a level below price is not labeled support solely because it is below; resistance is symmetric',()=>{
 for(const mirror of [false,true]){
  const zones=[level(99,'support'),level(100,'resistance'),level(103,'support'),level(104,'resistance')];
  const prices=Array.from({length:13},(_,i)=>101+i*.005);
  const rows=prices.map((price,i)=>({ts:T-12000+i*1000,price:mirror?203-price:price}));
  const map=mirror?zones.map(z=>({...z,low:203-z.high,high:203-z.low,level:203-z.level,
   supportPivots:z.resistancePivots,resistancePivots:z.supportPivots})):zones;
  const result=applyHistoricalPriceStructure({candidate:{ready:false,side:null},structure:{candles:50,
   tolerance:.01,atr:.1,averages:[{value:101,slope:.01},{value:101,slope:.01}],zones:map},
   quoteHistory:rows,quoteAt:T,now:T,price:rows.at(-1).price,durationMs:30000});
  assert.equal(result.priceStructure.nearestSupport.level,99);
  assert.equal(result.priceStructure.nearestResistance.level,104);
 }
});
test('strengthening continuation and actual breakout retain eligibility at a known directional level',()=>{
 for(const prices of [[1.10070,1.10072,1.10074,1.10076,1.10079,1.10082,1.10088,1.100945],
  [1.10070,1.10074,1.10080,1.10087,1.10092,1.10106,1.101085,1.10110]]){
  const price=prices.at(-1);assert.equal(check({candidate:{ready:true,side:'CALL',observedAt:T,entryPrice:price},
   structure:{tolerance:.00005,candleLevelMap:{observedCandles:60,asOf:T-1000,levels:[{...level(1.101,'resistance'),resistanceRejections:2,resistanceWick:.8}]}},
   quoteHistory:prices.map((p,i)=>({ts:T-7000+i*1000,price:p})),quoteAt:T,now:T,price}),null);
 }
});
test('an accelerating candle in a zone is not blindly inverted or blocked; reversal needs its own structure, for CALL and PUT',()=>{
 for(const side of ['CALL','PUT']){
  const base=[1.10070,1.10072,1.10074,1.10078,1.10083,1.10088,1.10094,1.10101];
  const prices=side==='CALL'?base:base.map(p=>2.2-p),price=prices.at(-1);
  const z={...level(side==='CALL'?1.101:1.099,side==='CALL'?'resistance':'support'),supportRejections:side==='PUT'?2:0,resistanceRejections:side==='CALL'?2:0,supportWick:side==='PUT'?.8:0,resistanceWick:side==='CALL'?.8:0,
   low:side==='CALL'?1.10098:1.09898,high:side==='CALL'?1.10102:1.09902};
  const result=check({candidate:{ready:true,side,observedAt:T,entryPrice:price},structure:{tolerance:.00005,
   candleLevelMap:{observedCandles:60,asOf:T-1000,levels:[z]}},quoteAt:T,now:T,price,
   quoteHistory:prices.map((p,i)=>({ts:T-7000+i*1000,price:p}))});
  assert.equal(result,null);
 }
});
test('a received support rejection, higher low and CURRENT high break issues CALL; resistance mirrors PUT at every duration',()=>{
 const vertices=[103,101,102,100,101,100.5,101.5],q=[];
 for(let k=0;k<vertices.length-1;k++)for(let j=0;j<5;j++)q.push({ts:T+q.length*1000,price:vertices[k]+(vertices[k+1]-vertices[k])*j/5});
 q.push({ts:T+q.length*1000,price:101.5});
 for(const mirror of [false,true]){
  const rows=mirror?q.map(x=>({...x,price:200-x.price})):q,last=rows.at(-1),side=mirror?'PUT':'CALL';
  const map={observedCandles:50,asOf:T-1000,tolerance:.1,levels:[level(100,mirror?'resistance':'support')]};
  const a={map,quoteHistory:rows,quoteAt:last.ts,now:last.ts,price:last.price};
  const event=confirmedLevelReversal(a);assert.equal(event?.side,side);
  for(const durationMs of [5000,10000,15000,30000,60000,120000,300000]){
   const candidate={ready:true,side:mirror?'CALL':'PUT'};
   const result=applyObservedLevelSequence({candidate,...a,durationMs});
   assert.equal(result.side,side);assert.equal(result.reason,'confirmed-level-structure-reversal');
  }
  assert.equal(confirmedLevelReversal({...a,quoteHistory:rows.slice(0,-1),quoteAt:rows.at(-2).ts,now:rows.at(-2).ts,price:rows.at(-2).price}),null,'no premature signal before the local pivot is broken');
  const late=[...rows,...[1,2,3].map(i=>({ts:last.ts+i*1000,price:last.price+(mirror?-1:1)*.1*i}))];
  assert.equal(confirmedLevelReversal({...a,quoteHistory:late,quoteAt:late.at(-1).ts,now:late.at(-1).ts,price:late.at(-1).price}),null,'do not re-issue a reversal after price has already travelled');
 }
});
test('the complete runtime emits the confirmed contrary signal through probability, expiry review and one-shot lifecycle at all seven expiries',()=>{
 const vertices=[103,101,102,100,101,100.5,101.5],q=[];
 for(let k=0;k<vertices.length-1;k++)for(let j=0;j<5;j++)q.push({ts:T+q.length*1000,price:vertices[k]+(vertices[k+1]-vertices[k])*j/5});
 q.push({ts:T+q.length*1000,price:101.5});
 for(const mirror of [false,true])for(const durationMs of [30000,60000,300000]){
  const quotes=mirror?q.map(p=>({...p,price:200-p.price})):q,last=quotes.at(-1);
  const z={...level(100,mirror?'resistance':'support'),tests:[{age:1}],windows:[3,10,20,50]};
  const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
  r.patchSettings({engine:'automatic',orderDurationMs:durationMs},'controlled-level-reversal');
  r.structureCache={get:()=>({candles:50,asOf:T-1000,periodMs:60000,tolerance:.1,atr:1,averages:[],zones:[z],
   candleLevelMap:{observedCandles:50,asOf:T-1000,tolerance:.1,levels:[z],windows:[]}})};
  const out=r._signalValidationGate({analysis:{},settings:r.settings,now:last.ts,
   snap:{provider:'iq_option',price:last.price,quoteTs:last.ts,quoteHistory:quotes,candles:[],historicalCandlesVerified:true,payout:null}});
  assert.equal(out.analysis.vnext.futureEntryAnchor.side,mirror?'PUT':'CALL');
  assert.equal(out.analysis.vnext.futureEntryAnchor.exitAt,last.ts+durationMs);
  assert.equal(out.analysis.vnext.nowObservation.reason,'confirmed-level-structure-reversal');
 }
});


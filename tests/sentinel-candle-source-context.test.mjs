import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {historicalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {structuralCandleInput} from '../experiments/verified-candle-source-20261017.mjs';
import {candleSourceResearchRuntime} from '../experiments/candle-source-research-runtime-20261017.mjs';
import {nativeCandleFixture,CANDLE_T} from './fixtures/sentinel-native-candle-collision-20261017.mjs';
for(const provider of ['iq_option','exnova'])test(`${provider}: protocol → adapter → runtime restores all 100 native 1m candles instead of the collided 80`,async()=>{
 const f=nativeCandleFixture(provider),{DemoTradingRuntime:Candidate,cleanup}=await candleSourceResearchRuntime();
 try{
  assert.equal(f.live.historicalCandlesVerified,true);assert.equal(f.live.predictionCandles.length,120);
  const run=Runtime=>{const r=new Runtime({enableVNext:true,forecastModel:'now-structural-v1'});r.setExternalMarket(f.market);
   const snap=r._marketSnapshot();r._signalValidationGate({analysis:{asset:'EUR/USD'},snap,settings:r.settings,now:CANDLE_T});return r.structureCache.value;};
  const before=historicalPriceStructure({candles:f.live.candles,now:CANDLE_T}),after=run(Candidate);
  assert.equal(before.candles,80);assert.equal(after.candles,100);
  assert.equal(after.periodMs,60000);assert.equal(after.candleLevelMap.windows.find(w=>w.size===100).available,true);
  assert.deepEqual(before.averages.map(a=>a.period),[20,50]);assert.deepEqual(after.averages.map(a=>a.period),[20,50,100]);
  assert.deepEqual(after,historicalPriceStructure({candles:f.small,now:CANDLE_T}));
 }finally{cleanup();}
});
test('current corrections take precedence within their own period; forming and invalid rows stay excluded',()=>{
 const f=nativeCandleFixture(),last=f.small.at(-1),corrected={...last,high:last.high+.0001};
 const forming={...last,from:CANDLE_T/1000,to:CANDLE_T/1000+60,high:10};
 const invalid={...last,from:CANDLE_T/1000-6600,to:CANDLE_T/1000-6540,low:2,high:1};
 const source=structuralCandleInput({historicalCandlesVerified:true,predictionCandles:[...f.small,...f.large,forming,invalid],candles:[corrected]});
 assert.deepEqual(historicalPriceStructure({candles:source,now:CANDLE_T}),
  historicalPriceStructure({candles:[...f.small.slice(0,-1),corrected],now:CANDLE_T}));
});
test('an unverified pool cannot enter the base, and missing/empty preserved pools retain the current source',()=>{
 const f=nativeCandleFixture();
 assert.deepEqual(structuralCandleInput({historicalCandlesVerified:false,predictionCandles:f.small,candles:f.small}),[]);
 assert.equal(structuralCandleInput({candles:f.small}),f.small);
 assert.equal(structuralCandleInput({candles:f.small,predictionCandles:[]}),f.small);
});
test('single-period inputs preserve released observations and the complete entry/expiry lifecycle',async()=>{
 const f=nativeCandleFixture(),{DemoTradingRuntime:Candidate,cleanup}=await candleSourceResearchRuntime();
 try{
  const before=new Released({enableVNext:true,forecastModel:'now-structural-v1'}),after=new Candidate({enableVNext:true,forecastModel:'now-structural-v1'});
  for(let i=60;i<f.state.quoteHistory.length;i++){
   const q=f.state.quoteHistory[i],history=f.state.quoteHistory.slice(0,i+1);
   const snap={provider:'iq_option',candles:f.small,predictionCandles:f.small,historicalCandlesVerified:true,quoteHistory:history,quoteTs:q.ts,price:q.price};
   const run=r=>r._signalValidationGate({analysis:{asset:r.settings.asset},snap,settings:r.settings,now:q.ts}).analysis.vnext;
   assert.deepEqual(run(after),run(before));
  }
 }finally{cleanup();}
});

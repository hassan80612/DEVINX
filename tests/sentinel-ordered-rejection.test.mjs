import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHistoricalPriceStructure as releasedHistorical} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {applyCandleLevelRoute as releasedRoute} from '../sentinel-trading-lab/agent/src/core/candle-level-map.mjs';
import {orderedRejectionResearchRuntime} from '../experiments/ordered-rejection-research-runtime-20261017.mjs';
const T=1792250040000;
function scenario({fresh=false,mirror=false}={}){
 let prices=[99.97,100.01,99.98,99.97,99.96,99.96,99.96,99.963,99.966,99.968,99.970,99.960,99.945];
 if(fresh){prices[8]=100.01;prices[9]=99.99;}
 if(mirror)prices=prices.map(x=>200-x);
 const quoteHistory=prices.map((price,i)=>({ts:T+(i-12)*1000,receivedAt:T+(i-12)*1000,price}));
 const zone={level:100,low:100,high:100,touches:2,pivots:1,ages:[10,20],confirmedPivots:1,independentTests:2,independentRejections:2,
  supportWick:.6,resistanceWick:.6,windows:[3,10,20,50,100],tests:[{age:10},{age:20}]};
 const map={observedCandles:100,asOf:T-60000,tolerance:.02,levels:[zone],windows:[{size:100,available:true,levels:[zone]}]};
 const structure={candles:100,periodMs:60000,tolerance:.02,atr:.2,averages:[{period:20,value:100,slope:0}],zones:[zone],candleLevelMap:map};
 return {candidate:{ready:false,side:null,reason:'unconfirmed'},quoteHistory,quoteAt:T,now:T,price:prices.at(-1),durationMs:30000,structure,map};
}
for(const mirror of [false,true])test(`${mirror?'CALL':'PUT'}: a touch before the approach cannot be reused as a new rejection`,async()=>{
 const a=scenario({mirror}),c=await orderedRejectionResearchRuntime();
 try{
  const side=mirror?'CALL':'PUT';
  assert.equal(releasedHistorical(a).side,side);assert.equal(releasedHistorical(a).ready,true);
  assert.equal(releasedRoute(a).side,side);assert.equal(releasedRoute(a).ready,true);
  assert.equal(c.applyHistoricalPriceStructure(a).ready,false);assert.equal(c.applyCandleLevelRoute(a).ready,false);
 }finally{c.cleanup();}
});
for(const mirror of [false,true])test(`${mirror?'CALL':'PUT'}: a real touch after the approach preserves the existing rejection`,async()=>{
 const a=scenario({fresh:true,mirror}),c=await orderedRejectionResearchRuntime();
 try{
  assert.equal(releasedHistorical(a).ready,true);assert.equal(releasedRoute(a).ready,true);
  assert.deepEqual(c.applyHistoricalPriceStructure(a),releasedHistorical(a));
  assert.deepEqual(c.applyCandleLevelRoute(a),releasedRoute(a));
 }finally{c.cleanup();}
});
test('future and late-arriving touch observations cannot qualify a current rejection',async()=>{
 const a=scenario(),b={...a,quoteHistory:[...a.quoteHistory,{ts:T+1000,price:100,receivedAt:T+1000},{ts:T-4000,price:100,receivedAt:T+1000}]},c=await orderedRejectionResearchRuntime();
 try{assert.deepEqual(c.applyHistoricalPriceStructure(a),c.applyHistoricalPriceStructure(b));assert.deepEqual(c.applyCandleLevelRoute(a),c.applyCandleLevelRoute(b));}finally{c.cleanup();}
});
for(const mirror of [false,true])test(`${mirror?'PUT':'CALL'}: an actual breakout keeps its original evidence and decision`,async()=>{
 const a=scenario(),prices=[99.90,99.91,99.92,99.93,99.94,99.945,99.95,100.02,100.08,100.10,100.12,100.14,100.16];
 a.quoteHistory=prices.map((p,i)=>({ts:T+(i-12)*1000,receivedAt:T+(i-12)*1000,price:mirror?200-p:p}));a.price=a.quoteHistory.at(-1).price;
 const c=await orderedRejectionResearchRuntime();
 try{
  assert.equal(releasedHistorical(a).reason,'historical-level-breakout');
  assert.deepEqual(c.applyHistoricalPriceStructure(a),releasedHistorical(a));assert.deepEqual(c.applyCandleLevelRoute(a),releasedRoute(a));
 }finally{c.cleanup();}
});

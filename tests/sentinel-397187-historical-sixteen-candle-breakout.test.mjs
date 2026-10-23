import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {reviewHistoricalBreakoutContinuation} from '../sentinel-trading-lab/agent/src/core/historical-breakout-continuation.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000;
const horizons=[5000,10000,15000,30000,60000,120000,300000];
// There are only 19 CLOSED candles, so no EMA20 exists. The historically
// confirmed high is exactly 16 completed candles old (index 2).
const candles=Array.from({length:19},(_,i)=>{
 const close=1.13025+i*.00035/18;
 return {from:T-(19-i)*60000,to:T-(18-i)*60000,
  open:close-.00003,close,high:i===2?1.1309:close+.00009,
  low:close-.00009};
});
const mirror=p=>2.26-p;
const invertBars=rows=>rows.map(c=>({...c,open:mirror(c.open),close:mirror(c.close),
 high:mirror(c.low),low:mirror(c.high)}));
const prices=end=>Array.from({length:17},(_,i)=>({
 ts:T-16000+i*1000,receivedAt:T-16000+i*1000,
 price:1.13035+(end-1.13035)*i/16
}));
const evaluate=(s,q,side,ms)=>reviewHistoricalBreakoutContinuation({
 candidate:{ready:true,side,reason:'closed-structure-and-live-impulse',
  observedAt:T,entryPrice:q.at(-1).price},
 structure:s,quoteHistory:q,quoteAt:T,now:T,price:q.at(-1).price,durationMs:ms
});
test('confirmed resistance created SIXTEEN closed candles ago is visible before EMA20 exists',()=>{
 const s=historicalPriceStructure({candles,now:T});
 assert.equal(s.candles,19);
 assert.equal(s.averages.length,0);
 const zone=s.zones.find(z=>Math.abs(z.level-1.1309)<1e-8);
 assert.ok(zone,'resistance from 16 bars ago is not discarded');
 assert.equal(Math.max(...zone.ages),16);
 assert.ok(zone.confirmedPivots>=1);
});
test('historical highs and lows have NO fixed candle age limit: 0,1,2,3,4,5,10,16,30,60',()=>{
 for(const age of [0,1,2,3,4,5,10,16,30,60]){
  const n=Math.max(19,age+5);
  const bars=Array.from({length:n},(_,i)=>{
   const close=1.13025+i*.00025/(n-1);
   return{from:T-(n-i)*60000,to:T-(n-i-1)*60000,
    open:close-.00004,close,high:i===n-1-age?1.1309:close+.000075,
    low:close-.00006};
  });
  const s=historicalPriceStructure({candles:bars,now:T});
  const q=prices(1.13088),z=s.zones.find(z=>Math.abs(z.level-1.1309)<1e-8);
  assert.ok(z?.resistanceWick>=.6||z?.confirmedHighPivots>0,'no age veto '+age);
  assert.equal(evaluate(s,q,'CALL',30000).ready,false,'false CALL into '+age+'-bar high');
  // A genuinely held breakout must remain a valid continuation opportunity.
  assert.equal(evaluate(s,prices(1.13113),'CALL',30000).ready,true,'held break at age '+age);
 }
});
test('up-candle approaching resistance is NOT sufficient breakout evidence for any duration',()=>{
 const s=historicalPriceStructure({candles,now:T}),q=prices(1.13088);
 for(const duration of horizons){
  const result=evaluate(s,q,'CALL',duration);
  assert.equal(result.ready,false,String(duration));
  assert.equal(result.side,null,'never flip CALL to an unproven PUT');
  assert.equal(result.reason,'resistance-breakout-strength-unconfirmed');
  assert.equal(result.historicalBarrier.oldestBarsAgo,16);
  assert.equal(result.historicalBarrier.expirySeconds,duration/1000);
 }
});
test('down-candle approaching the old SUPPORT requires equivalent evidence',()=>{
 const s=historicalPriceStructure({candles:invertBars(candles),now:T});
 const q=prices(1.13088).map(p=>({...p,price:mirror(p.price)}));
 for(const duration of horizons){
  const v=evaluate(s,q,'PUT',duration);
  assert.equal(v.ready,false,String(duration));
  assert.equal(v.reason,'support-breakout-strength-unconfirmed');
 }
});
test('real observed breach with multi-quote hold and followthrough remains qualified for ALL durations',()=>{
 const s=historicalPriceStructure({candles,now:T}),q=prices(1.13113);
 for(const ms of horizons){
  const v=evaluate(s,q,'CALL',ms);
  assert.equal(v.ready,true,String(ms)+' genuine held breakout');
  assert.equal(v.side,'CALL');
 }
});
test('absence of a confirmed wall does not add a generic waiting gate',()=>{
 const s=historicalPriceStructure({candles,now:T});
 const q=prices(1.13088);
 const v=evaluate({...s,zones:[]},q,'CALL',30000);
 assert.equal(v.ready,true);
 assert.equal(v.side,'CALL');
});
test('all strategies have the same shared barrier review after specialized proposals',()=>{
 const source=analyzeNowOpportunity.toString();
 assert.match(source,/reviewHistoricalBreakoutContinuation/);
 assert.match(source,/candidate:pivotReviewed,structure,quoteHistory,quoteAt,now,price,durationMs/);
 assert.ok(source.indexOf('reviewHistoricalBreakoutContinuation')>
   source.indexOf('specialist=selectedEngine'));
});

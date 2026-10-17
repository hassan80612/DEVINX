import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalPriceStructure,HistoricalPriceStructureCache} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {assessCandleLevelRoute,applyCandleLevelRoute} from '../sentinel-trading-lab/agent/src/core/candle-level-map.mjs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1792250000000;
const candles=()=>Array.from({length:100},(_,i)=>({from:T-(100-i)*60000,to:T-(99-i)*60000,
 open:107,close:106,high:110,low:i===79?90:i===97?100:103}));
const quotes=prices=>prices.map((price,i)=>({ts:T-(prices.length-1-i)*1000,price}));
const rebound=quotes([104,101,99,95,90,90.4,91.2]);
const input=rows=>({quoteHistory:rows,quoteAt:T,now:T,price:rows.at(-1).price,durationMs:30000});
const map=()=>historicalPriceStructure({candles:candles(),now:T}).candleLevelMap;
const candidate={ready:true,side:'PUT',pendingForecast:{ready:true,side:'PUT',predictedPrice:80},predictedPrice:80,expectedLogMove:-.1};
test('maps the 3/10/20/50/100 windows without losing a 20-bars-old level behind a recently broken level',()=>{
 const m=map();assert.deepEqual(m.windows.map(w=>[w.size,w.available]),[[3,true],[10,true],[20,true],[50,true],[100,true]]);
 const old=m.levels.find(z=>z.level===90),near=m.levels.find(z=>z.level===100);
 assert.ok(old.tests.some(t=>t.age===20));assert.ok(!old.windows.includes(20));assert.ok(old.windows.includes(50));
 assert.ok(near.windows.includes(3));assert.ok(old.confirmedPivots>0);
});
test('a downward breakout has the next older support in its route, not an automatic reversal before reaching it',()=>{
 const rows=quotes([104,102,101,99,98,97,96]);
 const r=assessCandleLevelRoute({map:map(),...input(rows),side:'PUT',targetPrice:80});
 assert.equal(r.nextLevels[0].level,90);assert.equal(r.nextLevels[0].beforeProjectedTarget,true);
 assert.equal(r.event.kind,'breakout');assert.equal(r.event.side,'PUT');
 assert.equal(applyCandleLevelRoute({candidate,map:map(),...input(rows)}).side,'PUT');
});
test('rejection at the next older support takes precedence over continuing the previous downward breakout',()=>{
 const r=applyCandleLevelRoute({candidate,map:map(),...input(rebound)});
 assert.equal(r.ready,true);assert.equal(r.side,'CALL');assert.equal(r.reason,'multiscale-candle-rejection');
 assert.equal(r.priceStructure.candleRoute.event.zone.level,90);
 assert.equal(r.priceStructure.candleRoute.event.zone.oldestBarsAgo,20);
 assert.equal(r.predictedPrice,null);assert.equal(r.expectedLogMove,null);
 assert.equal(r.priceStructure.candleRoute.discardedProjection.side,'PUT');
 assert.equal(r.priceStructure.candleRoute.side,'CALL');
 assert.equal(r.priceStructure.candleRoute.nextLevels[0].level,100);
});
test('breaking the older support remains a PUT rather than blindly bouncing because a level exists',()=>{
 const rows=quotes([95,94,92,89,88,87,86]);
 const r=applyCandleLevelRoute({candidate,map:map(),...input(rows)});
 assert.equal(r.side,'PUT');assert.equal(r.priceStructure.candleRoute.event.kind,'breakout');
});
test('resistance behaves symmetrically to support',()=>{
 const mirror=p=>220-p;
 const bars=candles().map(c=>({...c,open:mirror(c.open),close:mirror(c.close),high:mirror(c.low),low:mirror(c.high)}));
 const m=historicalPriceStructure({candles:bars,now:T}).candleLevelMap;
 const rows=rebound.map(q=>({...q,price:mirror(q.price)}));
 const r=applyCandleLevelRoute({candidate:{...candidate,side:'CALL',pendingForecast:{ready:true,side:'CALL'}},map:m,...input(rows)});
 assert.equal(r.side,'PUT');assert.equal(r.priceStructure.candleRoute.event.zone.level,130);
});
test('adjacent candles are one test until the complete range moves away and revisits',()=>{
 const bars=candles();for(const b of bars)b.low=100;
 let m=historicalPriceStructure({candles:bars,now:T}).candleLevelMap;
 assert.equal(m.levels.find(z=>z.level===100).independentTests,1);
 bars[40].low=104;
 m=historicalPriceStructure({candles:bars,now:T}).candleLevelMap;
 assert.equal(m.levels.find(z=>z.level===100).independentTests,2);
});
test('a recurring candle boundary passed through without rejection is not a defended barrier',()=>{
 const bars=Array.from({length:100},(_,i)=>{
  const phase=i%10,open=100+phase,close=open+1;
  return {from:T-(100-i)*60000,to:T-(99-i)*60000,open,close,low:open,high:close};
 });
 const m=historicalPriceStructure({candles:bars,now:T}).candleLevelMap;
 const passed=m.levels.find(z=>Math.abs(z.level-105)<.000001);
 assert.ok(passed.independentTests>=2);
 assert.equal(passed.confirmedPivots,0);assert.equal(passed.independentRejections,0);
 const q=quotes([104,104.5,104.9,105,104.9,104.8,104.7]);
 const r=assessCandleLevelRoute({map:m,...input(q),side:'CALL',targetPrice:108});
 assert.notEqual(r.event?.zone.level,105);
});
test('missing candles cannot fabricate a historical rejection from nonconsecutive observations',()=>{
 const bars=candles().slice(-3);bars[0].low=103;bars[1].low=100;bars[2].low=103;
 bars[2].from+=60000;bars[2].to+=60000;
 const m=historicalPriceStructure({candles:bars,now:T+60000}).candleLevelMap;
 const z=m.levels.find(l=>l.level===100);
 assert.equal(z.confirmedPivots,0);assert.equal(z.independentRejections,0);
});
test('a confirmed three-candle wick structure works without waiting for an EMA20 or 100 new candles',()=>{
 const bars=candles().slice(-3);bars[0].low=103;bars[1].low=100;bars[2].low=103;
 const rows=quotes([104,103,102,100,100.2,100.4,101]);
 const args={...input(rows),candles:bars,engineId:'automatic',qualityPolicy:'adaptive-market-v17'};
 const r=analyzeNowOpportunity(args);assert.equal(r.ready,true);assert.equal(r.side,'CALL');
 assert.equal(r.contextStrategy,'support_resistance');
 assert.equal(r.priceStructure.candleRoute.windows.find(w=>w.size===3).available,true);
 assert.equal(r.priceStructure.candleRoute.windows.find(w=>w.size===100).available,false);
});
test('an unfinished candle or future quote cannot establish a rejection or change a prior decision',()=>{
 const bars=candles(),m=map();
 const future={from:T,to:T+60000,open:100,close:200,high:220,low:1};
 assert.deepEqual(historicalPriceStructure({candles:[...bars,future],now:T}).candleLevelMap,m);
 const args={candidate,map:m,...input(rebound)};
 assert.deepEqual(applyCandleLevelRoute({...args,quoteHistory:[...rebound,{ts:T+1000,price:200}]}),applyCandleLevelRoute(args));
 assert.equal(applyCandleLevelRoute({...args,now:T+2000}),candidate);
});
test('a gap in live prices cannot fabricate a current rejection',()=>{
 const r=applyCandleLevelRoute({candidate,map:map(),...input(rebound),quoteHistory:rebound.filter((q,i)=>![2,3,4].includes(i))});
 assert.equal(r.side,'PUT');assert.equal(r.priceStructure.candleRoute.event,null);
});
test('the currently issued signal remains immutable even after a new structural rejection',()=>{
 const first=advanceNowOpportunity({candidate:{ready:true,side:'PUT',entryPrice:104,observedAt:T-10000},now:T-10000,quoteAt:T-10000,asset:'EUR',durationMs:30000});
 const r=applyCandleLevelRoute({candidate,map:map(),...input(rebound)});
 const held=advanceNowOpportunity({previous:first,candidate:r,now:T,quoteAt:T,asset:'EUR',durationMs:30000});
 assert.equal(held.side,'PUT');assert.equal(held.exitAt,T+20000);assert.equal(held.entryReadyNow,false);
});
test('candle corrections and context changes invalidate the multiscale map cache',()=>{
 const cache=new HistoricalPriceStructureCache(),bars=candles();
 const a=cache.get({candles:bars,now:T,context:'EUR'});
 bars[79].low=85;const b=cache.get({candles:bars,now:T,context:'EUR'});
 assert.notDeepEqual(a.candleLevelMap,b.candleLevelMap);
 assert.notEqual(b,cache.get({candles:bars,now:T,context:'GBP'}));
});
test('other holding durations are unchanged by the new 30-second rejection candidate',()=>{
 assert.equal(applyCandleLevelRoute({candidate,map:map(),...input(rebound),durationMs:5000}),candidate);
});
test('actual runtime can issue the three-candle rejection on the current quote, preserving the full expiry',async()=>{
 const bars=candles().slice(-3);bars[0].low=103;bars[1].low=100;bars[2].low=103;
 const rows=quotes([...Array(8).fill(104),104,103,102,100,100.2,100.4,101]);
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.stateName='running';runtime.settings.asset='EUR/USD';runtime.settings.engine='automatic';
 runtime.setExternalMarket({provider:'exnova',symbol:'EUR/USD',validatedSymbol:'EUR/USD',
  quote:101,quoteTs:T,lastQuoteAt:T,quoteHistory:rows,candles:bars,
  quoteFeedValidated:true,analysisFeedValidated:true,assetValidated:true});
 await runtime.tick(T,{skipStatus:true});
 const signal=runtime.lastResult.analysis.vnext.futureEntryAnchor;
 assert.equal(signal.side,'CALL');assert.equal(signal.entryAt,T);assert.equal(signal.exitAt,T+30000);
 assert.equal(runtime.lastResult.order,undefined);
});

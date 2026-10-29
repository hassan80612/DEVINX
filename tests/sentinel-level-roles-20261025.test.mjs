import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCandleLevelMap,applyCandleLevelRoute} from '../sentinel-trading-lab/agent/src/core/candle-level-map.mjs';
import {applyHistoricalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {verifiedWallExhaustionRisk} from '../sentinel-trading-lab/agent/src/core/verified-wall-exhaustion.mjs';
import {observedRoleRetest} from '../sentinel-trading-lab/agent/src/core/level-role-evidence.mjs';
import {historicalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
function resistanceMap(){
 const rows=Array.from({length:12},(_,i)=>({from:T-(12-i)*60000,to:T-(11-i)*60000,
  open:98.5,close:98.6,low:98,high:i%4===1?100:99}));
 return buildCandleLevelMap({rows,zones:[{low:100,high:100,level:100}],tolerance:.1});
}
function supportMap(){
 const rows=Array.from({length:12},(_,i)=>({from:T-(12-i)*60000,to:T-(11-i)*60000,
  open:101.5,close:101.4,high:102,low:i%4===1?100:101}));
 return buildCandleLevelMap({rows,zones:[{low:100,high:100,level:100}],tolerance:.1});
}
const quotes=prices=>prices.map((price,i)=>({ts:T-(prices.length-1-i)*1000,price}));
test('closed resistance pivots and rejections never count as support confirmations',()=>{
 const z=resistanceMap().levels[0];
 assert.ok(z.resistancePivots>=2);assert.ok(z.resistanceRejections>=2);
 assert.equal(z.supportPivots,0);assert.equal(z.supportRejections,0);
});
test('a bounce inside a resistance is not an independently supported CALL reversal',()=>{
 const map=resistanceMap(),q=quotes([100.3,100.25,100.2,100.1,100,100.02,100.08]);
 const input={quoteHistory:q,quoteAt:T,now:T,price:q.at(-1).price,durationMs:30000};
 const waiting={ready:false,side:null,reason:'not-ready'};
 const structure={candles:80,periodMs:60000,atr:1,tolerance:.1,
  averages:[{value:99,slope:.01,period:20}],zones:[{...map.levels[0],touches:3,pivots:3,ages:[2,6,10]}]};
 assert.equal(applyHistoricalPriceStructure({candidate:waiting,structure,...input}).ready,false);
 assert.equal(applyCandleLevelRoute({candidate:waiting,map,...input}).ready,false);
});
test('support-only evidence cannot veto a CALL as a confirmed resistance',()=>{
 const prices=[1.10070,1.10074,1.10080,1.10087,1.10092,1.10094,1.100944,1.100945],q=quotes(prices);
 const level={low:1.10098,high:1.10102,level:1.101,confirmedPivots:2,independentRejections:2,
  resistanceWick:.8,supportWick:.8,supportPivots:2,supportRejections:2,resistancePivots:0,resistanceRejections:0};
 const candidate={ready:true,side:'CALL',reason:'historical-level-rejection',observedAt:T,entryPrice:prices.at(-1)};
 assert.equal(verifiedWallExhaustionRisk({candidate,structure:{tolerance:.00005,
  candleLevelMap:{observedCandles:60,asOf:T-1000,levels:[level]}},quoteHistory:q,quoteAt:T,now:T,price:prices.at(-1)}),null);
});
test('support counts and rejection decisions mirror resistance without inverting an entry blindly',()=>{
 const map=supportMap(),z=map.levels[0];
 assert.ok(z.supportPivots>=2);assert.ok(z.supportRejections>=2);
 assert.equal(z.resistancePivots,0);assert.equal(z.resistanceRejections,0);
 const q=quotes([99.7,99.75,99.8,99.9,100,99.98,99.92]);
 const result=applyCandleLevelRoute({candidate:{ready:false,side:null},map,
  quoteHistory:q,quoteAt:T,now:T,price:q.at(-1).price,durationMs:30000});
 assert.equal(result.ready,false,'do not sell a small down tick inside known support');
});
test('a confirmed resistance reaction remains available on the live quote without four new bars',()=>{
 const q=quotes([99.7,99.85,99.98,100,99.98,99.95,99.9]);
 for(const mirror of [false,true]){
  const rows=mirror?q.map(x=>({...x,price:200-x.price})):q;
  const result=applyCandleLevelRoute({candidate:{ready:false,side:null},map:mirror?supportMap():resistanceMap(),
   quoteHistory:rows,quoteAt:T,now:T,price:rows.at(-1).price,durationMs:30000});
  assert.equal(result.ready,true);assert.equal(result.side,mirror?'CALL':'PUT');
  assert.equal(result.observedAt,T);assert.equal(result.entryPrice,rows.at(-1).price);
 }
});
test('an observed breakout, retest and departure can change resistance into support symmetrically',()=>{
 const q=quotes([99.7,99.8,99.9,100.02,100.20,100.30,100.35,100.30,100.28,
  100.27,100.25,100.2,100.12,100.05,100.07,100.14,100.25]);
 for(const mirror of [false,true]){
  const rows=mirror?q.map(x=>({...x,price:200-x.price})):q;
  const result=applyCandleLevelRoute({candidate:{ready:false,side:null},map:mirror?supportMap():resistanceMap(),
   quoteHistory:rows,quoteAt:T,now:T,price:rows.at(-1).price,durationMs:30000});
  assert.equal(result.ready,true);assert.equal(result.side,mirror?'PUT':'CALL');
 }
});
test('missing, unordered or future-received retest prices cannot change a level role',()=>{
 const q=quotes([99.7,99.8,100.2,100.3,100.05,100.1,100.25]);
 const input={quoteHistory:q,quoteAt:T,now:T,price:q.at(-1).price,side:'CALL',
  zone:{low:100,high:100},tolerance:.1};
 assert.equal(observedRoleRetest(input),true);
 assert.equal(observedRoleRetest({...input,quoteHistory:q.filter((_,i)=>![4,5].includes(i))}),false);
 assert.equal(observedRoleRetest({...input,quoteHistory:q.map((x,i)=>i>=4?{...x,receivedAt:T+1000}:x)}),false);
 assert.equal(observedRoleRetest({...input,quoteHistory:[...q.slice(0,4),q[5],q[4],q[6]]}),false);
});
test('recorded resistance-only zone no longer authorizes the CALL as support; next PUT needs no candle wait',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url)));
 const conflictAt=1791385485950,index=fixture.quoteHistory.findIndex(q=>q.ts===conflictAt);
 assert.ok(index>=0);const q=fixture.quoteHistory[index],prefix=fixture.quoteHistory.slice(0,index+1);
 const structure=historicalPriceStructure({candles:fixture.candles,now:q.ts}),legacy=structuredClone(structure);
 for(const z of [...legacy.zones,...legacy.candleLevelMap.levels])
  for(const key of ['supportPivots','resistancePivots','supportRejections','resistanceRejections'])delete z[key];
 const input={quoteHistory:prefix,candles:fixture.candles,price:q.price,quoteAt:q.ts,now:q.ts,
  durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'};
 const old=analyzeNowOpportunity({...input,structureCache:{get:()=>legacy}});
 assert.equal(old.ready,false);assert.equal(old.side,null);assert.equal(old.provisionalSide,'CALL');
 assert.equal(old.reason,'short-horizon-setup-not-eligible');
 const zone=structure.candleLevelMap.levels.find(z=>z.level===old.priceStructure.candleRoute.event.zone.level);
 assert.equal(zone.supportPivots,0);assert.equal(zone.supportRejections,0);
 assert.equal(zone.resistancePivots,1);assert.equal(zone.resistanceRejections,2);
 assert.equal(analyzeNowOpportunity({...input,structureCache:{get:()=>structure}}).ready,false);
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 rt.patchSettings({engine:'automatic',orderDurationMs:30000},'recorded-role-test');
 let next=null;
 for(let i=0;i<fixture.quoteHistory.length;i++){
  const point=fixture.quoteHistory[i];if(point.ts>conflictAt+7000)break;
  const out=rt._signalValidationGate({analysis:{},settings:rt.settings,now:point.ts,
   snap:{provider:'iq_option',price:point.price,quoteTs:point.ts,
    quoteHistory:fixture.quoteHistory.slice(0,i+1),candles:fixture.candles,
    historicalCandlesVerified:true,payout:null}});
  const anchor=out.analysis?.vnext?.futureEntryAnchor;
  assert.notEqual(anchor?.entryTriggeredAt,conflictAt);
  if(anchor?.entryTriggeredAt>conflictAt){next=anchor;break;}
 }
 assert.ok(next);assert.equal(next.side,'PUT');
 assert.equal(next.entryTriggeredAt-conflictAt,5966);
 assert.equal(next.exitAt-next.entryTriggeredAt,30000);
});
test('support/resistance specialist cannot revive the same rejected historical role',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url)));
 const at=1791385489908,index=fixture.quoteHistory.findIndex(q=>q.ts===at),q=fixture.quoteHistory[index];
 assert.ok(index>=0);
 const input={quoteHistory:fixture.quoteHistory.slice(0,index+1),candles:fixture.candles,
  price:q.price,quoteAt:at,now:at,durationMs:30000,qualityPolicy:'adaptive-market-v17'};
 const automatic=analyzeNowOpportunity({...input,engineId:'automatic'});
 const specialist=analyzeNowOpportunity({...input,engineId:'support_resistance'});
 assert.equal(automatic.ready,false);assert.equal(specialist.ready,false);
 assert.equal(specialist.reason,'shared-base-level-role-conflict');
});

test('short crossing of a known level requires the correct role for an independent breakout',()=>{
 for(const mirror of [false,true])for(const correctRole of [false,true]){
  const q=quotes([99.7,99.85,100.05,100.18,100.22,100.25,100.3]);
  if(mirror)for(const row of q)row.price=200-row.price;
  const support=mirror?correctRole:!correctRole;
  const zone={low:100,high:100,level:100,confirmedPivots:2,independentRejections:3,touches:4,pivots:2,ages:[2,6,10],
   supportPivots:support?2:0,supportRejections:support?3:0,
   resistancePivots:support?0:2,resistanceRejections:support?0:3};
  const out=applyHistoricalPriceStructure({candidate:{ready:false,side:null,reason:'not-ready'},
   structure:{candles:80,periodMs:60000,atr:1,tolerance:.1,averages:[{value:99,slope:.01,period:20}],zones:[zone]},
   quoteHistory:q,quoteAt:T,now:T,price:q.at(-1).price,durationMs:60000});
  assert.equal(out.ready,correctRole);
  if(correctRole){assert.equal(out.side,mirror?'PUT':'CALL');assert.equal(out.reason,'historical-level-breakout');}
 }
});

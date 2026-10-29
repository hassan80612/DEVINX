import test from 'node:test';
import assert from 'node:assert/strict';
import {continuationRoomRisk} from '../sentinel-trading-lab/agent/src/core/continuation-room-risk.mjs';
const T=1800000000000;
function input(prices,mirror=false){
 const zone={low:99.85,high:100.04,level:99.945,
  resistancePivots:1,resistanceRejections:1,supportPivots:0,supportRejections:0};
 if(mirror){zone.low=200-100.04;zone.high=200-99.85;zone.level=200-99.945;
  zone.supportPivots=1;zone.supportRejections=1;zone.resistancePivots=0;zone.resistanceRejections=0;}
 const quoteHistory=prices.map((p,i)=>({ts:T-(prices.length-1-i)*1000,price:mirror?200-p:p}));
 const price=quoteHistory.at(-1).price;
 return {candidate:{ready:true,side:mirror?'PUT':'CALL',reason:'closed-structure-and-live-impulse',
  observedAt:T,entryPrice:price},quoteHistory,quoteAt:T,now:T,price,durationMs:60000,
  structure:{tolerance:.15,candleLevelMap:{observedCandles:100,asOf:T-1000,levels:[zone]}}};
}
const retry=[100.05,100.02,100,99.96,99.92,99.84,99.92,99.98,100.03];
test('crossing the midpoint does not clear an opposing zone after an observed edge rejection',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const x=input(retry,mirror),result=continuationRoomRisk({...x,durationMs});
  assert.equal(result?.kind,'continuation-retrying-inside-rejected-opposing-zone');
  assert.ok(result.touchAt<result.retreatAt&&result.retreatAt<T);
 }
});
test('first accelerating approaches and actually cleared outer edges retain the existing decision',()=>{
 for(const mirror of [false,true]){
  assert.equal(continuationRoomRisk(input([99.5,99.52,99.56,99.62,99.7,99.8,99.91,99.98,100.03],mirror)),null);
  assert.equal(continuationRoomRisk(input([...retry.slice(0,-1),100.3],mirror)),null);
 }
});
test('unknown role, missing rejection and genuine same-side evidence do not acquire a zone veto',()=>{
 for(const mirror of [false,true]){
  const x=input(retry,mirror),z=x.structure.candleLevelMap.levels[0];
  for(const k of ['supportPivots','supportRejections','resistancePivots','resistanceRejections'])delete z[k];
  assert.equal(continuationRoomRisk(x),null);
  const both=input(retry,mirror);Object.assign(both.structure.candleLevelMap.levels[0],{supportPivots:1,resistancePivots:1});
  assert.equal(continuationRoomRisk(both),null);
 }
});
test('the zone retry rule keeps five-minute policy separate and never bridges missing observations',()=>{
 const x=input(retry);
 assert.equal(continuationRoomRisk({...x,durationMs:300000}),null);
 assert.equal(continuationRoomRisk({...x,quoteHistory:x.quoteHistory.filter((_,i)=>![3,4,5].includes(i))}),null);
 assert.equal(continuationRoomRisk({...x,quoteHistory:x.quoteHistory.map(q=>({...q,receivedAt:T+1000}))}),null);
});

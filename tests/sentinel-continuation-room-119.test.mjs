import test from 'node:test';
import assert from 'node:assert/strict';
import {continuationRoomRisk as risk} from '../sentinel-trading-lab/agent/src/core/continuation-room-risk.mjs';
import {readFileSync} from 'node:fs';
const T=1800000000000;
const prices=[100,100.09,100.18,100.24,100.285,100.31,100.322,100.328,100.332,100.336];
const quotes=prices.map((price,i)=>({ts:T-9000+i*1000,receivedAt:T-9000+i*1000,price}));
const barrier={level:100.41,low:100.40,high:100.42,
 resistancePivots:2,resistanceRejections:3,supportPivots:0,supportRejections:0};
const args=()=>({candidate:{ready:true,side:'CALL',reason:'historical-level-breakout',observedAt:T,entryPrice:prices.at(-1)},
 structure:{tolerance:.035,candleLevelMap:{observedCandles:100,asOf:T-500,tolerance:.035,levels:[barrier]}},
 quoteHistory:quotes,quoteAt:T,now:T,price:prices.at(-1)});
test('price fading into a HISTORICALLY proven opposing wall blocks new continuation, not direction inversion',()=>{
 const x=risk(args());assert.equal(x?.kind,'fading-continuation-into-opposing-wall');
 assert.equal(x.level,barrier.level);assert.ok(x.roomNeeded>0);
});
test('symmetric PUT into validated support uses exactly the same evidence',()=>{
 const x=args();x.quoteHistory=quotes.map(q=>({...q,price:200-q.price}));
 x.price=200-prices.at(-1);x.candidate.side='PUT';x.candidate.entryPrice=x.price;
 x.structure.candleLevelMap.levels=[{...barrier,level:200-barrier.level,low:200-barrier.high,
  high:200-barrier.low,supportPivots:2,supportRejections:3,resistancePivots:0,resistanceRejections:0}];
 assert.equal(risk(x)?.kind,'fading-continuation-into-opposing-wall');
});
test('unchallenged trend without a nearby confirmed opposite barrier is unchanged',()=>{
 const x=args();x.structure.candleLevelMap.levels=[];
 assert.equal(risk(x),null);
});
test('one touch, only a wick or wrong level role cannot veto a continuation',()=>{
 for(const z of [
  {...barrier,resistancePivots:0},
  {...barrier,resistanceRejections:1},
  {...barrier,resistancePivots:0,resistanceRejections:0,supportPivots:4,supportRejections:4}
 ]){const x=args();x.structure.candleLevelMap.levels=[z];assert.equal(risk(x),null);}
});
test('sustained acceleration into a level is NOT preemptively prohibited',()=>{
 const x=args();x.quoteHistory=quotes.map((q,i)=>({...q,price:100+(i/9)**2*.336}));
 x.price=x.quoteHistory.at(-1).price;x.candidate.entryPrice=x.price;
 assert.equal(risk(x),null);
});
test('a genuine breakout already beyond prior resistance is NOT an opposing wall',()=>{
 const x=args();x.quoteHistory=quotes.map(q=>({...q,price:q.price+.22}));
 x.price=x.quoteHistory.at(-1).price;x.candidate.entryPrice=x.price;
 assert.equal(risk(x),null);
});
test('all confirmed reversal/rejection decisions are left untouched',()=>{
 for(const reason of ['confirmed-level-structure-reversal','failed-breakout-structure-change',
   'historical-level-rejection','closed-range-extreme-reversal-confirmed','multiscale-candle-rejection']){
   const x=args();x.candidate.reason=reason;assert.equal(risk(x),null,reason);
 }
 const x=args();x.candidate.priceStructure={confirmedReversal:{side:'CALL',confirmedAt:T}};
 assert.equal(risk(x),null);
});
test('an isolated bad future tick, stale quote or missing current quote cannot create a veto',()=>{
 const x=args();assert.equal(risk({...x,now:T+1600}),null);
 assert.equal(risk({...x,quoteHistory:[...x.quoteHistory,{ts:T+1000,price:100.6,receivedAt:T+1000}]}),risk(x));
 assert.equal(risk({...x,quoteHistory:x.quoteHistory.slice(0,-1)}),null);
 assert.equal(risk({...x,quoteHistory:x.quoteHistory.map(q=>({...q,receivedAt:T+3000}))}),null);
});
test('market data gap and unverified historical context do not create a block',()=>{
 const x=args();x.quoteHistory=x.quoteHistory.filter(q=>q.ts!==T-3000&&q.ts!==T-4000);
 assert.equal(risk(x),null);
 const old=args();old.structure.candleLevelMap.asOf=T+1000;
 assert.equal(risk(old),null);
});
test('continuation safety is in the SAME market base and final direction review, not broker or bot',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.match(s,/roomRisk=!pivotRisk&&!wallRisk&&proposed.ready\?continuationRoomRisk/);
 assert.match(s,/roomRisk=!pivotRisk&&!wallRisk\?continuationRoomRisk/);
 assert.doesNotMatch(readFileSync(new URL('../sentinel-trading-lab/agent/src/core/continuation-room-risk.mjs',import.meta.url),'utf8'),
 /setTimeout\s*\(|setInterval\s*\(|\bawait\b|fetch\s*\(/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {oppositePivotBreakRisk} from '../sentinel-trading-lab/agent/src/core/opposite-pivot-break-risk.mjs';
import {confirmedFastLevelReversal} from '../sentinel-trading-lab/agent/src/core/fast-level-reversal.mjs';
import {applyObservedLevelSequence,observedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {analyzeNowOpportunity,reviewChangedOpportunitySide,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000;
const walk=(vertices,n=12)=>{const prices=[vertices[0]];for(const end of vertices.slice(1)){
 const from=prices.at(-1);for(let i=1;i<=n;i++)prices.push(from+(end-from)*i/n);
}return prices.map((price,i)=>({ts:T-(prices.length-1-i)*250,price}));};
const path=()=>walk([110,103,108,101,105,98,102,96,107]);
const args=(q,side='PUT')=>({candidate:{ready:true,side,reason:'closed-structure-and-live-impulse',observedAt:q.at(-1).ts,entryPrice:q.at(-1).price},quoteHistory:q,quoteAt:q.at(-1).ts,now:q.at(-1).ts,price:q.at(-1).price});
test('PUT following successive lower highs/lows is discarded when current prices break LAST falling swing high',()=>{
 const q=path(),result=oppositePivotBreakRisk(args(q));
 assert.equal(result?.kind,'observed-opposite-swing-pivot-broken');
 assert.equal(result?.observedSide,'CALL');
 assert.ok(result.pivot<q.at(-1).price&&result.breakAt<=T);
});
test('mirror CALL after higher highs/lows is discarded when price breaks below LAST rising swing low',()=>{
 const q=path().map(x=>({...x,price:200-x.price})),result=oppositePivotBreakRisk(args(q,'CALL'));
 assert.equal(result?.observedSide,'PUT');
});
test('no blocking before pivot actually breaks, without directional historical structure, or after breakout is old',()=>{
 const q=path();
 assert.equal(oppositePivotBreakRisk(args(q.slice(0,-8))),null);
 assert.equal(oppositePivotBreakRisk(args(walk([101,103,99,104,98,105,99,106,107]))),null);
 const stale=q.slice();for(let i=1;i<=35;i++)stale.push({ts:T+i*250,price:107+i*.002});
 assert.equal(oppositePivotBreakRisk(args(stale)),null);
});
test('confirmed reversals, price-verified trend corrections and unready candidates remain unchanged',()=>{
 const q=path(),a=args(q);
 for(const reason of ['confirmed-fast-level-reversal','confirmed-level-structure-reversal',
  'historical-level-rejection','failed-breakout-structure-change','closed-range-extreme-reversal-confirmed']){
  assert.equal(oppositePivotBreakRisk({...a,candidate:{...a.candidate,reason}}),null,reason);
 }
 assert.equal(oppositePivotBreakRisk({...a,candidate:{...a.candidate,ready:false}}),null);
 const flipped={...a,candidate:{...a.candidate,side:'CALL'}};
 assert.equal(oppositePivotBreakRisk(flipped),null);
});
test('future quotes, stale current quote and missing continuity do not trigger opposite-side protection',()=>{
 const a=args(path());
 assert.deepEqual(oppositePivotBreakRisk({...a,quoteHistory:[...a.quoteHistory,{ts:T+1000,price:200}]}),oppositePivotBreakRisk(a));
 assert.equal(oppositePivotBreakRisk({...a,now:T+1600}),null);
 const q=a.quoteHistory.map(x=>({...x}));
 q.at(-1).receivedAt=T+1000;
 assert.equal(oppositePivotBreakRisk({...a,quoteHistory:q}),null);
 const broken=a.quoteHistory.map((x,i)=>({...x,ts:x.ts-(i<a.quoteHistory.length-4?12000:0)}));
 assert.equal(oppositePivotBreakRisk({...a,quoteHistory:broken}),null);
});
test('final-direction review evaluates same opposite pivot evidence, no inverse order invented',()=>{
 const a=args(path());
 const x=reviewChangedOpportunitySide({...a,previousSide:'CALL',structureCache:{get:()=>({tolerance:.04,candleLevelMap:{observedCandles:0,levels:[]}})},candles:[]});
 assert.equal(x.ready,false);assert.equal(x.side,null);
 assert.equal(x.reason,'final-side-observed-opposite-pivot-break');
});
test('shared base uses new evidence BEFORE broker; irreversible opened expiry unchanged',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.match(s,/oppositePivotBreakRisk\(\{candidate:proposed,quoteHistory,quoteAt,now,price\}\)/);
 assert.match(s,/oppositePivotBreakRisk\(\{candidate,quoteHistory,quoteAt,now,price\}\)/);
 const q=path(),issued=advanceNowOpportunity({candidate:{...args(q).candidate,side:'CALL'},now:T,quoteAt:T,asset:'EUR/USD',durationMs:30000});
 const changed=advanceNowOpportunity({previous:issued,candidate:{...args(q).candidate,side:'PUT'},now:T+1000,quoteAt:T+1000,asset:'EUR/USD',durationMs:30000});
 assert.equal(changed.side,'CALL');assert.equal(changed.entryReadyNow,false);
});
test('fast V rejection can survive a tiny one-tick retrace between advancing quotes, not a weak bounce',()=>{
 const q=Array.from({length:720},(_,i)=>({ts:T-180000+i*250,price:106-5.89*i/720}));
 const prices=[100.11,100.07,100.025,99.99,100.018,100.013,100.044,100.065];
 for(const [i,p] of prices.entries())q.push({ts:T+i*250,price:p});
 const level=(price,role)=>({low:price,high:price,level:price,confirmedPivots:1,independentRejections:2,
  supportPivots:role==='support'?1:0,resistancePivots:role==='resistance'?1:0,
  supportRejections:role==='support'?2:0,resistanceRejections:role==='resistance'?2:0});
 const map={observedCandles:100,asOf:T-60000,tolerance:.07,levels:[level(100,'support'),level(101,'resistance')]};
 const a={quoteHistory:q,quoteAt:q.at(-1).ts,now:q.at(-1).ts,price:q.at(-1).price,map};
 assert.equal(confirmedFastLevelReversal(a)?.side,'CALL');
 assert.equal(confirmedFastLevelReversal({...a,price:100.001,quoteHistory:q.map((v,i)=>i===q.length-1?{...v,price:100.001}:v)}),null);
});
test('do not introduce fixed timer, browser DOM reads, waits, or other operations into price gate',()=>{
 for(const file of ['opposite-pivot-break-risk.mjs','fast-level-reversal.mjs']){
  const s=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(s,/setTimeout\s*\(|setInterval\s*\(|page\.evaluate\s*\(|\bawait\b|fetch\s*\(/);
 }
});

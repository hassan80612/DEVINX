import test from 'node:test';
import assert from 'node:assert/strict';
import {observedSwings,observedLevelSequence,applyObservedLevelSequence} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1792250000000;
function walk(vertices){
 const prices=[vertices[0]];
 for(const end of vertices.slice(1)){
  const start=prices.at(-1),steps=Math.round(Math.abs(end-start)*10);
  for(let i=1;i<=steps;i++)prices.push(start+(end-start)*i/steps);
 }
 return prices.map((price,i)=>({ts:T-(prices.length-1-i)*1000,price}));
}
const level=price=>({low:price,high:price,level:price,windows:[3,10,20,50,100],confirmedPivots:2,independentTests:3});
const map={observedCandles:100,asOf:T-60000,tolerance:.15,levels:[level(90),level(100),level(110)]};
const args=rows=>({map,quoteHistory:rows,quoteAt:T,now:T,price:rows.at(-1).price,durationMs:30000});
const rebound=walk([102,100.6,101.3,99.4,100.2,99.9,101.8]);
const candidate={ready:true,side:'PUT',observedAt:T,entryPrice:101.8};
test('a monotonic path cannot fabricate a confirmed pivot at its beginning',()=>{
 assert.deepEqual(observedSwings(walk([103,100]),.2),[]);
 assert.deepEqual(observedSwings(walk([100,103]),.2),[]);
});
test('support breakdown, reclaim, higher low and break of the latest local high identify an observed reversal',()=>{
 const s=observedLevelSequence(args(rebound));
 assert.equal(s.structureChange.kind,'failed-breakout-structure-change');
 assert.equal(s.structureChange.side,'CALL');assert.equal(s.structureChange.level.level,100);
 assert.ok(s.structureChange.brokenAt<s.structureChange.reclaimedAt);
 assert.ok(Math.abs(s.structureChange.pivotPrice-100.2)<1e-8);
 assert.ok(s.turns.some(p=>p.kind==='low'&&Math.abs(p.price-99.9)<1e-8));
 assert.equal(applyObservedLevelSequence({candidate,...args(rebound)}).side,'CALL');
});
test('returning across the level alone is not a break of the local structure',()=>{
 const rows=walk([102,100.6,101.3,99.4,100.2]);
 assert.equal(observedLevelSequence(args(rows)).structureChange,null);
});
test('a break, underside retest and new low support continuation instead of a blind CALL at support',()=>{
 const rows=walk([102,100.4,100.9,99,100,99.7,98.6]);
 const s=observedLevelSequence(args(rows));
 assert.equal(s.structureChange.kind,'break-retest-continuation');
 assert.equal(s.structureChange.side,'PUT');
});
test('a reclaimed level that is lost again cannot retain the old reversal',()=>{
 const rows=walk([102,100.6,101.3,99.4,101.8,99]);
 const e=observedLevelSequence(args(rows)).structureChange;
 assert.notEqual(e?.side,'CALL');
});
test('the same geometry mirrors correctly for resistance and PUT reversal',()=>{
 const rows=rebound.map(q=>({...q,price:200-q.price}));
 const s=observedLevelSequence(args(rows));
 assert.equal(s.structureChange.side,'PUT');
});
test('no future quote or receipt can influence the current event',()=>{
 const a=args(rebound),future={ts:T+1000,price:50};
 assert.deepEqual(observedLevelSequence({...a,quoteHistory:[...rebound,future]}),observedLevelSequence(a));
 assert.deepEqual(observedLevelSequence({...a,quoteHistory:[...rebound,{ts:T-500,receivedAt:T+1000,price:50}]}),observedLevelSequence(a));
 assert.equal(observedLevelSequence({...a,now:T+2000}),null);
});
test('a market gap resets the sequence rather than bridging a missing reversal',()=>{
 const rows=[...rebound.slice(0,-5).map(q=>({...q,ts:q.ts-10000})),...rebound.slice(-5)];
 assert.equal(observedLevelSequence(args(rows)).structureChange,null);
});
test('entry uses the current quote and full 30s expiry, and cannot flip a held signal',()=>{
 const selected=applyObservedLevelSequence({candidate,...args(rebound)});
 const issued=advanceNowOpportunity({candidate:selected,now:T,quoteAt:T,asset:'EUR',durationMs:30000});
 assert.equal(issued.entryAt,T);assert.equal(issued.exitAt,T+30000);
 const held=advanceNowOpportunity({previous:issued,candidate:{...candidate,observedAt:T+1000},now:T+1000,quoteAt:T+1000,asset:'EUR',durationMs:30000});
 assert.equal(held.side,'CALL');assert.equal(held.entryReadyNow,false);
});
test('unavailable history and unsupported durations preserve the existing decision',()=>{
 assert.equal(applyObservedLevelSequence({candidate,...args(rebound),map:null}),candidate);
 assert.equal(applyObservedLevelSequence({candidate,...args(rebound),durationMs:4000}),candidate);
});
test('confirmed rejection followed by directional movement can favor continuation when the next historical level is beyond the 30s travel estimate',()=>{
 const rows=walk([100,103,102.5,105,103.5]);
 const a={...args(rows),map:{...map,levels:[level(90),level(105)]}};
 const s=observedLevelSequence(a);
 assert.equal(s.continuation.side,'PUT');assert.equal(s.continuation.nextLevel.level,90);
 assert.ok(s.continuation.room>s.continuation.projectedMove);
 assert.equal(applyObservedLevelSequence({candidate:{...candidate,side:'CALL'},...a}).side,'PUT');
});
test('a nearby older level prevents assuming the current movement has clear room for 30 seconds',()=>{
 const rows=walk([100,103,102.5,105,103.5]);
 const s=observedLevelSequence({...args(rows),map:{...map,levels:[level(90),level(103.3),level(105)]}});
 assert.equal(s.continuation,null);
});
test('unknown next level and unready baseline do not create a continuation admission',()=>{
 const rows=walk([100,103,102.5,105,103.5]);
 assert.equal(observedLevelSequence({...args(rows),map:{...map,levels:[level(105)]}}).continuation,null);
 const waiting={ready:false,side:null};
 const r=applyObservedLevelSequence({candidate:waiting,...args(rows),map:{...map,levels:[level(90),level(105)]}});
 assert.equal(r.ready,false);assert.equal(r.side,null);
});

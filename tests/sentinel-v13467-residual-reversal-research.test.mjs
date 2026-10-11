import test from 'node:test';
import assert from 'node:assert/strict';
import {entryRegimeFeatures,correctSelectedEngineFutureEntry,advanceSelectedEngineResidualStudy} from '../sentinel-trading-lab/agent/src/core/vnext-residual-reversal-research.mjs';
const start=1800000000000;
const sample=Array.from({length:300},(_,i)=>({
 ts:start+i*1000,price:1.1+Math.sin(i/14)*.00007+i*.0000003
}));
const at=start+299000;
const plan={
 side:'CALL',engineId:'automatic',asset:'EUR/USD OTC',delaySeconds:30,holdingSeconds:30,
 issuedAt:at,entryAt:at+30000,exitAt:at+60000,
 projectedEntryPrice:1.1000,projectedExitPrice:1.10002,actionable:false
};
test('original 13.4.67 side and price are never mutated by corrective research',()=>{
 const before=structuredClone(plan);
 const out=correctSelectedEngineFutureEntry({basePlan:plan,quoteHistory:sample,now:at});
 assert.equal(out.baselineSide,plan.side);
 assert.equal(out.shadowSide,plan.side);
 assert.equal(out.correction,0);
 assert.equal(out.reason,'no-completed-samples');
 assert.deepEqual(plan,before);
});
test('regime description excludes future quotes and detects range activity',()=>{
 const a=entryRegimeFeatures(sample,at);
 const poisoned=[...sample,{ts:at+30000,price:0.1},{ts:at+60000,price:100}];
 assert.deepEqual(entryRegimeFeatures(poisoned,at),a);
 assert.equal(a.features.length,12);
 assert.ok(a.turning>=0&&a.turning<=1);
});
test('an observed 30-second entry and 30-second settlement creates one true residual, AFTER expiry',()=>{
 const first=advanceSelectedEngineResidualStudy({basePlan:plan,quoteHistory:sample,now:at});
 assert.equal(first.pending.length,1);
 assert.equal(first.completed,0);
 const early=advanceSelectedEngineResidualStudy({previous:first,basePlan:plan,now:at+30000,
  quoteHistory:[...sample,{ts:at+30000,price:1.10015}]});
 assert.equal(early.completed,0);
 const mature=advanceSelectedEngineResidualStudy({previous:early,basePlan:plan,now:at+60000,
  quoteHistory:[...sample,{ts:at+30000,price:1.10015},{ts:at+60000,price:1.09985}]});
 assert.equal(mature.completed,1);
 assert.equal(mature.pending.length,0);
 assert.ok(mature.examples[0].residual<0);
 const repeat=advanceSelectedEngineResidualStudy({previous:mature,basePlan:plan,now:at+61000,
  quoteHistory:[...sample,{ts:at+30000,price:1.10015},{ts:at+60000,price:1.09985}]});
 assert.equal(repeat.completed,1);
});
test('late market prints cannot manufacture a winning historical outcome',()=>{
 const first=advanceSelectedEngineResidualStudy({basePlan:plan,quoteHistory:sample,now:at});
 const x=advanceSelectedEngineResidualStudy({previous:first,basePlan:plan,now:at+65000,
  quoteHistory:[...sample,{ts:at+34000,price:1.1},{ts:at+62000,price:1.2}]});
 assert.equal(x.completed,0);
 const expired=advanceSelectedEngineResidualStudy({previous:x,basePlan:null,now:at+80000,
  quoteHistory:[...sample,{ts:at+34000,price:1.1},{ts:at+62000,price:1.2}]});
 assert.equal(expired.pending.length,0);
 assert.equal(expired.completed,0);
});
test('correction can be positive or negative, and never changes selected engine or timestamp',()=>{
 const feat=entryRegimeFeatures(sample,at);
 const examples=[...Array(14)].map((_,i)=>({
  engineId:'automatic',asset:'EUR/USD OTC',delaySeconds:30,
  features:feat.features,exitAt:at-(i+1)*75000,
  residual:-.00015
 }));
 const out=correctSelectedEngineFutureEntry({basePlan:plan,examples,quoteHistory:sample,now:at});
 assert.ok(out.correction<0);
 assert.ok(out.observations>0);
 assert.equal(plan.side,'CALL');
 const other=correctSelectedEngineFutureEntry({basePlan:plan,examples:examples.map(x=>({...x,engineId:'trend'})),quoteHistory:sample,now:at});
 assert.equal(other.correction,0);
 const reversed=correctSelectedEngineFutureEntry({basePlan:plan,examples:examples.map(x=>({...x,residual:.00015})),quoteHistory:sample,now:at});
 assert.ok(reversed.correction>0);
});

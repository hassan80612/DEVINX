import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {causalPatternDirection as released} from '../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs';
import {binaryObjectiveResearchRuntime} from '../experiments/binary-objective-research-runtime-20261018.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-binary-objective-counterexample-20261018.json',import.meta.url)));
const c=await binaryObjectiveResearchRuntime({trace:true});
test.after(()=>c.cleanup());
for(const mirror of [false,true])test(`a rare large return cannot use the opposite class vote as its strength ${mirror}`,()=>{
 const transform=mirror?p=>1/p:p=>p;
 const input={...fixture,quoteHistory:fixture.quoteHistory.map(q=>({...q,price:transform(q.price)})),price:transform(fixture.price)};
 const old=released(input),fixed=c.causalPatternDirection(input),vote=fixed.researchBinary;
 assert.equal(old.ready,true);assert.equal(fixed.ready,true);assert.ok(old.strength>=.4);
 assert.equal(old.side,mirror?'CALL':'PUT');assert.equal(fixed.side,mirror?'PUT':'CALL');
 assert.equal(fixed.strength,old.strength);
 assert.equal(fixed.side,vote.winsCall>vote.winsPut?'CALL':'PUT');
 assert.equal(vote.meanMoveSide,old.side);
 const majority=vote.selectedExamples.reduce((s,x)=>s+(x.side===fixed.side?1:0),0);
 assert.ok(majority>vote.selectedExamples.length/2);
 assert.equal(fixed.analogues,old.analogues);assert.equal(fixed.selected,old.selected);
 assert.equal(fixed.expectation,old.expectation);
});
test('future and not-yet-received quotes cannot change weighted outcome counts or side',()=>{
 const ts=fixture.quoteAt,poisoned={...fixture,quoteHistory:[...fixture.quoteHistory,
  {ts:ts+1,receivedAt:ts+1,price:100},{ts:ts-1,receivedAt:ts+1,price:100}]};
 assert.deepEqual(c.causalPatternDirection(poisoned),c.causalPatternDirection(fixture));
});
test('scaling price units preserves vote-based classification and confidence',()=>{
 const input={...fixture,quoteHistory:fixture.quoteHistory.map(q=>({...q,price:q.price*1000})),price:fixture.price*1000};
 const a=c.causalPatternDirection(fixture),b=c.causalPatternDirection(input);
 assert.equal(a.side,b.side);assert.ok(Math.abs(a.strength-b.strength)<1e-9);
});
test('invalid, mismatched, unsupported and stale current prices remain unready',()=>{
 for(const input of [{...fixture,price:fixture.price+1},{...fixture,now:fixture.quoteAt+2501},
  {...fixture,now:fixture.quoteAt-1},{...fixture,durationMs:10000},
  {...fixture,quoteHistory:fixture.quoteHistory.slice(-10)}]){
  assert.equal(c.causalPatternDirection(input).ready,false);assert.equal(released(input).ready,false);
 }
});

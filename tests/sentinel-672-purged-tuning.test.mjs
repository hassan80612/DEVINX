import test from 'node:test';
import assert from 'node:assert/strict';
import {purgedTuningTrajectory} from '../sentinel-trading-lab/agent/src/core/purged-tuning-research.mjs';
import {generate} from '../scripts/sentinel-tuning-synthetic-streams.mjs';
const call=(rows,h,mode,now=rows.at(-1).ts)=>purgedTuningTrajectory({quoteHistory:rows,asOf:now,entryDelaySeconds:h,holdingSeconds:h,tuningMode:mode});
test('all tuning variants preserve coherent direct entry/expiry prices and informational permissions',()=>{
 const rows=generate(1200031,'cycle',3601),now=rows.at(-1).ts;
 for(const h of [5,30,300])for(const mode of ['fixed02','fixed2','nonOverlap','walkDirection']){
  const p=call(rows,h,mode);assert.equal(p.status,'adaptive-direct-trajectory');
  assert.equal(p.entryAt,now+h*1000);assert.equal(p.exitAt,now+2*h*1000);
  assert.equal(p.side,p.projectedExitPrice>p.projectedEntryPrice?'CALL':'PUT');
  assert.ok(p.latestTrainingOutcomeAt<=now);assert.equal(p.actionable,false);assert.equal(p.calibrated,false);
  const issues=[];
  for(const block of p.tuningDiagnostics.evidenceTrace){
   assert.ok(block.trainLatestOutcomeAt<block.validationIssues[0]);
   for(let i=0;i<block.validationIssues.length;i++)issues.push({issue:block.validationIssues[i],outcome:block.validationOutcomes[i]});
  }
  issues.sort((a,b)=>a.issue-b.issue);
  for(let i=1;i<issues.length;i++)assert.ok(issues[i].issue>issues[i-1].outcome);
 }
});
test('long horizon reports repeated-outcome evidence and uses fixed prior rather than nominally large validation',()=>{
 const rows=generate(1200049,'regime_switch',3601),p=call(rows,300,'nonOverlap');
 assert.equal(p.tuningDiagnostics.nominalValidationExamples,21);
 assert.equal(p.tuningDiagnostics.nonOverlappingValidationExamples,1);
 assert.equal(p.tuningDiagnostics.selectionPerformed,false);
 assert.equal(p.validation.examples,0);assert.equal(p.validation.accuracy,null);
 assert.equal(p.fitted.penalty,.2);assert.equal(p.fitted.halfLifeSeconds,1800);
});
test('future input and late backfills do not alter tuning or forecast',()=>{
 const rows=generate(1200067,'reversal',3601),now=rows.at(-1).ts;
 const changed=[...rows,{ts:now+1,price:1e15},{ts:now-700000,price:1e-15,receivedAt:now+1}];
 for(const m of ['fixed02','fixed2','nonOverlap','walkDirection'])assert.deepEqual(call(changed,30,m,now),call(rows,30,m));
});
test('dense repeated ticks preserve time context and non-overlap evidence',()=>{
 const rows=generate(1200083,'trend',2401),now=rows.at(-1).ts;
 const dense=rows.flatMap(q=>[0,250,500,750].map(d=>({ts:q.ts+d,price:q.price}))).filter(q=>q.ts<=now);
 assert.deepEqual(call(dense,30,'walkDirection'),call(rows,30,'walkDirection'));
});

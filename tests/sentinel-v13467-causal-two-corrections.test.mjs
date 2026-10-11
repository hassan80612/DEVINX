import test from 'node:test';
import assert from 'node:assert/strict';
import {causalTwoCorrectionForecast,progressCausalTwoCorrectionStudy}
 from '../sentinel-trading-lab/agent/src/core/vnext-causal-two-corrections.mjs';
const beginning=1800000000000;
const history=Array.from({length:1200},(_,i)=>({
 ts:beginning+i*1000,price:1.1+Math.sin(i/15)*.00005+i*.0000002
}));
const now=beginning+1199000;
const plan={engineId:'automatic',asset:'EUR/USD OTC',
 delaySeconds:30,holdingSeconds:30,issuedAt:now,
 entryAt:now+30000,exitAt:now+60000,side:'CALL',
 projectedEntryPrice:1.1000,projectedExitPrice:1.10002,
 actionable:false,calibrated:false};
test('causal combination never touches the original, never invents a signal without completed labels',()=>{
 const copy=structuredClone(plan);
 const s=progressCausalTwoCorrectionStudy({basePlan:plan,quoteHistory:history,now});
 assert.deepEqual(plan,copy);
 assert.equal(s.combined.baselineSide,'CALL');
 assert.equal(s.combined.combinedSide,'CALL');
 assert.equal(s.combined.originalUntouched,true);
 assert.equal(s.combined.researchOnly,true);
 assert.equal(s.combined.actionable,false);
 assert.equal(s.pending.length,1);
});
test('combined study cannot train on invisible future prices or on late prints',()=>{
 const init=progressCausalTwoCorrectionStudy({basePlan:plan,quoteHistory:history,now});
 const poison=[...history,{ts:now+30000,price:.000001},{ts:now+60000,price:999}];
 const impossible=progressCausalTwoCorrectionStudy({basePlan:plan,quoteHistory:poison,now});
 assert.deepEqual(impossible.combined,init.combined);
 assert.equal(impossible.completed.length,0);
 const tooEarly=progressCausalTwoCorrectionStudy({
  previous:init,basePlan:plan,quoteHistory:poison,now:now+59000});
 assert.equal(tooEarly.completed.length,0);
 const completed=progressCausalTwoCorrectionStudy({
  previous:tooEarly,basePlan:plan,quoteHistory:poison,now:now+60000});
 assert.equal(completed.completed.length,1);
 assert.ok(completed.completed[0].actualLogReturn>0);
});
test('stacking uses only settled observations from the same motor, expiry and asset',()=>{
 const hist=progressCausalTwoCorrectionStudy({basePlan:plan,quoteHistory:history,now});
 const template=hist.pending[0];
 const rows=Array.from({length:36},(_,i)=>({
  ...template,issuedAt:now-(i+1)*95000-30000,
  entryAt:now-(i+1)*95000,
  exitAt:now-(i+1)*95000+30000,
  baseLogReturn:.00002,rawLogReturn:.00012,
  directLogReturn:-.00008,actualLogReturn:-.00022,
  scale:.00012
 }));
 const raw={correctedLogReturn:.00012},direct={directLogReturn:-.00008};
 const outcome=causalTwoCorrectionForecast({
  basePlan:plan,residualCandidate:raw,directCandidate:direct,
  completed:rows,quoteHistory:history,now});
 assert.ok(outcome.independentExamples>=12);
 assert.ok(outcome.directWeight>0);
 assert.ok(outcome.rawWeight<0);
 assert.ok(outcome.combinedLogReturn<outcome.baselineLogReturn);
 const other=causalTwoCorrectionForecast({
  basePlan:plan,residualCandidate:raw,directCandidate:direct,
  completed:rows.map(r=>({...r,engineId:'mean_reversion'})),
  quoteHistory:history,now});
 assert.equal(other.combinedSide,'CALL');
 assert.equal(other.rawWeight,0);
 assert.equal(other.directWeight,0);
});

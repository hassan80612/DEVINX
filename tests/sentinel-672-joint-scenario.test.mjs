import test from 'node:test';
import assert from 'node:assert/strict';
import {jointScenarioForecasts} from '../sentinel-trading-lab/agent/src/core/joint-scenario-research.mjs';
import {generate} from '../scripts/sentinel-joint-synthetic-streams.mjs';
const run=(rows,h=30,now=rows.at(-1).ts)=>jointScenarioForecasts({quoteHistory:rows,asOf:now,entryDelaySeconds:h,holdingSeconds:h});
test('one joint path supplies compatible direction, endpoint prices, extremes and reversal',()=>{
 for(const kind of ['cycle','regime_switch','exhaustion']){
  const rows=generate(1010031,kind,3601),now=rows.at(-1).ts;
  for(const h of [5,30,300]){
   const result=run(rows,h);assert.equal(result.status,'joint-scenario-research');
   for(const model of Object.values(result.models)){
    assert.equal(model.entryAt,now+h*1000);assert.equal(model.exitAt,now+2*h*1000);
    assert.equal(model.side,model.projectedExitPrice>model.projectedEntryPrice?'CALL':'PUT');
    const path=model.expectedPath.slice(h);
    assert.equal(model.events.top.price,Math.max(...path.map(p=>p.price)));
    assert.equal(model.events.bottom.price,Math.min(...path.map(p=>p.price)));
    assert.equal(path.find(p=>p.secondsFromNow===model.events.top.secondsFromNow).price,model.events.top.price);
    assert.equal(path.find(p=>p.secondsFromNow===model.events.bottom.secondsFromNow).price,model.events.bottom.price);
    assert.ok(model.events.top.price>=Math.max(model.projectedEntryPrice,model.projectedExitPrice));
    assert.ok(model.events.bottom.price<=Math.min(model.projectedEntryPrice,model.projectedExitPrice));
    assert.ok(model.latestTrainingOutcomeAt<=now);
    if(model.representativeTrainingOutcomeAt)assert.ok(model.representativeTrainingOutcomeAt<=now);
    if(model.validation.examples)assert.ok(model.tuningTrainLatestOutcomeAt<model.tuningValidationFirstIssueAt);
    assert.equal(model.actionable,false);assert.equal(model.calibrated,false);
   }
  }
 }
});
test('future quotes, late backfills and external truth labels do not change the joint distribution',()=>{
 const rows=generate(1010049,'reversal',3601),now=rows.at(-1).ts;
 const altered=[...rows,{ts:now+1,price:1e20},{ts:now-800000,price:1e-20,receivedAt:now+1}];
 assert.deepEqual(run(altered,30,now),run(rows));
 assert.deepEqual(jointScenarioForecasts({quoteHistory:rows,asOf:now,entryDelaySeconds:30,holdingSeconds:30,truth:'PUT'}),run(rows));
});
test('repeated tick density does not change time context or any selected path',()=>{
 const rows=generate(1010063,'trend',2401),now=rows.at(-1).ts;
 const dense=rows.flatMap(q=>[0,250,500,750].map(d=>({ts:q.ts+d,price:q.price}))).filter(q=>q.ts<=now);
 assert.deepEqual(run(dense),run(rows));
});
test('flat and stale context do not invent a directional future path',()=>{
 const rows=Array.from({length:2401},(_,i)=>({ts:1800000000000+i*1000,price:1}));
 assert.equal(run(rows).side,null);assert.equal(run(rows,30,rows.at(-1).ts+5000).side,null);
 assert.equal(jointScenarioForecasts({quoteHistory:[],asOf:1800000000000}).side,null);
});

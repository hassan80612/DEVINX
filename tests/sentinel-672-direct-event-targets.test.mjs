import test from 'node:test';
import assert from 'node:assert/strict';
import {directEventTargets} from '../sentinel-trading-lab/agent/src/core/direct-event-target-research.mjs';
const START=1800000000000;
function generate(seed,n=3601){
 let state=seed,lp=0;
 return Array.from({length:n},(_,i)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;
  lp+=(state/4294967296-.5)*.000010+.000008*Math.sin(i*.053);
  return {ts:START+i*1000,price:Math.exp(lp)};
 });
}
const predict=(rows,lead=30,hold=60,now=rows.at(-1)?.ts??START)=>directEventTargets({quoteHistory:rows,asOf:now,entryDelaySeconds:lead,holdingSeconds:hold});
test('separate direction and extrema heads obey exact interval and causal completed-target boundaries',()=>{
 const rows=generate(910021),now=rows.at(-1).ts;
 for(const h of [5,30,300]){
  const r=predict(rows,h,h);assert.equal(r.status,'direct-event-target-research');
  for(const model of Object.values(r.models)){
   assert.equal(model.entryAt,now+h*1000);assert.equal(model.exitAt,now+2*h*1000);
   assert.ok(['CALL','PUT'].includes(model.side));assert.ok(model.latestTrainingOutcomeAt<=now);
   if(model.validation.examples)assert.ok(model.tuningTrainLatestOutcomeAt<model.tuningValidationFirstIssueAt);
   for(const e of [model.events.top,model.events.bottom]){
    assert.ok(e.secondsFromNow>=h&&e.secondsFromNow<=2*h);assert.ok(Number.isFinite(e.price)&&e.price>0);
   }
   assert.equal(model.actionable,false);assert.equal(model.calibrated,false);assert.equal(model.modelConfidence,null);
   if(model.rawCallProbability!==null)assert.ok(model.rawCallProbability>=0&&model.rawCallProbability<=1);
  }
 }
});
test('future labels and late arriving backfills cannot change any prediction',()=>{
 const rows=generate(910033),now=rows.at(-1).ts;
 const contaminated=[...rows,{ts:now+1,price:1e15},{ts:now-900000,price:1e-15,receivedAt:now+1}];
 assert.deepEqual(predict(contaminated,30,60,now),predict(rows));
 const extra=directEventTargets({quoteHistory:rows,asOf:now,entryDelaySeconds:30,holdingSeconds:60,truth:'CALL',futureTopAt:now+40000});
 assert.deepEqual(extra,predict(rows));
});
test('quote density does not change observable time series or learned labels',()=>{
 const rows=generate(910047),now=rows.at(-1).ts;
 const dense=rows.flatMap(q=>[0,250,500,750].map(d=>({ts:q.ts+d,price:q.price}))).filter(q=>q.ts<=now);
 assert.deepEqual(predict(dense),predict(rows));
});
test('all-flat history does not invent a binary probability or claim calibrated accuracy',()=>{
 const rows=Array.from({length:1801},(_,i)=>({ts:START+i*1000,price:1}));
 const r=predict(rows,30,30);
 assert.equal(r.models.ridge_mean.side,null);
 assert.equal(r.models.logistic_mean.side,null);assert.equal(r.models.logistic_mean.rawCallProbability,null);
 assert.equal(r.models.logistic_mean.nonDrawTrainingExamples,0);
});
test('missing or stale observable history fails without fabricated events',()=>{
 assert.equal(predict([]).side,null);
 const rows=generate(910059),now=rows.at(-1).ts;
 assert.equal(predict(rows,30,60,now+5000).side,null);
 assert.equal(predict(rows.map(q=>({...q,receivedAt:now})),30,60,now).side,null);
});

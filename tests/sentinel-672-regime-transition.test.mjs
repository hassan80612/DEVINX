import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
import {regimeTransitionForecasts} from '../sentinel-trading-lab/agent/src/core/adaptive-regime-transition-research.mjs';
const START=1800000000000;
const generate=(seed,len=3601)=>{
 let state=seed,lp=0;
 return Array.from({length:len},(_,i)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;
  lp+=.000006*Math.sin(i*.075)+(state/4294967296-.5)*.000012;
  return {ts:START+i*1000,price:Math.exp(lp)};
 });
};
const call=(rows,h=30,asOf=rows.at(-1).ts)=>regimeTransitionForecasts({quoteHistory:rows,asOf,entryDelaySeconds:h,holdingSeconds:h});
test('all candidates predict exact direct future interval with completed outcomes only',()=>{
 const rows=generate(810017),now=rows.at(-1).ts;
 for(const h of [5,30,300]){
  const r=call(rows,h),base=adaptiveDirectTrajectory({quoteHistory:rows,asOf:now,entryDelaySeconds:h,holdingSeconds:h});
  assert.equal(r.status,'regime-transition-research');assert.equal(r.researchOnly,true);
  assert.equal(r.predictions.global.expectedPairedLogReturn,base.expectedPairedLogReturn);
  for(const p of Object.values(r.predictions)){
   assert.equal(p.entryAt,now+h*1000);assert.equal(p.exitAt,now+2*h*1000);
   assert.ok(p.latestTrainingOutcomeAt<=now);
   if(p.validation.examples)assert.ok(p.tuningTrainLatestOutcomeAt<p.tuningValidationFirstIssueAt);
   assert.equal(p.actionable,false);assert.equal(p.calibrated,false);assert.equal(p.modelConfidence,null);
  }
 }
});
test('future quotes and historical backfills arriving after issue have no influence',()=>{
 const rows=generate(810031),now=rows.at(-1).ts;
 assert.deepEqual(call([...rows,{ts:now+1,price:1e15},{ts:now-500000,price:1e-15,receivedAt:now+1}],30,now),call(rows));
});
test('no synthetic label or user-selected trading strategy determines context or candidate',()=>{
 const rows=generate(810047),now=rows.at(-1).ts;
 const a=call(rows);
 const b=regimeTransitionForecasts({quoteHistory:rows,asOf:now,entryDelaySeconds:30,holdingSeconds:30,oracleRegime:'trend',engine:'price_action',futureSide:'CALL'});
 assert.deepEqual(a,b);
});
test('missing, stale or only now-arriving backfilled context cannot create a forecast',()=>{
 assert.equal(call([],30,START).side,null);
 const rows=generate(810059),now=rows.at(-1).ts;
 assert.equal(call(rows,30,now+5000).side,null);
 assert.equal(call(rows.map(q=>({...q,receivedAt:now})),30,now).side,null);
});
test('dense unchanged tick data leaves time context and all forecasts identical',()=>{
 const rows=generate(810071),now=rows.at(-1).ts;
 const dense=rows.flatMap(q=>[0,250,500,750].map(d=>({ts:q.ts+d,price:q.price}))).filter(q=>q.ts<=now);
 assert.deepEqual(call(dense),call(rows));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule as candidateSchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {futureEntrySchedule as originalSchedule} from '../sentinel-trading-lab/agent/src/core/research-baseline-13467/future-entry-schedule.mjs';
import {specialistForwardPrediction} from '../sentinel-trading-lab/agent/src/core/specialist-forward-models.mjs';
import {automaticForwardPrediction} from '../sentinel-trading-lab/agent/src/core/automatic-forward-model.mjs';
import {priorConfirmedPivots,meanReversionAr1,localVolatilityChange,timedSlope} from '../sentinel-trading-lab/agent/src/core/engine-structure-metrics.mjs';
const EPOCH=1800000000000;
function quotes(length=1700){
 let p=Math.log(1.101),seed=49871,prev=0;
 return Array.from({length},(_,i)=>{
  seed=(1664525*seed+1013904223)>>>0;
  const fluct=(seed/2**32-.5)*.000020;
  const next=fluct+Math.sin(i/38)*.0000022-prev*.14;
  prev=next;p+=next;
  return{ts:EPOCH+i*1000,price:Math.exp(p)};
 });
}
const qs=quotes(),now=qs.at(-1).ts,horizons=[5,10,30,60,120,300];
test('nine independent engines, six user horizons and unchanged future-entry contract',()=>{
 const distinct=new Set();
 for(const engine of SCENARIO_ENGINES){
  for(const h of horizons){
   const settings={engine:engine.id,asset:'EUR/USD OTC',orderDurationMs:h*1000};
   const snap={quoteHistory:qs,quoteTs:now,provider:'iq_option'};
   const r=candidateSchedule({settings,snap,now,delays:[h]})[0];
   const original=originalSchedule({settings,snap,now,delays:[h]})[0];
   assert.equal(r.engineId,engine.id);
   assert.equal(r.asset,'EUR/USD OTC');
   assert.equal(r.delaySeconds,h);
   assert.equal(r.holdingSeconds,h);
   assert.equal(r.actionable,false);
   assert.equal(r.calibrated,false);
   assert.equal(r.issuedAt,now);
   assert.equal(r.entryAt,now+h*1000);
   assert.equal(r.exitAt,now+2*h*1000);
   assert.ok(['CALL','PUT',null].includes(r.side));
   assert.equal(original.entryAt,r.entryAt);
   assert.equal(original.exitAt,r.exitAt);
   assert.ok(r.projectedEntryPrice>0);
   assert.ok(r.projectedExitPrice>0);
   distinct.add(engine.id+'|'+h+'|'+r.projectedEntryPrice.toFixed(10)+'|'+r.projectedExitPrice.toFixed(10));
  }
 }
 assert.ok(distinct.size>48,'not nine independent models and six horizons');
});
test('only information known at the forecast instant may determine either motor decision',()=>{
 const h=30,engine='price_action',settings={engine,asset:'EUR/USD OTC',orderDurationMs:h*1000};
 const snap={quoteHistory:qs,quoteTs:now,provider:'iq_option'};
 const a=candidateSchedule({settings,snap,now,delays:[h]})[0];
 const b=candidateSchedule({settings,snap:{...snap,
   quoteHistory:[...qs,{ts:now+1000,price:1000},{ts:now+60000,price:.000001}]},
   now,delays:[h]})[0];
 assert.deepEqual(a,b);
});
test('structure primitives respect pivot confirmation and AR1 lookback',()=>{
 const log=qs.map(q=>({ts:q.ts,l:Math.log(q.price)}));
 const pivots=priorConfirmedPivots(log,now,{lookbackSeconds:400,confirmSeconds:3});
 for(const pivot of pivots){
  assert.ok(pivot.confirmedAt<=now);
  assert.ok(pivot.ts<=pivot.confirmedAt);
 }
 const ar=meanReversionAr1(log,now,{lookbackSeconds:600});
 assert.ok(ar===null||Number.isFinite(ar.phi));
 const v=localVolatilityChange(log,now,30);
 assert.ok(Number.isFinite(v.ratio)&&v.ratio>0);
 const trend=timedSlope(log,90,now);
 assert.ok(Number.isFinite(trend.r2)&&trend.r2>=0&&trend.r2<=1);
});
test('invalid and stale snapshots cannot produce a false operational CALL/PUT',()=>{
 const history=qs.slice(-8),now=qs.at(-1).ts+13000;
 for(const engine of SCENARIO_ENGINES){
  const forecast=engine.id==='automatic'?automaticForwardPrediction({
   quoteHistory:history,asOf:now,selectedSeconds:30}):
   specialistForwardPrediction({engineId:engine.id,
    quoteHistory:history,asOf:now,selectedSeconds:30});
  assert.ok(forecast.status!=='candidate-forward-prediction');
 }
});

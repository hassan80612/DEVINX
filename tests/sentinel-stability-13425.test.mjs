import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewScenario,scenarioAdmission} from '../sentinel-trading-lab/agent/src/core/scenario-review.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {RUNTIME_OPTIONS} from '../sentinel-trading-lab/agent/worker/release.mjs';
const t=1800000000000,limits={threshold:70,minPoints:74};
const plan=(side,extra={})=>({rawBias:side,confidence:80,callProbability:side==='CALL'?80:20,putProbability:side==='PUT'?80:20,outlookReady:true,directionReady:true,callTrigger:101,putTrigger:99,callInvalidation:80,putInvalidation:120,...extra});
function snap(rows,side='CALL'){
 const flip=n=>side==='CALL'?n:200-n,context=[[100,102,99,101],[101,102,99,101]],quoteHistory=[...context,...rows].flatMap((r,i)=>r.map((n,j)=>({ts:t+(i-2)*5000+[0,1000,2500,4000][j],price:flip(n)})));
 quoteHistory.push({ts:t+rows.length*5000,price:flip(rows.at(-1)[3])});return{provider:'test',price:quoteHistory.at(-1).price,quoteTs:quoteHistory.at(-1).ts,quoteHistory};
}
function runtime(){const r=new DemoTradingRuntime(RUNTIME_OPTIONS);Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:60,futureDisplayThreshold:70});r.settings.risk.minConfidence=74;return r;}
const analysis=(p,metrics={})=>({metrics,entryPlanner:{horizons:{60:p}}});
const opening={provider:'test',price:100,quoteTs:t,quoteHistory:[{ts:t,price:100}]};
test('small score/percentage dips do not re-admit an existing supported scenario; initial limits remain enforced',()=>{
 for(const side of ['CALL','PUT']){
  const r=runtime(),first=r._operationalSignalState(analysis(plan(side)),opening,t);
  const reduced=plan(side,{confidence:73,callProbability:side==='CALL'?69:31,putProbability:side==='PUT'?69:31});
  const s=snap([[100,100.4,99.9,100.3]],side),next=r._operationalSignalState(analysis(reduced),s,s.quoteTs);
  assert.equal(next.scenario.status,'OPEN');assert.equal(next.scenario.id,first.scenario.id);assert.equal(next.scenario.deadline,first.scenario.deadline);
  assert.equal(next.scenario.trigger,first.scenario.trigger);assert.equal(next.scenario.confidence,80);
  assert.equal(runtime()._operationalSignalState(analysis(reduced),s,s.quoteTs).scenario,null);
 }
});
test('own confirmed opposing break retires a forecast even when opposite admission fails; never opens an opposite trade',()=>{
 for(const side of ['CALL','PUT']){
  const r=runtime(),first=r._operationalSignalState(analysis(plan(side)),opening,t),opposite=side==='CALL'?'PUT':'CALL';
  const s=snap([[101,102,99,101],[101,101.5,97,97.5],[97.5,98.5,95,95.5]],side);
  const weak=plan(opposite,{confidence:64,directionReady:false,callProbability:opposite==='CALL'?55:45,putProbability:opposite==='PUT'?55:45});
  const next=r._operationalSignalState(analysis(weak),s,s.quoteTs);
  assert.equal(next.scenario.status,'INVALIDADO');assert.equal(next.scenario.id,first.scenario.id);assert.equal(next.scenario.side,side);
  assert.equal(next.ready,false);assert.equal(next.actionable,false);assert.equal(next.scenario.invalidationEvidence.holdAt,t+15000);
 }
});
test('opposite percentages, a recovering pullback and unsafe same-side evidence do not remain green or invent cancellation',()=>{
 for(const side of ['CALL','PUT']){
  const main={side,createdAt:t,deadline:t+60000},opposite=side==='CALL'?'PUT':'CALL';
  const s=snap([[101,102,99,101],[101,101.5,97,97.5],[97.5,101,97,100.5]],side);
  assert.equal(reviewScenario(main,plan(opposite,{directionReady:false}),s,s.quoteTs,limits).state,'REAVALIANDO');
  assert.equal(reviewScenario(main,plan(side,{safety:{blocked:true}}),s,s.quoteTs,limits).state,'REAVALIANDO');
  assert.equal(reviewScenario(main,plan(side),s,s.quoteTs+3000,limits).code,'feed');
 }
});
test('an extended trend remains eligible; an actual opposing micro turn blocks new forecasts before the slow model flips',()=>{
 for(const side of ['CALL','PUT']){
  const short={ready:true,[side==='CALL'?'callStretched':'putStretched']:true},metrics={shortModel:short};
  for(const kind of ['continuation','breakout','forming'])assert.equal(scenarioAdmission(plan(side,{scenario:{kind}}),metrics).allowed,true);
  assert.equal(scenarioAdmission(plan(side,{scenario:{kind:'reversal',reversalConfirmed:true}}),metrics).allowed,true);
  const pullback={shortModel:{ready:true,[side==='CALL'?'turnDown':'turnUp']:true},micro:{ready:true,delta5:side==='CALL'?-1:1}};
  assert.equal(scenarioAdmission(plan(side),pullback).code,'pullback');
  assert.equal(runtime()._operationalSignalState(analysis(plan(side),pullback),opening,t).scenario,null);
  const r=runtime(),first=r._operationalSignalState(analysis(plan(side)),opening,t),s=snap([[100,101,99.9,100.8]],side);
  const next=r._operationalSignalState(analysis(plan(side),metrics),s,s.quoteTs);assert.equal(next.scenario.status,'OPEN');assert.equal(next.scenario.id,first.scenario.id);
 }
});
test('stale and future quotes cannot open a new scenario',()=>{
 for(const dt of [-3000,100])assert.equal(runtime()._operationalSignalState(analysis(plan('CALL')),{...opening,quoteTs:t+dt},t).scenario,null);
});

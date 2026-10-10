import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {reviewScenario,scenarioAdmission} from '../sentinel-trading-lab/agent/src/core/scenario-review.mjs';
import {scenarioInvalidation} from '../sentinel-trading-lab/agent/src/core/scenario-invalidation.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';
import {RUNTIME_OPTIONS} from '../sentinel-trading-lab/agent/worker/release.mjs';
const t=1800000000000,limits={threshold:70,minPoints:55};
const p=(side,extra={})=>({asset:'TEST',horizonSeconds:60,rawBias:side,bias:side,confidence:80,callProbability:side==='CALL'?80:20,putProbability:side==='PUT'?80:20,outlookReady:true,directionReady:true,callTrigger:101,putTrigger:99,callInvalidation:80,putInvalidation:120,...extra});
const main=side=>({side,createdAt:t,deadline:t+60000,invalidation:side==='CALL'?80:120});
function snap(rows,side='CALL'){
 const flip=n=>side==='CALL'?n:200-n,context=[[100,102,99,101],[101,102,99,101]],q=[...context,...rows].flatMap((r,i)=>r.map((n,j)=>({ts:t+(i-2)*5000+[0,1000,2500,4000][j],price:flip(n)})));
 q.push({ts:t+rows.length*5000,price:flip(rows.at(-1)[3])});return{provider:'test',price:q.at(-1).price,quoteTs:q.at(-1).ts,quoteHistory:q};
}
const turn=[[101,102,99,101],[101,101.5,97,97.5],[97.5,98.5,95,95.5]];
const a=plan=>({metrics:{},entryPlanner:{horizons:{60:plan,30:{...plan,horizonSeconds:30}}}});
function runtime(){const r=new DemoTradingRuntime(RUNTIME_OPTIONS);Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:60,orderDurationMs:30000,futureDisplayThreshold:70});r.settings.risk.minConfidence=55;return r;}
function open(r,side){return r._operationalSignalState(a(p(side)),{provider:'test',price:100,quoteTs:t,quoteHistory:[{ts:t,price:100}]},t);}
test('own scenario retires on qualified opposite structure, symmetrically, before its distant frozen level',()=>{
 for(const side of ['CALL','PUT']){const opposite=side==='CALL'?'PUT':'CALL',s=snap(turn,side),x=reviewScenario(main(side),p(opposite),s,s.quoteTs,limits);assert.equal(x.state,'INVALIDADO');assert.equal(x.code,'own-reversal');assert.equal(x.evidence.holdAt,t+15000);assert.equal(scenarioInvalidation(main(side),s,s.quoteTs,{strict:true}).broken,false);}
});
test('an opposite percentage, one unfinished bar or failed follow-through cannot retire or invert the forecast',()=>{
 for(const side of ['CALL','PUT']){const opposite=side==='CALL'?'PUT':'CALL';
  const unfinished=snap(turn,side);unfinished.quoteTs=t+14999;
  assert.notEqual(reviewScenario(main(side),p(opposite),unfinished,t+14999,limits).state,'INVALIDADO');
  const rebound=snap([turn[0],turn[1],[97.5,101,97,100.5]],side);
  assert.equal(reviewScenario(main(side),p(opposite),rebound,rebound.quoteTs,limits).state,'REAVALIANDO');
  const weak=reviewScenario(main(side),p(opposite,{confidence:50,directionReady:false}),snap(turn,side),t+15000,limits);assert.equal(weak.state,'INVALIDADO');
 }
});
test('reassessment preserves original identity and window; qualified recovery clears risk on the next actual closed bar',()=>{
 for(const side of ['CALL','PUT']){const r=runtime(),first=open(r,side),s=snap([[100,101,99,100]],side);
 const weak=p(side,{confidence:50,directionReady:false,callProbability:51,putProbability:49});
 const o=r._operationalSignalState(a(weak),s,t+5000);assert.equal(o.scenario.id,first.scenario.id);assert.equal(o.scenario.status,'REAVALIANDO');assert.equal(o.scenario.closed,false);assert.equal(o.scenario.deadline,first.scenario.deadline);assert.equal(o.scenario.confidence,80);
 const same=r._operationalSignalState(a(p(side)),{...s,quoteTs:t+5100},t+5100);assert.equal(same.scenario.status,'REAVALIANDO');
 const recovered=snap([[100,101,99,100],[100,101,99,100]],side);const next=r._operationalSignalState(a(p(side)),recovered,t+10000);assert.equal(next.scenario.status,'OPEN');assert.equal(next.scenario.id,first.scenario.id);assert.equal(next.scenario.deadline,first.scenario.deadline);
 }
});
test('the subanalyst can neither protect, retire nor change the scenario, regardless of its alert or level',()=>{
 for(const side of ['CALL','PUT']){const x=runtime(),y=runtime();open(x,side);open(y,side);y.reversalMonitor.update=()=>({mode:'reversal-alert',active:true,alert:{side:side==='CALL'?'PUT':'CALL',invalidation:1,trigger:9999}});
 const s=snap([[100,101,99,100]],side);assert.deepEqual(x._operationalSignalState(a(p(side)),s,t+5000).scenario,y._operationalSignalState(a(p(side)),s,t+5000).scenario);
 const opposite=side==='CALL'?'PUT':'CALL',turning=snap(turn,side);x.reversalMonitor.update=()=>({mode:'reversal-alert',active:false});y.reversalMonitor.update=()=>({mode:'reversal-alert',active:true,alert:{side}});
 const one=x._operationalSignalState(a(p(opposite)),turning,t+15000),two=y._operationalSignalState(a(p(opposite)),turning,t+15000);assert.deepEqual(one.scenario,two.scenario);assert.equal(one.scenario.closed,true);assert.equal(one.ready,false);assert.equal(one.actionable,false);
 }
});
test('gaps, duplicates, future samples and a wick do not supply a confirmed own reversal or strict invalidation',()=>{
 const s=snap(turn),sparse={...s,quoteHistory:[{ts:t+10000,price:79},{ts:t+14900,price:79}]};assert.equal(scenarioInvalidation(main('CALL'),sparse,t+15000,{strict:true}).broken,false);
 for(const change of [q=>q.filter(x=>x.ts<t+10000||x.ts===t+14000||x.ts===t+15000),q=>q.filter(x=>x.ts<t+10000),q=>q.map(x=>({...x,ts:x.ts+60000}))]){const c={...s,quoteHistory:change(s.quoteHistory)};assert.notEqual(reviewScenario(main('CALL'),p('PUT'),c,t+15000,limits).state,'INVALIDADO');}
 const wick=snap([[100,101,79,100]]);assert.equal(scenarioInvalidation(main('CALL'),wick,t+5000,{strict:true}).broken,false);
});
test('own reversal is terminal: repeated frames and an unclosed opposite source cannot reopen it',()=>{
 const r=runtime(),first=open(r,'CALL'),s=snap(turn),plan=p('PUT',{entryTiming:{sourceBarAt:t+10000}});
 const closed=r._operationalSignalState(a(plan),s,t+15000);assert.equal(closed.scenario.id,first.scenario.id);assert.equal(closed.scenario.status,'INVALIDADO');
 const again=r._operationalSignalState(a(plan),{...s,quoteTs:t+15100},t+15100);assert.equal(again.scenario.id,first.scenario.id);assert.equal(again.scenario.closed,true);
});
test('view distinguishes the current opposing forecast without changing frozen scenario, and hides entry authorization',()=>{
 const op={asset:'TEST',forecastHorizonSeconds:60,durationMs:30000,subanalyst:{mode:'reversal-alert'},scenario:{...main('CALL'),confidence:80,status:'REAVALIANDO'}};
 const v=scenarioViewFromRuntime({operational:op,forecast:p('PUT'),asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+10000});assert.equal(v.side,'CALL');assert.equal(v.analysisSide,'PUT');assert.equal(v.oppositeAnalysis,true);assert.equal(v.risk,true);assert.equal(v.state,'REAVALIANDO');assert.equal(v.canEnter,false);
});

test('prospective selection rejects exhaustion with weakening and unconfirmed reversal; strong trends and qualified reversals remain eligible',()=>{
 for(const side of ['CALL','PUT']){
  const call=side==='CALL',short={ready:true,[call?'callStretched':'putStretched']:true,[call?'weakeningUp':'weakeningDown']:true};
  assert.equal(scenarioAdmission(p(side),{shortModel:short}).code,'exhaustion');
  const r=runtime(),analysis=a(p(side));analysis.metrics={shortModel:short};
  const o=r._operationalSignalState(analysis,{provider:'test',price:100,quoteTs:t,quoteHistory:[{ts:t,price:100}]},t);assert.equal(o.scenario,null);assert.match(o.scenarioReviewReason,/perdendo força/);assert.equal(o.actionable,false);
  short[call?'weakeningUp':'weakeningDown']=false;assert.equal(scenarioAdmission(p(side),{shortModel:short}).allowed,true);
  short[call?'callStretched':'putStretched']=false;assert.equal(scenarioAdmission(p(side),{shortModel:short}).allowed,true);
  assert.equal(scenarioAdmission(p(side,{scenario:{kind:'reversal',reversalConfirmed:false}}),{}).allowed,false);
  assert.equal(scenarioAdmission(p(side,{scenario:{kind:'reversal',reversalConfirmed:true}}),{}).allowed,true);
 }
});

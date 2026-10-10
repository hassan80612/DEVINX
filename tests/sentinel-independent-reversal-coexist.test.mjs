import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {RUNTIME_OPTIONS} from '../sentinel-trading-lab/agent/worker/release.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';

const t=Date.UTC(2026,9,9,17);
function plan(side,horizon,kind='continuation'){
 const call=side==='CALL';
 return{asset:'TEST',horizonSeconds:horizon,rawBias:side,bias:side,outlookReady:true,directionReady:true,confidence:80,agreement:80,
   callProbability:call?80:20,putProbability:call?20:80,
   strategyFutureBias:side,strategyFuture:{confidence:80,activeCount:1,evidence:80},
   callTrigger:100,putTrigger:100,callInvalidation:90,putInvalidation:110,
   expectedMove:.1,entryTiming:{maxDistance:.05},
   scenario:{kind,continuationReady:kind==='continuation',reversalConfirmed:kind==='reversal'}};
}
function analysis(){
 const call=true;
 return{quality:{entrySide:'BUY'},generalConsensus:{rapid:{side:'CALL'},strategies:{side:'CALL',strength:80}},
 metrics:{micro:{delta5:.01,delta15:-.01},shortModel:{ready:true,callScore:80,putScore:10,reversalCallScore:80,reversalPutScore:0,
 reversalCallCandidate:true,reversalPutCandidate:false,callSetup:false,putSetup:false,flowReadyCall:true,structureReadyCall:true,callRoomOk:true,reversalCallConfirmed:true}},
 entryPlanner:{horizons:{'120':plan('PUT',120),'30':plan('CALL',30,'reversal')}}};
}
function sample(now=t,arr=[99.99,100.01,100.02]){
 return{provider:'iq_option',asset:'TEST',price:arr.at(-1),quoteTs:now,
 quoteHistory:arr.map((price,i)=>({price,ts:now-(arr.length-1-i)*200}))};
}
function runtime(){const r=new DemoTradingRuntime(RUNTIME_OPTIONS);
 r.settings.asset='TEST';r.settings.forecastHorizonSeconds=120;r.settings.orderDurationMs=30000;
 r.settings.futureDisplayThreshold=70;r.settings.risk.minConfidence=55;
 return r;
}
test('production policy preserves independent evaluation while refusing unverified synthetic input',()=>{
 const r=runtime();assert.equal(r.subanalystPolicy,'persistent-reversal-alert-v1');
 const op=r._operationalSignalState(analysis(),sample(),t);
 assert.equal(op.subanalyst.mode,'reversal-alert');
 assert.equal(op.subanalyst.advisoryOnly,true);
 assert.equal(op.scenario.side,'PUT');
 assert.equal(op.entryAnalyst.independent,true);
 assert.equal(op.actionable,false,'unverified prediction history must not authorize entry');
 assert.equal(op.entryAnalyst.signal.actionable,false);
 const view=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:120,durationMs:30000,now:t});
 assert.equal(view.side,'PUT');
 assert.equal(view.entrySide,null,'scenario direction must not masquerade as an independent entry');
 assert.equal(view.canEnter,false);
 assert.equal(r.entryResearch.pending.length,0);
});
test('a fully qualified independent entry is visible alongside a separate opposite forecast and advisory',()=>{
 const op={asset:'TEST',forecastHorizonSeconds:120,durationMs:30000,side:'CALL',state:'ENTRADA',ready:true,actionable:true,
  createdAt:t,activeUntil:t+3000,targetAt:t+30000,entryWindowEndAt:t+30000,entryDecisionHorizonSeconds:30,
  scenario:{side:'PUT',createdAt:t-1000,deadline:t+120000,confidence:80,status:'OPEN',closed:false},
  subanalyst:{mode:'reversal-alert',advisoryOnly:true,active:false,status:'OBSERVANDO REVERSÃO'},
  entryAnalyst:{independent:true,qualification:{allowed:true},signal:{side:'CALL',actionable:true,ready:true,durationMs:30000}}};
 const v=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:120,durationMs:30000,now:t});
 assert.equal(v.side,'PUT');assert.equal(v.entrySide,'CALL');assert.equal(v.canEnter,true);
 assert.equal(v.displaySide,'PUT');assert.equal(v.entryWindowOpen,true);
 const expired=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:120,durationMs:30000,now:t+3001});
 assert.equal(expired.canEnter,false,'entry expires independently of main scenario');
});
test('no independent entry on stale quotes or inadequate microstructure',()=>{
 for(const mode of ['stale','empty']){
  const r=runtime(),a=analysis(),s=sample();
  if(mode==='stale')s.quoteTs=t-4000;
  else a.metrics.shortModel.ready=false;
  const op=r._operationalSignalState(a,s,t);
  assert.equal(op.actionable,false,mode);
  assert.equal(op.entryAnalyst.signal.actionable,false,mode);
 }
});
test('reversal monitor can remain advisory while the independent entry has no valid trigger',()=>{
 const r=runtime(),a=analysis();
 a.metrics.shortModel.reversalCallCandidate=false;
 a.metrics.shortModel.reversalCallConfirmed=false;
 a.metrics.shortModel.callScore=10;
 const op=r._operationalSignalState(a,sample(),t);
 assert.equal(op.subanalyst.mode,'reversal-alert');
 assert.equal(op.actionable,false);
 assert.equal(op.entryAnalyst.signal.actionable,false);
});

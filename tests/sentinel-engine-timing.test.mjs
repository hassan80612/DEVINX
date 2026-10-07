import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';

const t=Date.UTC(2026,9,7,12);
const confirmedSnap=(price=100,ts=t)=>({price,quoteTs:ts,quoteHistory:[{ts:ts-200,price},{ts,price}]});
function runtime(){const r=new DemoTradingRuntime();Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:60,orderDurationMs:30000,futureDisplayThreshold:50});r.settings.risk.minConfidence=70;return r}
test('runtime status carries broker feed and account metadata to the overlay',async()=>{
  const r=runtime();r.setExternalMarket({provider:'iq_option',symbol:'TEST',uiSymbol:'TEST',validatedSymbol:'TEST',assetValidated:true,feedValidated:true,brokerMode:'demo',executionReady:false,lastQuoteAt:t,lastCandleAt:t-10,quoteTs:t,quote:100,candles:[],expirationDurationMs:30000});
  const view=await r.status();
  assert.equal(view.liveBroker.lastQuoteAt,t);assert.equal(view.liveBroker.feedValidated,true);
  assert.equal(view.liveBroker.assetValidated,true);assert.equal(view.liveBroker.mode,'demo');
  assert.equal(view.liveBroker.expirationDurationMs,30000);assert.equal(view.autopilot.eligible,false);
});
function analysis(side='CALL',trigger=null){
  const call=side==='CALL',p={asset:'TEST',bias:side,rawBias:side,displayBias:side,outlookReady:true,directionReady:true,confidence:80,modelConfidence:80,agreement:80,callProbability:call?80:20,putProbability:call?20:80,strategyFutureBias:side,strategyFuture:{activeCount:1,evidence:70,confidence:80},callTrigger:trigger??101,putTrigger:trigger??99,callInvalidation:90,putInvalidation:110,callRule:'romper',putRule:'romper'};
  return{quality:{entrySide:call?'BUY':'SELL'},generalConsensus:{rapid:{side},strategies:{side,strength:80}},metrics:{last:100,micro:{},shortModel:{}},entryPlanner:{horizons:{'30':{...p},'60':{...p}}}};
}

test('each forecast is settled at its requested horizon, never the old 10s default',()=>{
  for(const seconds of [30,60,120,300,600,900,3600]){
    const r=runtime();r._queueSignalCandidate({kind:'horizon_forecast_v42',side:'BUY',confidence:80,probability:80,referencePrice:100,asset:'TEST',durationMs:seconds*1000,strategy:'test',now:t});
    assert.equal(r.signalValidation.pending[0].dueAt,t+seconds*1000);
    r._settleSignalValidation(t+10000,{price:101,quoteHistory:[{ts:t+10000,price:101}]});
    assert.equal(r.signalValidation.outcomes.length,0);
    r._settleSignalValidation(t+seconds*1000,{price:99,quoteHistory:[{ts:t+seconds*1000,price:99}]});
    assert.equal(r.signalValidation.outcomes[0].won,false);
  }
});
test('explicit operational expiry remains independent from the forecast horizon',()=>{
  const r=runtime();r._queueSignalCandidate({kind:'operational_v3',side:'BUY',referencePrice:100,asset:'TEST',durationMs:60000,settleDurationMs:30000,strategy:'test',now:t});
  assert.equal(r.signalValidation.pending[0].dueAt,t+30000);
});
test('unspecified probability is unknown instead of a fabricated zero percent',()=>{
  const r=runtime();r._queueSignalCandidate({kind:'confirmed',side:'BUY',referencePrice:100,asset:'TEST',durationMs:30000,strategy:'test',now:t});
  const p=r.signalValidation.pending[0];assert.equal(p.probability,null);assert.equal(p.probabilityBucket,null);
  r.signalValidation.outcomes=[{...p,won:true,settlementQuality:'exact'}];
  assert.equal(r._validationStats(p.key).avgPredicted,null);assert.equal(r._validationStats(p.key).brierScore,null);
});
test('restore discards calibration produced by the broken epoch and retains trade records',()=>{
  const r=runtime();r.restore({trades:[{id:'retained'}],signalValidation:{outcomes:[{key:'micro-v5|feed-v2-future-strategies-v1|x',won:true}],pending:[],lastQueued:{}}});
  assert.equal(r.signalValidation.outcomes.length,0);assert.equal(r.trades[0].id,'retained');
});
test('CALL and PUT continuation triggers stay fixed and can actually be crossed',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),trigger=side==='CALL'?100.2:99.8,a=analysis(side,trigger);
    const first=r._operationalSignalState(a,confirmedSnap(),t);assert.equal(first.state,'JANELA ABERTA');
    const price=side==='CALL'?100.5:99.5,next=analysis(side,side==='CALL'?100.7:99.3);
    const entered=r._operationalSignalState(next,confirmedSnap(price,t+1000),t+1000);
    assert.equal(entered.trigger,trigger);assert.equal(entered.state,'ENTRADA');assert.equal(entered.actionable,true);
    assert.equal(entered.targetAt,first.targetAt);assert.equal(r.signalValidation.pending[0].dueAt,t+31000);
  }
});
test('opposite prediction at the order expiry blocks a stronger scenario at another horizon',()=>{
  const r=runtime(),a=analysis('CALL',99);a.entryPlanner.horizons['30']=analysis('PUT',99).entryPlanner.horizons['30'];
  const op=r._operationalSignalState(a,confirmedSnap(),t);
  assert.equal(op.state,'AGUARDAR PRAZO');assert.equal(op.actionable,false);assert.equal(r.signalValidation.pending.length,0);
});
test('missing or unconfirmed order horizon cannot fall back to the scenario',()=>{
  for(const missing of [true,false]){const r=runtime(),a=analysis('CALL',99);if(missing)delete a.entryPlanner.horizons['30'];else a.entryPlanner.horizons['30'].directionReady=false;const op=r._operationalSignalState(a,confirmedSnap(),t);assert.equal(op.actionable,false)}
});
test('a repeated snapshot cannot compound confidence or smoothing confirmations',()=>{
  const r=runtime(),a=analysis();a.entryPlanner.horizons['60'].modelConfidence=70;
  const panel={confluence:{horizons:{'60':{activeCount:2,callPct:80,evidence:80,side:'CALL'}}}};
  r._mergeScenarioConfluence(a,panel,{price:100},t);const first=structuredClone(a.entryPlanner.horizons['60']);
  r._mergeScenarioConfluence(a,panel,{price:100},t);assert.deepEqual(a.entryPlanner.horizons['60'],first);
  r._mergeScenarioConfluence(a,panel,{price:100},t+1000);assert.equal(a.entryPlanner.horizons['60'].modelConfidence,first.modelConfidence);
});
test('raw opposite forecasts never accumulate cancellation confirmations by themselves',()=>{
  const r=runtime();r._operationalSignalState(analysis(),{price:100},t);
  const opposite=analysis('PUT');
  for(const ms of [1000,1000,2000,3000]){
    const op=r._operationalSignalState(opposite,{price:100},t+ms);
    assert.equal(op.side,'CALL');
    assert.notEqual(op.state,'INVALIDADO');
  }
  assert.equal(r.operationalSetup.oppositionCycles,0);
});
test('a full runtime tick evaluates scenario and operational setup only once',async()=>{
  const r=runtime();r.settings.requireLiveBroker=false;r.stateName='running';r.settings.schedule.timezone='UTC';
  let merges=0,ops=0;const merge=r._mergeScenarioConfluence.bind(r),op=r._operationalSignalState.bind(r);
  r._mergeScenarioConfluence=(...args)=>{merges++;return merge(...args)};r._operationalSignalState=(...args)=>{ops++;return op(...args)};
  await r.tick(Date.now());assert.ok(r.lastResult.analysis);assert.equal(merges,1);assert.equal(ops,1);
});
test('an expired untriggered setup stays closed instead of silently opening another countdown',()=>{
  const r=runtime(),a=analysis();r._operationalSignalState(a,confirmedSnap(),t);
  const ended=r._operationalSignalState(a,{price:100},t+61000);
  assert.equal(ended.state,'JANELA PERDIDA');assert.equal(ended.targetAt,t+60000);
  assert.equal(r._operationalSignalState(a,{price:100},t+62000).state,'JANELA PERDIDA');
});
test('changing order duration creates a distinct operational context',()=>{
  const r=runtime(),a=analysis();const old=r._operationalSignalState(a,confirmedSnap(),t);r.settings.orderDurationMs=60000;
  const next=r._operationalSignalState(a,{price:100},t+1000);assert.notEqual(next.createdAt,old.createdAt);assert.equal(next.durationMs,60000);
});
test('missing invalidation is not interpreted as a zero-price PUT cancellation',()=>{
  const r=runtime(),a=analysis('PUT');a.entryPlanner.horizons['30'].putInvalidation=null;
  assert.equal(r._operationalSignalState(a,{price:100},t).state,'JANELA ABERTA');
});
test('duplicate market scores contribute once to the consensus',()=>{
  const r=runtime(),a={finalConfluence:{callStrength:80,putStrength:20},quality:{technicalBuy:80,technicalSell:20},metrics:{shortModel:{reversalCallScore:20,reversalPutScore:80}}};
  const first=r._generalConsensus(a,{cards:[]});r.settings.pausedReadings.market_entry=true;
  const paused=r._generalConsensus(a,{cards:[]});assert.equal(first.rapid.callPct,paused.rapid.callPct);assert.equal(first.rapid.contributingCount,2);
});
test('scenario display shares the engine deadline and current confidence',()=>{
  const r=runtime(),op=r._operationalSignalState(analysis('CALL',99),confirmedSnap(),t);
  const view=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+1000});
  assert.equal(view.canEnter,true);assert.equal(view.deadline,t+60000);assert.equal(view.remainingSeconds,59);assert.equal(view.entryDeadline,t+3500);
  const expired=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+4000});
  assert.equal(expired.closed,false);assert.equal(expired.canEnter,false);assert.equal(expired.hasSetup,true);assert.equal(expired.state,'ACOMPANHANDO');assert.equal(expired.remainingSeconds,56);
});
test('terminal and mismatched runtime states never display an open window',()=>{
  for(const state of ['JANELA ENCERRADA','JANELA PERDIDA','INVALIDADO']){const view=scenarioViewFromRuntime({operational:{asset:'TEST',side:'CALL',state,createdAt:t,targetAt:t+60000,forecastHorizonSeconds:60,durationMs:30000},asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+1000});assert.equal(view.hasSetup,false);assert.equal(view.canEnter,false)}
  const view=scenarioViewFromRuntime({operational:{asset:'OTHER',side:'CALL',state:'ENTRADA',ready:true,actionable:true,activeUntil:t+3500,createdAt:t,targetAt:t+60000,forecastHorizonSeconds:60,durationMs:30000},asset:'TEST',horizonSeconds:60,durationMs:30000,now:t});assert.equal(view.contextMatches,false);assert.equal(view.canEnter,false);
});

test('shorter expiry revalidation preserves the full scenario deadline without releasing entry',()=>{
  const r=runtime(),a=analysis();const first=r._operationalSignalState(a,confirmedSnap(),t);
  a.entryPlanner.horizons['30'].directionReady=false;
  a.entryPlanner.horizons['30'].confidence=54;
  const paused=r._operationalSignalState(a,{price:100},t+2000);
  assert.equal(paused.state,'AGUARDAR PRAZO');assert.equal(paused.side,'CALL');assert.equal(paused.actionable,false);
  assert.equal(paused.targetAt,first.targetAt);assert.equal(paused.trigger,first.trigger);
  const view=scenarioViewFromRuntime({operational:paused,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+2000});
  assert.equal(view.hasSetup,true);assert.equal(view.canEnter,false);assert.equal(view.remainingSeconds,58);
  a.entryPlanner.horizons['30'].directionReady=true;a.entryPlanner.horizons['30'].confidence=80;
  const resumed=r._operationalSignalState(a,{price:100},t+3000);
  assert.equal(resumed.targetAt,first.targetAt);assert.equal(resumed.trigger,first.trigger);assert.equal(resumed.state,'JANELA ABERTA');
});
test('blocked forecasts explain safety and direction rather than thresholds already met',()=>{
  for(const safety of [false,true]){
    const r=runtime(),a=analysis();a.entryPlanner.horizons['60'].directionReady=false;a.entryPlanner.horizons['60'].safety={blocked:safety};
    const op=r._operationalSignalState(a,confirmedSnap(),t);
    assert.equal(op.actionable,false);assert.doesNotMatch(op.reason,/alcançar/);
    assert.match(op.reason,safety?/exaustão/:/confirmação técnica/);
  }
});

test('entry burst expiration keeps the forecast alive without extending entry or releasing twice',()=>{
  const r=runtime(),a=analysis('CALL',99);const first=r._operationalSignalState(a,confirmedSnap(),t);
  assert.equal(first.state,'ENTRADA');assert.equal(first.actionable,true);
  r.operationalSetup.releasedAt=t+1000;
  const used=r._operationalSignalState(a,{price:100},t+2000);assert.equal(used.actionable,false);
  for(const ms of [4000,15000,59000]){
    const op=r._operationalSignalState(a,{price:100},t+ms);
    assert.equal(op.state,'ACOMPANHANDO');assert.equal(op.actionable,false);assert.equal(op.ready,false);
    assert.equal(op.createdAt,first.createdAt);assert.equal(op.targetAt,first.targetAt);
    const view=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+ms});
    assert.equal(view.hasSetup,true);assert.equal(view.canEnter,false);assert.equal(view.deadline,t+60000);
  }
  assert.equal(r.signalValidation.pending.length,1);
  assert.equal(r._operationalSignalState(a,{price:100},t+60001).state,'JANELA ENCERRADA');
});
test('price invalidation is immediate even if the shorter order horizon no longer confirms',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),a=analysis(side);r._operationalSignalState(a,confirmedSnap(),t);
    a.entryPlanner.horizons['30'].directionReady=false;
    const op=r._operationalSignalState(a,{price:side==='CALL'?89:111},t+1000);
    assert.equal(op.state,'INVALIDADO');assert.equal(op.actionable,false);assert.match(op.reason,/preço/);
    a.entryPlanner.horizons['60'].directionReady=false;
    const weak=r._operationalSignalState(a,{price:100},t+2000);
    assert.equal(weak.state,'INVALIDADO');assert.equal(weak.targetAt,t+60000);assert.match(weak.reason,/preço/);
    a.entryPlanner.horizons['60'].directionReady=true;
    const back=r._operationalSignalState(a,{price:100},t+3000);
    assert.equal(back.state,'INVALIDADO');assert.equal(back.createdAt,t);
  }
});
test('a confidence dip during the entry burst never continues to authorize an entry',()=>{
  const r=runtime(),a=analysis('CALL',99);assert.equal(r._operationalSignalState(a,confirmedSnap(),t).actionable,true);
  a.entryPlanner.horizons['60'].confidence=54;
  const op=r._operationalSignalState(a,{price:100},t+1000);
  assert.equal(op.actionable,false);assert.equal(op.ready,false);assert.equal(op.targetAt,t+60000);assert.doesNotMatch(op.reason,/estão alinhados/);
});

test('current opposite analysis is visible without authorizing an unconfirmed opposite entry',()=>{
  const r=runtime(),op=r._operationalSignalState(analysis('CALL',99),confirmedSnap(),t);
  const forecast={asset:'TEST',horizonSeconds:60,outlookReady:true,confidence:80,rawBias:'PUT',callProbability:20,putProbability:80};
  const view=scenarioViewFromRuntime({operational:op,forecast,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+100});
  assert.equal(view.side,'CALL');assert.equal(view.analysisSide,'PUT');assert.equal(view.oppositeAnalysis,true);assert.equal(view.canEnter,false);assert.equal(view.entryWindowOpen,false);assert.equal(view.deadline,op.targetAt);
  assert.equal(r.signalValidation.pending.length,1);assert.equal(r.signalValidation.pending[0].side,'BUY');
  const wrong=scenarioViewFromRuntime({operational:op,forecast:{...forecast,asset:'OTHER'},asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+100});
  assert.equal(wrong.analysisSide,null);assert.equal(wrong.canEnter,false);
});
test('entry window opens immediately with the engine release and lasts only its useful burst',()=>{
  const r=runtime(),a=analysis('CALL',100),waiting=r._operationalSignalState(a,{price:99,quoteTs:t},t);
  const forecast={asset:'TEST',horizonSeconds:60,outlookReady:true,confidence:80,rawBias:'CALL',callProbability:80,putProbability:20};
  const pending=scenarioViewFromRuntime({operational:waiting,forecast,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t});
  assert.equal(pending.hasSetup,true);assert.equal(pending.entryWindowOpen,false);assert.equal(pending.analysisSide,'CALL');
  const entered=r._operationalSignalState(a,confirmedSnap(100.01,t+1000),t+1000);
  const open=scenarioViewFromRuntime({operational:entered,forecast,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+1000});
  assert.equal(open.entryWindowOpen,true);assert.equal(open.canEnter,true);assert.equal(open.entryRemainingSeconds,4);assert.equal(open.deadline,waiting.targetAt);
  const ended=scenarioViewFromRuntime({operational:entered,forecast,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+4501});
  assert.equal(ended.entryWindowOpen,false);assert.equal(ended.canEnter,false);assert.equal(ended.hasSetup,true);
});


test('current calibrated probabilities release the first confirmed entry without waiting for display smoothing',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime();r.settings.futureDisplayThreshold=70;
    const a=analysis(side,side==='CALL'?99:101);
    for(const p of Object.values(a.entryPlanner.horizons)){p.displayCallProbability=side==='CALL'?55:45;p.displayPutProbability=100-p.displayCallProbability}
    const op=r._operationalSignalState(a,confirmedSnap(),t);
    assert.equal(op.state,'ENTRADA');assert.equal(op.actionable,true);assert.equal(op.entryAt,t);
    assert.equal(r.signalValidation.pending.length,1);
    const bad=runtime();bad.settings.futureDisplayThreshold=70;
    for(const p of Object.values(a.entryPlanner.horizons)){p.callProbability=side==='CALL'?60:40;p.putProbability=100-p.callProbability;p.displayCallProbability=side==='CALL'?85:15;p.displayPutProbability=100-p.displayCallProbability}
    assert.equal(bad._operationalSignalState(a,confirmedSnap(),t).actionable,false);
  }
});


test('weak live forecasts do not replace the active display side or authorize an opposite entry',()=>{
 const r=runtime(),op=r._operationalSignalState(analysis('PUT',101),confirmedSnap(),t);
 for(const confidence of [46,48,51,52,54]){
  const forecast={asset:'TEST',horizonSeconds:60,outlookReady:true,confidence,rawBias:'CALL',callProbability:56,putProbability:44};
  const view=scenarioViewFromRuntime({operational:{...op,state:'AGUARDAR PRAZO',ready:false,actionable:false},forecast,asset:'TEST',horizonSeconds:60,durationMs:30000,minPoints:55,now:t+500});
  assert.equal(view.analysisSide,null);assert.equal(view.displaySide,'PUT');assert.equal(view.canEnter,false);assert.equal(view.deadline,op.targetAt);
 }
});
test('terminal scenario keeps its own display side while live forecasts change',()=>{
 const r=runtime(),original=r._operationalSignalState(analysis('PUT',101),confirmedSnap(),t);
 for(const side of ['CALL','PUT']){
  const forecast={asset:'TEST',horizonSeconds:60,outlookReady:true,confidence:80,rawBias:side,callProbability:side==='CALL'?80:20,putProbability:side==='PUT'?80:20};
  const view=scenarioViewFromRuntime({operational:{...original,state:'INVALIDADO',ready:false,actionable:false},forecast,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+500});
  assert.equal(view.displaySide,'PUT');assert.equal(view.closed,true);assert.equal(view.canEnter,false);
 }
});
test('opposite preview stays secondary until the runtime actually replaces the scenario',()=>{
 const r=runtime(),a=analysis('CALL',99),op=r._operationalSignalState(a,confirmedSnap(),t);
 const forecast={asset:'TEST',horizonSeconds:60,outlookReady:true,confidence:80,rawBias:'PUT',callProbability:20,putProbability:80};
 const pending=scenarioViewFromRuntime({operational:{...op,ready:false,actionable:false,oppositeOpportunity:{side:'PUT'}},forecast,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+100});
 assert.equal(pending.displaySide,'CALL');assert.equal(pending.analysisSide,'PUT');assert.equal(pending.canEnter,false);
 const released=scenarioViewFromRuntime({operational:{...op,side:'PUT',state:'ENTRADA',ready:true,actionable:true,activeUntil:t+3500},forecast,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t+100});
 assert.equal(released.displaySide,'PUT');assert.equal(released.canEnter,true);
});

function independentlyConfirmedExpiry(side='CALL'){
  const a=analysis(side,100),call=side==='CALL';
  a.entryPlanner.horizons['30'].horizonSeconds=30;
  a.entryPlanner.horizons['30'].scenario={kind:'continuation',continuationReady:true,triggerBasis:'structural-level'};
  a.entryPlanner.horizons['60']=analysis(call?'PUT':'CALL',100).entryPlanner.horizons['60'];
  a.entryPlanner.horizons['60'].horizonSeconds=60;
  a.metrics.shortModel={ready:true,structureReadyCall:call,flowReadyCall:call,callRoomOk:call,structureReadyPut:!call,flowReadyPut:!call,putRoomOk:!call};
  a.metrics.micro={delta2:call?.01:-.01,delta5:call?.02:-.02,delta15:call?.03:-.03};
  return a;
}
test('independently confirmed expiry enters on the first qualified frame without waiting for a longer scenario',()=>{
  for(const side of ['CALL','PUT'])for(const opposite of [true,false]){
    const r=runtime(),a=independentlyConfirmedExpiry(side);
    if(!opposite){a.entryPlanner.horizons['60']={...a.entryPlanner.horizons['30'],horizonSeconds:60,directionReady:false}}
    const price=side==='CALL'?100.3:99.7,op=r._operationalSignalState(a,confirmedSnap(price),t);
    assert.equal(op.state,'ENTRADA');assert.equal(op.actionable,true);assert.equal(op.side,side);
    assert.equal(op.entryDecisionHorizonSeconds,30);assert.equal(op.targetAt,t+60000);assert.equal(op.activeUntil,t+3500);
    assert.equal(r.signalValidation.pending[0].dueAt,t+30000);assert.match(r.signalValidation.pending[0].strategy,/independent-expiry-v1$/);
    const v=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:60,durationMs:30000,forecast:a.entryPlanner.horizons['30'],now:t});
    assert.equal(v.canEnter,true);assert.equal(v.displaySide,side);assert.equal(v.signalHorizonSeconds,30);
    const wrong=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:60,durationMs:30000,forecast:a.entryPlanner.horizons['60'],now:t});
    assert.equal(wrong.canEnter,false);
    const missing=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t});
    assert.equal(missing.canEnter,false);
  }
});
test('independent expiry still requires direction, structure, force, room, price and its own safety',()=>{
  for(const side of ['CALL','PUT'])for(const failure of ['structure','flow','room','direction','safety','weakening','quote','trigger','future-quote']){
    const r=runtime(),a=independentlyConfirmedExpiry(side),call=side==='CALL',p=a.entryPlanner.horizons['30'];
    let s=confirmedSnap(call?100.3:99.7);
    if(['structure','flow','room'].includes(failure))a.metrics.shortModel[{structure:call?'structureReadyCall':'structureReadyPut',flow:call?'flowReadyCall':'flowReadyPut',room:call?'callRoomOk':'putRoomOk'}[failure]]=false;
    if(failure==='direction')p.directionReady=false;
    if(failure==='safety')p.safety={blocked:true};
    if(failure==='weakening'){a.metrics.shortModel[call?'weakeningUp':'weakeningDown']=true;a.metrics.micro.delta2=call?-.01:.01}
    if(failure==='quote')s={price:s.price,quoteTs:t,quoteHistory:[{ts:t,price:s.price}]};
    if(failure==='future-quote')s={price:s.price,quoteTs:t,quoteHistory:[{ts:t+100,price:s.price}]};
    if(failure==='trigger')s=confirmedSnap(call?99.7:100.3);
    const op=r._operationalSignalState(a,s,t);
    assert.equal(op.actionable,false,side+' '+failure);assert.equal(r.signalValidation.pending.length,0,side+' '+failure);
  }
});
test('independent expiry can reverse an active scenario and keeps the previous outcome and fixed burst',()=>{
  for(const side of ['CALL','PUT']){
    const r=runtime(),oldSide=side==='CALL'?'PUT':'CALL',old=r._operationalSignalState(analysis(oldSide,100),confirmedSnap(oldSide==='CALL'?100.3:99.7),t);
    assert.equal(old.actionable,true);const prior=structuredClone(r.signalValidation.pending[0]);
    const a=independentlyConfirmedExpiry(side),s=confirmedSnap(side==='CALL'?100.3:99.7,t+500);
    const op=r._operationalSignalState(a,s,t+500);
    assert.equal(op.side,side);assert.equal(op.actionable,true);assert.equal(op.transition.fromSide,oldSide);
    assert.deepEqual(r.signalValidation.pending[0],prior);assert.equal(r.signalValidation.pending.length,2);
    const after=r._operationalSignalState(a,confirmedSnap(s.price,t+4500),t+4500);
    assert.equal(after.state,'ACOMPANHANDO');assert.equal(after.actionable,false);assert.equal(after.entryDecisionHorizonSeconds,30);
    assert.equal(r.signalValidation.pending.length,2);
  }
});
test('unready expiry reports the actual waiting criterion',()=>{
  const r=runtime(),a=analysis('CALL',99);a.entryPlanner.horizons['30'].directionReady=false;
  assert.match(r._operationalSignalState(a,confirmedSnap(),t).reason,/direção ainda sem confirmação técnica/i);
});
test('qualified expiry need not wait for the longer model confidence or percentage threshold',()=>{
  for(const criterion of ['confidence','percentage']){
    const r=runtime(),a=independentlyConfirmedExpiry('CALL');
    a.entryPlanner.horizons['60']={...a.entryPlanner.horizons['30'],horizonSeconds:60};
    if(criterion==='confidence'){a.entryPlanner.horizons['60'].confidence=40;a.entryPlanner.horizons['60'].strategyFuture={confidence:40}}
    else{r.settings.futureDisplayThreshold=70;a.entryPlanner.horizons['60'].callProbability=60;a.entryPlanner.horizons['60'].putProbability=40}
    const op=r._operationalSignalState(a,confirmedSnap(100.3),t);
    assert.equal(op.actionable,true);assert.equal(op.entryDecisionHorizonSeconds,30);
  }
});
test('independent expiry has its own measured history block and preserves stored outcomes',()=>{
  const r=runtime(),a=independentlyConfirmedExpiry('CALL'),first=r._operationalSignalState(a,confirmedSnap(100.3),t),key=first.validation.key;
  r.signalValidation.outcomes=Array.from({length:60},(_,i)=>({key,won:false,settlementQuality:'exact',createdAt:t-i*30000}));
  r.signalValidation.pending=[];r.operationalSetup=null;
  const op=r._operationalSignalState(a,confirmedSnap(100.3,t+1000),t+1000);
  assert.equal(op.historyBlocked,true);assert.equal(op.actionable,false);assert.equal(r.signalValidation.pending.length,0);assert.equal(r.signalValidation.outcomes.length,60);
});

test('scenario view keeps the active scenario side while opposite analysis is only a candidate',()=>{
  const op={asset:'TEST',side:'CALL',state:'JANELA ABERTA',ready:false,actionable:false,forecastHorizonSeconds:60,durationMs:30000,createdAt:t,targetAt:t+60000,entryWindowEndAt:t+60000,oppositeOpportunity:{side:'PUT'},futureSide:'PUT'};
  const forecast={asset:'TEST',horizonSeconds:60,rawBias:'PUT',outlookReady:true,directionReady:true,confidence:80,callProbability:20,putProbability:80};
  const view=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:60,durationMs:30000,forecast,displayThreshold:70,minPoints:55,now:t+1000});
  assert.equal(view.analysisSide,'PUT');
  assert.equal(view.oppositeAnalysis,true);
  assert.equal(view.displaySide,'CALL');
  assert.equal(view.canEnter,false);
});

test('raw CALL/PUT analysis stays off the main headline until a scenario owns the window',()=>{
  const forecast={asset:'TEST',horizonSeconds:60,outlookReady:true,directionReady:true,confidence:82,rawBias:'CALL',callProbability:82,putProbability:18};
  const view=scenarioViewFromRuntime({operational:{asset:'TEST',state:'AGUARDAR',forecastHorizonSeconds:60,durationMs:30000},forecast,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t});
  assert.equal(view.analysisSide,'CALL');
  assert.equal(view.hasSetup,false);
  assert.equal(view.displaySide,null);
  assert.equal(view.canEnter,false);
});

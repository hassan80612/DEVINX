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
test('two calls at the same timestamp count as one opposing confirmation',()=>{
  const r=runtime();r._operationalSignalState(analysis(),{price:100},t);
  const opposite=analysis('PUT');r._operationalSignalState(opposite,{price:100},t+1000);r._operationalSignalState(opposite,{price:100},t+1000);
  assert.equal(r.operationalSetup.oppositionCycles,1);
  assert.equal(r._operationalSignalState(opposite,{price:100},t+2000).state,'INVALIDADO');
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

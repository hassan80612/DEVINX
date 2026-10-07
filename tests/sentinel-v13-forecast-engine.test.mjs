import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { analyzeMarket } from '../sentinel-trading-lab/agent/src/core/strategy.mjs';
import { supportResistanceZones, trendLineQuality, swingFibonacci, volatilityState } from '../sentinel-trading-lab/agent/src/core/indicators.mjs';
import { DemoTradingRuntime } from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

function trendCandles({count=180,start=4100,step=.22,wiggle=.08,now=Date.now()}={}){
  const base=Math.floor(now/1000)-count*60;
  return Array.from({length:count},(_,i)=>{
    const center=start+i*step+Math.sin(i/5)*wiggle;
    const open=center-.04,close=center+.08;
    return {from:base+i*60,to:base+(i+1)*60,open,high:close+.10,low:open-.10,close,volume:120+(i%17)}
  })
}

function quoteFlow(last,{direction=1,now=Date.now()}={}){
  return Array.from({length:70},(_,i)=>({
    ts:now-(69-i)*1000,
    price:last+(i-69)*.018*direction
  }))
}

test('V13.3 future engine exposes 30s through 1h horizons',()=>{
  const now=Date.now(),candles=trendCandles({now}),last=candles.at(-1).close,quotes=quoteFlow(last,{direction:1,now});
  const a=analyzeMarket({candles,quoteHistory:quotes,strategy:'trend',minConfidence:70,durationMs:300000,freshnessMs:5000,quoteTs:now,now});
  assert.equal(a.entryPlanner.modelVersion,'future-v4.1');
  for(const h of ['30','60','120','300','600','900','3600'])assert.ok(a.entryPlanner.horizons[h],`missing horizon ${h}`);
  for(const h of ['300','900','3600']){
    const p=a.entryPlanner.horizons[h];
    assert.equal(p.modelVersion,'future-v4.1');
    assert.ok(p.callProbability>50,`expected CALL bias on trend horizon ${h}: ${JSON.stringify(p)}`);
    assert.equal(p.bias,'CALL');
    assert.ok(p.regime?.label);
    assert.ok(p.evidenceFamilies&&Object.keys(p.evidenceFamilies).length>=5);
    assert.ok(p.reliability&&Number.isFinite(Number(p.reliability.familyAgreement)));
    assert.ok(Number(p.reliability.evidenceFamilyCount)>=1&&Number(p.reliability.evidenceFamilyCount)<=5);
    assert.ok(Number(p.reliability.correlationPenalty)>=0&&Number(p.reliability.correlationPenalty)<=6);
    assert.ok(Number(p.modelConfidence)<=Number(p.reliability.baseModelConfidence));
  }
});

test('short future reacts before the current trend score blindly chases a reversal',()=>{
  const now=Date.now(),candles=trendCandles({count:150,now}),last=candles.at(-1).close;
  const rising=analyzeMarket({candles,quoteHistory:quoteFlow(last,{direction:1,now}),strategy:'trend',minConfidence:70,durationMs:60000,freshnessMs:5000,quoteTs:now,now});
  const falling=analyzeMarket({candles,quoteHistory:quoteFlow(last,{direction:-1,now}),strategy:'trend',minConfidence:70,durationMs:60000,freshnessMs:5000,quoteTs:now,now});
  const up=rising.entryPlanner.horizons['30'],down=falling.entryPlanner.horizons['30'];
  assert.ok(up.callProbability>down.callProbability,`30s forecast did not react to micro reversal: up=${up.callProbability}, down=${down.callProbability}`);
  assert.notEqual(up.signal,down.signal);
});

test('advanced market structure helpers return quality instead of a single blind min/max',()=>{
  const now=Date.now();
  const candles=Array.from({length:120},(_,i)=>{
    const base=100+Math.sin(i/5)*2+Math.sin(i/13)*.4;
    const open=base-.2,close=base+.15;
    return {from:Math.floor(now/1000)-120*60+i*60,to:Math.floor(now/1000)-119*60+i*60,open,high:base+.55,low:base-.55,close,volume:100}
  });
  const zones=supportResistanceZones(candles,90),lines=trendLineQuality(candles),fib=swingFibonacci(candles,120),vol=volatilityState(candles);
  assert.ok(zones.support&&zones.resistance);
  assert.ok(Number.isFinite(zones.support.strength)&&Number.isFinite(zones.resistance.strength));
  assert.ok('support' in lines&&'resistance' in lines);
  assert.ok(fib==null||Number.isFinite(Number(fib.quality)));
  assert.ok(Number.isFinite(Number(vol.ratio)));
});

test('V13.3 forecast calibration uses confidence bands, decision-grade stats and non-overlapping exact samples',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  rt.settings.asset='GOLD';
  rt.settings.futureDisplayThreshold=60;
  const modelKey='future-v4.2:smart_confluence:trend';
  const key=rt._validationKey('horizon_forecast_v42','GOLD',60000,modelKey);
  rt.signalValidation.outcomes=Array.from({length:120},(_,i)=>({
    key,settlementQuality:'exact',won:i<78,probability:82,probabilityBucket:'80-89'
  }));
  const stats=rt._validationStats(key),bucket=rt._validationStats(key,{bucket:'80-89'});
  assert.equal(stats.samples,120);
  assert.equal(bucket.samples,120);
  assert.ok(stats.brierScore!=null);
  assert.ok(stats.calibrationError!=null);

  const analysis={
    generalConsensus:{side:'PUT'},
    metrics:{regime:{label:'trend'}},
    entryPlanner:{horizons:{'60':{
      bias:'CALL',rawCallProbability:82,rawPutProbability:18,callProbability:82,putProbability:18,
      modelConfidence:80,confidence:80,outlookReady:true,directionReady:true,agreement:70,
      regime:{label:'trend',confidence:82},reliability:{evidenceFamilyCount:4,correlationPenalty:2}
    }}}
  };
  rt._mergeScenarioConfluence(analysis,{cards:[]},{price:4200,payout:.82},Date.now());
  const p=analysis.entryPlanner.horizons['60'];
  assert.equal(p.modelVersion,'future-v4.2');
  assert.equal(p.executionBias,'CALL');
  assert.equal(p.entryAligned,false);
  assert.ok(p.validation.historyWeight>0&&p.validation.historyWeight<=65);
  assert.equal(p.validation.bucket,'80-89');
  assert.ok(p.validation.bucketSamples>=120);
  assert.ok(p.callProbability<82,'band-aware calibration should pull an overconfident raw probability toward empirical accuracy');
  assert.ok(rt.signalValidation.pending.some(x=>x.kind==='horizon_decision_v13_3'),'decision-grade prediction should be audited separately');

  rt.signalValidation.pending=[];rt.signalValidation.lastQueued={};
  const t=Date.now();
  rt._queueSignalCandidate({kind:'horizon_forecast_v42',side:'BUY',confidence:70,probability:70,regime:'trend',referencePrice:4200,asset:'GOLD',durationMs:60000,strategy:modelKey,now:t});
  rt._queueSignalCandidate({kind:'horizon_forecast_v42',side:'BUY',confidence:72,probability:72,regime:'trend',referencePrice:4201,asset:'GOLD',durationMs:60000,strategy:modelKey,now:t+30000});
  assert.equal(rt.signalValidation.pending.length,1,'overlapping horizon samples must not inflate accuracy');
  rt._queueSignalCandidate({kind:'horizon_forecast_v42',side:'BUY',confidence:72,probability:72,regime:'trend',referencePrice:4201,asset:'GOLD',durationMs:60000,strategy:modelKey,now:t+60000});
  assert.equal(rt.signalValidation.pending.length,2);
});

test('V13.3 exact tie is recorded as draw and excluded from forecast win-rate samples',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  const now=Date.now(),key=rt._validationKey('horizon_forecast_v41','EUR/USD',30000,'future-v4.1:trend:range');
  rt.signalValidation.pending=[{
    key,kind:'horizon_forecast_v42',asset:'EUR/USD',durationMs:30000,settleDurationMs:30000,
    strategy:'future-v4.1:trend:range',side:'BUY',confidence:74,probability:74,probabilityBucket:'70-79',
    referencePrice:1.085,createdAt:now-30000,dueAt:now
  }];
  rt._settleSignalValidation(now,{price:1.085,quoteHistory:[{ts:now,price:1.085}]});
  assert.equal(rt.signalValidation.outcomes.length,1);
  assert.equal(rt.signalValidation.outcomes[0].draw,true);
  assert.equal(rt.signalValidation.outcomes[0].won,null);
  const stats=rt._validationStats(key);
  assert.equal(stats.samples,0);
  assert.equal(stats.draws,1);
});


test('short future keeps model readiness separate from weak raw 30s history',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  rt.settings.asset='EUR/USD OTC';
  rt.settings.strategy='smart_confluence';
  const now=Date.now();
  const fastKey=rt._validationKey('forecast30_v2','EUR/USD OTC',30000,'smart_confluence');
  rt.signalValidation.outcomes=Array.from({length:36},(_,i)=>({
    key:fastKey,settlementQuality:'exact',won:i<16,probability:70,probabilityBucket:'70-79'
  }));
  const analysis={
    generalConsensus:{side:'CALL'},
    metrics:{regime:{label:'trend'}},
    entryPlanner:{horizons:{'30':{
      bias:'CALL',rawCallProbability:74,rawPutProbability:26,callProbability:74,putProbability:26,
      modelConfidence:75,confidence:75,outlookReady:true,directionReady:true,agreement:70,
      regime:{label:'trend',confidence:80},reliability:{evidenceFamilyCount:4,correlationPenalty:1}
    }}}
  };
  rt._mergeScenarioConfluence(analysis,{cards:[]},{price:1.10,payout:.82},now);
  const p=analysis.entryPlanner.horizons['30'];
  assert.equal(p.validation.fast30Samples,36);
  assert.equal(p.validation.fast30WinRate,44.4);
  assert.equal(p.validation.fast30HistoryWeak,true);
  assert.equal(p.directionReady,true,'weak legacy-style 30s history is advisory; only clean decision-grade history can block');
});


test('strong future strategy conflict blocks a directional release without changing present cards',()=>{
  const rt=new DemoTradingRuntime({seed:21,balance:10000});
  rt.settings.asset='EUR/USD OTC';
  const analysis={
    generalConsensus:{rapid:{side:'CALL'},side:'CALL'},
    metrics:{regime:{label:'trend'}},
    entryPlanner:{horizons:{'60':{
      bias:'CALL',rawCallProbability:78,rawPutProbability:22,callProbability:78,putProbability:22,
      modelConfidence:77,confidence:77,outlookReady:true,directionReady:true,agreement:70,
      regime:{label:'trend',confidence:80},reliability:{evidenceFamilyCount:4,correlationPenalty:1}
    }}}
  };
  const strategyPanel={cards:[],confluence:{horizons:{'60':{activeCount:2,callPct:28,putPct:72,side:'PUT',agreement:82,evidence:74,confidence:76}}}};
  rt._mergeScenarioConfluence(analysis,strategyPanel,{price:1.10,payout:.82},Date.now());
  const p=analysis.entryPlanner.horizons['60'];
  assert.equal(p.strategyFutureConflict,true);
  assert.equal(p.directionReady,false);
  assert.equal(p.presentBias,'CALL');
});


test('future strategy aggregation discounts correlated strategy families', async()=>{
  const runtime=await import('../sentinel-trading-lab/agent/src/core/runtime.mjs');
  const rt=new runtime.DemoTradingRuntime({seed:33,balance:10000});
  const source=await import('node:fs/promises').then(x=>x.readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs', import.meta.url),'utf8'));
  assert.match(source,/strategyFamily/);
  assert.match(source,/location_reversion/);
  assert.match(source,/evidência correlacionada/);
  assert.match(source,/penalty\*=\.55/);
  assert.ok(rt);
});


function timedAnalysis(side='CALL'){
  const call=side==='CALL',plan={
    asset:'EUR/USD OTC',bias:side,rawBias:side,displayBias:side,
    callProbability:call?78:22,putProbability:call?22:78,displayCallProbability:call?78:22,displayPutProbability:call?22:78,
    modelConfidence:78,confidence:78,outlookReady:true,directionReady:true,agreement:72,
    strategyFutureBias:side,strategyFuture:{activeCount:2,evidence:70,confidence:76},
    callTrigger:1.099,putTrigger:1.101,callInvalidation:1.095,putInvalidation:1.105,
    callRule:'CALL somente após romper e sustentar acima do gatilho',putRule:'PUT somente após romper e sustentar abaixo do gatilho'
  };
  return{
    generalConsensus:{rapid:{side},strategies:{side,strength:76},side},
    quality:{technicalEdge:24,entryReady:true,entrySide:call?'BUY':'SELL',preEntry:{active:false,side:'WAIT'}},
    metrics:{last:1.10,shortModel:{ready:true,accelDown:false,accelUp:false,turnUp:false,turnDown:false,reversalCallCandidate:false,reversalPutCandidate:false,failedBreakDown:false,failedBreakUp:false},micro:{delta5:0,delta15:0,p5:0,pulse:0}},
    entryPlanner:{horizons:{'30':{...plan},'60':{...plan}}}
  }
}

test('1m forecast plus 30s expiration opens the forecast window immediately',()=>{
  const rt=new DemoTradingRuntime({seed:44,balance:10000});
  rt.settings.asset='EUR/USD OTC';rt.settings.forecastHorizonSeconds=60;rt.settings.orderDurationMs=30000;
  const t=Date.now(),analysis=timedAnalysis('CALL'),snap={price:1.10};
  const state=rt._operationalSignalState(analysis,snap,t);
  assert.notEqual(state.state,'AGUARDAR JANELA');
  assert.equal(state.timeToEntryMs,0);
  assert.equal(state.entryWindowStartAt,t);
  assert.equal(state.entryWindowEndAt,t+60000);
  assert.equal(state.expirationWarning,false);
});

test('30s forecast plus 30s expiration opens immediately and only closes the confirmed trigger burst',()=>{
  const rt=new DemoTradingRuntime({seed:45,balance:10000});
  rt.settings.asset='EUR/USD OTC';rt.settings.forecastHorizonSeconds=30;rt.settings.orderDurationMs=30000;
  const t=Date.now(),analysis=timedAnalysis('CALL'),snap={price:1.10};
  const now=rt._operationalSignalState(analysis,snap,t);
  assert.equal(now.state,'ENTRADA');
  assert.equal(now.actionable,true);
  const late=rt._operationalSignalState(analysis,snap,t+6000);
  assert.equal(late.actionable,false);
  assert.equal(late.state,'JANELA ENCERRADA');
});

test('a future CALL stays blocked while live force is burning strongly down',()=>{
  const rt=new DemoTradingRuntime({seed:46,balance:10000});
  rt.settings.asset='EUR/USD OTC';rt.settings.forecastHorizonSeconds=30;rt.settings.orderDurationMs=30000;
  const t=Date.now(),analysis=timedAnalysis('CALL'),snap={price:1.10};
  analysis.metrics.shortModel={...analysis.metrics.shortModel,ready:true,accelDown:true,turnUp:false,reversalCallCandidate:false,failedBreakDown:false};
  analysis.metrics.micro={delta5:-0.001,delta15:-0.002,p5:-1.7,pulse:-11};
  const blocked=rt._operationalSignalState(analysis,snap,t);
  assert.equal(blocked.side,'CALL');
  assert.equal(blocked.state,'AGUARDAR FORÇA');
  assert.equal(blocked.actionable,false);
  assert.equal(blocked.impulseConflict,true);
});

test('violent opposite micro impulse invalidates a locked future side without adding an expiration wait',()=>{
  const rt=new DemoTradingRuntime({seed:461,balance:10000});
  rt.settings.asset='EUR/USD OTC';rt.settings.forecastHorizonSeconds=60;rt.settings.orderDurationMs=30000;
  const t=Date.now(),analysis=timedAnalysis('CALL'),snap={price:1.10};
  const first=rt._operationalSignalState(analysis,snap,t);
  assert.notEqual(first.state,'AGUARDAR JANELA');
  const originalTarget=first.targetAt;
  analysis.metrics.shortModel={...analysis.metrics.shortModel,ready:true,accelDown:true,turnUp:false,reversalCallCandidate:false,failedBreakDown:false};
  analysis.metrics.micro={delta5:-0.002,delta15:-0.004,p5:-2.1,pulse:-14};
  const one=rt._operationalSignalState(analysis,snap,t+1000);
  assert.equal(one.side,'CALL');
  assert.equal(rt.operationalSetup.oppositionCycles,1);
  assert.equal(one.targetAt,originalTarget);
  const two=rt._operationalSignalState(analysis,snap,t+2000);
  assert.equal(two.state,'INVALIDADO');
  assert.equal(two.side,'CALL');
});

test('directionReady is mandatory before a future forecast becomes operational',()=>{
  const rt=new DemoTradingRuntime({seed:462,balance:10000});
  rt.settings.asset='EUR/USD OTC';rt.settings.forecastHorizonSeconds=30;rt.settings.orderDurationMs=30000;
  const analysis=timedAnalysis('CALL');
  analysis.entryPlanner.horizons['30'].directionReady=false;
  const state=rt._operationalSignalState(analysis,{price:1.10},Date.now());
  assert.equal(state.actionable,false);
  assert.equal(state.side,'AGUARDAR');
});

test('forecast horizon is persisted independently from expiration',()=>{
  const rt=new DemoTradingRuntime({seed:47,balance:10000});
  rt.patchSettings({forecastHorizonSeconds:120,orderDurationMs:30000},'test');
  assert.equal(rt.settings.forecastHorizonSeconds,120);
  assert.equal(rt.settings.orderDurationMs,30000);
});


test('expiration is advisory only: a longer expiration never delays or blocks the forecast window',()=>{
  const rt=new DemoTradingRuntime({seed:48,balance:10000});
  rt.settings.asset='EUR/USD OTC';rt.settings.forecastHorizonSeconds=30;rt.settings.orderDurationMs=60000;
  const t=Date.now(),analysis=timedAnalysis('CALL');
  const state=rt._operationalSignalState(analysis,{price:1.10,brokerExpirationDurationMs:120000},t);
  assert.notEqual(state.state,'AJUSTAR TEMPO');
  assert.notEqual(state.state,'AGUARDAR JANELA');
  assert.equal(state.timeToEntryMs,0);
  assert.equal(state.expirationWarning,true);
  assert.equal(state.expiration.source,'card-setting');
  assert.equal(state.expiration.selectedMs,60000);
});

test('operational runtime no longer contains broker-expiration mismatch gates',async()=>{
  const runtime=await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
  assert.ok(!runtime.includes("state:'AJUSTAR PRAZO'"));
  assert.ok(!runtime.includes("state:'VERIFICAR PRAZO'"));
  assert.ok(!runtime.includes("state:'AJUSTAR TEMPO'"));
  assert.ok(runtime.includes('timingOffsetMs=0'));
  assert.ok(runtime.includes('entryWindowStartAt=now'));
  assert.ok(runtime.includes("expirationSource:'card-setting'"));
  assert.ok(runtime.includes("settleDurationMs:durationMs"));
});


test('future overlay follows engine-owned windows and removes independent browser decisions',async()=>{
  const ui=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  assert.ok(ui.includes('scenarioViewFromRuntime'));
  assert.ok(ui.includes('runtimeDeadline'));
  assert.ok(ui.includes('localStorage.removeItem(decisionKey);localStorage.removeItem(expiredKey)'));
  assert.ok(!ui.includes('localStorage.setItem(decisionKey'));
  assert.ok(!ui.includes('targetAt:inheritedTargetAt||decisionNow+decisionSeconds*1000'));
});

test('locked forecast side does not chatter and a true reversal keeps the original target',()=>{
  const rt=new DemoTradingRuntime({seed:49,balance:10000});
  rt.settings.asset='EUR/USD OTC';rt.settings.forecastHorizonSeconds=60;rt.settings.orderDurationMs=30000;
  const t=Date.now(),snap={price:1.10};
  const first=rt._operationalSignalState(timedAnalysis('CALL'),snap,t);
  assert.equal(first.side,'CALL');
  assert.notEqual(first.state,'AGUARDAR JANELA');
  const firstTarget=first.targetAt;

  const oppositeOnce=rt._operationalSignalState(timedAnalysis('PUT'),snap,t+1000);
  assert.equal(oppositeOnce.side,'CALL',JSON.stringify(oppositeOnce));
  assert.equal(oppositeOnce.targetAt,firstTarget);
  assert.equal(rt.operationalSetup.side,'CALL');
  assert.equal(rt.operationalSetup.oppositionCycles,1);

  const oppositeTwice=rt._operationalSignalState(timedAnalysis('PUT'),snap,t+2000);
  assert.equal(oppositeTwice.side,'CALL');
  assert.equal(oppositeTwice.state,'INVALIDADO');

  const newPut=rt._operationalSignalState(timedAnalysis('PUT'),snap,t+2500);
  assert.equal(newPut.side,'PUT');
  assert.notEqual(newPut.state,'AGUARDAR JANELA');
  assert.equal(newPut.targetAt,firstTarget);

});


test('future engine exposes multi-timeframe reversal authority and anti-chase safety metadata',()=>{
  const now=Date.now(),candles=trendCandles({count:180,now}),last=candles.at(-1).close,quotes=quoteFlow(last,{direction:1,now});
  const a=analyzeMarket({candles,quoteHistory:quotes,strategy:'trend',minConfidence:70,durationMs:30000,forecastHorizonSeconds:30,freshnessMs:5000,quoteTs:now,now});
  const p=a.entryPlanner.horizons['30'];
  assert.ok(p.multiTimeframe&&Array.isArray(p.multiTimeframe.rows));
  assert.ok(p.reversalAuthority&&['CALL','PUT','NEUTRO'].includes(p.reversalAuthority.side));
  assert.ok(p.safety&&typeof p.safety.blocked==='boolean');
});

test('decision-grade validation samples do not overlap inside the same horizon',()=>{
  const rt=new DemoTradingRuntime({seed:55,balance:10000});
  const t=Date.now();
  rt._queueSignalCandidate({kind:'horizon_decision_v13_3',side:'BUY',confidence:75,probability:75,referencePrice:1.1,asset:'EUR/USD OTC',durationMs:30000,strategy:'x',now:t});
  rt._queueSignalCandidate({kind:'horizon_decision_v13_3',side:'BUY',confidence:76,probability:76,referencePrice:1.1,asset:'EUR/USD OTC',durationMs:30000,strategy:'x',now:t+10000});
  assert.equal(rt.signalValidation.pending.length,1);
  rt._queueSignalCandidate({kind:'horizon_decision_v13_3',side:'BUY',confidence:76,probability:76,referencePrice:1.1,asset:'EUR/USD OTC',durationMs:30000,strategy:'x',now:t+30000});
  assert.equal(rt.signalValidation.pending.length,2);
});

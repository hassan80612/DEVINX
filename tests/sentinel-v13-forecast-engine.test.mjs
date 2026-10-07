import test from 'node:test';
import assert from 'node:assert/strict';

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

test('V13.1 future engine exposes 30s through 1h horizons',()=>{
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

test('V13.1 forecast calibration uses confidence bands, decision-grade stats and non-overlapping exact samples',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  rt.settings.asset='GOLD';
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
  assert.ok(p.validation.historyWeight>0&&p.validation.historyWeight<=30);
  assert.equal(p.validation.bucket,'80-89');
  assert.ok(p.validation.bucketSamples>=120);
  assert.ok(p.callProbability<82,'band-aware calibration should pull an overconfident raw probability toward empirical accuracy');
  assert.ok(rt.signalValidation.pending.some(x=>x.kind==='horizon_decision_v13_2'),'decision-grade prediction should be audited separately');

  rt.signalValidation.pending=[];rt.signalValidation.lastQueued={};
  const t=Date.now();
  rt._queueSignalCandidate({kind:'horizon_forecast_v42',side:'BUY',confidence:70,probability:70,regime:'trend',referencePrice:4200,asset:'GOLD',durationMs:60000,strategy:modelKey,now:t});
  rt._queueSignalCandidate({kind:'horizon_forecast_v42',side:'BUY',confidence:72,probability:72,regime:'trend',referencePrice:4201,asset:'GOLD',durationMs:60000,strategy:modelKey,now:t+30000});
  assert.equal(rt.signalValidation.pending.length,1,'overlapping horizon samples must not inflate accuracy');
  rt._queueSignalCandidate({kind:'horizon_forecast_v42',side:'BUY',confidence:72,probability:72,regime:'trend',referencePrice:4201,asset:'GOLD',durationMs:60000,strategy:modelKey,now:t+60000});
  assert.equal(rt.signalValidation.pending.length,2);
});

test('V13.1 exact tie is recorded as draw and excluded from forecast win-rate samples',()=>{
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

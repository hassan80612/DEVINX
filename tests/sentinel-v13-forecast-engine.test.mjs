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

test('V13 future engine exposes 30s through 1h horizons',()=>{
  const now=Date.now(),candles=trendCandles({now}),last=candles.at(-1).close,quotes=quoteFlow(last,{direction:1,now});
  const a=analyzeMarket({candles,quoteHistory:quotes,strategy:'trend',minConfidence:70,durationMs:300000,freshnessMs:5000,quoteTs:now,now});
  assert.equal(a.entryPlanner.modelVersion,'future-v4');
  for(const h of ['30','60','120','300','600','900','3600'])assert.ok(a.entryPlanner.horizons[h],`missing horizon ${h}`);
  for(const h of ['300','900','3600']){
    const p=a.entryPlanner.horizons[h];
    assert.equal(p.modelVersion,'future-v4');
    assert.ok(p.callProbability>50,`expected CALL bias on trend horizon ${h}: ${JSON.stringify(p)}`);
    assert.equal(p.bias,'CALL');
    assert.ok(p.regime?.label);
    assert.ok(p.evidenceFamilies&&Object.keys(p.evidenceFamilies).length>=5);
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

test('V13 forecast calibration uses non-overlapping samples and real outcome quality',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  rt.settings.asset='GOLD';
  const key=rt._validationKey('horizon_forecast_v4','GOLD',60000,'future-v4:smart_confluence:trend');
  rt.signalValidation.outcomes=Array.from({length:120},(_,i)=>({
    key,settlementQuality:'exact',won:i<78,probability:78
  }));
  const stats=rt._validationStats(key);
  assert.equal(stats.samples,120);
  assert.ok(stats.brierScore!=null);
  assert.ok(stats.calibrationError!=null);

  const analysis={
    generalConsensus:{side:'PUT'},
    metrics:{regime:{label:'trend'}},
    entryPlanner:{horizons:{'60':{
      bias:'CALL',rawCallProbability:82,rawPutProbability:18,callProbability:82,putProbability:18,
      modelConfidence:80,confidence:80,outlookReady:true,directionReady:true,regime:{label:'trend',confidence:82}
    }}}
  };
  rt._mergeScenarioConfluence(analysis,{cards:[]},{price:4200},Date.now());
  const p=analysis.entryPlanner.horizons['60'];
  assert.equal(p.executionBias,'CALL');
  assert.equal(p.entryAligned,false);
  assert.ok(p.validation.historyWeight>=35);
  assert.ok(p.callProbability<82,'historical calibration should pull an overconfident raw probability toward empirical accuracy');

  rt.signalValidation.pending=[];rt.signalValidation.lastQueued={};
  const t=Date.now();
  rt._queueSignalCandidate({kind:'horizon_forecast_v4',side:'BUY',confidence:70,probability:70,regime:'trend',referencePrice:4200,asset:'GOLD',durationMs:60000,strategy:'future-v4:smart_confluence:trend',now:t});
  rt._queueSignalCandidate({kind:'horizon_forecast_v4',side:'BUY',confidence:72,probability:72,regime:'trend',referencePrice:4201,asset:'GOLD',durationMs:60000,strategy:'future-v4:smart_confluence:trend',now:t+30000});
  assert.equal(rt.signalValidation.pending.length,1,'overlapping horizon samples must not inflate accuracy');
  rt._queueSignalCandidate({kind:'horizon_forecast_v4',side:'BUY',confidence:72,probability:72,regime:'trend',referencePrice:4201,asset:'GOLD',durationMs:60000,strategy:'future-v4:smart_confluence:trend',now:t+60000});
  assert.equal(rt.signalValidation.pending.length,2);
});

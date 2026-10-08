import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PredictionInputState,predictionInput} from '../sentinel-trading-lab/agent/src/core/forecast-evidence.mjs';
import {analyzePrediction} from '../sentinel-trading-lab/agent/src/core/strategy.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';

test('backfill crossing 35 bars preserves the context interval and forecast with identical quotes',async()=>{
 const x=JSON.parse(await readFile('tests/fixtures/sentinel-continuation-prices.json','utf8'));
 const sixty=x.candles.filter(c=>c.to-c.from===60).sort((a,b)=>a.from-b.from),other=x.candles.filter(c=>c.to-c.from===120);
 const before={...x,candles:[...other,...sixty.slice(-34)]},after={...x,candles:[...other,...sixty.slice(-35)]};
 assert.equal(predictionInput(before).inputQuality.periodSeconds,120);
 assert.equal(predictionInput(after).inputQuality.periodSeconds,60);
 const state=new PredictionInputState(),a=state.prepare(before,'provider|asset|config'),b=state.prepare(after,'provider|asset|config');
 assert.equal(b.inputQuality.periodSeconds,120);assert.deepEqual(a.candles,b.candles);
 const p=input=>analyzePrediction({...input,quoteTs:x.now,predictionStrategies:['trend'],experimentalTiming:false});
 assert.deepEqual(p({...x,...a}).entryPlanner,p({...x,...b}).entryPlanner);
 assert.equal(state.prepare(after,'provider|other-asset|config').inputQuality.periodSeconds,60);
 assert.equal(state.prepare({...x,candles:sixty},'provider|asset|config').candles.length,0);
});

test('independent opposing entries cannot fabricate a main forecast or its clock',()=>{
 const now=1791385626945;
 for(const [i,side] of ['CALL','PUT','CALL'].entries()){
  const at=now+i*4000,op={asset:'TEST',side,scenario:null,entryAnalyst:{independent:true,qualification:{allowed:true}},forecastHorizonSeconds:120,durationMs:30000,entryDecisionHorizonSeconds:30,state:'ENTRADA',ready:true,actionable:true,activeUntil:at+3500,entryWindowEndAt:at+9600,createdAt:at};
  const view=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:120,durationMs:30000,now:at});
  assert.equal(view.displaySide,null);assert.equal(view.deadline,null);assert.equal(view.remainingSeconds,null);
  assert.equal(view.entrySide,side);assert.equal(view.canEnter,true);
  assert.equal(scenarioViewFromRuntime({operational:op,asset:'OTHER',horizonSeconds:120,durationMs:30000,now:at}).canEnter,false);
  assert.equal(scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:120,durationMs:30000,now:at+3500}).canEnter,false);
 }
});

test('evaluation timings and research identity differ from published experimental timing',async()=>{
 const x=JSON.parse(await readFile('tests/fixtures/sentinel-continuation-prices.json','utf8'));
 const p=analyzePrediction({...x,quoteTs:x.now,predictionStrategies:['trend'],experimentalTiming:false});
 assert.equal(p.entryPlanner.modelVersion,'future-v6.1-evaluation');
 for(const plan of Object.values(p.entryPlanner.horizons)){assert.equal(plan.modelRole,'evaluation');assert.equal(plan.modelVersion,'future-v6.1-evaluation');assert.equal(plan.scenario.triggerBasis,'structural-level');}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {earlyScenarioTurn} from '../sentinel-trading-lab/agent/src/core/early-scenario-turn.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';
import {readFile} from 'node:fs/promises';
const t=1800000000000;
const strongUp={ready:true,delta15:0.0004,delta30:0.0006,delta2:-0.00008,expected2:0.00012,lead:-.8};
const strongDown={...strongUp,delta15:-0.0004,delta30:-0.0006,delta2:0.00008,lead:.8};
const readyPlan=side=>({asset:'TEST',horizonSeconds:60,rawBias:side,bias:side,
  confidence:64,modelConfidence:64,callProbability:side==='CALL'?65:35,putProbability:side==='PUT'?65:35,
  outlookReady:true,directionReady:false,callTrigger:102,putTrigger:98,callInvalidation:85,putInvalidation:115,
  earlyTurn:{side:side==='CALL'?'PUT':'CALL',signal:side==='CALL'?-.35:.35,strength:.35,phase:'PERDA DE FORCA'}});
const snap={provider:'test',price:100,quoteTs:t,quoteHistory:[{ts:t,price:100}]};
function rt(){const r=new DemoTradingRuntime({scenarioPolicy:'own-review-v1',subanalystPolicy:'persistent-reversal-alert-v1'});r.settings.asset='TEST';r.settings.forecastHorizonSeconds=60;r.settings.orderDurationMs=30000;return r}
function a(side){return {metrics:{},entryPlanner:{horizons:{60:readyPlan(side),30:{...readyPlan(side),horizonSeconds:30}}}}}

test('price slowing at resistance adds continuous bearish pressure BEFORE candle close',()=>{
  const o=earlyScenarioTurn({micro:strongUp,short:{ready:true,weakeningUp:true,callStretched:true},price:1.1000,upper:1.1002,lower:1.0900,expectedMove:.0006,seconds:30});
  assert.equal(o.side,'PUT');assert.ok(o.signal<-.15);assert.ok(o.strength<=1);
  assert.equal(o.basis,'received-quote-pressure');
});
test('symmetric lower support turn provides bullish pressure without requiring last bar',()=>{
  const o=earlyScenarioTurn({micro:strongDown,short:{ready:true,weakeningDown:true,putStretched:true},price:1.1000,lower:1.0998,upper:1.1100,expectedMove:.0006,seconds:60});
  assert.equal(o.side,'CALL');assert.ok(o.signal>.15);assert.ok(o.strength<=1);
});
test('healthy continuation and old feed cannot become an artificial opposite call',()=>{
  const ongoing={...strongUp,delta2:.00015,lead:.45};
  const o=earlyScenarioTurn({micro:ongoing,short:{ready:true},price:1.1,upper:1.12,lower:1.07,expectedMove:.0004,seconds:30});
  assert.equal(o.signal,0);
  assert.equal(earlyScenarioTurn({micro:{...strongUp,ready:false},short:{ready:true},price:1.1,upper:1.1001,seconds:30}).strength,0);
  assert.equal(earlyScenarioTurn({micro:strongUp,short:{ready:true},price:1.1,upper:1.1001,seconds:300}).strength,0);
});
test('main forecast is visible before confidence crosses scenario admission, but cannot create an entry',()=>{
 const r=rt(),state=r._operationalSignalState(a('CALL'),snap,t);
 assert.equal(state.scenario,null);
 assert.equal(state.scenarioProjection.side,'CALL');
 assert.equal(state.scenarioProjection.confirmed,false);
 assert.equal(state.scenarioProjection.actionable,false);
 assert.equal(state.actionable,false);
 const v=scenarioViewFromRuntime({operational:state,asset:'TEST',horizonSeconds:60,durationMs:30000,now:t});
 assert.equal(v.projectionOnly,true);assert.equal(v.displaySide,'CALL');
 assert.equal(v.hasSetup,false);assert.equal(v.canEnter,false);
});
test('provisional opposite evidence never invalidates a valid previously installed main scenario',()=>{
 const r=rt(),first=a('CALL');first.entryPlanner.horizons[60].directionReady=true;
 first.entryPlanner.horizons[60].confidence=85;first.entryPlanner.horizons[60].modelConfidence=85;
 first.entryPlanner.horizons[60].callProbability=85;
 let initial=r._operationalSignalState(first,snap,t);
 assert.equal(initial.scenario.side,'CALL');
 const next=r._operationalSignalState(a('PUT'),{...snap,quoteTs:t+500,price:100,quoteHistory:[...snap.quoteHistory,{ts:t+500,price:100}]},t+500);
 assert.equal(next.scenario.side,'CALL');
 assert.equal(next.scenario.closed,false);
 assert.equal(next.scenarioProjection.side,'PUT');
 assert.equal(next.actionable,false);
});
test('short-horizon prediction alone consumes early-turn evidence and ignores unrelated subanalyst',async()=>{
 const src=await readFile(new URL('../sentinel-trading-lab/agent/src/core/strategy.mjs',import.meta.url),'utf8');
 assert.match(src,/earlyTurn=predictionModel\?earlyScenarioTurn/);
 assert.match(src,/projectedReversalSignal/);
 assert.match(src,/Number\(earlyTurn\?\.signal\|\|0\)/);
 assert.doesNotMatch(src,/PersistentReversalMonitor/);
 const screen=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 assert.match(screen,/ESTIMATIVA ANTECIPADA · NÃO É ENTRADA/);
});

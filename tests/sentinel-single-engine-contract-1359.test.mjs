import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES,selectedScenarioEngine,oneEngineSelection,scenarioEngineContext,selectedEngineForecastRequest} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';

test('only one independent engine is selected; secondary strategies are never allowed',()=>{
 for(const engine of SCENARIO_ENGINES){
   const s=oneEngineSelection({strategy:engine.id,strategy2:'breakout',strategy3:'trend'});
   assert.equal(s.engine,engine.id);
   assert.equal(s.strategy,engine.id);
   assert.equal(s.strategy2,'none');
   assert.equal(s.strategy3,'none');
 }
});
test('automatic mode never aliases a selectable specialist',()=>{
 const a=selectedScenarioEngine({engine:'automatic',strategy:'trend'});
 assert.equal(a.id,'automatic');
 assert.equal(a.family,'native');
 assert.ok(!/trend|breakout|reversion|fibonacci/.test(a.research));
});
test('engine forecast identity is isolated by broker/asset/horizon/expiration',()=>{
 const a=scenarioEngineContext({engine:'automatic'},'iq_option','EUR/USD OTC',30000,60);
 const b=scenarioEngineContext({engine:'support_resistance'},'iq_option','EUR/USD OTC',30000,60);
 assert.notEqual(a,b);
 assert.notEqual(a,scenarioEngineContext({engine:'automatic'},'exnova','EUR/USD OTC',30000,60));
 assert.notEqual(a,scenarioEngineContext({engine:'automatic'},'iq_option','EUR/USD OTC',60000,60));
});
test('all current strategies remain available as selectable independent engines',()=>{
 assert.deepEqual(SCENARIO_ENGINES.map(x=>x.id),[
 'automatic','price_action','support_resistance','trend','mean_reversion','breakout',
 'trendline_breakout','fibonacci_retest','smart_confluence']);
});

test('every selected motor projects the user/broker expiration, never stale 1m forecast',()=>{
 const now=1800000000000;
 for(const e of SCENARIO_ENGINES){
   const q=selectedEngineForecastRequest({
     settings:{engine:e.id,orderDurationMs:5000,forecastHorizonSeconds:60},
     broker:{instrument:'blitz'},provider:'iq_option',asset:'EUR/USD OTC',now
   });
   assert.equal(q.engineId,e.id);
   assert.equal(q.forecastHorizonSeconds,5);
   assert.equal(q.actionable,false);
   assert.match(q.calibrationKey,/vnext-expiry-driven/);
 }
});
test('broker-confirmed expiry redefines selected-engine horizon without mixing models',()=>{
 const q=selectedEngineForecastRequest({
  settings:{engine:'mean_reversion',orderDurationMs:60000,forecastHorizonSeconds:900},
  broker:{instrument:'blitz',expirationVerified:true,expirationDurationMs:15000},
  provider:'iq_option',asset:'EUR/USD OTC',now:1800000000000
 });
 assert.equal(q.engineId,'mean_reversion');
 assert.equal(q.forecastHorizonSeconds,15);
 assert.equal(q.expiry.durationMismatch,true);
});

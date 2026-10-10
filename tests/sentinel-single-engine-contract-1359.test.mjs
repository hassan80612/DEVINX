import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES,selectedScenarioEngine,oneEngineSelection,scenarioEngineContext} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';

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

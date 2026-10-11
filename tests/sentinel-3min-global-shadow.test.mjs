import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {threeMinuteGeneralResearch} from '../sentinel-trading-lab/agent/src/core/three-minute-general-research.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
const quotes=Array.from({length:1700},(_,i)=>({ts:T+i*1000,
 price:1.1*Math.exp(.000003*i+.00007*Math.sin(i*.05))}));
const now=quotes.at(-1).ts;
const snap={provider:'iq_option',quoteHistory:quotes,quoteTs:now,price:quotes.at(-1).price};
test('GENERAL 3m forecast evaluates all nine strategies independently, without broker actions',()=>{
 for(const engine of SCENARIO_ENGINES){
  const r=threeMinuteGeneralResearch({settings:{engine:engine.id,
   asset:'EUR/USD OTC'},snap,now});
  assert.equal(r.engineId,engine.id);
  assert.equal(r.horizonSeconds,180);
  assert.equal(r.actionable,false);
  assert.equal(r.calibrated,false);
  assert.equal(r.probability,null);
  assert.equal(r.baselineUnmodified,true);
  assert.ok(!r.confirmedSide||r.confirmedSide===r.baselineSide);
  assert.ok(['research-confirmed','research-abstain'].includes(r.status));
 }
});
test('GENERAL 3m forecast does not learn from future tick even if appended',()=>{
 const settings={engine:'automatic',asset:'EUR/USD OTC'};
 const original=threeMinuteGeneralResearch({settings,snap,now});
 const later=threeMinuteGeneralResearch({settings,snap:{...snap,
  quoteHistory:[...quotes,{ts:now+1000,price:.01}]},now});
 assert.deepEqual(original,later);
});
test('runtime main forecast stays unchanged when shadow three-minute research is enabled',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true});
 const base=runtime._signalValidationGate({analysis:{side:'WAIT'},snap,
  settings:runtime.settings,now});
 assert.equal(base.allowed,false);
 assert.equal(base.analysis.vnext.general180Research,null);
 const reference=base.analysis.vnext.receipt;
 runtime.patchSettings({threeMinuteResearchEnabled:true});
 const updated=runtime._signalValidationGate({analysis:{side:'WAIT'},snap,
  settings:runtime.settings,now});
 assert.equal(updated.allowed,false);
 assert.equal(updated.analysis.vnext.general180Research.engineId,'automatic');
 assert.equal(updated.analysis.vnext.general180Research.horizonSeconds,180);
 assert.equal(updated.analysis.vnext.general180Research.actionable,false);
 assert.deepEqual(updated.analysis.vnext.receipt,reference);
});

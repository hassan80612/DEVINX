import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const now=1800000000000,history=Array.from({length:2400},(_,i)=>({ts:now-(2399-i)*1000,price:Math.exp(.002*Math.sin(i/100))}));
const snap={quoteHistory:history,quoteTs:now,price:history.at(-1).price,provider:'iq_option'};
test('forecast mode is independent of every one of the nine strategies and uses actual future entry interval',()=>{
 assert.equal(SCENARIO_ENGINES.length,9);
 for(const engine of SCENARIO_ENGINES)for(const h of [30,60,180]){
  const settings={engine:engine.id,asset:'TEST',orderDurationMs:h*1000},input={settings,snap,now,delays:[h],forecastModel:'selected-strengths-67.5'};
  const original=futureEntrySchedule(input)[0],continuous=futureEntrySchedule({...input,settings:{...settings,forecastMode:'continuous'}})[0];
  assert.deepEqual(original,continuous);
  const selected=futureEntrySchedule({...input,settings:{...settings,forecastMode:'selective'}})[0];
  assert.equal(selected.engineId,engine.id);assert.equal(selected.forecastOwner,'selective-autonomous-v1');
  assert.equal(selected.entryAt,continuous.entryAt);assert.equal(selected.exitAt,continuous.exitAt);
  if(selected.side){assert.ok(selected.projectedEntryPrice>0);assert.ok(selected.projectedExitPrice>0);assert.equal(selected.side,selected.projectedExitPrice>selected.projectedEntryPrice?'CALL':'PUT');}
  else assert.notEqual(selected.status,'forecast');
 }
});
test('same quote does not reuse an entry from a different forecast mode',()=>{
 const settings={engine:'automatic',asset:'TEST',orderDurationMs:30000};
 const a=forwardHorizonMatrix({settings,snap,now,forecastModel:'selected-strengths-67.5'});
 const b=forwardHorizonMatrix({settings:{...settings,forecastMode:'selective'},snap,now,previous:a,forecastModel:'selected-strengths-67.5'});
 assert.equal(b.reused,false);
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'selected-strengths-67.5'});r.patchSettings(settings);r.vnextFutureEntryAnchor={engineId:'automatic',side:'CALL',entryAt:now+30000};
 r.patchSettings({forecastMode:'selective'});assert.equal(r.settings.engine,'automatic');assert.equal(r.vnextFutureEntryAnchor,null);
 r.patchSettings({engine:'breakout'});assert.equal(r.settings.forecastMode,'selective');assert.equal(r.settings.engine,'automatic');
 r.patchSettings({forecastMode:'continuous'});assert.equal(r.settings.engine,'automatic');
 r.patchSettings({engine:'breakout'});assert.equal(r.settings.engine,'breakout');
});
test('mobile stream carries the mode and both card selectors are wired to real settings',()=>{
 const frame=analystSnapshot({settings:{engine:'fibonacci_retest',forecastMode:'selective',orderDurationMs:30000},agentVersion:'13.4.67.7',lastEvalMs:now,lastResult:{analysis:{}}},{symbol:'TEST',lastQuoteAt:now,quote:1,assetValidated:true,analysisFeedValidated:true});
 assert.equal(frame.settings.forecastMode,'selective');assert.equal(frame.settings.engine,'fibonacci_retest');
 const mobile=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8'),pc=fs.readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.match(mobile,/aria-label="Modo de previsão"/);assert.match(mobile,/act\('settings',\{forecastMode:/);
 assert.match(pc,/data-sentinel-setting="forecastMode"/);assert.doesNotMatch(pc,/option value="selective_forecast"/);
});
test('previously saved selective strategy migrates to automatic plus selective mode',()=>{
 const r=new DemoTradingRuntime();r.patchSettings({engine:'selective_forecast'});assert.equal(r.settings.engine,'automatic');assert.equal(r.settings.forecastMode,'selective');
});

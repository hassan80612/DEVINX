import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {autonomousSelectiveEntry} from '../sentinel-trading-lab/agent/src/core/selective-autonomous.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {coherentInterval,observedNoise} from '../sentinel-trading-lab/agent/src/core/forward-direction-quality.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const now=1800000000000;
const quotes=Array.from({length:72},(_,i)=>({
 ts:now-(71-i)*3000,price:1.1+i*.000011+Math.sin(i/15)*.000002
}));
const snap={quoteHistory:quotes,price:quotes.at(-1).price,quoteTs:now,provider:'iq_option'};
test('selective requires no three complete bars and does not depend on the chosen strategy',()=>{
 const results=['automatic','trend','breakout','smart_confluence'].map(engine=>
  futureEntrySchedule({settings:{engine,forecastMode:'selective',asset:'TEST',orderDurationMs:5000},
   snap,now,delays:[5],forecastModel:'selected-strengths-67.5'})[0]);
 for(const r of results){
  assert.equal(r.forecastOwner,'selective-historical-outcomes-v2');
  if(r.side){assert.ok(r.entryAt>=now+2000&&r.entryAt<=now+5000);assert.equal(r.exitAt,r.entryAt+5000);}else assert.equal(r.entryAt,null);
  assert.equal(r.actionable,false);
  assert.ok(['forecast','scanning-entry-window','waiting-fresh-quote'].includes(r.status));
  if(r.side) assert.equal(r.side,r.projectedExitPrice>r.projectedEntryPrice?'CALL':'PUT');
 }
 for(const r of results.slice(1)){
  assert.equal(r.status,results[0].status);
  assert.equal(r.side,results[0].side);
  assert.equal(r.projectedEntryPrice,results[0].projectedEntryPrice);
  assert.equal(r.projectedExitPrice,results[0].projectedExitPrice);
 }
});
test('selective is silent on stale or insufficient observed feed; the clock never creates a signal',()=>{
 const old=autonomousSelectiveEntry({quoteHistory:quotes,now:now+5000,quoteTs:now,
  delaySeconds:5,holdingSeconds:5});
 assert.equal(old.side,null);
 assert.equal(old.status,'waiting-fresh-quote');
 const short=autonomousSelectiveEntry({quoteHistory:quotes.slice(-3),now,quoteTs:now,
  delaySeconds:5,holdingSeconds:5});
 assert.equal(short.side,null);
});
test('continuous forecasts never contradict their own entry/exit prices or approve near-zero moves',()=>{
 assert.equal(coherentInterval({side:'PUT',entryPrice:1,exitPrice:1.02,noise:0.01}).qualified,false);
 assert.equal(coherentInterval({side:'CALL',entryPrice:1,exitPrice:1.000001,noise:0.01}).qualified,false);
 assert.equal(coherentInterval({side:'CALL',entryPrice:1,exitPrice:1.02,noise:0.01}).side,'CALL');
 const noise=observedNoise({quotes,now,horizonSeconds:5});
 assert.ok(noise>0);
 const rows=futureEntrySchedule({settings:{engine:'automatic',asset:'TEST',
  orderDurationMs:30000,forecastMode:'continuous'},snap,now,delays:[5,30,60],
  forecastModel:'selected-strengths-67.5'});
 for(const r of rows)if(r.side){
   assert.ok(r.projectedEntryPrice>0&&r.projectedExitPrice>0);
   assert.equal(r.side,r.projectedExitPrice>r.projectedEntryPrice?'CALL':'PUT');
 }
});
test('only chosen horizon is evaluated in selective and engine changes are held for continuous',()=>{
 const settings={engine:'automatic',asset:'TEST',orderDurationMs:5000,forecastMode:'selective'};
 const matrix=forwardHorizonMatrix({settings,snap,now,forecastModel:'selected-strengths-67.5'});
 assert.equal(matrix.rows.length,1);
 assert.equal(matrix.entryRows.length,1);
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.patchSettings({engine:'trend'});
 runtime.patchSettings({forecastMode:'selective'});
 runtime.patchSettings({engine:'breakout'});
 assert.equal(runtime.settings.engine,'trend');
 runtime.patchSettings({forecastMode:'continuous'});
 assert.equal(runtime.settings.engine,'trend');
 runtime.patchSettings({engine:'breakout'});
 assert.equal(runtime.settings.engine,'breakout');
});
test('percentages use observed quote cards even when there is no forecast receipt',()=>{
 const pc=fs.readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 const mobile=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.match(pc,/const fresh=Number.isFinite\(value\)&&Number.isFinite\(other\)&&liveNow&&d.vnext\?\.engineId===d.engine/);
 assert.doesNotMatch(pc,/d.vnext\?\.receipt\?\.engineId===d.engine&&Math.round/);
 assert.match(mobile,/vnext\?\.cards\|\|\[\]/);
 assert.match(pc,/Seletiva Autônoma/);
 assert.match(mobile,/disabled=\{busy\|\|forecastMode==='selective'\}/);
 const engine=fs.readFileSync('sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs','utf8');
 assert.match(engine,/const autonomous=settings.forecastMode==='selective'/);
 assert.match(engine,/coherentInterval/);
});
test('all clocks share the original Agent deadline, no client deadline padding',()=>{
 const rt=fs.readFileSync('sentinel-trading-lab/agent/src/core/runtime.mjs','utf8');
 const pc=fs.readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 const mobile=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.match(rt,/const planned=sameEntry\?oldEntry:newEntryValid\?currentEntry:null/);
 assert.match(pc,/const entryPlanActive=entryPlanReady&&scheduledAt>Date.now\(\)/);
 assert.match(mobile,/const expired=pinned&&now>=plannedAt/);
});

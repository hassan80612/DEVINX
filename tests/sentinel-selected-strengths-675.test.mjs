import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const now=1800000000000,model='selected-strengths-67.5';
const quotes=Array.from({length:2400},(_,i)=>({ts:now-(2399-i)*1000,price:Math.exp(.002*Math.sin(i/100)+i*.000001)}));
const snap={quoteHistory:quotes,quoteTs:now,price:quotes.at(-1).price,provider:'iq_option'};
const input=engine=>({settings:{engine,asset:'TEST',orderDurationMs:60000},snap,now});
test('release selects exactly the tested automatic, breakout and fibonacci candidates',()=>{
 const release=JSON.parse(fs.readFileSync('sentinel-trading-lab/agent/release.json'));
 assert.equal(release.version,'13.4.67.17');assert.equal(release.runtime.forecastModel,model);
 for(const [engine,expected] of [['automatic','structure-context-v2'],['breakout','specialist-structure-v2'],['fibonacci_retest','specialist-structure-v2']]){
  assert.deepEqual(singleEngineForecast({...input(engine),forecastModel:model}),singleEngineForecast({...input(engine),forecastModel:expected}));
 }
});
test('all six other specialists remain byte-for-byte identical in their predictions',()=>{
 for(const engine of ['trend','price_action','mean_reversion','support_resistance','trendline_breakout','smart_confluence']){
  assert.deepEqual(singleEngineForecast({...input(engine),forecastModel:model}),singleEngineForecast(input(engine)));
  assert.deepEqual(futureEntrySchedule({...input(engine),forecastModel:model}),futureEntrySchedule(input(engine)));
 }
});
test('future-entry specialists use the same upgraded model for entry and expiry',()=>{
 for(const engine of ['breakout','fibonacci_retest']){
  const x=input(engine),row=futureEntrySchedule({...x,forecastModel:model,delays:[60]})[0];
  const first=singleEngineForecast({...x,forecastModel:model}).receipt;
  const second=singleEngineForecast({...x,settings:{...x.settings,orderDurationMs:120000},forecastModel:model}).receipt;
  assert.equal(row.projectedEntryPrice,first.projectedPrice);assert.equal(row.projectedExitPrice,second.projectedPrice);
  assert.equal(row.entryAt,now+60000);assert.equal(row.exitAt,now+120000);
 }
});
test('existing automatic future-entry trajectory and fixed mobile anchor are preserved',()=>{
 const x=input('automatic');assert.deepEqual(futureEntrySchedule({...x,forecastModel:model}),futureEntrySchedule({...x,forecastModel:'adaptive-direct-trajectory-v1'}));
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:model});Object.assign(r.settings,x.settings);
 const first=r._signalValidationGate({analysis:{},snap,settings:r.settings,now});
 const q={ts:now+1000,price:snap.price+.0001};
 const next=r._signalValidationGate({analysis:{},snap:{...snap,quoteTs:q.ts,price:q.price,quoteHistory:[...quotes.slice(1),q]},settings:r.settings,now:q.ts});
 assert.deepEqual(first.analysis.vnext.futureEntryAnchor,next.analysis.vnext.futureEntryAnchor);
 assert.equal(next.allowed,false);
});

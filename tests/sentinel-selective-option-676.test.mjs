import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectiveIntervalForecast} from '../sentinel-trading-lab/agent/src/core/selective-forward-model.mjs';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const now=1800000000000;
const history=Array.from({length:2400},(_,i)=>({ts:now-(2399-i)*1000,price:Math.exp(.002*Math.sin(i/100))}));
test('selective forecast estimates entry and exit on their own future timestamps',()=>{
 for(const holdingSeconds of [30,60,180,300]){
  const args={quoteHistory:history,asOf:now,entryDelaySeconds:holdingSeconds,holdingSeconds};
  const s=selectiveIntervalForecast(args),direct=adaptiveDirectTrajectory(args);
  assert.equal(s.entryAt,now+holdingSeconds*1000);assert.equal(s.exitAt,now+holdingSeconds*2000);
  assert.equal(s.projectedEntryPrice,direct.projectedEntryPrice);assert.equal(s.projectedExitPrice,direct.projectedExitPrice);
  if(s.side){assert.ok(s.qualified);assert.equal(s.side,s.projectedExitPrice>s.projectedEntryPrice?'CALL':'PUT');assert.ok(s.qualification.margin>=s.qualification.threshold);}
  else assert.equal(s.status,'waiting-selective-entry');
 }
});
test('qualification sees no future outcome or not-yet-arrived quote',()=>{
 const input={quoteHistory:history,asOf:now,entryDelaySeconds:30,holdingSeconds:30};
 assert.deepEqual(selectiveIntervalForecast(input),selectiveIntervalForecast({...input,quoteHistory:[...history,{ts:now+1,price:1e9},{ts:now-500,price:1e9,receivedAt:now+1000}]}));
 const stale=selectiveIntervalForecast({...input,asOf:now+5000});assert.equal(stale.side,null);
});
test('switching strategy isolates the future entry and keeps the existing automatic model',()=>{
 const snap={quoteHistory:history,quoteTs:now,price:history.at(-1).price,provider:'iq_option'};
 const settings={asset:'TEST',engine:'automatic',orderDurationMs:30000};
 const original=futureEntrySchedule({settings,snap,now,delays:[30],forecastModel:'selected-strengths-67.5'});
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'selected-strengths-67.5'});
 r.patchSettings(settings);r._signalValidationGate({analysis:{},snap,settings:r.settings,now});
 r.patchSettings({engine:'selective_forecast'});
 const changed=r._signalValidationGate({analysis:{},snap,settings:r.settings,now});
 assert.equal(changed.analysis.vnext.engineId,'selective_forecast');
 if(changed.analysis.vnext.futureEntryAnchor)assert.equal(changed.analysis.vnext.futureEntryAnchor.engineId,'selective_forecast');
 r.patchSettings({engine:'automatic'});
 assert.deepEqual(futureEntrySchedule({settings:r.settings,snap,now,delays:[30],forecastModel:r.forecastModel}),original);
});
test('site and PC expose selectable mode without removing any existing choice',()=>{
 const catalog=fs.readFileSync('sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs','utf8');
 const pc=fs.readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.match(catalog,/id:'selective_forecast',name:'Previsão seletiva'/);
 assert.match(pc,/option value="selective_forecast"/);assert.match(pc,/option value="automatic"/);
 const release=JSON.parse(fs.readFileSync('sentinel-trading-lab/agent/release.json'));
 assert.equal(release.version,'13.4.67.6');assert.equal(release.runtime.forecastModel,'selected-strengths-67.5');
});

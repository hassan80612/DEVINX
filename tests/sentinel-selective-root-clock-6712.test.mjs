import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {selectiveEvidence,qualifyStrategyInterval} from '../sentinel-trading-lab/agent/src/core/selective-forward-model.mjs';
const now=1800000000000;
function quotes(ms=4000,count=101){
 return Array.from({length:count},(_,i)=>({
  ts:now-(count-1-i)*ms,
  price:Math.exp(Math.log(1.04)+.00017*Math.sin(i/11)+i*.0000014)
 }));
}
test('causal sparse selective historical context survives actual 4s broker observations',()=>{
 const q=quotes(),common={quoteHistory:q,asOf:now,entryDelaySeconds:30,holdingSeconds:30};
 const defaultResult=adaptiveDirectTrajectory(common);
 assert.equal(defaultResult.status,'insufficient-completed-context');
 const selected=adaptiveDirectTrajectory({...common,historicalQuoteGapMs:8000});
 assert.equal(selected.status,'adaptive-direct-trajectory');
 assert.ok(selected.historicalExamples>=12);
 assert.ok(selected.latestTrainingOutcomeAt<=now);
 assert.equal(selected.latestObservedQuoteAt,now);
 assert.equal(selected.actionable,false);
 assert.equal(selected.calibrated,false);
});
test('late backfill and future observations never become historical evidence',()=>{
 const q=quotes(),opts={quoteHistory:q,asOf:now,entryDelaySeconds:30,holdingSeconds:30,historicalQuoteGapMs:8000};
 const stable=adaptiveDirectTrajectory(opts);
 assert.deepEqual(adaptiveDirectTrajectory({...opts,quoteHistory:[...q,
  {ts:now+1000,price:5000},{ts:now-120000,receivedAt:now+1000,price:.05}
 ]}),stable);
 const late=adaptiveDirectTrajectory({...opts,quoteHistory:q.map(x=>({...x,receivedAt:now}))});
 assert.equal(late.status,'insufficient-completed-context');
});
test('the selective live gate still refuses stale prices even after long historical context',()=>{
 const q=quotes(),forecast={side:'CALL',holdingSeconds:30,delaySeconds:30,
  projectedEntryPrice:1,projectedExitPrice:1.03};
 const stale=qualifyStrategyInterval({forecast,quoteHistory:q,asOf:now+4000});
 assert.equal(stale.side,null);
 assert.equal(stale.qualification.status,'waiting-quote');
 const selected=futureEntrySchedule({settings:{engine:'automatic',forecastMode:'selective',asset:'EUR/USD',orderDurationMs:30000},
   snap:{quoteHistory:q,quoteTs:now-4000,provider:'research'},adaptiveHistory:q,now:now+4000,
   forecastModel:'selected-strengths-67.5',delays:[30]})[0];
 assert.equal(selected.side,null);
 assert.equal(selected.status,'waiting-fresh-quote');
});
test('main selective prediction is preserved while auxiliary horizons cannot trigger heavy fits',()=>{
 const f=fs.readFileSync('sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs','utf8');
 const m=fs.readFileSync('sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs','utf8');
 assert.match(f,/autonomousSelectiveEntry/);
 assert.match(f,/selectiveLeadSeconds:chosen/);
 assert.match(m,/settings.forecastMode==='selective'\?\[horizon\]/);
 assert.match(m,/forecastModel:seconds===horizon\?forecastModel:'original-67'/);
});
test('mobile count must use original PC target timestamp, never a new 30-second clock',()=>{
 const c=fs.readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 const part=c.slice(c.indexOf('function MobileFutureEntryClock'),c.indexOf('export function LiveScenarioCard'));
 assert.match(part,/Math\.ceil\(\(windowEndsAt-now\)\/1000\)/);
 assert.match(part,/const running=windowStartedAt>0&&windowEndsAt>windowStartedAt&&now<windowEndsAt/);
 assert.doesNotMatch(part,/setNow\(plannedAt/);
});

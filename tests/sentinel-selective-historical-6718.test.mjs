import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {autonomousSelectiveEntry} from '../sentinel-trading-lab/agent/src/core/selective-autonomous.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const now=1800000003500,asset='TEST';
function quotes(n=1800,period=104,phase=0){
 return Array.from({length:n+1},(_,i)=>({
  ts:now-(n-i)*1000,price:1.1+.0015*Math.sin((i+phase)*2*Math.PI/period)+
  .00025*Math.sin((i+phase)*2*Math.PI/(period*.43))
 }));
}
const evalFor=(q,lead,hold=30,t=now)=>autonomousSelectiveEntry({
 quoteHistory:q,now:t,quoteTs:q.at(-1).ts,delaySeconds:lead,
 holdingSeconds:hold,asset,engineId:'automatic'
});
test('selected delay changes BOTH historical feature windows and historical outcome timestamps',()=>{
 const q=quotes(2600);
 const a=evalFor(q,5,5),b=evalFor(q,30,30),c=evalFor(q,60,60);
 for(const r of [a,b,c]){
  assert.equal(r.forecastOwner,'selective-historical-outcomes-v2');
  assert.equal(r.entryAt,now+r.delaySeconds*1000);
  assert.equal(r.exitAt,now+(r.delaySeconds+r.holdingSeconds)*1000);
  assert.equal(r.actionable,false);
  assert.ok(!r.side||r.side===(r.projectedExitPrice>r.projectedEntryPrice?'CALL':'PUT'));
 }
 assert.notDeepEqual(a.featureLagsSeconds,b.featureLagsSeconds);
 assert.notDeepEqual(b.featureLagsSeconds,c.featureLagsSeconds);
 assert.ok([a,b,c].every(r=>!('qualification' in r)));
 const source=fs.readFileSync('sentinel-trading-lab/agent/src/core/selective-autonomous.mjs','utf8');
 assert.match(source,/entry=lookup\(t\+elapsedMs\+h\*1000\)/);
 assert.match(source,/exit=lookup\(t\+elapsedMs\+\(h\+hold\)\*1000\)/);
 assert.doesNotMatch(source,/automaticForwardPrediction/);
});
test('the first 30s and delayed 30-to-60s outcomes are different research targets, not interchangeable',()=>{
 const q=quotes(2500),immediate=evalFor(q,0,30),delayed=evalFor(q,30,30);
 assert.equal(immediate.entryAt,now);
 assert.equal(immediate.exitAt,now+30000);
 assert.equal(delayed.entryAt,now+30000);
 assert.equal(delayed.exitAt,now+60000);
 assert.equal(immediate.forecastOwner,delayed.forecastOwner);
 assert.equal(immediate.holdingSeconds,30);
 assert.equal(delayed.holdingSeconds,30);
 assert.ok(!immediate.side||immediate.side===(immediate.projectedExitPrice>immediate.projectedEntryPrice?'CALL':'PUT'));
 assert.ok(!delayed.side||delayed.side===(delayed.projectedExitPrice>delayed.projectedEntryPrice?'CALL':'PUT'));
});
test('no look-ahead from future quotes or late backfills; no fabricated side when feed is stale',()=>{
 const q=quotes(1500),reference=evalFor(q,30,30);
 const polluted=autonomousSelectiveEntry({quoteHistory:[...q,
  {ts:now+1000,price:100000,receivedAt:now+1000},
  {ts:now-200000,price:.000001,receivedAt:now+9000}],
  now,quoteTs:now,delaySeconds:30,holdingSeconds:30,asset,engineId:'automatic'});
 assert.deepEqual(polluted,reference);
 const stale=autonomousSelectiveEntry({quoteHistory:q,now:now+4000,
  quoteTs:now,delaySeconds:30,holdingSeconds:30,asset});
 assert.equal(stale.status,'waiting-fresh-quote');
 assert.equal(stale.side,null);
});
test('changing expiry clears all old cached plans before a new real broker quote is evaluated',()=>{
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'selected-strengths-67.5'});
 r.patchSettings({asset,engine:'automatic',forecastMode:'selective',orderDurationMs:30000});
 r.vnextHorizonMatrix={rows:[{horizonSeconds:30,side:'CALL'}],entryRows:[]};
 r.vnextFutureEntryAnchor={side:'CALL',issuedAt:now,entryAt:now+30000};
 r.vnextTargetAnchor={side:'CALL'};
 r.vnextTargetProjection={side:'CALL'};
 r.vnextHorizonAudit={summaries:[]};
 r.lastResult={asset,analysis:{vnext:{receipt:{side:'CALL'},futureEntryAnchor:{side:'CALL'},
  futureEntryForecast:{side:'CALL'},futureEntryRows:[{side:'CALL'}],horizonForecasts:[{side:'CALL'}]}}};
 r.patchSettings({orderDurationMs:5000,forecastHorizonSeconds:5});
 assert.equal(r.settings.orderDurationMs,5000);
 assert.equal(r.vnextHorizonMatrix,null);
 assert.equal(r.vnextFutureEntryAnchor,null);
 assert.equal(r.vnextTargetAnchor,null);
 assert.equal(r.vnextHorizonAudit,null);
 assert.equal(r.lastResult.analysis.vnext.futureEntryAnchor,null);
 assert.deepEqual(r.lastResult.analysis.vnext.futureEntryRows,[]);
 assert.equal(r.nextEvalMs,0);
});
test('same quote context and different selected expiry recompute independent historical direction',()=>{
 const q=quotes(1900),snap={quoteHistory:q,quoteTs:now,price:q.at(-1).price,provider:'iq_option'};
 const settings={engine:'automatic',asset,forecastMode:'selective',orderDurationMs:30000};
 const first=forwardHorizonMatrix({settings,snap,now,forecastModel:'selected-strengths-67.5'});
 const next=forwardHorizonMatrix({settings:{...settings,orderDurationMs:60000},snap,now,
  previous:first,forecastModel:'selected-strengths-67.5'});
 assert.equal(first.entryRows.length,1);
 assert.equal(next.entryRows.length,1);
 assert.equal(next.entryRows[0].delaySeconds,60);
 if(next.entryRows[0].side){assert.ok(next.entryRows[0].entryAt>now&&next.entryRows[0].entryAt<=now+60000);assert.equal(next.entryRows[0].exitAt,next.entryRows[0].entryAt+60000);}
 assert.notEqual(first.context,next.context);
 assert.equal(next.reused,false);
});

import {retainAdaptiveHistory} from '../sentinel-trading-lab/agent/src/core/adaptive-temporal-history.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {adaptiveDirectTrajectory} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const MODEL='adaptive-direct-trajectory-v1',now=1800000000000,asset='EUR/USD OTC';
const history=Array.from({length:2400},(_,i)=>({
 ts:now-(2399-i)*1000,
 price:1.1+Math.sin(i/19)*.00016+Math.sin(i/47)*.00007+i*.00000003
}));
const snap={quoteHistory:history,quoteTs:now,price:history.at(-1).price,provider:'iq_option'};
const settings={engine:'automatic',asset,orderDurationMs:30000};
const release=JSON.parse(fs.readFileSync(new URL('../sentinel-trading-lab/agent/release.json',import.meta.url)));
test('release activates the tested new model through actual Worker runtime options',()=>{
 assert.equal(release.version,'13.4.67.20');
 assert.equal(release.runtime.forecastModel,'selected-strengths-67.5');
 const runtime=new DemoTradingRuntime({...release.runtime,enableVNext:true});
 runtime.patchSettings({...settings,forecastHorizonSeconds:30});
 assert.equal(runtime.forecastModel,'selected-strengths-67.5');
 const g=runtime._signalValidationGate({analysis:{},snap,settings:runtime.settings,now});
 const direct=adaptiveDirectTrajectory({quoteHistory:history,asOf:now,
  entryDelaySeconds:30,holdingSeconds:30});
 const plan=g.analysis.vnext.futureEntryForecast;
 assert.equal(plan.forecastOwner,'continuous-selected-engine-window-v1');
 assert.equal(plan.holdingSeconds,30);
 if(plan.side){assert.ok(plan.entryAt>now&&plan.entryAt<=now+30000);assert.equal(plan.exitAt,plan.entryAt+30000);assert.equal(plan.side,plan.projectedExitPrice>plan.projectedEntryPrice?'CALL':'PUT');}
 else assert.equal(plan.entryAt,null);
 assert.equal(g.analysis.operationalSignal.actionable,false);
 assert.equal(g.allowed,false);
});
test('new current-to-horizon price projection is not mixed with old historical analogs',()=>{
 const r=singleEngineForecast({settings,snap,now,forecastModel:MODEL});
 const direct=adaptiveDirectTrajectory({quoteHistory:history,asOf:now,
  entryDelaySeconds:0,holdingSeconds:30});
 assert.equal(r.modelVersion,MODEL);
 assert.equal(r.receipt.projectedPrice,direct.projectedExitPrice);
 assert.equal(r.forecastFoundation,'adaptive-direct-trajectory');
 assert.equal(r.receipt.targetAt,now+30000);
});
test('all live future-entry horizons run the direct model on exactly the same chosen times',()=>{
 const matrix=forwardHorizonMatrix({settings,snap,now,forecastModel:MODEL});
 for(const row of matrix.entryRows){
  const r=adaptiveDirectTrajectory({quoteHistory:history,asOf:now,
   entryDelaySeconds:row.delaySeconds,holdingSeconds:row.delaySeconds});
  if(row.delaySeconds===30){assert.equal(row.forecastOwner,'continuous-selected-engine-window-v1');assert.equal(row.holdingSeconds,30);}
  else assert.notEqual(row.modelVersion,MODEL,'secondary intervals must not re-fit heavy trajectory');
  if(row.entryAt!=null)assert.ok(row.entryAt>now&&row.entryAt<=now+row.delaySeconds*1000);
  if(row.exitAt!=null)assert.equal(row.exitAt,row.entryAt+row.delaySeconds*1000);
  if(row.side)assert.equal(row.side,row.projectedExitPrice>row.projectedEntryPrice?'CALL':'PUT');
 }
 const old=forwardHorizonMatrix({settings,snap,now});
 const switched=forwardHorizonMatrix({settings,snap,now,previous:old,forecastModel:MODEL});
 assert.equal(switched.reused,false,'cache from original model must not hide new predictions');
});
test('selected specialist motors retain original behavior, even in the new release',()=>{
 for(const engine of ['trend','mean_reversion','price_action','support_resistance','breakout',
  'trendline_breakout','fibonacci_retest','smart_confluence']){
  const own={...settings,engine};
  assert.deepEqual(singleEngineForecast({settings:own,snap,now,forecastModel:MODEL}),
   singleEngineForecast({settings:own,snap,now}));
  assert.deepEqual(futureEntrySchedule({settings:own,snap,now,forecastModel:MODEL}),
   futureEntrySchedule({settings:own,snap,now}));
 }
});
test('short-history fallback keeps original 67 functionality rather than mixing endpoint models',()=>{
 const short={...snap,quoteHistory:history.slice(-60)};
 assert.deepEqual(futureEntrySchedule({settings,snap:short,now,forecastModel:MODEL}),
  futureEntrySchedule({settings,snap:short,now}));
 assert.equal(singleEngineForecast({settings,snap:short,now,forecastModel:MODEL}).modelVersion,
  'vnext-single-owner-v1');
});
test('same fixed entry clock and signed compact mobile frame carry the new PC prediction',()=>{
 const runtime=new DemoTradingRuntime({...release.runtime,enableVNext:true});
 runtime.patchSettings({...settings,forecastHorizonSeconds:30});
 const g=runtime._signalValidationGate({analysis:{},snap,settings:runtime.settings,now});
 const original=g.analysis.vnext.futureEntryAnchor;
 const q={ts:now+1000,price:snap.price-.0001};
 const changed={...snap,quoteTs:q.ts,price:q.price,quoteHistory:[...history.slice(1),q]};
 const next=runtime._signalValidationGate({analysis:{},snap:changed,settings:runtime.settings,now:q.ts});
 if(original&&next.analysis.vnext.futureEntryAnchor&&next.analysis.vnext.futureEntryAnchor.side===original.side)assert.equal(next.analysis.vnext.futureEntryAnchor.entryAt,original.entryAt);
 const frame=analystSnapshot({settings:runtime.settings,agentVersion:release.version,state:'running',
  lastEvalMs:q.ts,lastResult:{asset,analysis:next.analysis}},{
  symbol:asset,validatedSymbol:asset,lastQuoteAt:q.ts,quote:q.price,
  assetValidated:true,analysisFeedValidated:true});
 const fitted=fitAnalystFrame(frame);
 assert.ok(fitted);
 assert.ok(Buffer.byteLength(JSON.stringify(fitted))+73<=3000);
 assert.equal(fitted.agentVersion,'13.4.67.20');
 const entry=fitted.lastResult.analysis.vnext.ea;
 if(original){assert.equal(entry[0],30);assert.equal(entry[6],original.entryAt);assert.equal(entry[7],original.exitAt);}
});
test('approved performance changes and preserved desktop controls, data bridge and mobile layout match reviewed sources',()=>{
 // 67.11 preserves the reviewed browser, desktop, bridge and layout sources; selective mode intentionally hides customer-facing technical details; layout geometry and desktop controls remain unchanged.
 const expected={"sentinel-trading-lab/agent/worker/live-bridge.mjs":"406cea810512f65fa3ed598028afc4be7d0a37a1","sentinel-trading-lab/agent/worker/local-playwright-driver.mjs":"262a14d4540d512822011ad690eb288cbf7ba671","sentinel-trading-lab/src/app/globals.css":"bfcf8831245db1dde5d7ce87cbbe2b6c35c857a9","sentinel-trading-lab/src/components/LiveScenarioCard.tsx":"d8ae8afdb2f115799e5483e09fe1fd987cb3c38c","sentinel-trading-lab/src/lib/live-card-model.ts":"877f11aa167627f7353c804f0571e25906127770"};
 const worker=fs.readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(worker,/onViewer:\(\)=>\{void publishLiveFrame\(\)\}/);
 assert.match(worker,/liveBridge\.publish\(analystSnapshot\(snapshot,chosen\.m\),\{urgent\}\)/);
 for(const [path,sha] of Object.entries(expected)){
  const bytes=fs.readFileSync(new URL('../'+path,import.meta.url));
  const actual=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  assert.equal(actual,sha,path);
 }
 const page=fs.readFileSync(new URL('../sentinel-trading-lab/src/app/console/page.tsx',import.meta.url),'utf8');
 assert.ok(page.includes("AVAILABLE_AGENT_VERSION='13.4.67.20'"));
 assert.ok(page.includes('/downloads/Sentinel-Agent-13.4.67.20.exe'));
});

test('dense feed retains time context for 300s model, without expanding mobile or old-card data',()=>{
 const base=now-2500000;
 const all=Array.from({length:10001},(_,i)=>({
  ts:base+i*250,price:1.1+Math.sin(i/76)*.00016+Math.sin(i/188)*.00007+i*.0000000075
 }));
 let context=null,raw=[];
 for(const issue of [600,1200,1800,2400,2500]){
  const at=base+issue*1000;
  raw=all.filter(q=>q.ts<=at).slice(-2400);
  context=retainAdaptiveHistory({previous:context,quotes:raw,now:at,
   asset,provider:'iq_option'});
  assert.ok(context.quotes.length<=3602);
  assert.equal(context.quotes.at(-1).ts,at);
 }
 const at=base+2500000;
 assert.ok(context.quotes.at(-1).ts-context.quotes[0].ts>1200000);
 assert.equal(adaptiveDirectTrajectory({quoteHistory:raw,asOf:at,
  entryDelaySeconds:300,holdingSeconds:300}).status,'insufficient-completed-context');
 const learned=adaptiveDirectTrajectory({quoteHistory:context.quotes,asOf:at,
  entryDelaySeconds:300,holdingSeconds:300});
 assert.equal(learned.status,'adaptive-direct-trajectory');
 const result=futureEntrySchedule({settings:{...settings,orderDurationMs:300000},
  snap:{quoteHistory:raw,quoteTs:at,provider:'iq_option'},now:at,
  delays:[300],forecastModel:MODEL,adaptiveHistory:context.quotes})[0];
 assert.equal(result.forecastOwner,'continuous-selected-engine-window-v1');
 assert.equal(result.holdingSeconds,300);
 if(result.side){assert.ok(result.entryAt>at&&result.entryAt<=at+300000);assert.equal(result.exitAt,result.entryAt+300000);}
});
test('time context rejects future arrivals, expires old points and isolates asset/provider',()=>{
 const previous=retainAdaptiveHistory({quotes:history,now,asset,provider:'iq_option'});
 const isolated=retainAdaptiveHistory({previous,quotes:[{ts:now,price:2}],
  now,asset:'BTC/USD',provider:'exnova'});
 assert.equal(isolated.quotes.length,1);
 const rejected=retainAdaptiveHistory({previous,quotes:[{ts:now+1,price:1e12},
  {ts:now-1,price:1e-12,receivedAt:now+1000}],now,asset,provider:'iq_option'});
 assert.deepEqual(rejected,previous);
 const later=retainAdaptiveHistory({previous,quotes:[],now:now+4000000,
  asset,provider:'iq_option'});
 assert.equal(later.quotes.length,0);
});

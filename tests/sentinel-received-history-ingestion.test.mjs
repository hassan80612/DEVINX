import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {runtimeMarketFromLive} from '../sentinel-trading-lab/agent/worker/runtime-market.mjs';
import {receivedHistoryInput} from './fixtures/sentinel-received-history-input.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';
const received=(...args)=>receivedHistoryInput(LocalPlaywrightDriver,...args);
for(const provider of ['iq_option','exnova'])test(`${provider}: received three-candle structure survives the actual worker-to-runtime path`,async()=>{
 const {now,live}=received(provider);
 assert.equal(live.candles.length,3);assert.equal(live.quoteFeedValidated,true);
 assert.equal(live.analysisFeedValidated,false,'the legacy fifty-candle readiness remains separate');
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.stateName='running';runtime.settings.asset='EUR/USD';runtime.settings.engine='automatic';
 // The fixture uses REAL recent broker quotes. Pick an existing allowed
 // daytime timezone so it tests the broker/market path independently of the
 // wall-clock minute at which CI happens to run (not a production change).
 const utcHour=new Date(now).getUTCHours();
 runtime.settings.schedule.timezone=utcHour<8?'Asia/Tokyo':
   utcHour>=20?'America/Sao_Paulo':'UTC';
 runtime.setExternalMarket(runtimeMarketFromLive(provider,live,'EUR/USD'));
 const snap=runtime._marketSnapshot();
 assert.equal(snap.historicalCandlesVerified,true,'a valid received structure must not disappear because it has fewer than fifty bars');
 await runtime.tick(now,{skipStatus:true});
 assert.ok(runtime.lastResult.analysis?.vnext,JSON.stringify(runtime.lastResult));
 const entry=runtime.lastResult.analysis.vnext.futureEntryAnchor;
 assert.equal(entry?.side,'CALL');assert.equal(entry.entryAt,now);assert.equal(entry.exitAt,now+30000);
 assert.equal(runtime.lastResult.order,undefined);
 const frame=analystSnapshot({state:'running',settings:runtime.settings,lastEvalMs:now,lastResult:runtime.lastResult},live);
 const mirrored=liveCardModel(frame,now).vnextFutureEntryAnchor;
 assert.equal(mirrored.side,entry.side);assert.equal(mirrored.entryAt,entry.entryAt);assert.equal(mirrored.exitAt,entry.exitAt);
});
for(const provider of ['iq_option','exnova'])test(`${provider}: resistance rejection remains symmetric through protocol ingestion`,async()=>{
 const {now,live}=received(provider,3,true);
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.stateName='running';runtime.settings.asset='EUR/USD';runtime.settings.engine='automatic';
 // The fixture uses REAL recent broker quotes. Pick an existing allowed
 // daytime timezone so it tests the broker/market path independently of the
 // wall-clock minute at which CI happens to run (not a production change).
 const utcHour=new Date(now).getUTCHours();
 runtime.settings.schedule.timezone=utcHour<8?'Asia/Tokyo':
   utcHour>=20?'America/Sao_Paulo':'UTC';
 runtime.setExternalMarket(runtimeMarketFromLive(provider,live,'EUR/USD'));
 await runtime.tick(now,{skipStatus:true});
 const entry=runtime.lastResult.analysis.vnext.futureEntryAnchor;
 assert.equal(entry?.side,'PUT');assert.equal(entry.entryAt,now);assert.equal(entry.exitAt,now+30000);
 assert.equal(runtime.lastResult.order,undefined);
});
test('all actually received window sizes remain available without claiming missing candles',()=>{
 for(const count of [3,10,20,49,50,100]){
  const {now,live}=received('exnova',count);
  assert.equal(live.historicalCandlesVerified,true);
  assert.equal(live.analysisFeedValidated,count>=50);
  const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
  runtime.setExternalMarket(runtimeMarketFromLive('exnova',live,'EUR/USD'));
  const snap=runtime._marketSnapshot();assert.equal(snap.historicalCandlesVerified,true);
  runtime._signalValidationGate({analysis:{},snap,settings:runtime.settings,now});
  assert.equal(runtime.structureCache.value.candles,count);
  assert.equal(runtime.structureCache.value.candleLevelMap.windows.find(w=>w.size===100).available,count===100);
 }
});
for(const failure of ['other-asset','stale-history','bad-integrity','unresolved-asset'])test(`${failure} cannot be promoted to verified structural history`,()=>{
 const {driver,state}=received();
 if(failure==='other-asset')state.candleActiveId=2;
 if(failure==='stale-history')state.candles=state.candles.map(c=>({...c,from:c.from-600,to:c.to-600}));
 if(failure==='bad-integrity')state.candles.at(-1).close=10;
 if(failure==='unresolved-asset')state.screenCandidateSymbol='GBP/USD';
 const live=driver.liveStatus('exnova');assert.equal(live.historicalCandlesVerified,false);
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.setExternalMarket(runtimeMarketFromLive('exnova',live,'EUR/USD'));
 assert.equal(runtime._marketSnapshot().historicalCandlesVerified,false);
});
test('verified historical context cannot bypass stale or missing current quote validation',()=>{
 for(const failure of ['stale','missing']){
  const {driver,state,now}=received();
  if(failure==='stale')state.lastQuoteAt=now-5000;else state.quoteHistory=[];
  const live=driver.liveStatus('exnova');assert.equal(live.historicalCandlesVerified,true);
  assert.equal(live.quoteFeedValidated,false);
  const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
  runtime.setExternalMarket(runtimeMarketFromLive('exnova',live,'EUR/USD'));
  const snap=runtime._marketSnapshot();assert.equal(snap.waitingLive,true);assert.deepEqual(snap.candles,[]);
 }
});
test('legacy producer flags retain their meaning while explicit rejection remains authoritative',()=>{
 const {live}=received();
 const legacy={...live,analysisFeedValidated:true};delete legacy.historicalCandlesVerified;
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.setExternalMarket(runtimeMarketFromLive('exnova',legacy,'EUR/USD'));
 assert.equal(runtime._marketSnapshot().historicalCandlesVerified,true);
 runtime.setExternalMarket(runtimeMarketFromLive('exnova',{...legacy,historicalCandlesVerified:false},'EUR/USD'));
 assert.equal(runtime._marketSnapshot().historicalCandlesVerified,false);
});
test('forming bars do not become closed historical structure merely because their provenance is valid',()=>{
 const {driver,state,now}=received();
 state.candles=state.candles.map(c=>({...c,from:c.from+180,to:c.to+180}));
 const live=driver.liveStatus('exnova');assert.equal(live.historicalCandlesVerified,true);
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.setExternalMarket(runtimeMarketFromLive('exnova',live,'EUR/USD'));
 runtime._signalValidationGate({analysis:{},snap:runtime._marketSnapshot(),settings:runtime.settings,now});
 assert.equal(runtime.structureCache.value.candles,0);
});

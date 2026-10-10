import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {compactRemoteState} from '../sentinel-trading-lab/agent/worker/remote-status.mjs';

const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const WORKER='sentinel-trading-lab/agent/worker/';

test('remote polling is bounded and heartbeat does not hold up mobile actions',()=>{
  const worker=read(WORKER+'index.mjs');
  assert.match(worker,/setInterval\(remoteLoop,2500\)/);
  assert.match(worker,/runtime\.stateName==='running'\?5000:20000/);
  assert.match(worker,/void sendRemoteHeartbeat\(\)/);
  assert.match(worker,/lastRemoteHeartbeatAttemptAt=0/);
  assert.match(worker,/dashboardTransportState\(/);
  const remote=read(WORKER+'remote-status.mjs');
  assert.match(remote,/MAX_ANALYSES\s*=\s*6/);
  assert.match(remote,/MAX_CANDLES\s*=\s*40/);
  assert.match(remote,/MAX_QUOTES\s*=\s*40/);
  assert.doesNotMatch(remote,/fetch\(|setInterval\(/);
});

test('retired CALL PUT Invest mobile trade path is absent and fails closed',()=>{
  const driver=read(WORKER+'local-playwright-driver.mjs');
  const worker=read(WORKER+'index.mjs');
  const adapter=read(WORKER+'adapters/browser-broker.mjs');
  const page=read('sentinel-trading-lab/src/app/page.tsx');
  for(const forbidden of ['scanExecutionUi','_axDemoOrder','_axClickBackend','placeManualOrder','placeDemoOrder','__sentinelAmountBuffer','sentinel-amount-listener-marker','broker-dom-controls.mjs'])assert.equal(driver.includes(forbidden),false,forbidden+' still in driver');
  for(const forbidden of ['reserveManualOrder','validateManualOrder','scan-controls','manualOrderBusy','manual-order-ledger'])assert.equal(worker.includes(forbidden),false,forbidden+' still in worker');
  assert.match(driver,/broker_order_execution_retired/);
  assert.match(adapter,/broker_order_execution_retired/);
  assert.doesNotMatch(page,/ManualOrderMobile|<ManualOrderMobile/);
  assert.equal(existsSync(resolve(root,WORKER+'manual-order.mjs')),false);
  assert.equal(existsSync(resolve(root,WORKER+'broker-dom-controls.mjs')),false);
  assert.equal(existsSync(resolve(root,'sentinel-trading-lab/src/components/ManualOrderMobile.tsx')),false);
  assert.match(read('sentinel-trading-lab/src/app/api/runtime/[...path]/route.ts'),/manual_mobile_controls_retired/);
});

test('remote broker snapshot is compact without changing full Agent values',()=>{
  const candles=Array.from({length:480},(_,i)=>({open:i,close:i+1}));
  const forecast={asset:'EUR/USD OTC',horizonSeconds:60,rawBias:'CALL',bias:'CALL',outlookReady:true,directionReady:true,callProbability:70,putProbability:30,confidence:80,modelConfidence:84,heavyArray:candles};
  const input={state:'running',liveBroker:{symbol:'EUR/USD OTC',quote:1.2345,candles,predictionCandles:candles,executionUi:{buy:true}},
    brokers:{iq_option:{marketData:{quote:1.2345,predictionCandles:candles,candles}}},
    lastResult:{asset:'EUR/USD OTC',analysis:{side:'BUY',confidence:80,operationalSignal:{scenario:{side:'CALL',deadline:123456}},generalConsensus:{rapid:{callPct:71}},predictionMetrics:{history:candles},strategyCards:candles,entryPlanner:{horizons:{60:forecast}}}}};
  const before=JSON.stringify(input);
  const out=compactRemoteState(input);
  assert.equal(out.liveBroker.quote,1.2345);
  assert.equal(out.liveBroker.candles.length,40);
  assert.equal(out.liveBroker.predictionCandles,undefined);
  assert.equal(out.brokers.iq_option.marketData.predictionCandles,undefined);
  assert.equal(out.lastResult.analysis.operationalSignal.scenario.side,'CALL');
  assert.equal(out.lastResult.analysis.entryPlanner.horizons[60].rawBias,'CALL');
  assert.equal(out.lastResult.analysis.entryPlanner.horizons[60].heavyArray,undefined);
  assert.equal(out.lastResult.analysis.predictionMetrics,undefined);
  assert.equal(JSON.stringify(input),before,'Never mutate input/engine history');
  assert.ok(JSON.stringify(out).length < before.length*.15,'Large duplicated prediction arrays should not reach Supabase');
});

test('selected-asset tracking and passive quotes survive without broker-page automation',()=>{
  const driver=read(WORKER+'local-playwright-driver.mjs');
  const worker=read(WORKER+'index.mjs');
  const manager=read(WORKER+'agent-manager.mjs');
  const installer=read('sentinel-trading-lab/public/downloads/install-agent-v88.ps1');
  assert.match(driver,/pageNetworkTap='read-only-quote-observer'/);
  assert.match(driver,/page\.on\('websocket'/);
  assert.match(driver,/ws\.on\('framesent'/);
  assert.match(driver,/ws\.on\('framereceived'/);
  assert.doesNotMatch(driver,/page\.on\('response'/);
  assert.doesNotMatch(driver,/WebSocket\.prototype\.send\s*=/);
  assert.doesNotMatch(driver,/document\.elementsFromPoint/);
  assert.match(driver,/direct_market_feed_unavailable/);
  assert.match(driver,/async shutdown\(\)/);
  assert.match(driver,/analysisFeedValidated/);
  assert.doesNotMatch(driver,/__sentinelOverlayClock\s*=\s*setInterval/);
  assert.match(worker,/driver\.shutdown\?\.\(\)/);
  assert.match(manager,/for\(let i=0;i<100;i\+\+\)/);
  assert.match(installer,/13\.4\.49-independent-1010/);
  assert.doesNotMatch(installer,/13\.4\.39-broker-passive-1009/);
});

test('broker account validation never masks a valid market analysis in the floating card',()=>{
  const worker=read(WORKER+'index.mjs');
  const driver=read(WORKER+'local-playwright-driver.mjs');
  assert.match(worker,/analysisStale:[^\n]+analysisFeedValidated/);
  assert.doesNotMatch(worker,/analysisStale:view\.liveBroker\?\.feedValidated===false/);
  assert.match(driver,/analysisFeedValidated=!!\(/);
  assert.match(driver,/feedValidated=!!\(analysisFeedValidated&&st\.balance/);
});

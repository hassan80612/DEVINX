import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const short=[5000,10000,15000,30000,60000];
const make=()=>new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
test('new short-term Sentinel engine defaults to 30-second expiry and reference',()=>{
 const runtime=make();
 assert.equal(runtime.settings.orderDurationMs,30000);
 assert.equal(runtime.settings.forecastHorizonSeconds,30);
});
test('5/10/15/30/60s are independent expiries under shared 30s analysis reference',()=>{
 for(const value of short){
  const runtime=make();
  runtime.patchSettings({orderDurationMs:value,forecastHorizonSeconds:value/1000});
  assert.equal(runtime.settings.orderDurationMs,value);
  assert.equal(runtime.settings.forecastHorizonSeconds,30);
 }
});
test('unsupported expiries remain rejected; supported 1m is explicitly accepted',()=>{
 for(const value of [31000,45000,120000,300000,3600000]){
  const runtime=make();
  assert.throws(()=>runtime.patchSettings({orderDurationMs:value}),/invalid_short_operation_duration/);
  assert.equal(runtime.settings.orderDurationMs,30000);
 }
});
test('persisted 60s stays 60s; unsupported legacy 15m migrates to 30s',()=>{
 for(const prior of [60000,900000]){
  const runtime=make();
  runtime.restore({settings:{orderDurationMs:prior,forecastHorizonSeconds:prior/1000}});
  assert.equal(runtime.settings.orderDurationMs,prior===60000?60000:30000);
  assert.equal(runtime.settings.forecastHorizonSeconds,30);
 }
});
test('minute support does not restore broker-clock scans or new polling',()=>{
 const source=readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.doesNotMatch(source,/lastBrokerTimeScanAt|readBrokerTimingSnapshot|scanEveryMs/);
 const worker=readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');assert.match(worker,/accountBalanceSnapshot/);assert.match(worker,/runtime\.tick\(loopNow,\{skipStatus:true\}\)/);
});
test('legacy forecast engine still accepts its own former duration settings',()=>{
 const legacy=new DemoTradingRuntime({enableVNext:false,forecastModel:'original-67'});
 legacy.patchSettings({orderDurationMs:60000});
 assert.equal(legacy.settings.orderDurationMs,60000);
});
test('short NOW engine evaluates independently for each supported expiry',()=>{
 const base=Date.UTC(2026,9,16,12),rows=Array.from({length:120},(_,i)=>({
  ts:base+i*1000,receivedAt:base+i*1000,price:1.1*Math.exp(i*.00003)
 })),last=rows.at(-1);
 for(const durationMs of short){
  const result=analyzeNowOpportunity({quoteHistory:rows,quoteAt:last.ts,price:last.price,
   now:last.ts,engineId:'automatic',qualityPolicy:'adaptive-market-v17',durationMs});
  assert.equal(result.expirySeconds,durationMs/1000,'wrong holding-period metadata');
 }
});

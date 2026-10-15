import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const short=[5000,10000,15000,30000];
const make=()=>new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
test('new short-term Sentinel engine defaults to 30-second expiry and reference',()=>{
 const runtime=make();
 assert.equal(runtime.settings.orderDurationMs,30000);
 assert.equal(runtime.settings.forecastHorizonSeconds,30);
});
test('5/10/15/30s are independent expiries under shared 30s analysis reference',()=>{
 for(const value of short){
  const runtime=make();
  runtime.patchSettings({orderDurationMs:value,forecastHorizonSeconds:value/1000});
  assert.equal(runtime.settings.orderDurationMs,value);
  assert.equal(runtime.settings.forecastHorizonSeconds,30);
 }
});
test('no duration over 30 seconds is accepted from a direct API or a stale PC menu',()=>{
 for(const value of [31000,45000,60000,120000,300000,3600000]){
  const runtime=make();
  assert.throws(()=>runtime.patchSettings({orderDurationMs:value}),/invalid_short_operation_duration/);
  assert.equal(runtime.settings.orderDurationMs,30000);
 }
});
test('persisted 60-second or older 15-minute expiry migrates to 30s without restarting signals',()=>{
 for(const prior of [60000,900000]){
  const runtime=make();
  runtime.restore({settings:{orderDurationMs:prior,forecastHorizonSeconds:prior/1000}});
  assert.equal(runtime.settings.orderDurationMs,30000);
  assert.equal(runtime.settings.forecastHorizonSeconds,30);
 }
});
test('broker page wide text scan becomes less frequent for normal clock but keeps 2.5s on explicit broker clock',()=>{
 const source=readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.match(source,/scanEveryMs=payload\.clockMode==='broker'\?2500:10000/);
 assert.match(source,/payload\.brokerTiming=this\.readBrokerTimingSnapshot\(provider,st\)/);
 assert.doesNotMatch(source,/payload\.brokerTiming=this\.liveStatus\(provider\)\.brokerTiming/);
 assert.match(source,/Date\.now\(\)-Number\(s\.lastBrokerTimeScanAt\|\|0\)>=scanEveryMs/);
 const worker=readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
 assert.match(worker,/runtime\.tick\(loopNow,\{skipStatus:true\}\)/);
 assert.match(worker,/publishLiveFrame\(\)/);
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

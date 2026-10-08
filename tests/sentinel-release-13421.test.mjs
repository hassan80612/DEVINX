import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RUNTIME_OPTIONS,VERSION,BUILD} from '../sentinel-trading-lab/agent/worker/release.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeReplayFrame} from '../sentinel-trading-lab/agent/worker/replay.mjs';

test('installed release activates the exact tested prediction and reversal policy',async()=>{
 assert.equal(VERSION,'13.4.22');assert.equal(BUILD,'13.4.22-expiry-retrace-1008');
 const x=JSON.parse(await readFile('tests/fixtures/sentinel-continuation-prices.json','utf8'));
 const released=new DemoTradingRuntime(RUNTIME_OPTIONS),tested=new DemoTradingRuntime({predictionModel:'family-v6-verified-input',entryPolicy:'structural-reversals-v1',scenarioPolicy:'closed-structure-v1'});
 const original=new DemoTradingRuntime({predictionModel:'family-v6-stable',entryPolicy:'structural-reversals-v1'});
 for(const r of [released,tested,original]){Object.assign(r.settings,{asset:'TEST',strategy:'trend',forecastHorizonSeconds:30,orderDurationMs:30000,futureDisplayThreshold:50});r.settings.risk.minConfidence=55;}
 // Chronological frames include backfill growth and every operational decision.
 for(let i=0;i<x.quoteHistory.length;i++){
  const q=x.quoteHistory[i],snap={provider:'test',candles:x.candles.filter(c=>c.to*1000<=q.ts),quoteHistory:x.quoteHistory.slice(0,i+1),price:q.price,quoteTs:q.ts};
  const a=analyzeReplayFrame(released,snap,q.ts),b=analyzeReplayFrame(tested,snap,q.ts);
  assert.deepEqual(a.entryPlanner,b.entryPlanner);assert.deepEqual(a.operationalSignal,b.operationalSignal);assert.deepEqual(a.generalConsensus,b.generalConsensus);const previous=analyzeReplayFrame(original,snap,q.ts);assert.deepEqual(a.generalConsensus,previous.generalConsensus);
 }
});

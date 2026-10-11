import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const read=p=>readFile(new URL('../sentinel-trading-lab/'+p,import.meta.url));
const source=async p=>(await read(p)).toString('utf8');

test('single selected-engine forecasting algorithm remains exactly 13.4.60, with no new instant-signal observer',async()=>{
 const bytes=await read('agent/src/core/vnext-single-engine.mjs');
 const hash=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0'))
  .update(bytes).digest('hex');
 assert.equal(hash,'6a546ae6113cf313e803bf8d2bd5b9151eba8a30');
 const runtime=await source('agent/src/core/runtime.mjs');
 assert.match(runtime,/const model=singleEngineForecast\(\{settings,snap,now\}\)/);
 assert.doesNotMatch(runtime,/observeImmediateMarket|vnextNowObservation|nowIndication/);
 assert.match(runtime,/const eligible=previous\.filter\(x=>x\?\.targetAt>now-2000\)/);
 assert.match(runtime,/forwardHorizonMatrix\(/);
});

test('neither PC overlay nor normal or floating mobile render a secondary CALL PUT observer',async()=>{
 const [pc,phone,model,bridge,signed]=await Promise.all([
  source('agent/worker/local-playwright-driver.mjs'),
  source('src/components/LiveScenarioCard.tsx'),
  source('src/lib/live-card-model.ts'),
  source('agent/worker/live-bridge.mjs'),
  source('agent/worker/signed-live-bridge.mjs')
 ]);
 assert.doesNotMatch(pc,/immediate-market-observation|observationOpposing|observationFresh|liveObservation/);
 assert.doesNotMatch(phone,/instantObservation|vnextNowObservation|opposingObserved/);
 assert.doesNotMatch(model,/vnextNowObservation/);
 assert.doesNotMatch(bridge,/nowIndication:vnext\.nowIndication/);
 assert.doesNotMatch(signed,/a\.vnext\?\.nowIndication/);
 assert.equal((phone.match(/\{forecastReceipt\}/g)||[]).length,2,
   'mobile normal and floating must use the exact same selected motor forecast');
 assert.match(pc,/data-sentinel-vnext-clock/);
 assert.match(phone,/forecastDelayed/);
 assert.match(phone,/mobile-feed-path/);
});

test('selected forecast remains read-only; no new automatic trading permissions',async()=>{
 const [runtime,engine]=await Promise.all([
  source('agent/src/core/runtime.mjs'),source('agent/src/core/vnext-single-engine.mjs')
 ]);
 assert.match(runtime,/return\{allowed:false,analysis:result,reasons:\[model\.reason\]\}/);
 assert.match(engine,/automaticForwardPrediction\(options\)/);
 assert.match(engine,/specialistForwardPrediction\(\{\.\.\.options,engineId:request\.engineId\}\)/);
});

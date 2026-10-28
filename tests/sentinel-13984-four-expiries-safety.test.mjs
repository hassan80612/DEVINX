import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
import {combine66WithProbability} from '../sentinel-trading-lab/agent/src/core/66-probability-integration.mjs';
import {CausalProbabilityReview} from '../sentinel-trading-lab/agent/src/core/causal-probability-review.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
function quotes(seconds=200,slope=.000002){
 return Array.from({length:seconds+1},(_,i)=>({ts:T+i*1000,price:1.10001+slope*i+Math.sin(i/13)*.0000002}));
}
for(const ms of [30000,60000,120000,300000]){
 test(ms/1000+'s probability uses past prices, no WAIT gate or invented calibrated certainty',()=>{
  const q=quotes(),last=q.at(-1);
  const p=shortProbability({quoteHistory:q,quoteAt:last.ts,price:last.price,durationMs:ms,payout:.8,now:last.ts});
  assert.equal(p.horizonSeconds,ms/1000);
  assert.equal(p.calibrated,false);assert.equal(p.source,'parametric-unvalidated');
  assert.ok(Number.isFinite(p.pCall));assert.ok(Number.isFinite(p.pPut));
  assert.ok(Math.abs(p.pCall+p.pPut-1)<1e-9);
  assert.equal(shortProbability({quoteHistory:q,quoteAt:last.ts,price:last.price,durationMs:ms,now:last.ts+4000}).ready,false);
  // Insufficient LONG history never vetoes a previously qualified analyst entry.
  const old={ready:true,side:'CALL',strength:40,reason:'closed-structure-and-live-impulse'};
  const thin=shortProbability({quoteHistory:q.slice(-50),quoteAt:last.ts,price:last.price,durationMs:ms,now:last.ts});
  const merged=combine66WithProbability(old,thin,{durationMs:ms,proof:{approved:false,n:0}});
  assert.equal(merged.ready,true);assert.equal(merged.side,'CALL');
 });
 test(ms/1000+'s expiry learning does not authorize premature inversion',()=>{
  const q=quotes(),last=q.at(-1),review=new CausalProbabilityReview();
  const context='exnova|EUR/USD OTC|automatic|'+ms;
  const record=review.observe({context,now:last.ts,quoteAt:last.ts,price:last.price,quoteHistory:q,expiryMs:ms,
   original:{ready:true,side:'CALL',strength:35,reason:'closed-structure-and-live-impulse'},
   estimate:{pCall:.30,pPut:.70},marketValid:true,payout:.8});
  assert.equal(record.approved,false);assert.equal(record.n,0);
  const old={ready:true,side:'CALL',strength:35,reason:'closed-structure-and-live-impulse'};
  assert.equal(combine66WithProbability(old,{pCall:.30,pPut:.70},{durationMs:ms,proof:record}).side,'CALL');
 });
}
test('only 30s, 1m and 5m are user-selectable, without broker expiry manipulation',()=>{
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const bot=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs',import.meta.url),'utf8');
 assert.match(worker,/\[30000,60000,300000\]/);
 assert.match(driver,/The broker's native expiry selection|user's native expiry selection/i);
 assert.match(bot,/async recoverDigitalAfterClose\(_provider\)\{return false;\}/);
 assert.doesNotMatch(bot,/await hits\[0\]\.frame\.locator\(hits\[0\]\.selector\)\.click/);
});
test('original analyst horizon and no third-pivot wait are preserved',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/if\(pivots\.length===2\)return /);
 const q=quotes(),last=q.at(-1);
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 for(const duration of [30000,60000,300000]){
  rt.patchSettings({orderDurationMs:duration},'test');
  const snap={provider:'iq_option',quoteHistory:q,quoteTs:last.ts,price:last.price,payout:.8};
  const v=rt._signalValidationGate({analysis:{},snap,settings:rt.settings,now:last.ts});
  assert.equal(rt.settings.orderDurationMs,duration);
  assert.equal(v.analysis.vnext.expirySeconds,duration/1000);
  assert.equal(v.analysis.vnext.nowObservation.probabilityCalibrated,false);
  assert.ok(v.analysis.vnext.nowObservation.probabilityCall!=null);
 }
});

test('legacy selected expiry is migrated, while unrelated bot cadence is untouched',()=>{
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 for(const durationMs of [5000,10000,15000,120000]){
  assert.throws(()=>rt.patchSettings({orderDurationMs:durationMs},'test'),/invalid_short_operation_duration/);
  assert.equal(rt.settings.orderDurationMs,30000);
 }
 for(const durationMs of [30000,60000,300000]){
  rt.patchSettings({orderDurationMs:durationMs},'test');
  assert.equal(rt.settings.orderDurationMs,durationMs);
 }
 const snapshot=rt.snapshotPersistent();
 snapshot.settings.orderDurationMs=120000;
 const restored=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 restored.restore(snapshot);
 assert.equal(restored.settings.orderDurationMs,60000,'obsolete 2m migrates to 1m rather than silently resetting to 30s');
 const consoleUi=readFileSync(new URL('../sentinel-trading-lab/src/app/console/page.tsx',import.meta.url),'utf8');
 const overlay=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const phone=readFileSync(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 assert.match(consoleUi,/const allowed=\[30000,60000,300000\]/);
 assert.match(overlay,/\$\{\[30,60,300\]\.map/);
 assert.match(phone,/const expiryChoices=\[30,60,300\]/);
 assert.doesNotMatch(overlay,/<option value="120"[^>]*>2 min/);
});

test('six PC commands are horizontally aligned, including Mapear, with no duplicate top-right start dock',()=>{
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const executor=readFileSync(new URL('../sentinel-trading-lab/agent/worker/executor-panel.mjs',import.meta.url),'utf8');
 assert.match(driver,/grid-template-columns:repeat\(6,minmax\(82px,1fr\)\)/);
 assert.match(driver,/data-sentinel-analysis-actions style="display:contents"/);
 assert.match(executor,/data-sentinel-bot-actions style="display:contents"/);
 assert.match(executor,/data-sentinel-executor-action="map"/);
 assert.match(executor,/data-sentinel-executor-action="start"/);
 assert.match(executor,/data-sentinel-executor-action="stop"/);
 assert.doesNotMatch(driver,/grid-template-columns:repeat\(3,minmax\(78px,1fr\)\)/);
});

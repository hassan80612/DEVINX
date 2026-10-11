import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PAIR_STRATEGIES} from '../sentinel-trading-lab/agent/src/core/pair-strategy-catalog.mjs';
import {isPairedStrategy,selectedForecast} from '../sentinel-trading-lab/agent/src/core/unified-strategy-forecast.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
const T=1800000000000;
const priceRows=(seed,n=1800)=>{
 let rand=seed>>>0,p=1.1;
 return Array.from({length:n},(_,i)=>{
  rand=(1664525*rand+1013904223)>>>0;
  const n=(rand/4294967296-.5)*.000009;
  p*=Math.exp(.000004*Math.sin(i*.035+seed)+.00001*Math.sin(i*.19)+n);
  return {ts:T+i*1000,price:p};
 });
};
const snap=prices=>({quoteHistory:prices,quoteTs:prices.at(-1).ts,provider:'iq_option',price:prices.at(-1).price});
test('single selectable catalog contains all nine independent strategies plus exactly three pairs',()=>{
 assert.equal(SCENARIO_ENGINES.length,9);
 assert.equal(PAIR_STRATEGIES.length,3);
 assert.equal(new Set([...SCENARIO_ENGINES,...PAIR_STRATEGIES].map(x=>x.id)).size,12);
 for(const p of PAIR_STRATEGIES){
  assert.equal(isPairedStrategy(p.id),true);
  assert.equal(p.engines.length,2);
  assert.equal(p.versions.length,2);
  assert.notEqual(p.engines[0],p.engines[1]);
 }
});
test('automatic defaults to its own real forecast, without opaque filter or endless forced WAIT',()=>{
 const prices=priceRows(93),s=snap(prices),now=s.quoteTs;
 const rt=new DemoTradingRuntime({enableVNext:true});
 assert.equal(rt.settings.engine,'automatic');
 const out=rt._signalValidationGate({analysis:{side:'WAIT'},snap:s,settings:rt.settings,now});
 const main=selectedForecast({settings:rt.settings,snap:s,now});
 assert.equal(out.allowed,false);
 assert.equal(out.analysis.vnext.engineId,'automatic');
 assert.equal(out.analysis.vnext.receipt?.side,main.receipt?.side);
 assert.equal(out.analysis.vnext.futureQualification,null);
 assert.equal(rt.settings.demoAutopilot,false);
 assert.ok(main.receipt, 'native Auto should compute its own forecast');
});
test('each pair actually calculates the main card forecast, not a side research flag',()=>{
 const prices=priceRows(3187),s=snap(prices),now=s.quoteTs;
 for(const p of PAIR_STRATEGIES){
  const settings={engine:p.id,asset:'EUR/USD OTC',orderDurationMs:180000};
  const direct=selectedForecast({settings,snap:s,now});
  assert.equal(direct.engineId,p.id);
  assert.deepEqual(direct.pairMembers,p.engines);
  assert.equal(direct.actionable,false);
  assert.equal(direct.calibrated,false);
  if(direct.receipt){
    assert.equal(direct.receipt.engineId,p.id);
    assert.equal(direct.receipt.expirySeconds,180);
    assert.equal(direct.receipt.targetAt,now+180000);
    assert.ok(['CALL','PUT'].includes(direct.receipt.side));
  }else{
    assert.equal(direct.computedStatus,'pair-disagreement');
    assert.equal(direct.operational.side,'AGUARDAR');
  }
  const rt=new DemoTradingRuntime({enableVNext:true});
  rt.patchSettings(settings);
  const out=rt._signalValidationGate({analysis:{side:'WAIT'},snap:s,settings:rt.settings,now});
  assert.equal(out.allowed,false);
  assert.equal(out.analysis.vnext.engineId,p.id);
  assert.equal(out.analysis.vnext.receipt?.side||null,direct.receipt?.side||null);
  assert.equal(out.analysis.vnext.combinedResearch,null);
  assert.equal(rt.settings.demoAutopilot,false);
  const matrix=forwardHorizonMatrix({settings,snap:s,now,primary:direct});
  assert.equal(matrix.rows.length,1,'combined calculations should not multiply irrelevant timeframes');
  assert.equal(matrix.entryRows.length,1);
  assert.equal(matrix.entryRows[0].engineId,p.id);
 }
});
test('a future quote cannot contaminate an issued pair forecast',()=>{
 const prices=priceRows(997),s=snap(prices),now=s.quoteTs;
 const future={ts:now+1000,price:40000};
 for(const p of PAIR_STRATEGIES){
  const cfg={engine:p.id,asset:'EUR/USD OTC',orderDurationMs:60000};
  const first=selectedForecast({settings:cfg,snap:s,now});
  const second=selectedForecast({settings:cfg,snap:{...s,quoteHistory:[...prices,future]},now});
  assert.deepEqual(first.receipt,second.receipt);
 }
});
test('UX exposes ONE selector per surface and no duplicate advanced research control card',()=>{
 const pc=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const mobile=readFileSync(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 const web=readFileSync(new URL('../sentinel-trading-lab/src/app/console/page.tsx',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 for(const p of PAIR_STRATEGIES){
  assert.ok(pc.includes('<option value="'+p.id+'"'));
  assert.ok(web.includes("['"+p.id+"'"));
  assert.ok(mobile.includes('PAIR_STRATEGIES.map'));
  assert.ok(worker.includes("'"+p.id+"'"));
 }
 assert.ok(pc.includes('data-sentinel-setting="engine"'));
 assert.ok(!pc.includes('data-sentinel-pair-settings'));
 assert.ok(!pc.includes('data-sentinel-setting="pairResearchEnabled"'));
 assert.ok(!web.includes('pairResearchEnabled===true'));
 assert.ok(!mobile.includes('<MobileExperimentalControls'));
 assert.ok(pc.includes('Detalhes da entrada futura'));
 assert.ok(pc.includes('data-sentinel-vnext-horizon-matrix'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {strategyHorizonAdvisor} from '../sentinel-trading-lab/agent/src/core/strategy-horizon-advisor.mjs';
import {threeMinuteGeneralResearch,generalHorizonResearch} from '../sentinel-trading-lab/agent/src/core/three-minute-general-research.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
function history(type='trend',length=1650){
 let p=1.1;return Array.from({length},(_,i)=>{
  p*=Math.exp(type==='trend'?.000011+Math.sin(i*.26)*.000002:
   type==='range'?(1.1-p)*.11+Math.sin(i*.14)*.00001:
   Math.sin(i*.03)*.000012);
  return {ts:T+i*1000,price:p};
 });
}
test('each of nine strategies receives a duration/context note; not an invented accuracy score',()=>{
 const q=history(),now=q.at(-1).ts;
 for(const h of [5,30,60,120,180,300,600,900]){
  const r=strategyHorizonAdvisor({settings:{engine:'price_action',strategyAdvisorMode:'manual',
    orderDurationMs:h*1000},quoteHistory:q,asOf:now});
  assert.equal(r.strategies.length,9);
  assert.deepEqual(r.strategies.map(x=>x.engineId),SCENARIO_ENGINES.map(x=>x.id));
  assert.equal(r.selectedEngine,'price_action');
  assert.equal(r.manualSelectionPreserved,true);
  assert.equal(r.strategySwitched,false);
  assert.equal(r.suggestedEngineId,null);
  assert.equal(r.requestedHoldingSeconds,h);
  assert.equal(r.calibrated,false);
  assert.equal(r.actionable,false);
  for(const item of r.strategies){assert.ok(item.description);assert.ok(item.interpretation)}
 }
});
test('advisor never consults prices after issuance',()=>{
 const q=history(),now=q.at(-1).ts;
 const settings={engine:'automatic',strategyAdvisorMode:'automatic_advisory',orderDurationMs:180000};
 const original=strategyHorizonAdvisor({settings,quoteHistory:q,asOf:now});
 const future=strategyHorizonAdvisor({settings,quoteHistory:[...q,
  {ts:now+1000,price:.001},{ts:now+180000,price:50}],asOf:now});
 assert.deepEqual(original,future);
 assert.equal(original.strategySwitched,false);
});
test('no historical regime: do not invent an automatic recommendation',()=>{
 const q=history().slice(-18),now=q.at(-1).ts;
 const r=strategyHorizonAdvisor({settings:{engine:'trend',strategyAdvisorMode:'automatic_advisory',
  orderDurationMs:180000},quoteHistory:q,asOf:now});
 assert.equal(r.status,'insufficient-market-context');
 assert.equal(r.recommended,null);
 assert.equal(r.suggestedEngineId,null);
});
test('selected horizon path comparison preserves original forecast and cannot send orders',()=>{
 const q=history(),now=q.at(-1).ts,snap={provider:'iq_option',quoteHistory:q,quoteTs:now};
 for(const h of [5,30,60,120,180,300,600,900]){
  const settings={engine:'automatic',orderDurationMs:h*1000,asset:'EUR/USD OTC'};
  const r=generalHorizonResearch({settings,snap,now});
  assert.equal(r.horizonSeconds,h);
  assert.equal(r.engineId,'automatic');
  assert.equal(r.actionable,false);
  assert.equal(r.calibrated,false);
  assert.equal(r.baselineUnmodified,true);
  assert.equal(r.probability,null);
  assert.ok(!r.confirmedSide||r.confirmedSide===r.baselineSide);
 }
 const defaults=threeMinuteGeneralResearch({settings:{engine:'automatic',orderDurationMs:30000,
  asset:'EUR/USD OTC'},snap,now});
 assert.equal(defaults.horizonSeconds,180);
});
test('runtime defaults remain OFF; optional research must not change main strategy',()=>{
 const q=history(),now=q.at(-1).ts;
 const rt=new DemoTradingRuntime({enableVNext:true});
 const snap={quoteHistory:q,quoteTs:now,price:q.at(-1).price,provider:'iq_option'};
 const base=rt._signalValidationGate({settings:rt.settings,analysis:{side:'WAIT'},snap,now});
 assert.equal(base.allowed,false);
 assert.equal(base.analysis.vnext.strategyAdvisor,null);
 assert.equal(base.analysis.vnext.generalFutureResearch,null);
 const before=base.analysis.vnext.receipt;
 rt.patchSettings({strategyAdvisorEnabled:true,futureResearchEnabled:true,
  strategyAdvisorMode:'automatic_advisory',orderDurationMs:180000,engine:'price_action'});
 const a=rt._signalValidationGate({settings:rt.settings,analysis:{side:'WAIT'},snap,now});
 assert.equal(a.allowed,false);
 assert.equal(a.analysis.vnext.strategyAdvisor.selectedEngine,'price_action');
 assert.equal(a.analysis.vnext.strategyAdvisor.strategySwitched,false);
 assert.equal(a.analysis.vnext.generalFutureResearch.horizonSeconds,180);
 assert.equal(a.analysis.vnext.generalFutureResearch.actionable,false);
 assert.equal(rt.settings.engine,'price_action');
 assert.equal(rt.settings.demoAutopilot,false);
 const b=rt._signalValidationGate({settings:rt.settings,analysis:{side:'WAIT'},snap,now});
 assert.strictEqual(a.analysis.vnext.strategyAdvisor,b.analysis.vnext.strategyAdvisor);
 assert.strictEqual(a.analysis.vnext.generalFutureResearch,b.analysis.vnext.generalFutureResearch);
});
test('both PC overlay and web console explain strategy suitability and experiment toggles',()=>{
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const web=readFileSync(new URL('../sentinel-trading-lab/src/app/console/page.tsx',import.meta.url),'utf8');
 assert.ok(worker.includes('data-sentinel-strategy-context'));
 assert.ok(worker.includes('Onde cada estratégia tende a ser mais útil'));
 assert.ok(worker.includes('PREVISÃO POR TRAJETÓRIA · EXPERIMENTAL'));
 assert.ok(web.includes('strategyAdvisorEnabled'));
 assert.ok(web.includes('strategyAdvisorMode'));
 assert.ok(web.includes('futureResearchEnabled'));
 assert.ok(web.includes('pairResearchEnabled'));
 assert.ok(web.includes('Duração da operação depois da entrada'));
 assert.ok(!worker.includes('MOTOR ATIVO'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {qualifyFutureDirection,applyQualifiedDisplay} from '../sentinel-trading-lab/agent/src/core/qualified-future-direction.mjs';
import {resolveForecastOwner} from '../sentinel-trading-lab/agent/src/core/effective-forecast-owner.mjs';
const T=1800000000000;
function quotes(n=1600){
 let x=1.1;
 return Array.from({length:n},(_,i)=>{
  x*=Math.exp(.000004*Math.sin(i*.03)+.000012*Math.sin(i*.31)+.000002);
  return {ts:T+i*1000,price:x};
 });
}
test('filter cannot see future ticks; baseline original remains audit target',()=>{
 const q=quotes(),now=q.at(-1).ts;
 const settings={engine:'automatic',asset:'EUR/USD OTC',orderDurationMs:180000};
 const snap={quoteHistory:q,quoteTs:now,provider:'iq_option'};
 const model=singleEngineForecast({settings,snap,now});
 const original=model.receipt;
 assert.ok(original);
 const first=qualifyFutureDirection({receipt:original,quoteHistory:q,asOf:now});
 const second=qualifyFutureDirection({receipt:original,quoteHistory:[...q,
  {ts:now+1000,price:200},{ts:now+180000,price:1e-4}],asOf:now});
 assert.deepEqual(first,second);
 assert.equal(first.calibrated,false);
 const view=applyQualifiedDisplay({model,qualification:first});
 if(!first.confirmed){
  assert.equal(view.receipt,null);
  assert.equal(view.operational.side,'AGUARDAR');
  assert.equal(view.plan,null);
 }
 assert.strictEqual(model.receipt,original);
});
test('runtime only filters when explicitly enabled and does not perform an order',()=>{
 const q=quotes(),now=q.at(-1).ts;
 const snap={provider:'iq_option',quoteTs:now,quoteHistory:q,price:q.at(-1).price};
 const rt=new DemoTradingRuntime({enableVNext:true});
 assert.equal(rt.settings.autoRoutingEnabled,false);
 assert.equal(rt.settings.futureSignalFilterEnabled,true);
 rt.patchSettings({futureSignalFilterEnabled:false});
 const old=rt._signalValidationGate({analysis:{side:'WAIT'},snap,settings:rt.settings,now});
 assert.equal(old.allowed,false);
 assert.equal(old.analysis.vnext.futureQualification,null);
 rt.patchSettings({futureSignalFilterEnabled:true});
 const qualified=rt._signalValidationGate({analysis:{side:'WAIT'},snap,settings:rt.settings,now});
 assert.equal(qualified.allowed,false);
 assert.equal(qualified.analysis.side,'WAIT');
 const state=qualified.analysis.vnext.futureQualification;
 assert.equal(state.enabled,true);
 assert.equal(qualified.analysis.vnext.receipt?.side||null,state.side);
 assert.equal(rt.settings.demoAutopilot,false);
 assert.ok(rt.vnextPending?.length>0,'original forecasts must remain available for honest backtesting');
 const disabled=resolveForecastOwner({settings:{engine:'automatic',orderDurationMs:180000},
  snap,now});
 assert.equal(disabled.switched,false);
});
test('manual forecast never filtered, even when auto filter flag is enabled',()=>{
 const rt=new DemoTradingRuntime({enableVNext:true});
 const q=quotes(),now=q.at(-1).ts;
 const snap={provider:'iq_option',quoteTs:now,quoteHistory:q};
 rt.patchSettings({engine:'trend',futureSignalFilterEnabled:true,autoRoutingEnabled:true});
 const output=rt._signalValidationGate({analysis:{side:'WAIT'},snap,settings:rt.settings,now});
 assert.equal(output.analysis.vnext.futureQualification,null);
 assert.equal(output.analysis.vnext.engineId,'trend');
 assert.equal(output.allowed,false);
});

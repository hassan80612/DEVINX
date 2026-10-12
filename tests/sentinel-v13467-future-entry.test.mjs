import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {forwardHorizonMatrix} from '../sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
const read=p=>readFile(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');
const now=1800000000000,asset='EUR/USD OTC';
const quoteHistory=Array.from({length:460},(_,i)=>({
  ts:now-(459-i)*1000,
  price:1.1+0.0000017*i+Math.sin(i/11)*0.00002+Math.sin(i/41)*0.00005
}));
const snap={quoteHistory,quoteTs:now,price:quoteHistory.at(-1).price,provider:'iq_option'};
test('every selected motor computes scheduled ENTRY at H and later outcome at 2H, not present-candle direction',()=>{
 for(const selected of SCENARIO_ENGINES){
   const settings={engine:selected.id,asset,orderDurationMs:30000};
   const matrix=forwardHorizonMatrix({settings,snap,now,
     primary:singleEngineForecast({settings,snap,now})});
   const plan=matrix.entryRows.find(r=>r.delaySeconds===30);
   assert.ok(plan,selected.id);
   if(plan.side){
     assert.ok(['CALL','PUT'].includes(plan.side));
     assert.equal(plan.entryAt,now+30000);
     assert.equal(plan.exitAt,now+60000);
     assert.equal(plan.holdingSeconds,30);
     assert.equal(plan.side,plan.projectedExitPrice>plan.projectedEntryPrice?'CALL':'PUT');
     assert.equal(plan.actionable,false);
     assert.equal(plan.calibrated,false);
     assert.ok(plan.projectedEntryPrice>0);
   }else assert.equal(plan.status,selected.id==='selective_forecast'?'waiting-selective-entry':'insufficient-future-evidence');
 }
});
test('scheduled entry uses TWO forecasts from same selected motor, not the spot-to-entry bias',()=>{
 const settings={engine:'mean_reversion',asset,orderDurationMs:30000};
 const forecasts=futureEntrySchedule({settings,snap,now,delays:[30]});
 const plan=forecasts[0];
 const entry=singleEngineForecast({settings,snap,now}).receipt;
 const exit=singleEngineForecast({settings:{...settings,orderDurationMs:60000},snap,now}).receipt;
 assert.equal(plan.projectedEntryPrice,entry?.projectedPrice??null);
 assert.equal(plan.projectedExitPrice,exit?.projectedPrice??null);
 assert.equal(plan.entryAt,now+30000);
 assert.equal(plan.exitAt,now+60000);
});
test('recorded CALL/PUT future-entry decision cannot flip during countdown',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.patchSettings({asset,engine:'automatic',orderDurationMs:30000,forecastHorizonSeconds:30});
 const initial=runtime._signalValidationGate({analysis:{},snap,settings:runtime.settings,now});
 const pinned=initial.analysis.vnext.futureEntryAnchor;
 assert.ok(pinned?.side);
 const reversed={...snap,quoteTs:now+2000,
   price:quoteHistory.at(-1).price-0.0001,
   quoteHistory:[...quoteHistory,{ts:now+2000,price:quoteHistory.at(-1).price-0.0001}]};
 const updated=runtime._signalValidationGate({analysis:{},snap:reversed,
   settings:runtime.settings,now:now+2000});
 assert.deepEqual(updated.analysis.vnext.futureEntryAnchor,pinned,
   'every new price may change the motor forecast but cannot rewrite a pinned prediction');
 assert.equal(updated.allowed,false);
 assert.equal(updated.analysis.operationalSignal.actionable,false);
});
test('PC and both mobile layouts take CALL/PUT from pinned future ENTRY only and preserve fixed clock',async()=>{
 const [pc,mobile,model,bridge]=await Promise.all([
   read('agent/worker/local-playwright-driver.mjs'),
   read('src/components/LiveScenarioCard.tsx'),
   read('src/lib/live-card-model.ts'),
   read('agent/worker/live-bridge.mjs')
 ]);
 assert.match(pc,/const pinnedEntry=d\.vnext\?\.futureEntryAnchor/);
 assert.match(pc,/data-deadline="\$\{scheduledAt\}"/);
 assert.match(pc,/ATÉ POSSÍVEL ENTRADA/);
 assert.match(pc,/scheduledDecision/);
 assert.doesNotMatch(pc,/const liveForecastReady=/);
 assert.match(mobile,/const futureEntry=m\.vnextFutureEntryAnchor/);
 assert.match(mobile,/data-testid="future-entry-decision"/);
 assert.match(mobile,/ATÉ POSSÍVEL ENTRADA/);
 assert.equal((mobile.match(/\{forecastReceipt\}/g)||[]).length,2);
 assert.match(mobile,/forecastHorizonStrip=vnext&&forecastMode!=='selective'\?<details/);
 assert.equal((mobile.match(/\{forecastHorizonStrip\}/g)||[]).length,2);
 assert.match(model,/vnextFutureEntryAnchor/);
 assert.match(bridge,/ea:entryTuple\(vnext\.futureEntryAnchor\)/);
 assert.match(bridge,/vnext:\{\.\.\.compactVnext,targetProjection:null,hm:\[\],hf:\[\],er:\[\]\}/);
});
test('the signed mobile snapshot never confuses forecast future entry with direct spot horizon',()=>{
 const settings={engine:'automatic',asset,orderDurationMs:30000};
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.patchSettings({...settings,forecastHorizonSeconds:30});
 const result=runtime._signalValidationGate({analysis:{},snap,settings:runtime.settings,now});
 const frame=analystSnapshot({settings:runtime.settings,agentVersion:'13.4.67',state:'running',
   lastEvalMs:now,lastResult:{asset,analysis:result.analysis}},{
     symbol:asset,validatedSymbol:asset,lastQuoteAt:now,quote:snap.price,
     assetValidated:true,analysisFeedValidated:true});
 const fitted=fitAnalystFrame(frame);
 assert.ok(fitted);
 assert.equal(fitted.lastResult.analysis.vnext.ea[0],30);
 assert.ok(['CALL','PUT'].includes(fitted.lastResult.analysis.vnext.ea[1]));
 assert.ok(Buffer.byteLength(JSON.stringify(fitted))+73<=3000);
});

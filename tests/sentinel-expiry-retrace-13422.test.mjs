import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';

test('a scenario expires once and requires a new price structure before reopening',()=>{
 const rt=new DemoTradingRuntime({scenarioPolicy:'closed-structure-v1'});
 Object.assign(rt.settings,{asset:'TEST',forecastHorizonSeconds:30,orderDurationMs:30000,futureDisplayThreshold:50});
 rt.settings.risk.minConfidence=55;
 const plan={rawBias:'CALL',callProbability:75,putProbability:25,confidence:80,outlookReady:true,directionReady:true,callInvalidation:95,callTrigger:101,entryTiming:{sourceBarAt:10000}};
 const call=(now,p=plan)=>rt._operationalSignalState({metrics:{},entryPlanner:{horizons:{30:p}}},{provider:'test',price:100,quoteTs:now,quoteHistory:[{ts:now,price:100}]},now).scenario;
 const first=call(10000);assert.equal(first.deadline,40000);
 const expired=call(40001);assert.equal(expired.id,first.id);assert.equal(expired.closed,true);assert.equal(expired.status,'JANELA ENCERRADA');
 assert.equal(call(41000).id,first.id);
 assert.equal(call(47000,{...plan,entryTiming:{sourceBarAt:46000}}).id,first.id,'a newer quote alone must not reopen');
 const next=call(48000,{...plan,callTrigger:102,entryTiming:{sourceBarAt:47000}});
 assert.notEqual(next.id,first.id);assert.equal(next.closed,false);assert.equal(next.deadline,78000);
});
test('expired forecast does not veto an independent qualified entry',()=>{
 const now=100000;
 const view=scenarioViewFromRuntime({operational:{asset:'TEST',forecastHorizonSeconds:30,durationMs:30000,
   scenario:{side:'CALL',createdAt:60000,deadline:90000,closed:true,status:'JANELA ENCERRADA'},
   side:'PUT',state:'ENTRADA',ready:true,actionable:true,createdAt:93000,
   activeUntil:101000,entryWindowEndAt:101000,entryAnalyst:{independent:true,qualification:{allowed:true}}},
   asset:'TEST',horizonSeconds:30,durationMs:30000,now});
 assert.equal(view.closed,true);assert.equal(view.hasSetup,false);assert.equal(view.deadline,null);
 assert.equal(view.state,'JANELA ENCERRADA');assert.equal(view.canEnter,true);
});
test('changing expiration synchronizes forecast and expired message is highlighted',async()=>{
 const worker=await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const overlay=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(worker,/orderDurationMs:n,forecastHorizonSeconds:n\/1000/);
 assert.match(overlay,/el\.dataset\.plannerHorizon=String\(seconds\)/);
 assert.match(overlay,/00:00 · ENCERRADO/);
 assert.match(overlay,/PRAZO ENCERRADO · ESPERE NOVA ESTRUTURA/);
});

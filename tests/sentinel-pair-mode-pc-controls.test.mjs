import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {RESEARCH_PAIRS} from '../sentinel-trading-lab/agent/src/core/paired-entry-research.mjs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
test('PC and console share exactly three experimental two-strategy choices',()=>{
 const worker=read('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
 const server=read('../sentinel-trading-lab/agent/worker/index.mjs');
 const console=read('../sentinel-trading-lab/src/app/console/page.tsx');
 assert.equal(RESEARCH_PAIRS.length,3);
 for(const pair of RESEARCH_PAIRS){
  assert.ok(worker.includes('<option value="'+pair.id+'"'));
  assert.ok(console.includes('<option value="'+pair.id+'"'));
  assert.ok(server.includes("'"+pair.id+"'"));
  assert.notEqual(pair.first.engine,pair.second.engine);
 }
 assert.ok(worker.includes('⚙ Opções de previsão'));
 assert.ok(worker.includes('Duração da operação independente da entrada'));
 assert.ok(worker.includes('data-sentinel-preserve-open="1" data-sentinel-no-drag'));
 assert.ok(server.includes("['pairResearchEnabled','futureResearchEnabled','strategyAdvisorEnabled','autoRoutingEnabled','futureSignalFilterEnabled']"));
 assert.ok(server.includes("runtime.patchSettings({[key]:value===true||String(value)==='true'}"));
});
test('PC overlay settings map to independently validated runtime fields',()=>{
 const index=read('../sentinel-trading-lab/agent/worker/index.mjs');
 for(const name of ['pairResearchId','entryTimeMode','entryLeadSeconds',
  'holdingSeconds','strategyAdvisorEnabled','strategyAdvisorMode',
  'futureResearchEnabled'])assert.ok(index.includes("'"+name+"'"));
 const runtime=new DemoTradingRuntime({enableVNext:true});
 assert.equal(runtime.settings.pairResearchEnabled,false);
 assert.equal(runtime.settings.futureResearchEnabled,false);
 assert.equal(runtime.settings.strategyAdvisorEnabled,false);
 assert.equal(runtime.settings.demoAutopilot,false);
 for(const pair of RESEARCH_PAIRS){
  runtime.patchSettings({pairResearchEnabled:true,pairResearchId:pair.id,
    entryTimeMode:'fixed',entryLeadSeconds:30,holdingSeconds:180,
    strategyAdvisorEnabled:true,strategyAdvisorMode:'automatic_advisory'});
  assert.equal(runtime.settings.pairResearchId,pair.id);
  assert.equal(runtime.settings.engine,'automatic');
  assert.equal(runtime.settings.demoAutopilot,false);
  assert.equal(runtime.settings.holdingSeconds,180);
 }
});

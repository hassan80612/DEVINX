import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

test('motor and selected-expiry changes retain prior observed outcomes without Supabase',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.vnextOutcomes=[{engineId:'automatic',expirySeconds:30,correct:true},{engineId:'price_action',expirySeconds:15,correct:false}];
 runtime.vnextPending=[{engineId:'automatic',targetAt:1800000000000}];
 runtime.patchSettings({engine:'price_action',orderDurationMs:15000});
 assert.equal(runtime.vnextOutcomes.length,2);
 assert.equal(runtime.vnextPending.length,1);
 runtime.patchSettings({asset:'USD/JPY OTC'});
 assert.deepEqual(runtime.vnextOutcomes,[]);
 assert.deepEqual(runtime.vnextPending,[]);
});
test('15-minute forecast storage is not silently discarded by short-expiry FIFO',async()=>{
 const s=await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(s,/this\.vnextPending=rest\.slice\(-1200\)/);
 assert.match(s,/now-Number\(x\.issuedAt\)<1000/);
});
test('new desktop has restored three light CALL PUT cards but old strategy voters stay hidden',async()=>{
 const s=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const start=s.indexOf('const nextHtml=d.engine?');
 assert.ok(start>=0);
 const view=s.slice(start,start+14000);
 assert.match(view,/LEITURAS CALL \/ PUT · AO VIVO/);
 assert.match(view,/MERCADO AGORA|d\.vnext\?\.cards/);
 assert.match(view,/Pressão técnica, NÃO taxa de acerto/);
 assert.match(view,/Os 3 cards são somente indicadores visuais/);
 assert.match(view,/data-sentinel-setting="engine"/);
 assert.match(view,/data-sentinel-setting="duration"/);
 assert.doesNotMatch(view,/Estratégia 1/);
});
test('PC frame urgent switch includes the selected motor and expiry',async()=>{
 const s=await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(s,/runtime\.settings\.engine,runtime\.settings\.orderDurationMs/);
 assert.match(s,/liveForecast\?\.side/);
});

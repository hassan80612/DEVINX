import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=p=>readFile(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');
test('mobile compact and full card contain the SAME selected single engine and future-price receipt',async()=>{
 const s=await source('src/components/LiveScenarioCard.tsx');
 assert.match(s,/const engineSettings=vnext/);
 assert.match(s,/const forecastReceipt=vnext/);
 assert.ok((s.match(/\{engineSettings\}/g)||[]).length===2);
 assert.ok((s.match(/\{forecastReceipt\}/g)||[]).length===2);
 assert.match(s,/Motor responsável pelo cenário/);
 assert.match(s,/Expiração escolhida para previsão/);
 assert.match(s,/PREÇO (PROJETADO|DA ÚLTIMA PROJEÇÃO)/);
 assert.match(s,/(ALVO NO FUTURO|HORÁRIO DO ALVO FIXADO)/);
 assert.match(s,/!vnext&&<details className="liveSettings"/);
});
test('desktop Agent selects only one motor and displays the target price/time rather than 3-strategy cards',async()=>{
 const s=await source('agent/worker/local-playwright-driver.mjs');
 const v=s.slice(s.indexOf('const nextHtml=d.engine?'),s.indexOf('const nextHtml=d.engine?')+18000);
 assert.match(v,/data-sentinel-setting="engine"/);
 assert.match(v,/data-sentinel-setting="duration"/);
 assert.match(v,/PREÇO PROJETADO/);
 assert.match(v,/PROJEÇÃO FUTURA/);
 assert.match(v,/PREVISÃO EXPERIMENTAL/);
 assert.doesNotMatch(v,/Estratégia 1/);
 assert.doesNotMatch(v,/Estratégia 2/);
 assert.doesNotMatch(v,/Estratégia 3/);
});
test('site Strategies page no longer configures three independent slots',async()=>{
 const s=await source('src/app/console/page.tsx');
 const block=s.slice(s.indexOf('function Strategies('),s.indexOf('function Risk('));
 assert.match(block,/engine:e\.target\.value/);
 assert.match(block,/Somente o motor escolhido/);
 assert.doesNotMatch(block,/strategygrid/);
});
test('overlay Worker supports Blitz 5s and never silently changes expiry from broker reads',async()=>{
 const s=await source('agent/worker/index.mjs');
 assert.match(s,/\[5000,10000,15000,30000,45000,60000/);
 assert.match(s,/engine:String\(value\)/);
 assert.match(s,/orderDurationMs:n,forecastHorizonSeconds:Math\.round\(n\/1000\)/);
 assert.match(s,/vnext:a\.vnext\|\|null/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');

test('one clock in normal and floating mobile cards, not two overlapping clocks',async()=>{
 const s=await read('src/components/LiveScenarioCard.tsx');
 assert.equal((s.match(/data-testid="forecast-countdown-clock"/g)||[]).length,1);
 assert.equal((s.match(/data-testid="forecast-fixed-countdown"/g)||[]).length,0);
 assert.equal((s.match(/\{forecastReceipt\}/g)||[]).length,2);
 assert.match(s,/const clockForecast=m\.vnextTargetAnchor\|\|liveForecast/);
 assert.match(s,/Math\.ceil\(\(forecastTargetAt-now\)\/1000\)/);
 assert.match(s,/CONTAGEM DA RODADA/);
 assert.match(s,/HORÁRIO FIXO DA RODADA/);
 assert.match(s,/ENCERRADO/);
 assert.match(s,/PROJEÇÃO AO VIVO/);
});
test('Agent independently pins display clock to original forecast without gating its live model',async()=>{
 const s=await read('agent/src/core/runtime.mjs');
 assert.match(s,/const model=singleEngineForecast\(\{settings,snap,now\}\)/);
 assert.match(s,/const previousAnchor=this\.vnextTargetAnchor\|\|null/);
 assert.match(s,/Number\(previousAnchor\.targetAt\)>now/);
 assert.doesNotMatch(s,/current\.side===previousAnchor\.side/); // do not restart the clock when the live market direction flips
 assert.match(s,/vnext:\{\.\.\.model,evaluation:undefined,targetAnchor/);
 const bridge=await read('agent/worker/live-bridge.mjs');
 assert.match(bridge,/targetAnchor:vnext\.targetAnchor\?take/);
});
test('Windows PC countdown ticks locally without extra analysis, broker polling or network',async()=>{
 const s=await read('agent/worker/local-playwright-driver.mjs');
 assert.equal((s.match(/data-sentinel-vnext-clock-value/g)||[]).length,3); // markup, ticker, DOM reconciliation guard
 assert.match(s,/data-deadline="\$\{Number\(pinnedReceipt\?\.targetAt\|\|0\)\}"/);
 assert.match(s,/const tickTargetClock=\(\)=>/);
 assert.match(s,/target-Date\.now\(\)/);
 assert.match(s,/window\.setInterval\(\(\)=>/);
 assert.match(s,/shown='00:00'/);
 assert.match(s,/data-sentinel-cycle-status/);
});

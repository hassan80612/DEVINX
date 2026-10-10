import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');

test('mobile normal and floating reuse the same fixed-height immediate observation and future projection',async()=>{
  const [card,css]=await Promise.all([read('src/components/LiveScenarioCard.tsx'),read('src/app/globals.css')]);
  assert.equal((card.match(/\{instantObservation\}/g)||[]).length,2);
  assert.equal((card.match(/\{forecastReceipt\}/g)||[]).length,2);
  assert.equal((card.match(/data-testid="vnext-immediate-observation"/g)||[]).length,1);
  assert.equal((card.match(/data-testid="forecast-countdown-clock"/g)||[]).length,1);
  assert.match(card,/vnextCompactDirection/);
  assert.match(card,/LEITURA AGORA/);
  assert.match(card,/não é ordem/);
  assert.doesNotMatch(card,/PONTO DE ENTRADA OBSERVADO · PESQUISA EM DEMO/);
  assert.match(css,/\.liveScenario \.vnextInstantObservation\{[\s\S]*?height:94px;min-height:94px;max-height:94px/);
  assert.match(css,/\.liveScenario \.vnextFutureDirection\{height:27px;min-height:27px;max-height:27px/);
  assert.match(css,/\.liveScenarioCompact \.vnextTargetCountdown/);
  assert.match(css,/\.liveScenario \.vnextFutureReceipt\{/);
});

test('PC fixes the same dimensions, and changing CALL/PUT rewrites content without replacing the clock',async()=>{
  const pc=await read('agent/worker/local-playwright-driver.mjs');
  const section=pc.slice(pc.indexOf('const nextHtml=d.engine?'),pc.indexOf('const nextHtml=d.engine?')+18000);
  assert.match(section,/data-sentinel-card="immediate-market-observation"/);
  assert.match(section,/grid-template-rows:13px 24px 16px 16px/);
  assert.match(section,/height:88px;max-height:88px/);
  assert.match(section,/grid-template-rows:15px 26px 68px 47px 27px 25px/);
  assert.match(section,/height:26px;line-height:26px;font-size:18px/);
  assert.match(section,/data-sentinel-vnext-clock/);
  assert.match(section,/LEITURA AGORA/);
  assert.match(pc,/current\.matches\?\.\('details\[data-sentinel-preserve-open\]'\)/);
  assert.match(pc,/parent\.matches\?\.\('\[data-sentinel-vnext-clock-value\]'\)/);
  assert.doesNotMatch(section,/PONTO DE ENTRADA OBSERVADO · PESQUISA EM DEMO/);
});

test('the newly compact UI does not touch the prediction motor or its independent observed-market logic',async()=>{
  const [runtime,market]=await Promise.all([read('agent/src/core/runtime.mjs'),read('agent/src/core/immediate-market-observation.mjs')]);
  assert.match(runtime,/const model=singleEngineForecast\(\{settings,snap,now\}\)/);
  assert.match(runtime,/const detectedNow=observeImmediateMarket\(/);
  assert.match(market,/tradeAuthorization:false/);
});

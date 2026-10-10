import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {lightweightDashboard} from '../sentinel-trading-lab/agent/src/core/vnext-market-cards.mjs';
const read=p=>readFile(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');
const now=1800000000000;
const quotes=Array.from({length:200},(_,i)=>({ts:now-(199-i)*1000,price:1.1+Math.sin(i/7)*0.00003}));
const receipt=(side,price,issuedAt)=>({
  status:'forecast-created',engineId:'automatic',asset:'EUR/USD OTC',side,
  issuedAt,expirySeconds:30,targetAt:issuedAt+30000,
  referencePrice:1.1,projectedPrice:price
});
test('projected percentages really change with a new motor forecast, not a pinned historical receipt',()=>{
  const a=lightweightDashboard({quoteHistory:quotes,receipt:receipt('CALL',1.1005,now),now});
  const b=lightweightDashboard({quoteHistory:quotes,receipt:receipt('PUT',1.0996,now),now});
  assert.ok(a.projection.callPct>b.projection.callPct);
  assert.notEqual(a.projection.callPct,b.projection.callPct);
  assert.equal(a.cards[2].callPct,b.cards[2].callPct,
    'the two historic total cards must remain independent of the motor');
});
test('PC uses latest receipt and latest projection; never frozen targetProjection as the current percentage',async()=>{
  const s=await read('agent/worker/local-playwright-driver.mjs');
  const v=s.slice(s.indexOf('const nextHtml=d.engine?'),s.indexOf('const nextHtml=d.engine?')+18000);
  assert.match(s,/const liveReceipt=d\.vnext\?\.receipt\|\|null/);
  assert.match(s,/const liveProjection=liveForecastReady\?d\.vnext\?\.projection\|\|null:null/);
  assert.match(v,/liveProjection\.callPct/);
  assert.match(v,/liveProjection\.putPct/);
  assert.doesNotMatch(v,/pinnedProjection\.callPct/);
  assert.match(v,/PROJEÇÃO FUTURA EM ANÁLISE/);
  assert.match(v,/ALVO EM ANÁLISE/);
  assert.match(v,/data-sentinel-cycle-status/);
  assert.match(s,/shown='00:00'/);
  assert.doesNotMatch(s,/shown='ALVO ENCERRADO'/);
});
test('normal and floating mobile share live percent and same scenario-aligned now observation',async()=>{
  const s=await read('src/components/LiveScenarioCard.tsx');
  assert.match(s,/const liveProjection=liveForecastValid\?m\.vnextProjection:null/);
  assert.match(s,/const observation=liveForecastValid&&observed\?\.side===liveForecast\.side/);
  assert.match(s,/opposingObserved\?'Movimento atual contrário à projeção/);
  assert.match(s,/liveProjection\.callPct/);
  assert.match(s,/liveProjection\.putPct/);
  assert.match(s,/ALVO EM ANÁLISE/);
  assert.match(s,/forecastTargetPast\?'ALVO ENCERRADO':'CONTAGEM DA RODADA'/);
  assert.equal((s.match(/\{instantObservation\}/g)||[]).length,2);
  assert.equal((s.match(/\{forecastReceipt\}/g)||[]).length,2);
  assert.doesNotMatch(s,/pinnedProjection/);
});
test('no new motor vetoes, voting or fixed delay are inserted into the runtime',async()=>{
 const [runtime,bridge]=await Promise.all([read('agent/src/core/runtime.mjs'),read('agent/worker/live-bridge.mjs')]);
 assert.match(runtime,/const model=singleEngineForecast\(\{settings,snap,now\}\)/);
 assert.match(runtime,/vnext:\{\.\.\.model,evaluation:undefined,targetAnchor/);
 assert.match(bridge,/projection:vnext\.projection\?take/);
 assert.match(bridge,/targetAnchor:vnext\.targetAnchor\?take/);
});

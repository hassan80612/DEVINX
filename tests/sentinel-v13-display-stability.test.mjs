import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { DemoTradingRuntime } from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

test('strategy display percentages do not turn sparse one-sided evidence into fake 100%',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  const weak=rt._strategyPercentages(28,0);
  assert.ok(weak.callPct>55&&weak.callPct<75,JSON.stringify(weak));
  assert.equal(weak.putPct,100-weak.callPct);
  const strong=rt._strategyPercentages(100,0);
  assert.ok(strong.callPct>=80&&strong.callPct<=95,JSON.stringify(strong));
  assert.ok(strong.putPct>=5);
});

test('future stability damps one-cycle direction flips and keeps horizons independent',()=>{
  const rt=new DemoTradingRuntime({seed:14,balance:10000});
  const t=Date.now();
  const first=rt._stabilizeForecast({asset:'GOLD',seconds:30,callPct:78,putPct:22,bias:'CALL',now:t});
  assert.equal(first.side,'CALL');
  const oneFlip=rt._stabilizeForecast({asset:'GOLD',seconds:30,callPct:25,putPct:75,bias:'PUT',now:t+1000});
  assert.notEqual(oneFlip.side,'PUT','one opposite cycle should not immediately flip CALL to PUT');
  const long=rt._stabilizeForecast({asset:'GOLD',seconds:900,callPct:80,putPct:20,bias:'CALL',now:t});
  const longFlip=rt._stabilizeForecast({asset:'GOLD',seconds:900,callPct:20,putPct:80,bias:'PUT',now:t+1000});
  assert.ok(longFlip.callPct>20,'15m horizon should smooth more than the new raw tick');
  assert.notEqual(longFlip.side,'PUT');
});

test('premium overlay has thresholds on every total and no fake scenario refresh button',async()=>{
  const driver=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  const worker=await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
  for(const key of ['data-sentinel-market-threshold','data-sentinel-strategy-threshold','data-sentinel-op-threshold','data-sentinel-average-threshold']){
    assert.ok(driver.includes(key),key);
  }
  assert.ok(driver.includes('MÉDIA DOS 3 TOTAIS'));
  assert.ok(driver.includes('sentinel-future-decision-v13|'));
  assert.ok(driver.includes('ANÁLISE EM ANDAMENTO'));
  assert.ok(driver.includes('AGUARDE O SINAL DE ENTRADA'));
  assert.ok(driver.includes('ownSignal.actionable===true'));
  assert.ok(driver.includes('data-sentinel-subanalyst-status'));
  assert.ok(!driver.includes('PARA ENTRADA AGORA'));
  assert.ok(!driver.includes('DECISÃO TRAVADA'));
  assert.ok(!driver.includes('data-sentinel-action="refreshScenario"'));
  assert.ok(!worker.includes("if(action==='refreshScenario')"));
});

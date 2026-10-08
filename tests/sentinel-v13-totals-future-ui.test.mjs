import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { DemoTradingRuntime } from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

test('V13 total cards expose independent visual thresholds and a non-execution average card', async()=>{
  const driver=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  assert.match(driver,/data-sentinel-market-threshold/);
  assert.match(driver,/data-sentinel-strategy-threshold/);
  assert.match(driver,/data-sentinel-op-threshold/);
  assert.match(driver,/data-sentinel-average-threshold/);
  assert.match(driver,/MÉDIA DOS 3 TOTAIS/);
  assert.match(driver,/CONF MÉDIA/);
  assert.match(driver,/PRÓXIMO PASSO/);
  assert.match(driver,/sentinel-future-decision-v13/);
  assert.match(driver,/ANÁLISE EM ANDAMENTO/);
  assert.match(driver,/AGUARDE O SINAL DE ENTRADA/);
  assert.match(driver,/data-sentinel-subanalyst-status/);
  assert.doesNotMatch(driver,/data-sentinel-entry-action/);
  assert.doesNotMatch(driver,/PREVISÃO .* PARA ENTRADA AGORA/);
  assert.doesNotMatch(driver,/DECISÃO TRAVADA/);
});

test('ineffective scenario refresh is removed without touching normal broker refresh', async()=>{
  const driver=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  const worker=await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(driver,/data-sentinel-action="refreshScenario"/);
  assert.doesNotMatch(worker,/action==='refreshScenario'/);
  assert.match(worker,/action==='refresh'/);
});

test('future UI smoothing keeps raw forecast intact and reacts faster at short horizons',()=>{
  const rt=new DemoTradingRuntime({seed:13,balance:10000});
  rt.settings.asset='GOLD';

  const first={
    generalConsensus:{side:'CALL'},
    entryPlanner:{horizons:{
      '30':{bias:'CALL',rawCallProbability:80,rawPutProbability:20,callProbability:80,putProbability:20,modelConfidence:75,confidence:75,outlookReady:false,regime:{label:'trend'}},
      '900':{bias:'CALL',rawCallProbability:80,rawPutProbability:20,callProbability:80,putProbability:20,modelConfidence:75,confidence:75,outlookReady:false,regime:{label:'trend'}}
    }}
  };
  rt._mergeScenarioConfluence(first,{cards:[]},{price:4200},100000);
  assert.equal(first.entryPlanner.horizons['30'].displayCallProbability,80);
  assert.equal(first.entryPlanner.horizons['900'].displayCallProbability,80);

  const second={
    generalConsensus:{side:'PUT'},
    entryPlanner:{horizons:{
      '30':{bias:'PUT',rawCallProbability:40,rawPutProbability:60,callProbability:40,putProbability:60,modelConfidence:72,confidence:72,outlookReady:false,regime:{label:'reversal'}},
      '900':{bias:'PUT',rawCallProbability:40,rawPutProbability:60,callProbability:40,putProbability:60,modelConfidence:72,confidence:72,outlookReady:false,regime:{label:'reversal'}}
    }}
  };
  rt._mergeScenarioConfluence(second,{cards:[]},{price:4198},101000);

  const short=second.entryPlanner.horizons['30'];
  const long=second.entryPlanner.horizons['900'];
  assert.equal(short.callProbability,40);
  assert.equal(long.callProbability,40);
  assert.ok(short.displayCallProbability<80&&short.displayCallProbability>40);
  assert.ok(long.displayCallProbability<80&&long.displayCallProbability>40);
  assert.ok(short.displayCallProbability<long.displayCallProbability,'30s display should react faster than 15m');
});

test('strategy cards aggregate independent future horizons instead of present-only scores', async()=>{
  const runtime=await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
  assert.match(runtime,/futureByHorizon/);
  assert.match(runtime,/entryPlanner\?\.horizons/);
  assert.match(runtime,/projectionHorizonSeconds/);
  assert.match(runtime,/strategyFutureBias/);
  assert.match(runtime,/strategyBlend/);
});


test('three-total average sits immediately after the future scenario and before the total cards', async()=>{
  const driver=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  const future=driver.indexOf('data-sentinel-card="horizon"');
  const average=driver.indexOf('data-sentinel-summary="average-total"');
  const totals=driver.indexOf('>TOTAIS</div>',future);
  assert.ok(future>=0&&average>future&&totals>average,{future,average,totals});
});

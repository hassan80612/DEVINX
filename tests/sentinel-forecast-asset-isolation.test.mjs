import test from 'node:test';
import assert from 'node:assert/strict';

import { LocalPlaywrightDriver, instrumentLabel } from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import { DemoTradingRuntime } from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import { analyzeMarket } from '../sentinel-trading-lab/agent/src/core/strategy.mjs';

test('Sentinel isolates Gold from the previous asset and keeps future bias separate from entry timing', () => {
  assert.equal(instrumentLabel('Gold Blitz'), 'Gold');
  assert.equal(instrumentLabel('front.com'), null);
  assert.equal(instrumentLabel('new-web-loading-screen'), null);

  const driver = new LocalPlaywrightDriver({ dataDir: 'sentinel-trading-lab/agent/worker/data/test-gold-isolation' });
  const st = driver.state('iq_option');

  st.uiSymbol = 'EUR/USD';
  st.symbol = 'EUR/USD';
  st.activeId = 1;
  st.activeMap.set('EURUSD', 1);
  st.candles = [{ from: 1, to: 2, open: 1, high: 1.1, low: 0.9, close: 1 }];
  st.quote = 1.11702;
  st.quoteHistory = [{ ts: Date.now(), price: 1.11702 }];
  st.lastQuoteAt = Date.now();
  st.lastCandleAt = Date.now();

  assert.equal(driver.applyActiveSelection('iq_option', { symbol: 'Gold', source: 'click' }), true);
  assert.equal(st.uiSymbol, 'Gold');
  assert.equal(st.symbol, 'Gold');
  assert.equal(st.candles.length, 0);
  assert.equal(st.quote, null);
  assert.equal(st.quoteHistory.length, 0);

  st.uiSymbolSource = 'dom-active';
  st.lastUiSignalAt = Date.now();
  driver.ingest(
    'iq_option',
    JSON.stringify({ name: 'sendMessage', msg: { name: 'get-candles', body: { active_id: 1912, size: 60 } } }),
    'page-out'
  );

  assert.equal(st.activeMap.get('GOLD'), 1912);
  assert.equal(st.activeId, 1912);
  assert.equal(st.pageActiveId, 1912);

  const runtime = new DemoTradingRuntime({ seed: 7, balance: 10000 });
  runtime.settings.asset = 'EUR/USD';
  runtime.lastResult = {
    asset: 'EUR/USD',
    analysis: {
      entryPlanner: {
        horizons: {
          '60': { asset: 'EUR/USD', callTrigger: 1.1162, putTrigger: 1.1173 }
        }
      }
    }
  };

  runtime.setExternalMarket({
    provider: 'iq_option',
    symbol: 'Gold',
    uiSymbol: 'Gold',
    quote: 4132.858,
    candles: [],
    quoteHistory: [],
    feedValidated: false
  });

  assert.equal(runtime.settings.asset, 'GOLD');
  assert.equal(runtime.lastResult.asset, 'GOLD');
  assert.equal(runtime.lastResult.analysis.entryPlanner, undefined);

  runtime.settings.asset = 'GOLD';
  const foreign = runtime._operationalSignalState({
    generalConsensus: { side: 'CALL', state: 'ALINHADO', strength: 70, edge: 20 },
    quality: {},
    entryPlanner: {
      horizons: {
        '60': {
          asset: 'EUR/USD',
          bias: 'CALL',
          rawBias: 'CALL',
          confidence: 80,
          outlookReady: true,
          callTrigger: 1.1162,
          putTrigger: 1.1173
        }
      }
    }
  }, { price: 4132.858 }, Date.now());

  assert.equal(foreign.trigger, null);
  assert.match(foreign.reason, /Aguardando preço e previsão/);

  const future = {
    generalConsensus: { side: 'PUT' },
    entryPlanner: {
      horizons: {
        '60': {
          bias: 'CALL',
          confidence: 62,
          modelConfidence: 62,
          outlookReady: true,
          callProbability: 64,
          putProbability: 36
        }
      }
    }
  };

  runtime._mergeScenarioConfluence(future, { cards: [] }, { price: 4132.858 }, Date.now());

  assert.equal(future.entryPlanner.horizons['60'].asset, 'GOLD');
  assert.equal(future.entryPlanner.horizons['60'].executionBias, 'CALL');
  assert.equal(future.entryPlanner.horizons['60'].entryAligned, false);
});

test('Sentinel future engine exposes direction by horizon without pretending it is an entry confirmation', () => {
  const now = Date.now();
  const base = Math.floor(now / 1000) - 120 * 60;
  const candles = Array.from({ length: 120 }, (_, i) => {
    const open = 4100 + i * 0.25;
    const close = open + 0.16;
    return {
      from: base + i * 60,
      to: base + (i + 1) * 60,
      open,
      high: close + 0.08,
      low: open - 0.07,
      close,
      volume: 100 + i
    };
  });

  const last = candles.at(-1).close;
  const quoteHistory = Array.from({ length: 40 }, (_, i) => ({
    ts: now - 39000 + i * 1000,
    price: last - 0.8 + i * 0.022
  }));

  const analysis = analyzeMarket({
    candles,
    quoteHistory,
    strategy: 'trend',
    minConfidence: 70,
    durationMs: 60000,
    freshnessMs: 5000,
    quoteTs: now,
    now
  });

  const plan = analysis.entryPlanner.horizons['60'];

  assert.equal(plan.outlookReady, true);
  assert.ok(plan.callProbability > plan.putProbability);
  assert.equal(plan.bias, 'CALL');
  assert.equal(typeof plan.directionReady, 'boolean');
  assert.match(plan.basis, /independente do consenso atual/);
});

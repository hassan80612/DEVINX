import test from 'node:test';
import assert from 'node:assert/strict';

import { DemoTradingRuntime } from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import { analyzeMarket } from '../sentinel-trading-lab/agent/src/core/strategy.mjs';

test('Sentinel clears old forecast state when runtime asset changes', () => {
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
});

test('Sentinel rejects a planner from another asset in the operational signal', () => {
  const runtime = new DemoTradingRuntime({ seed: 8, balance: 10000 });
  runtime.settings.asset = 'GOLD';

  const result = runtime._operationalSignalState({
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

  assert.equal(result.trigger, null);
  assert.match(result.reason, /Aguardando preço e previsão/);
});

test('Future direction stays independent from current entry consensus', () => {
  const runtime = new DemoTradingRuntime({ seed: 9, balance: 10000 });
  runtime.settings.asset = 'GOLD';

  const analysis = {
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

  runtime._mergeScenarioConfluence(analysis, { cards: [] }, { price: 4132.858 }, Date.now());
  const plan = analysis.entryPlanner.horizons['60'];

  assert.equal(plan.asset, 'GOLD');
  assert.equal(plan.executionBias, 'CALL');
  assert.equal(plan.entryAligned, false);
});

test('Future engine exposes a directional horizon separately from entry readiness', () => {
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

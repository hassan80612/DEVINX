import test from 'node:test';
import assert from 'node:assert/strict';
import { compactRemoteState } from '../sentinel-trading-lab/agent/worker/remote-status.mjs';

test('limits remote payload without mutating trading engine buffers', () => {
  const reasons = ['sample'];
  const entries = Array.from({length: 50}, (_,i) => ({
    ts: i+1, side: 'BUY', confidence: 81, reasons, metrics: {history: 'x'.repeat(8000)}
  }));
  const candles = Array.from({length: 1000}, (_,i) => ({open:i,close:i+1,volume:10}));
  const quotes = Array.from({length: 2000}, (_,i) => ({price:i,time:i}));
  const market = {symbol:'EURUSD', candles, quoteHistory:quotes, assets:Array(500).fill('EURUSD')};
  const input = {
    state:'running', lastResult:{analysis:{confidence:81}}, recentAnalyses:entries,
    brokers:{iq_option:{connected:true,marketData:market}}, liveBroker:market,
    entryResearch:{samples:100,byContext:{heavy:'y'.repeat(30000)}}
  };
  const out=compactRemoteState(input);
  assert.equal(out.state,'running');
  assert.equal(out.lastResult,input.lastResult);
  assert.equal(out.recentAnalyses.length,6);
  assert.ok(out.recentAnalyses[0].metrics);
  assert.equal(out.recentAnalyses[1].confidence,81);
  assert.equal('metrics' in out.recentAnalyses[1],false);
  assert.equal(out.liveBroker.candles.length,40);
  assert.equal(out.liveBroker.quoteHistory.length,40);
  assert.equal(out.brokers.iq_option.marketData.assets.length,80);
  assert.equal(out.entryResearch.samples,100);
  assert.equal('byContext' in out.entryResearch,false);
  assert.equal(input.recentAnalyses.length,50);
  assert.equal(input.liveBroker.candles.length,1000);
  assert.ok(JSON.stringify(out).length < JSON.stringify(input).length * 0.15);
});

test('handles offline/empty remote data safely', () => {
  assert.deepEqual(compactRemoteState(null),{});
  const state={recentAnalyses:[],liveBroker:null,brokers:null};
  assert.deepEqual(compactRemoteState(state),state);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './fixtures/executor-13946.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

test('Stop Loss is absolute account floor: 50 start, 30 target => stop at balance 30',async()=>{
 const x=setup();x.balance(50);
 x.bot.configure({amount:1,stopLoss:30,stopWin:0});
 await x.bot.start();
 assert.equal(x.bot.initialBalance,50);
 assert.equal(x.bot.status().lossLimitRemaining,20);
 x.bot.net=-19;x.bot.watch();
 assert.equal(x.bot.enabled,true);
 assert.equal(x.bot.status().lossLimitRemaining,1);
 x.bot.net=-20;x.bot.watch();
 assert.equal(x.bot.enabled,false);
 assert.match(x.bot.message,/stop-loss/i);
});
test('Stop Win is absolute target: 50 start, 70 target => stop at balance 70',async()=>{
 const x=setup();x.balance(50);
 x.bot.configure({amount:1,stopLoss:0,stopWin:70});
 await x.bot.start();
 x.bot.net=19;x.bot.watch();assert.equal(x.bot.enabled,true);
 x.bot.net=20;x.bot.watch();assert.equal(x.bot.enabled,false);
 assert.match(x.bot.message,/Stop Win/);
});
test('Stop Loss protects next stake against crossing absolute floor',async()=>{
 const x=setup();x.balance(50);x.bot.configure({amount:21,stopLoss:30});
 await x.bot.start();
 assert.equal(x.bot.status().lossLimitRemaining,20);
 await x.fire();
 assert.equal(x.calls.length,0);
 assert.equal(x.bot.enabled,false);
});
test('Stop Win/Stop Loss are per-session and use captured opening broker balance',async()=>{
 const x=setup();x.balance(100);x.bot.configure({amount:1,stopLoss:80,stopWin:110});
 await x.bot.start();
 assert.equal(x.bot.status().lossLimitRemaining,20);
 x.balance(95);
 x.bot.watch();
 assert.equal(x.bot.status().lossLimitRemaining,20,'do not recalculate floor from a delayed broker-balance display');
});
test('no page-socket candle-history fallbacks may reset IQ Option or Exnova expiry',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const segment=source.slice(source.indexOf('async _requestCandles('),source.indexOf('async requestQuoteHistory('));
 assert.ok(segment.length>100);
 assert.doesNotMatch(segment,/await this\.wsSend\(provider,modern\)/);
 assert.doesNotMatch(segment,/await this\.wsSend\(provider,legacy\)/);
 for(const provider of ['iq_option','exnova']){
  const driver=new LocalPlaywrightDriver(),st=driver.state(provider);
  st.candleSize=60;st.expirationDurationMs=120000;
  driver.setPredictionPeriod(provider,null);
  assert.equal(st.predictionPeriod,null);
  assert.equal(st.candleSize,60);
  assert.equal(st.expirationDurationMs,120000);
 }
});
test('mobile strategy/duration layout aligns without changing timing logic',()=>{
 const css=readFileSync(new URL('../sentinel-trading-lab/src/app/globals.css',import.meta.url),'utf8');
 assert.match(css,/Mobile: strategy and expiry selectors share a clean aligned row/);
 assert.match(css,/grid-template-columns: minmax\(0,1fr\) minmax\(0,1fr\)!important/);
 assert.match(css,/vnextEngineToolbar label:first-child > small/);
});

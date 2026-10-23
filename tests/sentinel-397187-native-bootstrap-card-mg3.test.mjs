import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {SignalExecutor, MAX_MARTINGALE_LEVELS} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
import {readFileSync} from 'node:fs';

for(const provider of ['iq_option','exnova']){
 test(provider+': native traderoom cold-start requests metadata, never rewrites market duration',async()=>{
   const driver=new LocalPlaywrightDriver({dataDir:'unused-cold-start-test'});
   driver.sessions.set(provider,{page:{isClosed:()=>false}});
   const state=driver.state(provider),sent=[];
   state.candleSize=120;state.expirationDurationMs=120000;state.expirationRaw='2m';
   driver.wsSend=async(_provider,payload)=>{sent.push(payload);return {ok:true}};
   assert.equal(await driver.requestBaseData(provider),true);
   assert.deepEqual(sent.map(p=>p.msg.name),['get-initialization-data','get-balances']);
   assert.equal(await driver.requestBaseData(provider),false,'avoid repeated cold-start reconnect loop');
   assert.equal(sent.length,2);
   assert.equal(await driver._requestCandles(provider,{symbol:'EUR/USD OTC',activeId:76,force:true}),false);
   assert.equal(await driver.requestQuoteHistory(provider,{symbol:'EUR/USD OTC',activeId:76}),false);
   assert.equal(await driver.refreshPredictionHistory(provider),false);
   assert.equal(state.candleSize,120);
   assert.equal(state.expirationDurationMs,120000);
   assert.equal(state.expirationRaw,'2m');
   assert.equal(sent.filter(p=>/candle|subscribe|option|order/i.test(p.msg.name)).length,0);
   state.activeMap.set('EURUSDOTC',76);state.balance=50;
   assert.equal(await driver.requestBaseData(provider),true);
   assert.equal(sent.length,2,'healthy page does not generate new requests');
 });
 test(provider+': concurrency does not duplicate initialization messages',async()=>{
   const driver=new LocalPlaywrightDriver({dataDir:'unused-cold-start-test'});
   driver.sessions.set(provider,{page:{isClosed:()=>false}});
   let sends=0;
   driver.wsSend=async()=>{sends++;await Promise.resolve();return {ok:true}};
   const responses=await Promise.all(Array.from({length:6},()=>driver.requestBaseData(provider)));
   assert.ok(responses.every(Boolean));
   assert.equal(sends,2);
 });
}

test('Martingale refuses level 4 and cycles after the third losing increase',()=>{
 assert.equal(MAX_MARTINGALE_LEVELS,3);
 const bot=new SignalExecutor({context:()=>({durationMs:30000}),clock:()=>Date.now()});
 bot.configure({martingaleLevels:3,martingaleMultiplier:2,martingaleEnabled:true,amount:1});
 assert.throws(()=>bot.configure({martingaleLevels:4}),/inválida/);
 assert.deepEqual([0,1,2,3].map(level=>{bot.martingaleLevel=level;return bot.nextClicks()}),[1,2,4,8]);
 bot.martingaleLevel=3;
 bot.applyCompletedSequence({orders:[{settled:true}],clickCount:1,netPnl:-8,martingaleLevel:3});
 assert.equal(bot.martingaleLevel,0);
 assert.equal(bot.nextClicks(),1);
});
test('compact top bot controls and visible 3-level ceiling preserve original bot panel',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(src,/data-sentinel-executor-action="start"/);
 assert.match(src,/data-sentinel-executor-action="stop"/);
 assert.match(src,/visibleAnchor/);
 assert.match(src,/stableScrollTop\+delta/);
 const panel=executorPanel({config:{martingaleLevels:3,martingaleEnabled:true,martingaleMultiplier:2},
  provider:'exnova',history:[],sessionWins:0,sessionLosses:0},'pt');
 assert.match(panel,/max="3"/);
 assert.match(panel,/Máximo 3 níveis/);
 assert.match(panel,/data-sentinel-executor-action="start"/);
 assert.match(panel,/data-sentinel-executor-action="stop"/);
});

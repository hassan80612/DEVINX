import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {SignalExecutor, MAX_MARTINGALE_LEVELS} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
import {readFileSync} from 'node:fs';

for(const provider of ['iq_option','exnova']){
 test(provider+': native traderoom NEVER opens Agent-owned broker socket while restoring saldo or period',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'unused-cold-start-test'});
  driver.sessions.set(provider,{page:{isClosed:()=>false}});
  const state=driver.state(provider),sent=[];
  state.candleSize=120;state.expirationDurationMs=120000;state.expirationRaw='2m';
  driver.domSnapshot=async()=>({ok:true}); // read-only visible account text, no writes
  driver.wsSend=async(_provider,payload)=>{sent.push(payload);return{ok:true}};
  assert.equal(await driver.requestBaseData(provider),false,'unknown bank ID is not verified');
  assert.equal(await driver.requestBaseData(provider),false,'bounded retry without outbound writes');
  assert.equal(sent.length,0);
  assert.equal(await driver._requestCandles(provider,{symbol:'EUR/USD OTC',activeId:76,force:true}),false);
  assert.equal(await driver.requestQuoteHistory(provider,{symbol:'EUR/USD OTC',activeId:76}),false);
  assert.equal(await driver.refreshPredictionHistory(provider),false);
  assert.equal(state.candleSize,120);
  assert.equal(state.expirationDurationMs,120000);
  assert.equal(state.expirationRaw,'2m');
  state.activeMap.set('EURUSDOTC',76);
  driver.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:50}]},'page-in');
  assert.equal(await driver.requestBaseData(provider),true);
  assert.equal(sent.length,0,'confirmed account never sends initialization');
 });
 test(provider+': concurrent native startup shares one passive DOM read',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'unused-cold-start-test'});
  driver.sessions.set(provider,{page:{isClosed:()=>false}});
  let reads=0,sends=0;
  driver.domSnapshot=async()=>{reads++;await Promise.resolve();return{}};
  driver.wsSend=async()=>{sends++;return{ok:true}};
  const responses=await Promise.all(Array.from({length:6},()=>driver.requestBaseData(provider)));
  assert.ok(responses.every(x=>x===false));
  assert.equal(reads,1);
  assert.equal(sends,0);
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

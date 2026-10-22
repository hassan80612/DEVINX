import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {longHorizonDirection} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {readBrokerTradeStake} from '../sentinel-trading-lab/agent/worker/broker-trade-stake.mjs';

const T=1800000000000;
const context=()=>({state:'running',licensed:true,provider:'exnova',asset:'EUR/USD OTC',
 activeId:1,engine:'automatic',durationMs:30000,analysis:{},
 brokerBalance:{provider:'exnova',accountId:'demo',amount:1000,receivedAt:T,revision:1}});

test('stop win is based only on settlement from the broker and tracks each settled order once',async()=>{
 const c=context();
 const bot=new SignalExecutor({clock:()=>T,context:()=>c,driver:{prepare:async()=>({ready:true,amount:1})}});
 bot.configure({stopWin:3,stopLoss:15});await bot.start();
 const fake=(id)=>bot.ledger.set('exnova|'+id,{provider:'exnova',orderId:id,
   accountId:'demo',netPnl:0,source:'unresolved',sessionId:bot.sessionId,amount:1});
 fake('A');assert.equal(bot.settle({provider:'exnova',orderId:'A',accountId:'demo',
    source:'broker',netPnl:2}),true);
 assert.equal(bot.enabled,true);assert.equal(bot.sessionWins,1);assert.equal(bot.net,2);
 assert.equal(bot.settle({provider:'exnova',orderId:'A',accountId:'demo',
    source:'broker',netPnl:2}),false);
 fake('B');bot.settle({provider:'exnova',orderId:'B',accountId:'demo',source:'broker',netPnl:-1});
 assert.equal(bot.sessionLosses,1);assert.equal(bot.net,1);
 fake('C');bot.settle({provider:'exnova',orderId:'C',accountId:'demo',source:'broker',netPnl:3});
 assert.equal(bot.net,4);assert.equal(bot.sessionWins,2);assert.equal(bot.sessionLosses,1);
 assert.equal(bot.enabled,false);assert.match(bot.message,/Stop Win atingido/);
 bot.stop('manual',{reset:true});assert.equal(bot.sessionWins,0);assert.equal(bot.sessionLosses,0);
});

test('stop win never cuts a physically executing batch in half',async()=>{
 const c=context();
 const bot=new SignalExecutor({clock:()=>T,context:()=>c,driver:{prepare:async()=>({ready:true,amount:1})}});
 bot.configure({stopWin:2});await bot.start();bot.executing=true;
 bot.ledger.set('exnova|A',{provider:'exnova',orderId:'A',accountId:'demo',
  netPnl:0,source:'unresolved',sessionId:bot.sessionId,amount:1});
 bot.settle({provider:'exnova',orderId:'A',accountId:'demo',source:'broker',netPnl:3});
 assert.equal(bot.enabled,true);assert.match(bot.suspensionReason,/Stop Win/);
 bot.executing=false;bot.watch();assert.equal(bot.enabled,false);
});

test('risk adapter persists stopWin and discreet win/loss counts with old payload compatibility',()=>{
 const data=packExecutor({enabled:true,config:{amount:2,stopLoss:10,stopWin:25,
   martingaleLevels:2,directionMode:'automatic'},sessionWins:5,sessionLosses:3});
 const decoded=unpackExecutor(data);
 assert.equal(decoded.config.stopWin,25);assert.equal(decoded.sessionWins,5);
 assert.equal(decoded.sessionLosses,3);
 const old=[...data];old[3]=old[3].slice(0,-1);old[18]=old[18].slice(0,8);
 const previous=unpackExecutor(old);
 assert.equal(previous.config.martingaleLevels,2);
 assert.equal(previous.sessionWins,0);assert.equal(previous.sessionLosses,0);
 const panel=readFileSync(new URL('../sentinel-trading-lab/agent/worker/executor-panel.mjs',import.meta.url),'utf8');
 assert.match(panel,/data-sentinel-executor-wl/);
 assert.match(panel,/input\('stopWin'/);
});

test('120/300 second scope checks prior already received prices and leaves shorter durations alone',()=>{
 const t=T,history=[];let p=1.1;
 for(let i=0;i<300;i++){p+=(i<240?.00002:-.00003);history.push({ts:t+i*1000,price:p});}
 const quoteAt=history.at(-1).ts,noise=.00015;
 const m2=longHorizonDirection({quotes:history,quoteAt,price:p,durationMs:120000,noise});
 const m5=longHorizonDirection({quotes:history,quoteAt,price:p,durationMs:300000,noise});
 assert.equal(m2.horizonSeconds,90);assert.equal(m5.horizonSeconds,180);
 assert.equal(m2.side,'PUT');assert.equal(m5.side,'CALL');
 assert.equal(longHorizonDirection({quotes:history,quoteAt,price:p,durationMs:30000}).scoped,false);
 const engine=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.match(engine,/range-awaiting-third-confirmed-turn/);
 assert.match(engine,/long-horizon-structure-contradicts-short-impulse/);
});

test('broker display selection is not rewritten by passive background maintenance or account inspection',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const begin=src.indexOf('async sessionInfo(provider)'),end=src.indexOf('  peek(provider)',begin);
 assert.ok(begin>0&&end>begin);
 assert.doesNotMatch(src.slice(begin,end),/page\.goto\(/);
 assert.match(src,/balancesOnly:passiveStreamHealthy/);
 assert.match(src,/get-initialization-data/);
 assert.match(src,/async launchNormal\(/);
});

test('broker Invest recognizes its own custom control with word boundary syntax',()=>{
 const text=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-trade-stake.mjs',import.meta.url),'utf8');
 assert.match(text,/if\(!\/\\binvest/);
 assert.doesNotMatch(text,/if\(!\/\\\\binvest/);
});

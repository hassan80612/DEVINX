import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {SENTINEL_PLANS} from '../sentinel-trading-lab/src/lib/commercial.ts';
const T=1800000000000;
function make(){
 const c={state:'running',licensed:true,provider:'exnova',asset:'EUR/USD',engine:'automatic',
   durationMs:30000,analysis:{},brokerBalance:{provider:'exnova',accountId:'demo',amount:50,receivedAt:T,revision:1}};
 return {c,bot:new SignalExecutor({clock:()=>T,context:()=>c,driver:{prepare:async()=>({amount:1})}})};
}
function settle(bot,id,pnl){
 bot.ledger.set('exnova|'+id,{provider:'exnova',orderId:id,accountId:'demo',netPnl:0,
   source:'unresolved',sessionId:bot.sessionId,amount:1});
 bot.settle({provider:'exnova',orderId:id,accountId:'demo',source:'broker',netPnl:pnl});
}
test('BRL 170 / USD 35 are prepaid 30-day purchases',()=>{
 assert.equal(SENTINEL_PLANS.BR.amount,170);assert.equal(SENTINEL_PLANS.INTL.amount,35);
 assert.equal(SENTINEL_PLANS.BR.billing,'prepaid_30_days');
});
test('bankroll 50, Stop Win target 60',async()=>{
 const {bot}=make();bot.configure({stopWin:60,stopLoss:40});await bot.start();
 assert.equal(bot.initialBalance,50);assert.equal(bot.lossBudgetRemaining(),10);
 settle(bot,'A',4);assert.equal(bot.enabled,true);
 settle(bot,'B',6);assert.equal(bot.enabled,false);
 assert.match(bot.message,/Stop Win atingido/);
});
test('bankroll 50, Stop Loss target 40',async()=>{
 const {bot}=make();bot.configure({stopWin:60,stopLoss:40});await bot.start();
 settle(bot,'A',-5);assert.equal(bot.enabled,true);
 settle(bot,'B',-5);assert.equal(bot.enabled,false);
 assert.match(bot.message,/stop-loss|limite de perda/i);
});
test('Stop clears prior bankroll but retains thresholds; new Start reads deposit',async()=>{
 const {bot,c}=make();bot.configure({stopWin:90,stopLoss:40});await bot.start();
 settle(bot,'A',-2);bot.stop('manual',{reset:true});
 assert.equal(bot.initialBalance,null);assert.equal(bot.balanceRisk.current,null);
 assert.equal(bot.net,0);assert.equal(bot.config.stopLoss,40);assert.equal(bot.config.stopWin,90);
 c.brokerBalance={...c.brokerBalance,amount:75,revision:2};
 await bot.start();assert.equal(bot.initialBalance,75);assert.equal(bot.lossBudgetRemaining(),35);
});
test('stale balance waits for fresh event before opening stop-limited session',async()=>{
 const {bot,c}=make();bot.configure({stopWin:60,stopLoss:40});
 c.brokerBalance={...c.brokerBalance,receivedAt:T-90000};
 await bot.start();assert.equal(bot.initialBalance,null);
 bot.watch();assert.match(bot.message,/aguardando saldo atualizado/);
 c.brokerBalance={...c.brokerBalance,amount:52,revision:3,receivedAt:T};
 bot.watch();assert.equal(bot.initialBalance,52);
});

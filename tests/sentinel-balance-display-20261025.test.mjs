import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
const T=1800000000000;
function fixture(amount=100){
 const context={provider:'exnova',asset:'EUR/USD',engine:'automatic',state:'running',licensed:true,
  durationMs:30000,brokerBalance:{provider:'exnova',accountId:'demo',amount,receivedAt:T,revision:1}};
 let prepares=0;
 const bot=new SignalExecutor({clock:()=>T,context:()=>context,driver:{prepare:async()=>{prepares++;return{amount:1}}}});
 return {bot,context,prepares:()=>prepares};
}
test('cached available balance reaches PC and phone before the first bot activation/event',()=>{
 const {bot,prepares}=fixture();const state=bot.status();
 assert.equal(state.availableBalance,100);assert.equal(state.brokerBalance.amount,100);
 assert.equal(unpackExecutor(packExecutor(state)).availableBalance,100);
 assert.match(executorPanel(state,'pt'),/Disponível: 100\.00/);
 assert.match(executorPanel(state,'en'),/Available: 100\.00/);
 assert.equal(bot.initialBalance,undefined);assert.equal(bot.enabled,false);assert.equal(prepares(),0);
});
test('manual Stop resets risk state while the cached account balance stays visible',async()=>{
 const {bot,context}=fixture();bot.configure({stopLoss:50,stopWin:150});await bot.start();
 bot.stop('manual',{reset:true});
 assert.equal(bot.initialBalance,null);assert.equal(bot.balanceRisk.current,null);
 context.brokerBalance={...context.brokerBalance,amount:75,revision:2};
 const state=bot.status();assert.equal(state.availableBalance,75);
 assert.equal(bot.initialBalance,null);assert.equal(bot.stopBalanceReference,null);
 assert.equal(bot.net,0);assert.equal(bot.sessionWins,0);assert.equal(bot.sessionLosses,0);
});
test('zero balance is visible as zero; a missing or other-provider account stays unknown',()=>{
 const {bot,context}=fixture(0);assert.equal(bot.status().availableBalance,0);
 context.brokerBalance=null;assert.equal(bot.status().availableBalance,null);
 context.brokerBalance={provider:'iq_option',accountId:'other',amount:999,receivedAt:T,revision:1};
 assert.equal(bot.status().availableBalance,null);
});

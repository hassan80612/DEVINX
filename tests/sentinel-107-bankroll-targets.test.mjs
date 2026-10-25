import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
const T=1800000000000;
function make(){
 let now=T;
 const context={state:'running',licensed:true,provider:'exnova',asset:'EUR/USD',engine:'automatic',durationMs:30000,analysis:{},
  brokerBalance:{provider:'exnova',accountId:'demo',amount:100,receivedAt:T,revision:1}};
 const bot=new SignalExecutor({clock:()=>now,context:()=>context,driver:{prepare:async()=>({amount:1})}});
 const balance=amount=>{now++;context.brokerBalance={...context.brokerBalance,amount,receivedAt:now,revision:context.brokerBalance.revision+1};bot.observeBalance(context.brokerBalance)};
 const settle=(id,pnl)=>{now++;bot.ledger.set('exnova|'+id,{provider:'exnova',orderId:id,accountId:'demo',sessionId:bot.sessionId,amount:1,netPnl:0,source:'unresolved'});bot.settle({provider:'exnova',accountId:'demo',orderId:id,source:'broker',netPnl:pnl})};
 return {bot,context,balance,settle};
}
test('100 bankroll stops at 50, not after a 50-unit loss from a different balance',async()=>{
 const {bot,balance}=make();bot.configure({stopLoss:50,stopWin:150});await bot.start();
 balance(50.01);bot.watch();assert.equal(bot.enabled,true);
 balance(50);bot.watch();assert.equal(bot.enabled,false);
});
test('100 bankroll stops at or above the 150 target',async()=>{
 const {bot,balance}=make();bot.configure({stopWin:150});await bot.start();
 balance(149.99);bot.watch();assert.equal(bot.enabled,true);
 balance(151);bot.watch();assert.equal(bot.enabled,false);
});
test('fresh reconciled deposit replaces old opening-plus-profit for stops and allowance',async()=>{
 const {bot,balance}=make();bot.configure({stopLoss:90,stopWin:150});await bot.start();
 bot.net=-20;balance(120);
 assert.equal(bot.stopLossReached(),false);assert.equal(bot.lossBudgetRemaining(),30);
 bot.watch();assert.equal(bot.enabled,true);
 bot.executing=true;balance(119);
 assert.equal(bot.stopTargetBalance(),120,'pending debit retains the deposit, not the obsolete opening bankroll');
 assert.equal(bot.stopLossReached(),false);
 bot.net=-21;assert.equal(bot.stopTargetBalance(),119,'apply only settlements newer than the reconciled deposit');
});
test('fresh withdrawal overrides historic accumulated profit',async()=>{
 const {bot,balance}=make();bot.configure({stopLoss:50,stopWin:150});await bot.start();
 bot.net=60;balance(120);
 assert.equal(bot.stopWinReached(),false);bot.watch();assert.equal(bot.enabled,true);
 balance(49);bot.watch();assert.equal(bot.enabled,false);
});
test('stale pre-settlement broker balance cannot mask a confirmed stop or freeze WIN/LOSS',async()=>{
 const {bot,settle}=make();bot.configure({stopLoss:50,stopWin:150});await bot.start();
 settle('first',-49);assert.equal(bot.enabled,true);assert.equal(bot.sessionLosses,1);
 settle('second',-1);assert.equal(bot.enabled,false);assert.equal(bot.sessionLosses,2);
 assert.equal(bot.stopTargetBalance(),50);
});
test('pending account debit is not a confirmed loss or a stop-target crossing',async()=>{
 const {bot,balance}=make();bot.configure({stopLoss:50,stopWin:150});await bot.start();
 bot.pending={provider:'exnova',orders:[],amount:60};balance(40);
 assert.equal(bot.stopLossReached(),false);assert.equal(bot.sessionLosses,0);
});

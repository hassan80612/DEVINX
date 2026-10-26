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
 settle(bot,'B',6);assert.equal(bot.enabled,true,'do not stop on derived P&L before the broker updates');
 bot.observeBalance({provider:'exnova',accountId:'demo',amount:60,receivedAt:T,revision:2});assert.equal(bot.enabled,false);
 assert.match(bot.message,/Stop Win atingido/);
});
test('bankroll 50, Stop Loss target 40',async()=>{
 const {bot}=make();bot.configure({stopWin:60,stopLoss:40});await bot.start();
 settle(bot,'A',-5);assert.equal(bot.enabled,true);
 settle(bot,'B',-5);assert.equal(bot.enabled,true,'do not stop on a derived balance');
 bot.observeBalance({provider:'exnova',accountId:'demo',amount:40,receivedAt:T,revision:2});assert.equal(bot.enabled,false);
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
test('stale balance does not suspend CALL/PUT while stop targets await a fresh event',async()=>{
 const {bot,c}=make();bot.configure({stopWin:60,stopLoss:40});
 c.brokerBalance={...c.brokerBalance,receivedAt:T-90000};
 await bot.start();assert.equal(bot.initialBalance,null);
 bot.watch();assert.equal(bot.enabled,true);assert.equal(bot.suspensionReason,null);assert.equal(bot.lossBudgetRemaining(),Infinity);
 c.brokerBalance={...c.brokerBalance,amount:52,revision:3,receivedAt:T};
 bot.watch();assert.equal(bot.initialBalance,52);
});

test('first CALL executes without broker balance; later balance reconstructs opening bankroll safely',async()=>{
 let now=T,clicks=0;
 const c={state:'running',licensed:true,provider:'exnova',asset:'EUR/USD',activeId:1,engine:'automatic',
  durationMs:30000,analysis:{},quote:1.1,quoteAt:T,brokerBalance:null};
 const driver={prepare:async()=>({amount:1}),execute:async(_,order)=>{
  order.captureEntry();order.clicked=true;clicks++;
  return{accepted:true,orderId:'first'};}};
 const bot=new SignalExecutor({clock:()=>now,context:()=>c,driver});
 bot.configure({stopWin:60,stopLoss:40});await bot.start();
 bot.watch();assert.equal(bot.initialBalance,null);assert.equal(bot.suspensionReason,null);
 assert.equal(bot.lossBudgetRemaining(),Infinity);
 now+=100;c.quoteAt=now;
 c.analysis={vnext:{futureEntryAnchor:{
  context:'exnova|EURUSD|automatic|30000',phase:'fired',side:'CALL',
  entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000}}};
 bot.pulse();await bot.inflight;
 assert.equal(clicks,1,'first physical CALL must not be blocked by unknown bankroll');
 assert.equal(bot.executed,1);
 c.brokerBalance={provider:'exnova',accountId:'demo',amount:49,receivedAt:now,revision:1};
 bot.watch();assert.equal(bot.initialBalance,null,'do not confuse in-flight debit with opening bankroll');
 now+=30000;bot.settle({provider:'exnova',accountId:'demo',orderId:'first',source:'broker',netPnl:-1});
 bot.watch();assert.equal(bot.initialBalance,null,'pre-settlement observation is not a post-settlement balance');
 c.brokerBalance={...c.brokerBalance,amount:49,receivedAt:now,revision:2};
 bot.watch();assert.equal(bot.initialBalance,50);
 assert.equal(bot.lossBudgetRemaining(),9);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {dispatchExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {readFileSync} from 'node:fs';
const NOW=1800000000000;
const balance=(accountId,amount=100)=>({provider:'iq_option',accountId,amount,revision:5,receivedAt:NOW,source:'protocol'});
const ctx=(brokerMode='demo',accountId='demo-account',amount=100)=>({
 provider:'iq_option',brokerMode,asset:'EUR/USD OTC',durationMs:60000,
 engine:'automatic',state:'running',licensed:true,brokerBalance:balance(accountId,amount),analysis:null
});
const create=(state,prepare=async()=>({ready:true,amount:5}))=>
 new SignalExecutor({driver:{prepare},context:()=>state.current,clock:()=>NOW});

test('218: DEMO to REAL rebind confirms new Invest without closing Agent or auto-trading',async()=>{
 const state={current:ctx('real','real-account',20)};
 let calls=0;
 const bot=create(state,async()=>{calls++;return{ready:true,amount:4}});
 bot.enabled=true;bot.session={provider:'iq_option',asset:'EUR/USD OTC',durationMs:60000,
  engine:'automatic',accountId:'demo-account',brokerMode:'demo'};
 bot.net=19;bot.sessionWins=8;bot.sessionLosses=3;bot.martingaleLevel=1;
 bot.config.stopLoss=3;bot.config.stopWin=300;
 const result=await bot.syncAccountAndInvest();
 assert.equal(calls,1);
 assert.equal(result.enabled,false,'REAL account must need explicit Ligar bot');
 assert.equal(result.sessionWins,0);assert.equal(result.sessionLosses,0);
 assert.equal(result.config.amount,4);assert.equal(result.config.stopLoss,3);
 assert.equal(result.config.stopWin,300);assert.equal(bot.martingaleLevel,0);
 assert.equal(result.brokerBalance.amount,20);
 assert.match(result.message,/REAL/);assert.match(result.message,/Ligar bot/);
 assert.equal(bot.pending,null);assert.equal(bot.accountInvestSyncPending,false);
 assert.equal(bot.lastBrokerExpiryMismatch,null);
});
test('218: REAL to DEMO works with exactly the same account confirmation',async()=>{
 const state={current:ctx('demo','demo-account',1000)};
 const bot=create(state,async()=>({ready:true,amount:7}));
 bot.enabled=true;
 bot.session={provider:'iq_option',asset:'EUR/USD OTC',durationMs:60000,
  engine:'automatic',accountId:'real-account',brokerMode:'real'};
 const result=await bot.syncAccountAndInvest();
 assert.equal(result.enabled,false);assert.equal(result.config.amount,7);
 assert.match(result.message,/DEMO/);
});
test('218: same account Invest 2 to 9 preserves all WIN/LOSS, Martingale and selected expiry',async()=>{
 const state={current:ctx('demo','demo-account',100)};
 const bot=create(state,async()=>({ready:true,amount:9}));
 bot.enabled=true;bot.startedAt=NOW-90000;
 bot.session={provider:'iq_option',asset:'EUR/USD OTC',durationMs:60000,
  engine:'automatic',accountId:'demo-account',brokerMode:'demo'};
 bot.balanceRisk.observe(state.current.brokerBalance);
 bot.balanceRisk.begin('iq_option');
 bot.initialBalance=100;bot.config.amount=2;bot.config.martingaleEnabled=true;
 bot.martingaleLevel=1;bot.sessionWins=6;bot.sessionLosses=2;bot.net=8;
 bot.seen.add('old-signal');
 const r=await bot.syncAccountAndInvest();
 assert.equal(r.enabled,true);assert.equal(r.sessionWins,6);
 assert.equal(r.sessionLosses,2);assert.equal(r.config.amount,9);
 assert.equal(bot.martingaleLevel,1);assert.equal(bot.session.durationMs,60000);
 assert.equal(bot.session.accountId,'demo-account');assert.equal(bot.net,8);
 assert.equal(bot.queuedSignal,null);
});
test('218: reject unresolved trade before broker read and preserve all state',async()=>{
 const state={current:ctx('real','real-account',100)};
 let prepared=0;
 const bot=create(state,async()=>{prepared++;return{amount:4}});
 bot.enabled=true;bot.session={provider:'iq_option',asset:'EUR/USD OTC',accountId:'old-demo',brokerMode:'demo',durationMs:60000};
 bot.pending={id:'unsettled',orders:[{clicked:true,settled:false,amount:5}]};
 await assert.rejects(()=>bot.syncAccountAndInvest(),/operação pendente/);
 assert.equal(prepared,0);assert.equal(bot.enabled,true);assert.equal(bot.pending.id,'unsettled');
});
test('218: stale account, unknown mode and unreadable Invest never confirm an old stake',async()=>{
 const state={current:ctx('real','real-account',100)};
 const bot=create(state,async()=>({amount:null}));
 bot.config.amount=3;bot.enabled=true;
 bot.session={provider:'iq_option',asset:'EUR/USD OTC',durationMs:60000,accountId:'demo',brokerMode:'demo'};
 await assert.rejects(()=>bot.syncAccountAndInvest(),/Invest atual/);
 assert.equal(bot.config.amount,3);assert.equal(bot.enabled,true);
 state.current={...state.current,brokerBalance:{...state.current.brokerBalance,receivedAt:NOW-40000}};
 await assert.rejects(()=>bot.syncAccountAndInvest(),/não confirmados/);
 assert.equal(bot.config.amount,3);
 state.current={...ctx('switching','real-account')};
 await assert.rejects(()=>bot.syncAccountAndInvest(),/não confirmados/);
});
test('218: account or asset switching during asynchronous Invest read does not commit any changes',async()=>{
 const state={current:ctx('real','real-account',100)};
 let release;
 const wait=new Promise(resolve=>release=resolve);
 const bot=create(state,async()=>{await wait;return{ready:true,amount:25}});
 bot.config.amount=2;bot.enabled=true;
 bot.session={provider:'iq_option',asset:'EUR/USD OTC',durationMs:60000,accountId:'demo-account',brokerMode:'demo'};
 const task=bot.syncAccountAndInvest();
 assert.equal(bot.accountInvestSyncPending,true);
 state.current={...ctx('demo','other-demo',100),asset:'EUR/GBP OTC'};
 release();
 await assert.rejects(task,/mudou durante a leitura/);
 assert.equal(bot.config.amount,2);assert.equal(bot.enabled,true);
 assert.equal(bot.accountInvestSyncPending,false);
});
test('218: the card command reaches only the explicit Invest update route',async()=>{
 const runs=[];
 const result=await dispatchExecutor('/executor/sync-invest',{},async(action,payload)=>{
   runs.push({action,payload});return{ok:true};
 },()=>({provider:'iq_option',asset:'EUR/USD OTC',durationMs:60000}));
 assert.deepEqual(result,{ok:true});
 assert.deepEqual(runs,[{action:'executor-sync-invest',payload:{}}]);
 const index=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const card=readFileSync(new URL('../sentinel-trading-lab/src/components/BotControl.tsx',import.meta.url),'utf8');
 assert.match(index,/action==='executor-sync-invest'/);
 assert.match(card,/Atualizar Invest/);
 assert.match(card,/executor\/sync-invest/);
});

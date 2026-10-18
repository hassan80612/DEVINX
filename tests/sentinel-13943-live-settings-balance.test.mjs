import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const T=1800000000000;
function setup(provider='iq_option',native=false){
 let now=T,revision=0;const calls=[];
 const c={state:'running',licensed:true,provider,asset:'EUR/USD OTC',activeId:76,durationMs:30000,engine:'automatic',analysis:{}};
 const balance=(amount,accountId='10')=>c.brokerBalance={provider,accountId,amount,receivedAt:now,revision:++revision};
 if(native)balance(100);
 const driver={prepare:async()=>{},execute:async(p,o)=>{assert.ok(o.isValid());o.captureEntry();o.clicked=true;calls.push({...o});return{clicked:true,clickId:String(calls.length)};}};
 const bot=new SignalExecutor({driver,context:()=>c,clock:()=>now});bot.configure({initialBalance:500,amount:10,payoutPercent:80});
 const fire=(side='CALL',engine=c.engine)=>{c.analysis={vnext:{futureEntryAnchor:{context:[provider,'EURUSDOTC',engine,30000].join('|'),phase:'fired',side,entryTriggeredAt:now,exitAt:now+30000,holdingSeconds:30,entryPrice:1}}};bot.pulse();return bot.inflight;};
 return{bot,c,driver,calls,balance,fire,advance:ms=>now+=ms,quote:price=>{c.quote=price;c.quoteAt=now;c.quoteHistory=[{ts:now,price,receivedAt:now}];},now:()=>now};
}
test('running time limit edits count from original start; zero removes deadline',async()=>{
 const x=setup();await x.bot.start();x.advance(90000);x.bot.configure({stopAfterMinutes:2});assert.equal(x.bot.deadlineAt,T+120000);
 x.bot.configure({stopAfterMinutes:0});assert.equal(x.bot.deadlineAt,null);x.advance(100000);x.bot.watch();assert.ok(x.bot.enabled);
 x.bot.configure({stopAfterMinutes:1});assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/tempo programado/);
});
test('running edits preserve pending stake/payout and apply limits immediately',async()=>{
 const x=setup();await x.bot.start();await x.fire();x.bot.configure({amount:20,payoutPercent:90,intervalMs:60000,initialBalance:999});
 assert.equal(x.bot.pending.amount,10);assert.equal(x.bot.pending.payoutPercent,80);assert.equal(x.bot.initialBalance,500);
 x.advance(30000);x.quote(.9);x.bot.watch();x.bot.configure({stopLoss:5});assert.equal(x.bot.enabled,false);
});
test('stop with pending trade unlocks all settings; missing closing quote releases unknown result',async()=>{
 const x=setup();await x.bot.start();await x.fire();x.bot.stop();x.bot.configure({amount:12,payoutPercent:85,stopAfterMinutes:4,stopLoss:5,initialBalance:99,intervalMs:60000});
 assert.ok(x.bot.pending);x.advance(31000);x.bot.watch();assert.equal(x.bot.pending,null);assert.equal(x.bot.closed,0);assert.equal(x.bot.net,0);assert.equal(x.bot.history[0].result,'unknown');
 await x.bot.start();assert.equal(x.bot.initialBalance,99);
});
test('running manual session with no closing quote eventually stops and unlocks restart',async()=>{
 const x=setup();await x.bot.start();await x.fire();x.advance(45001);x.bot.watch();assert.equal(x.bot.enabled,false);assert.equal(x.bot.pending,null);assert.equal(x.bot.net,0);await x.bot.start();
});
test('strategy switch keeps bot armed and executes fresh new-strategy signal only',async()=>{
 const x=setup();await x.bot.start();x.c.engine='trend';await x.fire('CALL','automatic');assert.equal(x.bot.enabled,true);assert.equal(x.calls.length,0);
 x.advance(30000);await x.fire('PUT');assert.equal(x.calls.length,1);assert.equal(x.calls[0].side,'PUT');assert.equal(x.calls[0].engine,'trend');
});
test('strategy switch preserves already clicked entry and fixed expiry',async()=>{
 const x=setup();await x.bot.start();await x.fire();const old=x.bot.pending;x.c.engine='trend';x.bot.watch();assert.equal(x.bot.pending,old);assert.ok(x.bot.enabled);
 x.advance(30000);x.quote(1.1);await x.fire('PUT');assert.equal(x.calls.length,2);assert.equal(x.calls[1].engine,'trend');
});
test('strategy change before asynchronous click cancels old entry without disarming',async()=>{
 const x=setup();await x.bot.start();const pending=x.fire();x.c.engine='trend';await pending;assert.equal(x.calls.length,0);assert.equal(x.bot.pending,null);assert.ok(x.bot.enabled);
 x.advance(30000);await x.fire('PUT');assert.equal(x.calls.length,1);
});
for(const provider of ['iq_option','exnova']){
 test(provider+': received balance overrides manual opening amount; zero is not missing',async()=>{
  const x=setup(provider,true);x.bot.configure({initialBalance:0});await x.bot.start();assert.equal(x.bot.initialBalance,100);assert.equal(x.bot.status().balanceSource,'broker-received-balance');
  x.bot.stop();x.balance(0);await assert.rejects(x.bot.start(),/saldo inicial/);assert.equal(x.bot.enabled,false);
 });
 test(provider+': pending debit is reserved; actual loss stops despite winning quote estimate',async()=>{
  const x=setup(provider,true);x.bot.configure({stopLoss:10});await x.bot.start();await x.fire();x.advance(100);x.balance(90);x.bot.watch();assert.ok(x.bot.enabled);assert.equal(x.bot.status().riskNetPnl,0);assert.equal(x.bot.status().availableBalance,90);
  x.advance(29900);x.quote(1.1);x.bot.watch();assert.equal(x.bot.net,8);assert.ok(x.bot.enabled);assert.equal(x.bot.status().balanceReconciling,true);
  x.advance(1000);x.bot.watch();assert.equal(x.bot.enabled,false);assert.equal(x.bot.status().riskNetPnl,-10);
 });
 test(provider+': delayed native credit prevents false stop from losing quote estimate',async()=>{
  const x=setup(provider,true);x.bot.configure({stopLoss:10});await x.bot.start();await x.fire();x.advance(50);x.balance(90);x.bot.watch();x.advance(29950);x.quote(.9);x.bot.watch();assert.equal(x.bot.net,-10);assert.ok(x.bot.enabled);
  x.advance(500);x.balance(108);x.bot.watch();assert.ok(x.bot.enabled);assert.equal(x.bot.status().riskNetPnl,8);assert.equal(x.bot.status().balanceReconciling,false);
 });
 test(provider+': selected account change stops; absent native balance still starts manually',async()=>{
  const x=setup(provider,true);await x.bot.start();x.balance(1000,'20');x.bot.watch();assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/conta/);
  const y=setup(provider);await y.bot.start();assert.equal(y.bot.status().balanceSource,'user-configured-local-calculation');assert.equal(y.bot.initialBalance,500);
 });
 test(provider+': snapshot retains provenance across market and inactive-account frames',()=>{
  const d=new LocalPlaywrightDriver();Object.assign(d.state(provider),{balanceId:10,mode:'demo',activeId:76});d.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:100},{id:20,type:1,amount:500}]});
  const first=d.accountBalanceSnapshot(provider);assert.equal(first.amount,100);
  d.ingest(provider,{name:'quote-generated',msg:{active_id:76,price:1.1,time:Date.now()/1000}});assert.deepEqual(d.accountBalanceSnapshot(provider),first);
  d.ingest(provider,{name:'balance-changed',msg:{body:{balance_id:20,type:1,amount:600}}});assert.deepEqual(d.accountBalanceSnapshot(provider),first);
  d.ingest(provider,{name:'event',msg:{name:'balance-changed',body:{balance_id:10,type:4,current_balance:90}}});const next=d.accountBalanceSnapshot(provider);assert.equal(next.amount,90);assert.equal(next.revision,first.revision+1);
 });
}
test('native mode releases missing quote as unknown and continues on next fresh signal',async()=>{
 const x=setup('iq_option',true);await x.bot.start();await x.fire();x.advance(31000);x.balance(108);x.bot.watch();assert.equal(x.bot.pending,null);assert.equal(x.bot.history[0].result,'unknown');assert.ok(x.bot.enabled);assert.equal(x.bot.net,0);assert.equal(x.bot.status().riskNetPnl,8);
 await x.fire('PUT');assert.equal(x.calls.length,2);
});
test('editing stop loss enforces current native account drawdown immediately',async()=>{
 const x=setup('iq_option',true);await x.bot.start();x.balance(85);x.bot.watch();assert.ok(x.bot.enabled);x.bot.configure({stopLoss:10});assert.equal(x.bot.enabled,false);
});
test('panel enables every setting while running and stopped with pending entry; start/map remain guarded',()=>{
 const x=setup();for(const state of [{enabled:true},{enabled:false,pending:{side:'CALL'}},{enabled:false,executing:true}]){
  const html=executorPanel({...x.bot.status(),...state});const controls=[...html.matchAll(/<(?:input|select)\b[^>]*data-sentinel-executor-setting[^>]*>/g)];assert.equal(controls.length,6);assert.ok(controls.every(m=>!m[0].includes(' disabled')));
  assert.match(html,/data-sentinel-executor-action="start" disabled/);assert.match(html,/data-sentinel-executor-action="map" disabled/);
 }
});
test('worker uses cached account snapshot and serial atomic config writes without order observation',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');assert.match(s,/accountBalanceSnapshot/);assert.match(s,/executorSettingsWrite=executorSettingsWrite\.catch/);assert.match(s,/rename\(executorSettingsFile\+'\.tmp'/);assert.doesNotMatch(s,/setExecutionObserver\(/);
});

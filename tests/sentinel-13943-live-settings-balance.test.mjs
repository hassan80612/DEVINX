import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,T} from './fixtures/executor-13946.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
for(const provider of ['iq_option','exnova']){
 test(provider+': snapshot retains provenance across market and inactive-account frames',()=>{
  const d=new LocalPlaywrightDriver();Object.assign(d.state(provider),{balanceId:10,mode:'demo',activeId:76});d.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:100},{id:20,type:1,amount:500}]});
  const first=d.accountBalanceSnapshot(provider);assert.equal(first.amount,100);
  d.ingest(provider,{name:'quote-generated',msg:{active_id:76,price:1.1,time:Date.now()/1000}});assert.deepEqual(d.accountBalanceSnapshot(provider),first);
  d.ingest(provider,{name:'balance-changed',msg:{body:{balance_id:20,type:1,amount:600}}});assert.deepEqual(d.accountBalanceSnapshot(provider),first);
  d.ingest(provider,{name:'event',msg:{name:'balance-changed',body:{balance_id:10,type:4,current_balance:90}}});const next=d.accountBalanceSnapshot(provider);assert.equal(next.amount,90);assert.equal(next.revision,first.revision+1);
 });
 test(provider+': account change safely suspends; missing native balance does not block activation',async()=>{
 const x=setup(provider);await x.bot.start();x.balance(1000,'20');x.bot.watch();assert.equal(x.bot.enabled,true);assert.match(x.bot.message,/conta/);assert.ok(x.bot.suspensionReason);const y=setup(provider);y.c.brokerBalance=null;await y.bot.start();assert.ok(y.bot.enabled);assert.equal(y.bot.status().brokerBalance,null);
 });
 test(provider+': pending debit is reserved even after expiry; delayed winning credit is reconciled',async()=>{
 const x=setup(provider);x.bot.configure({amount:10,stopLoss:30});await x.bot.start();await x.fire();const id=x.bot.pending.orderId;x.advance(50);x.balance(90);x.bot.watch();assert.equal(x.bot.status().riskNetPnl,0);x.advance(30950);x.bot.watch();assert.ok(x.bot.enabled);assert.equal(x.bot.status().riskNetPnl,-10,'after expiry unknown 10 stake must remain reserved, not counted as a confirmed loss');
 x.bot.settle({provider,accountId:'10',orderId:id,netPnl:8});assert.equal(x.bot.net,8);assert.ok(x.bot.enabled);assert.equal(x.bot.status().balanceReconciling,true);x.balance(108);x.bot.watch();assert.equal(x.bot.status().riskNetPnl,8);assert.equal(x.bot.status().balanceReconciling,false);
 });
}
test('legacy minute timer is ignored: only user Stop, stop-loss and insufficient bank cause OFF',async()=>{
 const x=setup();await x.bot.start();x.advance(90000);x.bot.configure({stopAfterMinutes:2});assert.equal(x.bot.deadlineAt,null);x.bot.configure({stopAfterMinutes:0});assert.equal(x.bot.deadlineAt,null);x.advance(100000);x.bot.watch();assert.ok(x.bot.enabled);x.bot.configure({stopAfterMinutes:1});assert.equal(x.bot.enabled,true);
});
test('strategy switches preserve pending trade and follow the new strategy after actual settlement',async()=>{
 const x=setup();await x.bot.start();await x.fire();const pending=x.bot.pending;x.c.engine='trend';x.bot.watch();assert.ok(x.bot.enabled);assert.equal(x.bot.pending,pending);x.close(.8);await x.fire('PUT');assert.equal(x.calls.length,2);assert.equal(x.calls[1].engine,'trend');
});
test('strategy change before asynchronous click cancels old direction without disarming',async()=>{
 const x=setup();await x.bot.start();const flight=x.fire();x.c.engine='trend';await flight;assert.equal(x.calls.length,0);assert.equal(x.bot.pending,null);assert.ok(x.bot.enabled);x.advance(30000);await x.fire('PUT');assert.equal(x.calls.length,1);
});
test('editing loss limit immediately enforces current native account drawdown',async()=>{
 const x=setup();await x.bot.start();x.balance(85);x.bot.watch();assert.ok(x.bot.enabled);x.bot.configure({stopLoss:10});assert.equal(x.bot.enabled,false);
});
test('worker uses cached received balance and serial atomic settings writes',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');assert.match(s,/accountBalanceSnapshot/);assert.match(s,/executorSettingsWrite=executorSettingsWrite\.catch/);assert.match(s,/rename\(executorSettingsFile\+'\.tmp'/);
});

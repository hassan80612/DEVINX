import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/executor-13946.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
for(const provider of ['iq_option','exnova']){
 test(provider+': no balance is needed to activate, click, settle, or apply bounded martingale',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.bot.configure({stopLoss:7,martingaleEnabled:true,martingaleLevels:1});await x.bot.start();
  let s=unpackExecutor(packExecutor(x.bot.status()));assert.ok(s.enabled);assert.equal(s.initialBalance,null);assert.equal(s.calculatedBalance,null);assert.equal(s.availableBalance,null);assert.equal(s.lossLimitRemaining,7);
  await x.fire('CALL');assert.equal(x.calls[0].amount,1);x.advance(30000);assert.ok(x.bot.settle({provider,accountId:'10',orderId:x.bot.pending.orderId,netPnl:-1,source:'broker'}));
  await x.fire('PUT');assert.equal(x.calls[1].side,'PUT');assert.equal(x.calls[1].amount,2);x.advance(30000);x.bot.settle({provider,accountId:'10',orderId:x.bot.pending.orderId,netPnl:-2,source:'broker'});
  assert.equal(x.bot.nextAmount(),1);assert.equal(x.bot.status().riskNetPnl,-3);assert.equal(x.bot.status().lossLimitRemaining,4);assert.equal(x.bot.status().availableBalance,null);
  x.bot.configure({stopLoss:3});assert.equal(x.bot.enabled,false);
 });
 test(provider+': late balance updates display without resetting confirmed session results; account changes stop',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;await x.bot.start();await x.fire();x.advance(30000);x.bot.settle({provider,accountId:'10',orderId:x.bot.pending.orderId,netPnl:-1,source:'broker'});
  x.balance(23);x.bot.watch();assert.equal(x.bot.status().netPnl,-1);assert.equal(x.bot.status().riskNetPnl,-1);assert.equal(x.bot.status().availableBalance,23);assert.equal(x.bot.status().calculatedBalance,null);
  x.balance(50,'20');x.bot.watch();assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/conta/);
 });
 test(provider+': a disappearing balance does not cancel a fresh analyst signal',async()=>{
  const x=setup(provider);await x.bot.start();x.c.brokerBalance=null;await x.fire('PUT');assert.equal(x.calls.length,1);assert.ok(x.bot.enabled);
 });
 test(provider+': a confirmed close permits next signal even before balance credit arrives',async()=>{
  const x=setup(provider);x.bot.configure({amount:10});await x.bot.start();await x.fire();x.balance(90);x.bot.watch();x.advance(30000);x.bot.settle({provider,accountId:'10',orderId:x.bot.pending.orderId,netPnl:8,source:'broker'});
  assert.ok(x.bot.status().balanceReconciling);await x.fire('PUT');assert.equal(x.calls.length,2);assert.equal(x.calls[1].amount,10);
 });
 test(provider+': optional balance still prevents a known insufficient stake and a changed account during activation',async()=>{
  const x=setup(provider);x.balance(0);await assert.rejects(x.bot.start(),/insuficiente/);assert.equal(x.calls.length,0);
  const y=setup(provider);y.driver.prepare=async()=>y.balance(100,'20');await assert.rejects(y.bot.start(),/mudou/);assert.equal(y.calls.length,0);
 });
}

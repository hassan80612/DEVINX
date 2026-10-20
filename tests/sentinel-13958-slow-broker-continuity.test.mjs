import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/executor-13946.mjs';

function settleAll(x,netPnl=-1){
 const batch=x.bot.pending;assert.ok(batch);
 x.advance(60000);
 for(const order of [...batch.orders])assert.equal(x.bot.settle({
  provider:x.c.provider,orderId:order.orderId,netPnl,source:'broker'}),true);
}
for(const provider of ['exnova','iq_option']){
 test(provider+': slow broker skips impossible multi-click entry WITHOUT sending a baseline or resetting recovery',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  x.driver.batchFeasibility=(_provider,{count})=>count>1?
   {safe:false,reason:'measured native click latency'}:{safe:true};
  await x.bot.start();
  await x.fire('CALL');assert.equal(x.calls.length,1);settleAll(x,-1);
  assert.equal(x.bot.nextClicks(),2);
  const prior=x.calls.length;
  await x.fire('PUT');
  assert.equal(x.calls.length,prior,'no mistaken 1-click recovery');
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.nextClicks(),2);
  assert.equal(x.bot.martingaleLevel,1);
  assert.equal(x.bot.enabled,true);
  assert.match(x.bot.message,/nível de martingale preservado/);
  x.driver.batchFeasibility=()=>({safe:true});
  x.advance(31000);
  await x.fire('CALL');
  assert.equal(x.calls.length-prior,2);
  assert.equal(x.bot.pending.martingaleLevel,1);
  settleAll(x,.86);
  assert.equal(x.bot.nextClicks(),1);
 });
 test(provider+': slow broker may reject stale one-click signal without OFF or late duplicate',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.driver.batchFeasibility=()=>({safe:false,reason:'outside execution budget'});
  await x.bot.start();
  await x.fire('CALL');
  assert.equal(x.calls.length,0);
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.enabled,true);
  assert.match(x.bot.message,/aguardando próximo/);
  const before=x.calls.length;
  await x.fire('PUT');assert.equal(x.calls.length,before,'a rejected signal is not replayed');
 });
 test(provider+': measured fast multi-click sequence is NOT reduced',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  x.driver.batchFeasibility=()=>({safe:true});
  await x.bot.start();
  await x.fire();settleAll(x,-1);
  const before=x.calls.length;
  await x.fire('PUT');
  assert.equal(x.calls.length-before,2);
  assert.equal(x.bot.pending.martingaleFallback,false);
  assert.equal(x.bot.pending.clickCount,2);
 });
}

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
 test(provider+': slow broker 4-click signal enters a fresh ONE-click baseline, bot remains ON',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  // Control measurement is too slow even though analyst signals are fresh.
  x.driver.batchFeasibility=(_provider,{count})=>count>1?
   {safe:false,reason:'measured native click latency'}:{safe:true};
  await x.bot.start();
  await x.fire('CALL');assert.equal(x.calls.length,1);settleAll(x,-1);
  assert.equal(x.bot.nextClicks(),2);
  const first=x.calls.length;
  await x.fire('PUT');
  assert.equal(x.calls.length-first,1,'do not skip the fresh signal forever');
  assert.equal(x.bot.pending.clickCount,1);
  assert.equal(x.bot.pending.amount,1);
  assert.equal(x.bot.pending.martingaleLevel,0);
  assert.equal(x.bot.pending.martingaleFallback,true);
  assert.equal(x.bot.martingaleLevel,0);
  assert.equal(x.bot.enabled,true);
  assert.match(x.bot.message,/martingale reduzido por lentidão/);
  settleAll(x,0.86);
  assert.equal(x.bot.nextClicks(),1);
  const last=x.calls.length;
  await x.fire('CALL');assert.equal(x.calls.length-last,1);
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

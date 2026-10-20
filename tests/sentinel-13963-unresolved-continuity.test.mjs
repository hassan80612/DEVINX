import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/executor-13946.mjs';

for (const provider of ['iq_option','exnova']) {
 test(provider+': expired unresolved intermediate triple stage must not freeze subsequent signals',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.c.durationMs=15000;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:2});
  await x.bot.start();
  await x.fire('CALL');
  const first=x.bot.pending;
  x.advance(15000);
  assert.equal(x.bot.settle({provider,orderId:first.orderId,netPnl:-1,source:'broker'}),true);
  assert.equal(x.bot.nextClicks(),3);
  await x.fire('PUT');const batch=x.bot.pending;
  assert.equal(batch.clickCount,3);
  x.advance(16500);
  x.bot.watch();
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.enabled,true);
  assert.equal(x.bot.nextClicks(),1);
  assert.equal(x.bot.unresolvedExposure(),3);
  const clicks=x.calls.length;
  await x.fire('CALL');
  assert.equal(x.calls.length,clicks+1);
  assert.equal(x.bot.pending.clickCount,1);
  for(const o of batch.orders)assert.equal(x.bot.settle({
   provider,orderId:o.orderId,netPnl:-1,source:'broker'}),true);
  assert.equal(x.bot.unresolvedBatches.size,0);
  assert.equal(x.bot.nextClicks(),1,'late prior loss cannot alter current cycle');
  assert.equal(x.bot.net,-4,'only confirmed actual broker results count as PnL');
  x.advance(15000);
  assert.equal(x.bot.settle({provider,orderId:x.bot.pending.orderId,
   netPnl:-1,source:'broker'}),true);
  assert.equal(x.bot.nextClicks(),3);
 });
 test(provider+': unknown prior risk still enforces a modest configured stop-loss',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.c.durationMs=15000;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:2,stopLoss:1.5});
  await x.bot.start();await x.fire('CALL');const batch=x.bot.pending;
  x.advance(16500);x.bot.watch();
  assert.equal(x.bot.unresolvedExposure(),1);
  const before=x.calls.length;
  await x.fire('PUT');
  assert.equal(x.calls.length,before);
  assert.equal(x.bot.enabled,false,'user-chosen stop loss must still protect funds');
  assert.equal(x.bot.net,0,'unknown must not be fabricated as a broker loss');
 });
 test(provider+': received full results left in an orphan batch reconcile and unfreeze',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.c.durationMs=15000;
  await x.bot.start();await x.fire('CALL');
  const batch=x.bot.pending;
  batch.dispatchComplete=true;batch.orders[0].settled=true;
  x.bot.watch();
  assert.equal(x.bot.pending,null);
  x.advance(15000);await x.fire('PUT');
  assert.equal(x.calls.length,2,'no stale lock after all orders settled');
 });
}

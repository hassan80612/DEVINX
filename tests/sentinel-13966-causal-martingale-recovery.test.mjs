import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/executor-13946.mjs';

const brokerClose=(x,order,netPnl)=>x.bot.settle({
 provider:x.c.provider,accountId:'10',orderId:order.orderId,netPnl,source:'broker'
});
for(const provider of ['iq_option','exnova']){
 test(provider+': expire at real window boundary and immediately honor new fresh 30s signal, not next-next one',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:2});
  await x.bot.start();await x.fire('CALL');const old=x.bot.pending;
  x.advance(29900);
  const previous=x.calls.length;
  await x.fire('PUT');
  assert.equal(x.calls.length,previous,'cannot overlap still-open CALL');
  assert.ok(x.bot.queuedSignal,'new valid PUT must remain queued, not consumed');
  x.advance(100);x.bot.pulse();
  await x.bot.inflight;
  assert.equal(x.calls.length,previous+1,'PUT delivered as soon as previous actual expiry reached');
  assert.equal(x.calls.at(-1).side,'PUT');
  assert.equal(x.bot.nextClicks(),1,'unknown original result cannot be treated as loss');
  assert.equal(x.bot.unresolvedExposure(),1,'unsettled historical position still accounted for in risk');
  assert.equal(brokerClose(x,old.orders[0],-1),true);
  assert.equal(x.bot.nextClicks(),1,'late prior loss cannot mutate already-open new cycle');
 });
 test(provider+': a real late LOSS arriving AFTER expiry but BEFORE another entry still advances 1→3',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:2});
  await x.bot.start();await x.fire('CALL');const old=x.bot.pending;
  x.advance(30000);x.bot.watch();
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.nextClicks(),1,'temporarily show base while result is unknown');
  assert.equal(brokerClose(x,old.orders[0],-1),true);
  assert.equal(x.bot.unresolvedBatches.size,0);
  assert.equal(x.bot.nextClicks(),3,'identified prior LOSS must drive own progression');
  const before=x.calls.length;
  await x.fire('PUT');
  assert.equal(x.calls.length-before,3,'never lose martingale when broker close arrives before next trade');
  assert.equal(x.bot.pending.clickCount,3);
 });
 test(provider+': broker WIN after expiry before next trade never forces 3 clicks',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:2});
  await x.bot.start();await x.fire('CALL');const old=x.bot.pending;
  x.advance(30000);x.bot.watch();
  assert.equal(brokerClose(x,old.orders[0],0.8),true);
  assert.equal(x.bot.nextClicks(),1);
  await x.fire('PUT');assert.equal(x.bot.pending.clickCount,1);
 });
 test(provider+': fresh queued signal can be consumed once only; old or expired signals remain ignored',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;await x.bot.start();
  await x.fire('CALL');x.advance(29900);await x.fire('PUT');
  x.advance(100);x.bot.pulse();await x.bot.inflight;
  const count=x.calls.length;x.bot.pulse();await x.bot.inflight;
  assert.equal(x.calls.length,count,'no double click on same futureEntryAnchor');
  x.advance(31000);x.bot.pulse();await x.bot.inflight;
  assert.equal(x.calls.length,count,'outdated PUT cannot be replayed later');
 });
 test(provider+': stop loss still protects against broker-unknown exposure',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({stopLoss:1.5});
  await x.bot.start();await x.fire('CALL');x.advance(30000);x.bot.watch();
  const n=x.calls.length;await x.fire('PUT');
  assert.equal(x.calls.length,n,'the prior one-dollar unknown + new stake exceed user-chosen cap');
  assert.equal(x.bot.enabled,false);
  assert.equal(x.bot.net,0,'loss must never be invented');
 });
}

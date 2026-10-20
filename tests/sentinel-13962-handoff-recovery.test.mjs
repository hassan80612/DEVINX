import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/executor-13946.mjs';

function closeBatch(x,pnl=-1){
 const b=x.bot.pending;assert.ok(b);
 x.advance(32000);
 for(const order of b.orders)
  assert.equal(x.bot.settle({provider:x.c.provider,orderId:order.orderId,
   accountId:'10',netPnl:pnl,source:'broker'}),true);
 assert.equal(x.bot.pending,null);
}
for(const provider of ['iq_option','exnova']){
 test(provider+': after FOUR martingale levels the following immediate signal resumes at 1 click without stale old analysis',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:3});
  await x.bot.start();
  for(const count of [1,3,9,27]){
   const before=x.calls.length;
   await x.fire('CALL');
   assert.equal(x.calls.length-before,count,'selected martingale level clicks');
   closeBatch(x,-1);
  }
  assert.equal(x.bot.martingaleLevel,0);
  assert.equal(x.bot.nextClicks(),1);
  // The previous page signal can still be visible in runtime.lastResult
  // while heavyweight post-analysis work is processing the NEW signal.
  const old=x.c.analysis.vnext.futureEntryAnchor;
  const next={...old,side:'PUT',entryTriggeredAt:x.now(),entryAt:x.now(),
   exitAt:x.now()+30000,issuedAt:x.now(),entryReadyNow:true};
  const before=x.calls.length;
  x.bot.pulse(next);
  await x.bot.inflight;
  assert.equal(x.calls.length-before,1);
  assert.equal(x.calls.at(-1).side,'PUT');
  assert.equal(x.bot.nextClicks(),1);
  // Replaying the published frame must not click a duplicate.
  x.c.analysis={vnext:{futureEntryAnchor:next}};
  x.bot.pulse();
  await x.bot.inflight;
  assert.equal(x.calls.length-before,1);
  closeBatch(x,0.85);
  assert.equal(x.bot.nextClicks(),1);
 });
 test(provider+': while any previous martingale batch is pending the status must NOT claim signal stale',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:3});
  await x.bot.start();await x.fire('CALL');
  const pending=x.bot.pending;
  x.advance(1200);
  const old=x.c.analysis.vnext.futureEntryAnchor;
  x.bot.pulse({...old,entryTriggeredAt:x.now()-1100,
   exitAt:x.now()+28900,side:'PUT'});
  assert.equal(x.bot.pending,pending);
  assert.match(x.bot.message,/aguardando resultado da sequência anterior/);
  assert.doesNotMatch(x.bot.message,/Sinal antigo|Sinal recebido fora do prazo/);
  assert.equal(x.calls.length,1);
 });
 test(provider+': overdue signal is still denied when no pending trade, protecting late entries',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  await x.bot.start();
  const stale={context:provider+'|EURUSDOTC|automatic|30000',
   engineId:'automatic',phase:'fired',side:'CALL',
   entryTriggeredAt:x.now(),holdingSeconds:30,exitAt:x.now()+30000};
  x.advance(1200);x.bot.pulse(stale);
  assert.equal(x.calls.length,0);
  assert.match(x.bot.message,/1200ms; limite 900ms/);
 });
}

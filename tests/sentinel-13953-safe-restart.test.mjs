import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './fixtures/executor-13946.mjs';

for(const provider of ['iq_option','exnova']){
 test(provider+': start can rearm an OFF bot with pending settlement without duplicating any trade',async()=>{
  const x=setup(provider);
  x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  await x.bot.start();
  await x.fire('CALL');
  const oldId=x.bot.pending.orderId,oldSession=x.bot.sessionId,oldEntry=x.bot.executed;
  const oldBalance=x.bot.initialBalance;
  x.bot.stop('Pausa manual');
  assert.equal(x.bot.enabled,false);
  assert.ok(x.bot.pending);
  await x.bot.start();
  assert.equal(x.bot.enabled,true);
  assert.equal(x.bot.sessionId,oldSession);
  assert.equal(x.bot.initialBalance,oldBalance);
  assert.equal(x.bot.pending.orderId,oldId);
  assert.equal(x.bot.executed,oldEntry);
  assert.match(x.bot.message,/Ligado novamente/);
  await x.fire('PUT');
  assert.equal(x.calls.length,1,'cannot overlap a pending broker order');
  assert.equal(x.bot.settle({provider,orderId:oldId,netPnl:-1,source:'broker'}),true);
  assert.equal(x.bot.nextClicks(),2,'loss is learned after the genuine settlement');
  x.advance(400);
  await x.fire('PUT');
  assert.equal(x.calls.length,3);
  assert.deepEqual(x.calls.slice(1).map(o=>o.side),['PUT','PUT']);
  assert.equal(x.bot.enabled,true);
 });
 test(provider+': pending two-click Martingale batch can be safely resumed from OFF with unchanged progression',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  await x.bot.start();await x.fire('CALL');let first=x.bot.pending;
  x.advance(30000);
  assert.ok(x.bot.settle({provider,orderId:first.orderId,netPnl:-1,source:'broker'}));
  await x.fire('PUT');const batch=x.bot.pending;
  assert.equal(batch.clickCount,2);
  assert.equal(x.bot.nextClicks(),2);
  x.bot.stop();await x.bot.start();
  assert.equal(x.bot.pending,batch);
  assert.equal(x.bot.nextClicks(),2);
  x.advance(31000);x.bot.watch();
  assert.equal(x.bot.enabled,true);
  for(const p of [...batch.orders])assert.ok(x.bot.settle({provider,orderId:p.orderId,netPnl:-1,source:'broker'}));
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.nextClicks(),4);
  await x.fire('CALL');
  assert.equal(x.bot.pending.clickCount,4);
 });
 test(provider+': refusing to rearm a different broker account does not erase unsettled positions',async()=>{
  const x=setup(provider);
  await x.bot.start();await x.fire();const batch=x.bot.pending;
  x.bot.stop();
  x.balance(100,'different-account');
  await assert.rejects(()=>x.bot.start(),/conta\/ativo anterior|Analista mudou/);
  assert.equal(x.bot.enabled,false);
  assert.equal(x.bot.pending,batch);
  assert.equal(x.bot.executed,1);
 });
 test(provider+': a normal stop with no pending positions still starts a fresh session',async()=>{
  const x=setup(provider);await x.bot.start();const sid=x.bot.sessionId;
  x.bot.stop();await x.bot.start();
  assert.equal(x.bot.enabled,true);
  assert.equal(x.bot.sessionId,sid+1);
  await x.fire('PUT');assert.equal(x.calls.at(-1).side,'PUT');
 });
}
test('PC and mobile allow restart when OFF with pending settlement, but Map is still blocked',()=>{
 const pc=readFileSync(new URL('../sentinel-trading-lab/agent/worker/executor-panel.mjs',import.meta.url),'utf8');
 const mobile=readFileSync(new URL('../sentinel-trading-lab/src/components/BotControl.tsx',import.meta.url),'utf8');
 assert.match(pc,/startDisabled=state.enabled\|\|state.arming/);
 assert.match(pc,/data-sentinel-executor-action="start"'\+startDisabled/);
 assert.match(pc,/data-sentinel-executor-action="map"'\+disabled/);
 assert.match(mobile,/bot.arming\|\|bot.enabled\|\|s.state!==/);
 assert.doesNotMatch(mobile,/bot.arming\|\|bot.enabled\|\|!!bot.pending/);
});

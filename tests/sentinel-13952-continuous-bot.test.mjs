import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './fixtures/executor-13946.mjs';
import {BrokerUiExecutor,settlementFromFrame} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

for(const provider of ['iq_option','exnova']){
 test(provider+': no 30s bot interval; next 5s analyst CALL/PUT is executed as soon as prior trade is settled',async()=>{
  const x=setup(provider);
  x.c.durationMs=5000;
  x.c.brokerBalance=null;
  x.bot.configure({intervalMs:30000,martingaleEnabled:true,martingaleLevels:3});
  await x.bot.start();
  await x.fire('CALL');
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].side,'CALL');
  assert.equal(x.calls[0].clickedAt,x.now(),'entry captures actual analyst signal moment');
  x.advance(5000);
  assert.equal(x.bot.settle({provider,orderId:x.bot.pending.orderId,netPnl:-1,source:'broker'}),true);
  assert.equal(x.bot.nextClicks(),2);
  x.advance(250);
  await x.fire('PUT');
  assert.equal(x.calls.length,3,'second analyst signal must not be skipped by old 30s cooldown');
  assert.deepEqual(x.calls.slice(1).map(o=>o.side),['PUT','PUT']);
  assert.equal(x.bot.pending.clickCount,2);
  assert.equal(x.bot.enabled,true);
 });
 test(provider+': late settlement reconciles without blocking subsequent normal entry',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  await x.bot.start();await x.fire('CALL');
  const oldId=x.bot.pending.orderId;
  x.advance(160000);x.bot.watch();
  assert.equal(x.bot.enabled,true);
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.unresolvedBatches.size,1);
  assert.equal(x.bot.nextClicks(),1,'unknown result never escalates Martingale');
  assert.equal(x.bot.net,0,'unknown result never fabricates a loss');
  assert.match(x.bot.message,/resultado financeiro pendente/);
  const before=x.calls.length;
  await x.fire('PUT');
  assert.equal(x.calls.length,before+1,'fresh signal after expiry continues with one click');
  assert.equal(x.bot.pending.clickCount,1);
  assert.ok(x.bot.settle({provider,orderId:oldId,netPnl:-1,source:'broker'}));
  assert.equal(x.bot.unresolvedBatches.size,0);
  assert.equal(x.bot.nextClicks(),1,'late prior loss cannot overwrite new cycle');
  assert.equal(x.bot.enabled,true);
  assert.equal(x.bot.pending.clickCount,1,'new click is independent of old unresolved result');
 });
 test(provider+': grouped closing packet completes two identified martingale orders, rejects unknown and duplicates',()=>{
  const matched=[],ui=new BrokerUiExecutor({}, {onSettlement:e=>matched.push(e)});
  for(const orderId of ['7','8'])ui.orders.set(provider+'|'+orderId,{provider,orderId,accountId:'10',amount:1,side:'CALL'});
  const packet={name:'event',msg:{name:'positions-changed',body:{positions:[
    {external_id:7,balance_id:10,invest:1,status:'closed',close_profit:0},
    {external_id:8,balance_id:10,invest:1,status:'closed',close_profit:1.86},
    {external_id:9,balance_id:10,invest:1,status:'closed',close_profit:1.86}
  ]}}};
  ui.observe(provider,packet,'page-in');
  assert.deepEqual(matched.map(e=>[e.orderId,e.netPnl]),[['7',-1],['8',.8600000000000001]]);
  assert.equal(ui.orders.size,0);
  ui.observe(provider,packet,'page-in');
  assert.equal(matched.length,2,'duplicate frame cannot settle twice');
  const wrong={name:'event',msg:{name:'positions-changed',body:{positions:[{order_id:'9',balance_id:20,invest:1,status:'closed',close_profit:2}]}}};
  assert.equal(settlementFromFrame(provider,wrong,{orderId:'9',accountId:'10',amount:1}),null);
 });
}
test('PC and phone no longer offer an interval setting which could skip analyst entries',()=>{
 const files=['../sentinel-trading-lab/agent/worker/executor-panel.mjs','../sentinel-trading-lab/src/components/BotControl.tsx'];
 for(const path of files){
  const c=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.doesNotMatch(c,/data-sentinel-executor-setting="intervalMs"|\['intervalMs','Intervalo entre entradas/);
 }
});
test('existing source sends each fresh one-shot decision to executor in post-analysis path',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(source,/await runtime\.tick\(loopNow,\{skipStatus:true\}\);\s*executor\.pulse\(\);/);
 const exec=readFileSync(new URL('../sentinel-trading-lab/agent/worker/signal-executor.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(exec,/s\.at-this\.lastEntryAt>=this\.config\.intervalMs/);
 assert.doesNotMatch(exec,/this\.releaseUnresolved\(\)/);
});

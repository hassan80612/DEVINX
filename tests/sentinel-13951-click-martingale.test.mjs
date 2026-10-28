import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {setup} from './fixtures/executor-13946.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
function settleSequence(x,values){
 const batch=x.bot.pending;assert.equal(values.length,batch.orders.length);x.advance(60000);
 for(const [i,p] of [...batch.orders].entries())assert.ok(x.bot.settle({provider:x.c.provider,accountId:'10',orderId:p.orderId,netPnl:values[i],source:'broker'}));
}
for(const provider of ['iq_option','exnova']){
 test(provider+': 1→2→4 physical clicks at fixed stake, reset on win/final level, retain on tie',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();
  for(const [count,pnl] of [[1,-1],[2,0],[2,-1],[4,-1],[1,-1],[2,.86],[1,.86]]){
   const before=x.calls.length;await x.fire('PUT');assert.equal(x.calls.length-before,count);assert.equal(x.bot.pending.clickCount,count);assert.equal(x.bot.pending.amount,count);
   assert.ok(x.calls.slice(before).every(p=>p.amount===1&&p.side==='PUT'));settleSequence(x,Array(count).fill(pnl));assert.equal(x.bot.pending,null);
  }
  assert.equal(x.bot.nextClicks(),1);assert.equal(x.bot.executed,13);assert.equal(x.bot.closed,13);
 });
 test(provider+': progression waits for ALL individual closes and uses aggregate result, not the first win',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();await x.fire();settleSequence(x,[-1]);await x.fire('PUT');
  const batch=x.bot.pending,[a,b]=batch.orders;x.advance(60000);
  assert.ok(x.bot.settle({provider,orderId:b.orderId,netPnl:.86}));assert.equal(x.bot.pending,batch);assert.equal(x.bot.nextClicks(),2);
  assert.equal(x.bot.settle({provider,orderId:b.orderId,netPnl:.86}),false);assert.ok(x.bot.settle({provider,orderId:a.orderId,netPnl:-1}));assert.equal(x.bot.nextClicks(),4);assert.equal(x.bot.closed,3);
 });
 test(provider+': full-sequence loss protection uses absolute bankroll floor and broker reading',async()=>{
  const x=setup(provider);x.balance(50);x.bot.configure({martingaleEnabled:true,martingaleLevels:3,stopLoss:48});await x.bot.start();await x.fire();settleSequence(x,[-1]);await x.fire('PUT');assert.equal(x.calls.length,1);assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/limite de perda restante/);
 });
 test(provider+': a late broker LOSS before next entry restores 4-click progression',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();await x.fire();settleSequence(x,[-1]);await x.fire();const [a,b]=x.bot.pending.orders;x.advance(30000);x.bot.settle({provider,orderId:a.orderId,netPnl:-1});assert.ok(x.bot.pending);x.advance(15001);x.bot.watch();assert.equal(x.bot.pending,null);assert.equal(x.bot.unresolvedBatches.size,1);assert.equal(x.bot.enabled,true);assert.equal(x.bot.nextClicks(),1);assert.ok(x.bot.settle({provider,orderId:b.orderId,netPnl:-1}));assert.equal(x.bot.unresolvedBatches.size,0);assert.equal(x.bot.nextClicks(),4);
 });
 test(provider+': disabling martingale while a sequence is open preserves orders then returns to one click',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();await x.fire();settleSequence(x,[-1]);await x.fire();assert.equal(x.bot.pending.orders.length,2);x.bot.configure({martingaleEnabled:false});settleSequence(x,[-1,-1]);assert.equal(x.bot.nextClicks(),1);await x.fire();assert.equal(x.bot.pending.orders.length,1);
 });
 test(provider+': minute expiry and phone control survive while fixed broker controls are not edited',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;x.c.durationMs=60000;await x.bot.start();await x.fire();const end=x.bot.pending.exitAt;x.advance(30000);await x.fire();assert.equal(x.calls.length,1);assert.equal(x.bot.pending.exitAt,end);assert.equal(x.bot.pending.orders[0].durationMs,60000);x.bot.stop();assert.ok(x.bot.pending);x.bot.configure({stopAfterMinutes:5,stopLoss:12});settleSequence(x,[.86]);assert.equal(x.bot.enabled,false);assert.equal(x.bot.config.stopAfterMinutes,5);
 });
 test(provider+': before-click sibling failure does not switch OFF; partial sequence never replays',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:2});
  await x.bot.start();await x.fire();settleSequence(x,[-1]);
  let calls=0,seq=0;
  x.driver.execute=async(p,o)=>{
   calls++;
   if(calls===2)throw Object.assign(Error('before click failure'),{beforeClick:true});
   o.captureEntry();o.clicked=true;
   return{accepted:true,orderId:'partial-'+(++seq)};
  };
  await x.fire('PUT');
  assert.equal(x.bot.enabled,true,'pre-click failure is not an automatic stop');
  assert.equal(x.bot.pending.orders.length,1);
  assert.equal(x.bot.pending.orders[0].orderId,'partial-1');
  x.advance(30000);
  assert.ok(x.bot.settle({provider,orderId:'partial-1',netPnl:.86,source:'broker'}));
  assert.equal(x.bot.nextClicks(),2,'partial batch must not advance/reset Martingale based on incomplete signal');
  assert.equal(calls,2,'no replay of the failed partial signal');
  x.advance(500);
  await x.fire('PUT');
  assert.equal(calls,4,'only a new analyst signal can launch another 2-click batch');
  assert.equal(x.bot.enabled,true);
 });;
}
test('maximum is finite/integer, zero disables progression, and wire carries click count without IDs',async()=>{
 const x=setup();for(const levels of [-1,1.5,11,Infinity])assert.throws(()=>x.bot.configure({martingaleLevels:levels}));x.bot.configure({martingaleEnabled:true,martingaleLevels:0});await x.bot.start();await x.fire();settleSequence(x,[-1]);assert.equal(x.bot.nextClicks(),1);
 const out=unpackExecutor(packExecutor({...x.bot.status(),nextClicks:8,brokerBalance:{amount:30,accountId:'private-id'}}));assert.equal(out.nextClicks,8);assert.equal(out.capabilities.brokerExecution,5);assert.doesNotMatch(JSON.stringify(out),/private-id/);
});
test('clean pre-martingale base has only CALL/PUT mapping; no value/expiry/keyboard/diagnostic dependency',async()=>{
 const module=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs',import.meta.url),'utf8');assert.doesNotMatch(module,/BrokerTradeParameters|brokerInputProbe|applyParameters|manualKey|keyboard\.|mouse\.|\.fill\(/);
 for(const name of ['broker-trade-parameters.mjs','broker-keypad.mjs','broker-input-diagnostic.mjs'])assert.equal(existsSync(new URL('../sentinel-trading-lab/agent/worker/'+name,import.meta.url)),false);
 for(const provider of ['iq_option','exnova']){const ui=new BrokerUiExecutor({state:()=>({symbol:'EURUSD',activeId:76})});let lookups=0;ui.controls=async()=>{lookups++;return{};};await ui.prepare(provider,{asset:'EUR/USD',activeId:76});assert.equal(lookups,1);}
});
test('PC panel says fixed-value clicks and removes keyboard diagnosis in every language',()=>{
 for(const language of ['pt','en','es','fr','ar']){const html=executorPanel({config:{amount:3,martingaleEnabled:true,martingaleLevels:3},nextClicks:4},language);assert.doesNotMatch(html,/executor-action="diagnose"/);assert.doesNotMatch(html,/executor-setting="(?:initialBalance|payoutPercent)"/);assert.match(html,/1 .* → 2 .* → 4 .* → 8 /);}
});
test('Stop during dispatch cancels remaining clicks but keeps an accepted order and its loss accounting',async()=>{
 const x=setup();x.c.brokerBalance=null;x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();await x.fire();settleSequence(x,[-1]);let clicks=0;
 x.driver.execute=async(provider,o)=>{clicks++;o.captureEntry();o.clicked=true;x.bot.stop();return{accepted:true,orderId:'before-stop'};};await x.fire('PUT');assert.equal(clicks,1);assert.equal(x.bot.pending.orders.length,1);assert.equal(x.bot.enabled,false);x.advance(30000);assert.ok(x.bot.settle({provider:'iq_option',orderId:'before-stop',netPnl:-1}));assert.equal(x.bot.pending,null);assert.equal(x.bot.nextClicks(),2);assert.equal(x.bot.net,-2);
});
test('one-minute option stays selectable on the floating card and mobile requires the click-count Agent',()=>{
 const card=readFileSync(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');assert.match(card,/expiryChoices=vnext\?\[5,10,15,30,60,120,300\]/);
 const phone=readFileSync(new URL('../sentinel-trading-lab/src/components/BotControl.tsx',import.meta.url),'utf8');assert.match(phone,/brokerExecution\)>=4/);assert.match(phone,/bot.nextClicks/);
});

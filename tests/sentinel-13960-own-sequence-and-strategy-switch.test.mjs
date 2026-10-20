import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,T} from './fixtures/executor-13946.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';

function settle(x,pnl=-1){
 const b=x.bot.pending;assert.ok(b,'broker batch pending');
 x.advance(60000);
 for(const child of [...b.orders]){
  assert.equal(x.bot.settle({provider:x.c.provider,accountId:'10',
   orderId:child.orderId,netPnl:pnl,source:'broker'}),true);
 }
 assert.equal(x.bot.pending,null);
}
for(const provider of ['iq_option','exnova']){
 test(provider+': optional tripling uses 1,3,9,27 physical clicks, then returns to one only on final completed LOSS',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:3});
  await x.bot.start();
  for(const n of [1,3,9,27]){
   assert.equal(x.bot.nextClicks(),n);
   const previous=x.calls.length;
   await x.fire('PUT');assert.equal(x.calls.length-previous,n);
   assert.equal(x.bot.pending.clickCount,n);
   assert.equal(x.bot.pending.amount,n);
   assert.ok(x.bot.pending.orders.every(o=>o.amount===1&&o.side==='PUT'));
   settle(x,-1);
   assert.equal(x.bot.enabled,true);
  }
  assert.equal(x.bot.nextClicks(),1);
  assert.equal(x.bot.net,-40);
 });
 test(provider+': skipped 3-click recovery never sends one default click or resets broker-owned level',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:3});
  await x.bot.start();await x.fire('CALL');settle(x,-1);
  assert.equal(x.bot.nextClicks(),3);
  const calls=x.calls.length;
  x.driver.batchFeasibility=(_,a)=>a.count===1?{safe:true}:{safe:false,reason:'broker very slow'};
  await x.fire('PUT');
  assert.equal(x.calls.length,calls);
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.nextClicks(),3);
  assert.equal(x.bot.enabled,true);
  assert.match(x.bot.message,/nível de martingale preservado/);
  x.advance(31000);await x.fire('CALL');assert.equal(x.calls.length,calls);
  assert.equal(x.bot.nextClicks(),3);
  x.driver.batchFeasibility=()=>({safe:true});
  x.advance(31000);await x.fire('PUT');
  assert.equal(x.calls.length-calls,3);
  settle(x,0.86);
  assert.equal(x.bot.nextClicks(),1,'real broker batch profit resets level');
 });
 test(provider+': hot change to another strategy preserves progression and ignores stale old-engine signal',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:2});
  await x.bot.start();
  await x.fire('CALL');settle(x,-1);
  assert.equal(x.bot.nextClicks(),3);
  x.c.engine='mean_reversion';
  // Old-engine signal is no longer authorized for the new setting.
  x.c.analysis={vnext:{futureEntryAnchor:{engineId:'automatic',phase:'fired',side:'CALL',
   context:'old',entryTriggeredAt:x.now(),holdingSeconds:30,exitAt:x.now()+30000}}};
  x.bot.pulse();
  assert.equal(x.bot.nextClicks(),3);
  assert.equal(x.bot.enabled,true);
  assert.equal(x.calls.length,1);
  await x.fire('PUT','mean_reversion');
  assert.equal(x.bot.pending.clickCount,3);
  settle(x,-1);
  assert.equal(x.bot.nextClicks(),9);
 });
 test(provider+': late complete settlement changes own progression once, no uncertain restart',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:2});
  await x.bot.start();await x.fire('CALL');settle(x,-1);
  await x.fire('PUT');const batch=x.bot.pending;
  assert.equal(batch.clickCount,3);
  x.advance(80000);x.bot.watch();
  assert.equal(x.bot.pending,null);
  assert.equal(x.bot.unresolvedBatches.size,1);
  assert.equal(x.bot.nextClicks(),3,'never reset on delayed close');
  const calls=x.calls.length;
  await x.fire('CALL');assert.equal(x.calls.length,calls,'unknown broker orders block new spending');
  for(const order of batch.orders){
   assert.equal(x.bot.settle({provider,orderId:order.orderId,netPnl:-1,source:'broker'}),true);
  }
  assert.equal(x.bot.unresolvedBatches.size,0);
  assert.equal(x.bot.nextClicks(),9,'confirmed loss advances exactly once');
  assert.equal(x.bot.consecutiveLossBatches,2);
 });
}
test('strategy switch keeps previous live expiry boundary but never replays old CALL',()=>{
 const prior={context:'iq_option|EUR/GBP OTC|automatic|30000',asset:'EUR/GBP OTC',
  engineId:'automatic',phase:'fired',side:'CALL',entryAt:T,entryTriggeredAt:T,
  exitAt:T+30000,holdingSeconds:30};
 const next=advanceNowOpportunity({previous:prior,now:T+1000,quoteAt:T+1000,asset:'EUR/GBP OTC',
  provider:'iq_option',engineId:'trend',durationMs:30000,
  candidate:{ready:true,side:'PUT',observedAt:T+1000,entryPrice:1.1}});
 assert.equal(next.phase,'scanning');
 assert.equal(next.side,null);
 assert.equal(next.reason,'strategy-switch-awaiting-previous-expiry');
 assert.equal(next.lastExpiryAt,T+30000);
 const after=advanceNowOpportunity({previous:next,now:T+30000,quoteAt:T+30000,
  provider:'iq_option',asset:'EUR/GBP OTC',engineId:'trend',durationMs:30000,
  candidate:{ready:true,side:'PUT',observedAt:T+30000,entryPrice:1.09}});
 assert.equal(after.phase,'fired');assert.equal(after.side,'PUT');assert.equal(after.entryTriggeredAt,T+30000);
});
test('runtime engine change keeps last active expiry while clearing old public signal',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.vnextWindowState={context:'iq_option|EUR/USD|automatic|30000',asset:'EUR/USD',
  engineId:'automatic',phase:'fired',side:'CALL',entryAt:T,
  exitAt:T+30000,holdingSeconds:30};
 runtime.lastResult={analysis:{vnext:{futureEntryAnchor:{side:'CALL'},engineId:'automatic'}}};
 runtime.patchSettings({engine:'trend'},'overlay');
 assert.equal(runtime.settings.engine,'trend');
 assert.equal(runtime.vnextWindowState?.exitAt,T+30000);
 assert.equal(runtime.lastResult.analysis.vnext.futureEntryAnchor,null);
 runtime.patchSettings({orderDurationMs:60000},'overlay');
 assert.equal(runtime.vnextWindowState,null);
});
test('wire transmits chosen triple multiplier and UI displays the selected progression',()=>{
 const x=setup();x.bot.configure({martingaleEnabled:true,martingaleLevels:3,martingaleMultiplier:3});
 const raw={...x.bot.status(),provider:'iq_option'};
 const received=unpackExecutor(packExecutor(raw));
 assert.equal(received.config.martingaleMultiplier,3);
 assert.equal(received.capabilities.brokerExecution,5);
 const html=executorPanel(raw,'pt');
 assert.match(html,/data-sentinel-executor-setting="martingaleMultiplier"/);
 assert.match(html,/1 .* → 3 .* → 9 .* → 27 /);
});
test('triple multiplier refuses values except 2 or 3, preserves backward-compatible default 2',()=>{
 const x=setup();
 assert.equal(x.bot.config.martingaleMultiplier,2);
 for(const bad of [-1,0,1,2.5,4,Infinity])assert.throws(()=>x.bot.configure({martingaleMultiplier:bad}));
 x.bot.configure({martingaleMultiplier:3});
 assert.equal(x.bot.nextClicks(),1);
});

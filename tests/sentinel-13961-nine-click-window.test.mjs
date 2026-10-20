import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/executor-13946.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {maxBatchDispatchMs,maxSignalAgeMs} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';

function close(x,loss=-1){
 const b=x.bot.pending;assert.ok(b);
 x.advance(31000);
 for(const o of [...b.orders])
  assert.equal(x.bot.settle({provider:x.c.provider,orderId:o.orderId,netPnl:loss,source:'broker'}),true);
}
for(const provider of ['iq_option','exnova']){
 test(provider+': a genuinely fast nine-click batch executes ALL nine even when total dispatch exceeds 900ms',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleMultiplier:3,martingaleLevels:3});
  await x.bot.start();
  await x.fire('CALL');close(x,-1);
  await x.fire('PUT');close(x,-1);
  assert.equal(x.bot.nextClicks(),9);
  const ui=new BrokerUiExecutor({});
  ui.confirmedDispatchDurations.set(ui.dispatchKey(provider,76),[180,190,210,220]);
  x.driver.batchFeasibility=(p,args)=>ui.batchFeasibility(p,args);
  const originalExecute=x.driver.execute;
  let queue=Promise.resolve();
  x.driver.execute=(p,order)=>{
   const step=queue.then(async()=>{x.advance(220);return originalExecute(p,order)});
   queue=step.catch(()=>{});
   return step;
  };
  const start=x.now(),previous=x.calls.length;
  await x.fire('CALL');
  assert.equal(x.calls.length-previous,9,'none of the last eight clicks was cancelled by the old 900ms guard');
  assert.equal(x.now()-start,1980,'9 clicks really consumed 1.98 seconds');
  assert.equal(x.bot.pending.clickCount,9);
  assert.equal(x.bot.pending.orders.filter(o=>o.clicked).length,9);
  assert.equal(x.bot.martingaleLevel,2,'no pre-settlement progression');
  close(x,.82);
  assert.equal(x.bot.nextClicks(),1,'all nine broker-confirmed profitable orders finish the batch');
 });
 test(provider+': an aged first click is still discarded, regardless of possible nine-click throughput',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;await x.bot.start();
  x.driver.batchFeasibility=()=>({safe:true});
  const started=x.now();x.c.analysis={vnext:{futureEntryAnchor:{context:[provider,'EURUSDOTC','automatic',30000].join('|'),
   engineId:'automatic',phase:'fired',side:'CALL',entryTriggeredAt:started,
   holdingSeconds:30,exitAt:started+30000,entryPrice:1.1}}};
  x.advance(1100);x.bot.pulse();
  assert.equal(x.calls.length,0);
  assert.match(x.bot.message,/Sinal recebido fora do prazo/);
 });
}
test('first click still has strict freshness; batch completion uses independent bounded time',()=>{
 assert.equal(maxSignalAgeMs(30000),900);
 assert.equal(maxBatchDispatchMs(30000),5000);
 assert.equal(maxBatchDispatchMs(5000),850);
 assert.equal(maxBatchDispatchMs(10000),1600);
 assert.equal(maxBatchDispatchMs(15000),2500);
 assert.equal(maxBatchDispatchMs(60000),8000);
});

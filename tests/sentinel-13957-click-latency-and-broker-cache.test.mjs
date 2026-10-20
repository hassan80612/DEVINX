import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/executor-13946.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';

function anchor(x,at,durationMs=30000){
 const c=x.c;c.durationMs=durationMs;
 c.analysis={vnext:{futureEntryAnchor:{context:[c.provider,c.asset,c.engine,durationMs].join('|'),
  engineId:c.engine,phase:'fired',side:'CALL',
  entryTriggeredAt:at,holdingSeconds:durationMs/1000,
  exitAt:at+durationMs,entryPrice:1.1}}};
}
test('stage6: very slow broker cannot execute an aged 30s signal (no stop, no late click)',async()=>{
 const x=setup();x.c.brokerBalance=null;await x.bot.start();
 anchor(x,x.now(),30000);x.advance(1000);x.bot.pulse();
 assert.equal(x.calls.length,0);
 assert.equal(x.bot.enabled,true);
 assert.match(x.bot.message,/Sinal recebido fora do prazo/);
});
test('stage6: a still-fresh 30s signal retains ordinary single-click semantics',async()=>{
 const x=setup();x.c.brokerBalance=null;await x.bot.start();
 anchor(x,x.now(),30000);x.advance(500);x.bot.pulse();
 await x.bot.inflight;
 assert.equal(x.calls.length,1);
 assert.equal(x.bot.pending.orders[0].durationMs,30000);
});
test('stage6: 60s entry retains 1.5s compatibility budget',async()=>{
 const x=setup();x.c.brokerBalance=null;x.c.durationMs=60000;await x.bot.start();
 anchor(x,x.now(),60000);x.advance(1000);x.bot.pulse();await x.bot.inflight;
 assert.equal(x.calls.length,1);
});
test('stage6: nine-click measured throughput uses bounded batch time, not 900ms first-click deadline',()=>{
 const ui=new BrokerUiExecutor({});
 const key=ui.dispatchKey('exnova',76);
 ui.confirmedDispatchDurations.set(key,[120,145,160,175,200,210,220,3000]);
 const opts={count:9,activeId:76,entryAt:2000,maxEntryAgeMs:900,maxBatchAgeMs:5000};
 assert.equal(ui.batchFeasibility('exnova',{...opts,now:2200}).safe,true);
 assert.equal(ui.batchFeasibility('exnova',{...opts,now:2600}).safe,true);
 assert.equal(ui.batchFeasibility('exnova',{...opts,now:3000}).safe,false,'first click must still be timely');
 ui.confirmedDispatchDurations.set(key,[750,850,900]);
 assert.equal(ui.batchFeasibility('exnova',{...opts,now:2200}).safe,false,'measured slow broker cannot fit nine');
});
test('stage6: unknown throughput does not automatically reject nine clicks, but 27 needs calibration',()=>{
 const ui=new BrokerUiExecutor({});
 const opts={activeId:76,entryAt:5000,now:5100,maxEntryAgeMs:900,maxBatchAgeMs:5000};
 assert.equal(ui.batchFeasibility('exnova',{...opts,count:9}).safe,true);
 assert.equal(ui.batchFeasibility('exnova',{...opts,count:27}).safe,false);
 assert.equal(ui.batchFeasibility('iq_option',{...opts,count:3}).safe,true);
});
test('operator responsiveness: reuse verified visible HTML controls within the same broker/asset instead of scanning all frames',async()=>{
 let evaluations=0,valid=true,activeId=76;
 const loc=()=>({
  count:async()=>valid?1:0,
  isVisible:async()=>valid,
  isEnabled:async()=>valid
 });
 const frame={
  evaluate:async()=>{evaluations++;return{callSelector:'[data-sentinel-execution-call="c"]',
    putSelector:'[data-sentinel-execution-put="p"]'};},
  locator:loc
 };
 const page={isClosed:()=>false,frames:()=>[frame]};
 const driver={sessions:new Map([['iq_option',{page}]]),state:()=>({activeId,symbol:'EUR/USD OTC'})};
 const ui=new BrokerUiExecutor(driver);
 const first=await ui.controls('iq_option');
 const second=await ui.controls('iq_option');
 assert.equal(evaluations,1);
 assert.equal(first.frame,second.frame);
 valid=false;
 await ui.controls('iq_option');
 assert.equal(evaluations,2,'stale or disabled controls must be rediscovered');
 valid=true;activeId=77;
 await ui.controls('iq_option');
 assert.equal(evaluations,3,'different asset ID must not inherit stale selectors');
});

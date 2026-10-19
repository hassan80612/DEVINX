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
 assert.match(x.bot.message,/Sinal antigo descartado/);
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
test('stage6: measured batch feasibility applies the REAL deadline, not stale old 1500ms default',()=>{
 const ui=new BrokerUiExecutor({});
 ui.confirmedDispatchDurations.set(ui.dispatchKey('exnova',76),[200]);
 assert.equal(ui.batchFeasibility('exnova',{count:4,activeId:76,entryAt:2000,now:2200,maxEntryAgeMs:900}).safe,true);
 assert.equal(ui.batchFeasibility('exnova',{count:4,activeId:76,entryAt:2000,now:2500,maxEntryAgeMs:900}).safe,false);
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

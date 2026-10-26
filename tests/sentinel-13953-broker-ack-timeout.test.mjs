import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';

for(const provider of ['iq_option','exnova']){
 for(const outboundTiming of ['before-timeout','after-timeout']){
  test(provider+': '+outboundTiming+' click without broker ACK never switches bot OFF, recovers correct order and next Martingale',async()=>{
   let now=1800000000000,serial=100;
   const c={provider,asset:'EUR/USD OTC',activeId:76,state:'running',licensed:true,
    engine:'automatic',durationMs:30000,analysis:{},brokerBalance:null};
   let physicalClicks=0;
   const client={state:()=>({symbol:c.asset,activeId:c.activeId})};
   let bot;
   const ui=new BrokerUiExecutor(client,{
    ackTimeoutMs:20,
    onSent:(rid,id)=>bot.sent(rid,id),
    onAccepted:e=>bot.accepted(e),
    onSettlement:e=>bot.settle(e),
    onRejected:e=>bot.rejected(e),
    onUnexpectedOrder:()=>bot.stop('external-trade')
   });
   ui.controls=async()=>({frame:{evaluate:async()=>({blocked:false}),locator:()=>({click:async()=>{
     physicalClicks++;
     if(outboundTiming==='before-timeout')pageOut();
    }})},callSelector:'#call',putSelector:'#put'});
   let orderRef,requestId=null;
   const pageOut=()=>{
    if(requestId!==null)return;
    requestId=String(++serial);
    ui.observe(provider,{name:'open-option',request_id:requestId,msg:{name:'open-option',body:{price:1,active_id:76,direction:'call',user_balance_id:10}}},'page-out');
   };
   const driver={prepare:async()=>{},execute:async(p,o)=>{orderRef=o;return ui.execute(p,o);}};
   bot=new SignalExecutor({driver,context:()=>c,clock:()=>now});
   bot.configure({amount:1,martingaleEnabled:true,martingaleLevels:3});
   await bot.start();
   c.analysis={vnext:{futureEntryAnchor:{
    context:provider+'|EURUSDOTC|automatic|30000',engineId:'automatic',phase:'fired',side:'CALL',
    entryTriggeredAt:now,exitAt:now+30000,holdingSeconds:30,entryPrice:1
   }}};
   bot.pulse();await bot.inflight;
   assert.equal(physicalClicks,1,'one physical click, not repeated');
   assert.equal(bot.enabled,true,'timeout is not a stop');
   assert.ok(bot.pending,'uncertain order remains tracked');
   assert.equal(bot.pending.orders.length,1);
   assert.equal(bot.pending.orders[0].state,'awaiting-broker');
   assert.equal(bot.nextClicks(),1,'do not infer a loss from a timeout');
   if(outboundTiming==='after-timeout')pageOut();
   assert.equal(bot.pending.orders[0].requestId,requestId);
   ui.observe(provider,{name:'open-option',request_id:requestId,msg:{name:'open-option',body:{id:771,open_price:1.2,user_balance_id:10}}},'page-in');
   assert.equal(bot.pending.orderId,'771','late response assigns the original broker order');
   assert.equal(bot.executed,1);
   now+=31000;
   ui.observe(provider,{name:'option-closed',msg:{name:'option-closed',body:{id:771,user_balance_id:10,amount:1,profit_amount:0}}},'page-in');
   assert.equal(bot.enabled,true);
   assert.equal(bot.pending,null,'real broker settlement clears the batch');
   assert.equal(bot.closed,1);
   assert.equal(bot.nextClicks(),2,'confirmed loss advances Martingale');
  });
 }
 test(provider+': stopped bot with UNKNOWN clicked order accepts Start but cannot duplicate trade',async()=>{
  let now=1800000000000,c={provider,asset:'EUR/USD OTC',activeId:76,state:'running',licensed:true,
    engine:'automatic',durationMs:30000,analysis:{},brokerBalance:null},physicalClicks=0;
  let bot;
  const ui=new BrokerUiExecutor({state:()=>({symbol:c.asset,activeId:c.activeId})},{ackTimeoutMs:20,
   onSent:(rid,id)=>bot.sent(rid,id),onAccepted:e=>bot.accepted(e),onSettlement:e=>bot.settle(e)});
  ui.controls=async()=>({frame:{evaluate:async()=>({blocked:false}),locator:()=>({click:async()=>{physicalClicks++}})},callSelector:'call',putSelector:'put'});
  bot=new SignalExecutor({driver:{prepare:async()=>{},execute:(p,o)=>ui.execute(p,o)},context:()=>c,clock:()=>now});
  bot.configure({amount:1});await bot.start();
  c.analysis={vnext:{futureEntryAnchor:{context:'test|automatic|30000',engineId:'automatic',phase:'fired',side:'PUT',
   entryTriggeredAt:now,exitAt:now+30000,holdingSeconds:30,entryPrice:1}}};
  bot.pulse();await bot.inflight;
  assert.equal(physicalClicks,1);
  bot.stop();assert.equal(bot.enabled,false);
  await bot.start();
  assert.equal(bot.enabled,true);assert.ok(bot.pending);
  now+=30000;
  c.analysis={vnext:{futureEntryAnchor:{context:'test|automatic|30000',engineId:'automatic',phase:'fired',side:'PUT',
   entryTriggeredAt:now,exitAt:now+30000,holdingSeconds:30,entryPrice:1}}};
  bot.pulse();assert.equal(physicalClicks,1,'cannot create a second order while first click is unidentified');
 });
}

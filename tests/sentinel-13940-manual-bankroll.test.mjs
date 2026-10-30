// Legacy manual-accounting contracts were superseded by confirmed broker settlement in .46.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,T} from './fixtures/executor-13946.mjs';
import {BrokerUiExecutor,settlementFromFrame} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
test('settlement frames use gross returns minus stake, reject foreign account/position, never generic profit',()=>{
 const k={orderId:'7',accountId:'10',amount:10};
 assert.equal(settlementFromFrame('iq_option',{name:'option-closed',msg:{id:7,amount:10,profit_amount:18}},k).netPnl,8);
 assert.equal(settlementFromFrame('exnova',{name:'position-changed',msg:{body:{external_id:7,status:'closed',invest:10,close_profit:0}}},k).netPnl,-10);
 assert.equal(settlementFromFrame('iq_option',{name:'option-closed',msg:{id:7,user_balance_id:10,amount:20,profit_amount:18}},k).netPnl,-2,'identified native close uses the actual broker stake');
 for(const m of [{id:8,profit_amount:18},{id:7,user_balance_id:20,profit_amount:18},{id:7,profit:18},{id:7,profit_amount:null}])assert.equal(settlementFromFrame('iq_option',{name:'option-closed',msg:m},k),null);
});
test('outbound click request and matching inbound broker ID must correlate before acceptance',()=>{
 const sent=[],accepted=[],settled=[];const ui=new BrokerUiExecutor({}, {onSent:x=>sent.push(x),onAccepted:x=>accepted.push(x),onSettlement:x=>settled.push(x)});
 const order={provider:'iq_option',accountId:'10',amount:10,activeId:76,side:'PUT'};let result;
 ui.attempt={provider:'iq_option',order,resolve:x=>result=x,reject:e=>{throw e;}};
 ui.observe('iq_option',{name:'sendMessage',request_id:'r',msg:{name:'binary-options.open-option',body:{user_balance_id:10,price:10,active_id:76,direction:'put'}}},'page-out');
 ui.observe('iq_option',{name:'option',request_id:'other',msg:{id:7}},'page-in');assert.equal(accepted.length,0);
 ui.observe('iq_option',{name:'option',request_id:'r',msg:{id:7}},'page-in');assert.equal(result.orderId,'7');assert.deepEqual(sent,['r']);assert.equal(accepted.length,1);
 ui.observe('iq_option',{name:'sendMessage',request_id:'r',msg:{name:'binary-options.open-option',body:{user_balance_id:10,price:10,active_id:76,direction:'put'}}},'page-out');assert.equal(sent.length,1);assert.equal(ui.awaiting.size,0);
 ui.observe('iq_option',{name:'option-closed',msg:{id:7,user_balance_id:10,amount:10,profit_amount:0}},'page-in');assert.equal(settled[0].netPnl,-10);
});
test('broker native and restored socket observers deliver order events once, with no extra requests',async()=>{
 const d=new LocalPlaywrightDriver(),ws={},cdp={},observed=[],commands=[];
 const page={on:(event,fn)=>{if(event==='websocket')fn({on:(event,fn)=>ws[event]=fn});},context:()=>({newCDPSession:async()=>({on:(event,fn)=>cdp[event]=fn,send:async cmd=>commands.push(cmd)})})};
 await d.attachNetwork('exnova',page);
 const frame={name:'option',request_id:'r1',msg:{id:99}},raw=JSON.stringify(frame);
 let parses=0;const originalParse=JSON.parse;JSON.parse=(...args)=>{parses++;return originalParse(...args);};
 try{cdp['Network.webSocketFrameReceived']({response:{opcode:1,payloadData:raw}});}finally{JSON.parse=originalParse;}
 assert.equal(observed.length,0,'disabled executor has no observer work');assert.equal(parses,0,'disabled bot does not decode order frames');
 d.setExecutionObserver((...args)=>observed.push(args));
 cdp['Network.webSocketFrameReceived']({response:{opcode:1,payloadData:raw}});ws.framereceived({payload:raw});assert.equal(observed.length,1);
 page.__sentinelAccountCdpReady=false;ws.framereceived({payload:raw});assert.equal(observed.length,2);
 assert.deepEqual(commands,['Network.enable'],'uses existing CDP observation, no order polling or subscriptions');
});

test('manual stop wins a race before an asynchronous click',async()=>{
 const x=setup();await x.bot.start();const flight=x.fire();x.bot.stop();await flight;assert.equal(x.calls.length,0);assert.equal(x.c.state,'running');
});
test('stale final signal never causes a late order',async()=>{
 const x=setup();await x.bot.start();x.c.analysis={vnext:{futureEntryAnchor:{context:'iq_option|EURUSDOTC|automatic|30000',phase:'fired',side:'CALL',entryTriggeredAt:T-2000,holdingSeconds:30,exitAt:T+28000}}};x.bot.pulse();await x.bot.inflight;assert.equal(x.calls.length,0);
});
test('paused analyst, lost license, changed provider or changed asset temporarily suspend without dispatch',async()=>{
 for(const patch of [{state:'paused'},{licensed:false},{provider:'exnova'},{asset:'GBP/USD'}]){const x=setup();await x.bot.start();Object.assign(x.c,patch);await x.fire();assert.equal(x.bot.enabled,true);assert.ok(x.bot.suspensionReason);assert.equal(x.calls.length,0);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalExecutor,executorSignal} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {BrokerUiExecutor,settlementFromFrame} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const T=1800000000000;
function setup(extra={}){
 let now=T,serial=0;
 const calls=[];const context={state:'running',licensed:true,provider:'iq_option',accountId:'10',activeId:76,asset:'EUR/USD OTC',mode:'demo',balance:1000,durationMs:30000,engine:'automatic',analysis:{}};
 const driver={prepare:async()=>({ready:true}),execute:async(p,o)=>{assert.equal(o.isValid(),true);calls.push(o);return{accepted:true,orderId:String(++serial)};},...extra};
 const bot=new SignalExecutor({driver,context:()=>context,clock:()=>now});bot.configure({amount:10});
 const fire=(at=now,side='CALL')=>{now=at;context.analysis={vnext:{futureEntryAnchor:Object.freeze({context:'iq_option|EURUSDOTC|automatic|30000',phase:'fired',side,entryTriggeredAt:at,holdingSeconds:30,exitAt:at+30000})}};};
 const complete=(netPnl=8)=>{const p=bot.pending;assert.ok(p);return bot.settle({provider:context.provider,accountId:context.accountId,orderId:p.orderId,netPnl});};
 return{bot,context,calls,fire,complete,advance:ms=>{now+=ms;},now:()=>now};
}
test('only final fired decisions can be executed; forecast/possible labels cannot trigger',()=>{
 for(const phase of ['scanning','open','predicted',null])assert.equal(executorSignal({side:'CALL',vnext:{futureEntryAnchor:{phase,side:'CALL',entryTriggeredAt:T}}}),null);
});
test('30-second mode follows final CALL and PUT exactly once, without touching analyst input',async()=>{
 const x=setup();await x.bot.start({confirmedMode:'demo'});
 for(let i=0;i<5;i++){
  x.fire(T+i*30000,i%2?'PUT':'CALL');const saved=JSON.stringify(x.context.analysis);
  assert.equal(x.bot.pulse(),undefined);await x.bot.inflight;for(let j=0;j<20;j++)x.bot.pulse();
  assert.equal(x.calls.length,i+1);assert.equal(x.calls.at(-1).side,i%2?'PUT':'CALL');assert.equal(JSON.stringify(x.context.analysis),saved);x.complete();
 }
 assert.equal(x.bot.closed,5);
});
test('one-minute mode skips alternate analyst decisions, without changing the trade duration',async()=>{
 const x=setup();x.bot.configure({intervalMs:60000});await x.bot.start({confirmedMode:'demo'});
 for(let i=0;i<6;i++){x.fire(T+i*30000);x.bot.pulse();await x.bot.inflight;if(x.bot.pending)x.complete();}
 assert.deepEqual(x.calls.map(x=>x.at),[T,T+60000,T+120000]);assert.ok(x.calls.every(o=>o.durationMs===30000));
});
test('bot activation never executes a signal which was already on screen',async()=>{
 const x=setup();x.fire();await x.bot.start({confirmedMode:'demo'});x.bot.pulse();assert.equal(x.calls.length,0);
 x.fire(T+30000);x.bot.pulse();await x.bot.inflight;assert.equal(x.calls.length,1);
});
test('deadline stops new entries even if no quote or signal arrives, leaving analyst running',async()=>{
 const x=setup();x.bot.configure({stopAfterMinutes:1});await x.bot.start({confirmedMode:'demo'});
 x.advance(60000);x.bot.watch();assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/tempo programado/);assert.equal(x.context.state,'running');
});
test('stop loss uses actual broker settlements, ignores prices, and deduplicates close events',async()=>{
 const x=setup();x.bot.configure({stopLoss:20});await x.bot.start({confirmedMode:'demo'});
 for(let i=0;i<2;i++){x.fire(T+i*30000);x.bot.pulse();await x.bot.inflight;const id=x.bot.pending.orderId;x.context.balance-=10;assert.equal(x.bot.net, i===0?0:-10*i);assert.equal(x.complete(-10),true);assert.equal(x.bot.settle({provider:'iq_option',accountId:'10',orderId:id,netPnl:-10}),false);}
 assert.equal(x.bot.net,-20);assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/stop loss/);assert.equal(x.context.state,'running');
});
test('missing broker acknowledgement stops the bot and cannot replay the same entry',async()=>{
 const x=setup({execute:async(p,o)=>{o.clicked=true;throw Error('sem confirmação');}});await x.bot.start({confirmedMode:'demo'});
 x.fire();x.bot.pulse();await x.bot.inflight;assert.equal(x.bot.enabled,false);assert.ok(x.bot.pending);await assert.rejects(x.bot.start({confirmedMode:'demo'}),/pendente/);
});
test('known pre-click cancellation allows correction, but never repeats the old signal',async()=>{
 const x=setup({execute:async()=>{throw Object.assign(Error('prazo errado'),{beforeClick:true});}});await x.bot.start({confirmedMode:'demo'});x.fire();x.bot.pulse();await x.bot.inflight;
 assert.equal(x.bot.pending,null);assert.equal(x.bot.enabled,false);await x.bot.start({confirmedMode:'demo'});x.bot.pulse();assert.equal(x.bot.pending,null);
});
test('manual stop wins a race before an asynchronous click; quote loop is never awaited',async()=>{
 const x=setup();await x.bot.start({confirmedMode:'demo'});x.fire();x.bot.pulse();x.bot.stop();await x.bot.inflight;
 assert.equal(x.calls.length,0);assert.equal(x.context.state,'running');
});
test('paused analyst, lost license, changed provider/account/asset/duration/strategy all disarm locally',async()=>{
 for(const patch of [{state:'paused'},{licensed:false},{provider:'exnova'},{accountId:'20'},{asset:'GBP/USD'},{mode:'real'},{durationMs:15000},{engine:'trend'}]){
  const x=setup();await x.bot.start({confirmedMode:'demo'});Object.assign(x.context,patch);x.fire();x.bot.pulse();assert.equal(x.bot.enabled,false,JSON.stringify(patch));assert.equal(x.calls.length,0);
 }
});
test('stale signal, missing balance and nonmultiple intervals never cause a late or wrong order',async()=>{
 const x=setup();await x.bot.start({confirmedMode:'demo'});x.fire(T-2000);x.advance(2000);x.bot.pulse();assert.equal(x.calls.length,0);
 x.bot.stop();x.bot.configure({intervalMs:45000});await assert.rejects(x.bot.start({confirmedMode:'demo'}),/múltiplo/);
});
test('real mode requires an explicit matching account choice, not a persisted legacy pilot flag',async()=>{
 const x=setup();x.context.mode='real';await assert.rejects(x.bot.start({confirmedMode:'real'}),/mesma conta/);
 x.bot.configure({accountMode:'real'});await assert.rejects(x.bot.start({confirmedMode:'demo'}),/mesma conta/);await x.bot.start({confirmedMode:'real'});assert.equal(x.bot.enabled,true);
});
test('a live previous position blocks overlap; an opposite incoming signal is not substituted',async()=>{
 const x=setup();await x.bot.start({confirmedMode:'demo'});x.fire();x.bot.pulse();await x.bot.inflight;
 x.fire(T+30000,'PUT');x.bot.pulse();assert.equal(x.calls.length,1);assert.equal(x.bot.pending.side,'CALL');x.complete();x.bot.pulse();assert.equal(x.calls.length,1);
});
test('late accepted confirmation is tracked while stopped without rearming or duplicating count',async()=>{
 const x=setup({execute:async(p,o)=>{o.clicked=true;x.bot.sent('r1');throw Error('timeout');}});await x.bot.start({confirmedMode:'demo'});x.fire();x.bot.pulse();await x.bot.inflight;
 x.bot.accepted({provider:'iq_option',requestId:'r1',orderId:'99'});x.bot.accepted({provider:'iq_option',requestId:'r1',orderId:'99'});assert.equal(x.bot.executed,1);assert.equal(x.bot.enabled,false);assert.equal(x.complete(-10),true);
});
test('settlement frames use gross returns minus stake, reject foreign account/position, never generic profit',()=>{
 const k={orderId:'7',accountId:'10',amount:10};
 assert.equal(settlementFromFrame('iq_option',{name:'option-closed',msg:{id:7,amount:10,profit_amount:18}},k).netPnl,8);
 assert.equal(settlementFromFrame('exnova',{name:'position-changed',msg:{body:{external_id:7,status:'closed',invest:10,close_profit:0}}},k).netPnl,-10);
 for(const m of [{id:8,profit_amount:18},{id:7,user_balance_id:20,profit_amount:18},{id:7,amount:20,profit_amount:18},{id:7,profit:18},{id:7,profit_amount:null}])assert.equal(settlementFromFrame('iq_option',{name:'option-closed',msg:m},k),null);
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
 cdp['Network.webSocketFrameReceived']({response:{opcode:1,payloadData:raw}});assert.equal(observed.length,0,'disabled executor has no observer work');
 d.setExecutionObserver((...args)=>observed.push(args));
 cdp['Network.webSocketFrameReceived']({response:{opcode:1,payloadData:raw}});ws.framereceived({payload:raw});assert.equal(observed.length,1);
 page.__sentinelAccountCdpReady=false;ws.framereceived({payload:raw});assert.equal(observed.length,2);
 assert.deepEqual(commands,['Network.enable'],'uses existing CDP observation, no order polling or subscriptions');
});

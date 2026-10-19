import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,T} from './fixtures/executor-13946.mjs';
import {SignalExecutor,executorSignal} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {settlementFromFrame,BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
for(const provider of ['iq_option','exnova']){
 test(provider+': bounded double progression resets after win and after final loss; ties keep level',async()=>{
  const x=setup(provider);x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();
  for(const [expected,result] of [[1,-1],[2,0],[2,-2],[4,-4],[1,-1],[2,1.6],[1,.8]]){
   await x.fire('PUT');assert.equal(x.calls.at(-1).amount,expected);assert.equal(x.calls.at(-1).side,'PUT');
   const id=x.bot.pending.orderId;assert.ok(x.close(result));assert.equal(x.bot.settle({provider,orderId:id,netPnl:result}),false);
  }
  assert.equal(x.bot.martingaleLevel,0);assert.equal(x.bot.closed,7);
 });
 test(provider+': disabled martingale stays at base after confirmed losses',async()=>{
  const x=setup(provider);await x.bot.start();for(let i=0;i<3;i++){await x.fire(i%2?'PUT':'CALL');assert.equal(x.calls.at(-1).amount,1);x.close(-1);}
 });
 test(provider+': duration changes affect next order, preserving pending expiry and enabled state',async()=>{
  const x=setup(provider);await x.bot.start();await x.fire();const original=x.bot.pending.exitAt;
  x.c.durationMs=60000;x.bot.watch();assert.ok(x.bot.enabled);assert.equal(x.bot.pending.exitAt,original);
  x.close(.8);await x.fire('PUT');assert.equal(x.calls.at(-1).durationMs,60000);assert.equal(x.bot.pending.exitAt,x.now()+60000);assert.ok(x.bot.enabled);
 });
 test(provider+': quote direction, stake debit and unknown result cannot advance martingale',async()=>{
  const x=setup(provider);x.bot.configure({martingaleEnabled:true,martingaleLevels:3,stopLoss:5});await x.bot.start();await x.fire();x.advance(10);x.balance(99);x.advance(29990);x.c.quote=.8;x.c.quoteAt=x.now();x.bot.watch();
  assert.equal(x.bot.net,0);assert.equal(x.bot.martingaleLevel,0);assert.equal(x.bot.status().riskNetPnl,0);assert.ok(x.bot.pending);assert.ok(x.bot.enabled);
  assert.equal(x.bot.settle({provider,orderId:x.bot.pending.orderId,netPnl:-1,source:'quote-estimate'}),false);
  x.advance(15001);x.bot.watch();assert.equal(x.bot.enabled,false);assert.equal(x.bot.pending,null);assert.equal(x.bot.net,0);assert.equal(x.bot.nextAmount(),1);
 });
 test(provider+': loss limit is account currency and blocks a step which could exceed it',async()=>{
  const x=setup(provider);x.bot.configure({amount:2,martingaleEnabled:true,martingaleLevels:3,stopLoss:5});await x.bot.start();await x.fire();x.close(-2);
  assert.equal(x.bot.status().lossLimitRemaining,3);assert.equal(x.bot.nextAmount(),4);await x.fire('PUT');assert.equal(x.calls.length,1);assert.equal(x.bot.enabled,false);assert.match(x.bot.message,/limite de perda restante/);
 });
 test(provider+': available broker funds limit stake; no manual balance or payout required',async()=>{
  const x=setup(provider);assert.equal('initialBalance' in x.bot.config,false);assert.equal('payoutPercent' in x.bot.config,false);await x.bot.start();assert.equal(x.bot.initialBalance,100);
  x.bot.configure({amount:150});await x.fire();assert.equal(x.calls.length,0);assert.equal(x.bot.enabled,false);
 });
}
test('invalid, negative and fractional martingale counts are rejected without mutating config',()=>{
 const x=setup();for(const levels of [-1,1.5,11,Infinity,'bad'])assert.throws(()=>x.bot.configure({martingaleLevels:levels}));assert.equal(x.bot.config.martingaleLevels,2);
});
test('editing limits and base while pending preserves actual open stake, account and expiry',async()=>{
 const x=setup();x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();await x.fire();const pending={...x.bot.pending};
 x.bot.stop();x.bot.configure({amount:3,stopAfterMinutes:5,stopLoss:10,martingaleLevels:1});assert.equal(x.bot.pending.amount,pending.amount);assert.equal(x.bot.pending.exitAt,pending.exitAt);assert.equal(x.bot.pending.accountId,'10');
 x.close(-1);assert.equal(x.bot.nextAmount(),6);await x.bot.start();assert.equal(x.bot.nextAmount(),3);
});
test('old signal does not execute on start; repeated pulses do not duplicate an order',async()=>{
 const x=setup();await x.fire();await x.bot.start();await x.fire();assert.equal(x.calls.length,0);x.advance(30000);await x.fire();for(let i=0;i<20;i++)await x.fire();assert.equal(x.calls.length,1);
});
test('minute interval skips alternate 30 second decisions, without changing broker expiry',async()=>{
 const x=setup();x.bot.configure({intervalMs:60000});await x.bot.start();
 for(let i=0;i<6;i++){await x.fire();if(x.bot.pending)x.close(.8);else x.advance(30000);}
 assert.equal(x.calls.length,3);assert.ok(x.calls.every(c=>c.durationMs===30000));
});
test('wrong account or wrong order settlement cannot alter stake or net PNL',async()=>{
 const x=setup();x.bot.configure({martingaleEnabled:true,martingaleLevels:3});await x.bot.start();await x.fire();
 for(const patch of [{accountId:'foreign'},{orderId:'other'},{provider:'exnova'}])assert.equal(x.bot.settle({provider:'iq_option',orderId:x.bot.pending.orderId,accountId:'10',netPnl:-1,...patch}),false);
 assert.equal(x.bot.net,0);assert.equal(x.bot.martingaleLevel,0);
});
test('session stop at exact confirmed limit prevents subsequent entries',async()=>{
 const x=setup();x.bot.configure({stopLoss:1});await x.bot.start();await x.fire();x.close(-1);assert.equal(x.bot.enabled,false);assert.equal(x.bot.status().lossLimitRemaining,0);
});
test('broker expiry overrides local estimate and incompatible acknowledgement stops further trades',async()=>{
 const x=setup();x.driver.execute=async(p,o)=>{o.captureEntry();o.clicked=true;return{accepted:true,orderId:'a',exitAt:x.now()+60000};};await x.bot.start();await x.fire();assert.equal(x.bot.enabled,false);assert.ok(x.bot.pending);assert.equal(x.bot.pending.exitAt,T+60000);
});
test('losing quote cannot override a confirmed winning broker settlement or reset twice',async()=>{
 const x=setup();x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();await x.fire();x.close(-1);await x.fire();x.c.quote=.1;x.c.quoteAt=x.now()+30000;x.close(1.6);assert.equal(x.bot.martingaleLevel,0);assert.equal(x.bot.net,.6);
});
test('late settlement updates an unknown ledger but cannot advance progression or contaminate a new session',async()=>{
 const x=setup();x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();await x.fire();const id=x.bot.pending.orderId;x.advance(45001);x.bot.watch();assert.equal(x.bot.settle({provider:'iq_option',orderId:id,accountId:'10',netPnl:-1}),true);assert.equal(x.bot.martingaleLevel,0);
 await x.bot.start();assert.equal(x.bot.settle({provider:'iq_option',orderId:id,netPnl:-1}),false);assert.equal(x.bot.net,0);
});
test('activation cannot fake an unread balance from obsolete manual configuration',async()=>{
 const x=setup();x.c.brokerBalance=null;x.bot.configure({initialBalance:999,payoutPercent:86});await x.bot.start();assert.equal(x.bot.enabled,true);assert.equal(x.bot.status().availableBalance,null);assert.equal(x.bot.status().calculatedBalance,null);
});
test('broker settlement parser subtracts stake from actual gross return and rejects generic profit',()=>{
 const known={orderId:'7',accountId:'10',amount:2};assert.equal(settlementFromFrame('exnova',{name:'option-closed',msg:{id:7,profit_amount:3.72}},known).netPnl,1.7200000000000002);
 assert.equal(settlementFromFrame('iq_option',{name:'position-changed',msg:{external_id:7,status:'closed',invest:2,close_profit:0}},known).netPnl,-2);
 for(const msg of [{id:8,profit_amount:3.72},{id:7,profit:3.72},{id:7,balance_id:20,profit_amount:3.72}])assert.equal(settlementFromFrame('exnova',{name:'option-closed',msg},known),null);
});
test('PC controls remove manual balance/payout; settings remain editable while running and stopped pending',()=>{
 const x=setup();for(const patch of [{enabled:true},{enabled:false,pending:{side:'CALL'}}]){const html=executorPanel({...x.bot.status(),...patch});assert.doesNotMatch(html,/data-sentinel-executor-setting="(?:initialBalance|payoutPercent)"/);assert.match(html,/data-sentinel-executor-setting="martingaleLevels"/);assert.match(html,/Perda máxima na sessão/);const fields=[...html.matchAll(/<(?:input|select)[^>]*data-sentinel-executor-setting[^>]*>/g)];assert.equal(fields.length,6);assert.ok(fields.every(m=>!m[0].includes(' disabled')));}
});
test('compact mobile wire preserves progression and limits without exposing order or account IDs',()=>{
 const x=setup();const status={...x.bot.status(),martingaleLevel:2,nextAmount:4,lossLimitRemaining:7,provider:'exnova',brokerBalance:{amount:30,receivedAt:T,accountId:'secret'}};const packed=packExecutor(status),out=unpackExecutor(packed);
 assert.equal(out.config.martingaleLevels,2);assert.equal(out.martingaleLevel,2);assert.equal(out.nextAmount,4);assert.equal(out.lossLimitRemaining,7);assert.equal(out.capabilities.brokerExecution,3);assert.doesNotMatch(JSON.stringify(packed),/secret/);
 const old=packed.slice(0,18);assert.ok(unpackExecutor(old));assert.equal(unpackExecutor(old).capabilities,undefined);
});
test('non-final forecast cannot trigger the executor',()=>{
 for(const phase of ['scanning','open','predicted',null])assert.equal(executorSignal({vnext:{futureEntryAnchor:{phase,side:'CALL',entryTriggeredAt:T}}}),null);
});

test('martingale is opt-in; off preserves the maximum and restores base for next entry',async()=>{
 const x=setup();assert.equal(x.bot.config.martingaleEnabled,false);x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();await x.fire();x.close(-1);assert.equal(x.bot.nextAmount(),2);x.bot.configure({martingaleEnabled:false});assert.equal(x.bot.nextAmount(),1);assert.equal(x.bot.config.martingaleLevels,2);await x.fire();x.close(-1);assert.equal(x.bot.nextAmount(),1);x.bot.configure({martingaleEnabled:true});assert.equal(x.bot.nextAmount(),1);
});
test('turning progression off during an increased stake preserves the open stake and prevents a new increase',async()=>{
 const x=setup();x.bot.configure({martingaleEnabled:true,martingaleLevels:2});await x.bot.start();await x.fire();x.close(-1);await x.fire();assert.equal(x.bot.pending.amount,2);x.bot.configure({martingaleEnabled:false});assert.equal(x.bot.pending.amount,2);x.close(-2);assert.equal(x.bot.nextAmount(),1);
});

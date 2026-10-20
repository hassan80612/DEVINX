import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/executor-13946.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';

for(const provider of ['iq_option','exnova']){
 test(provider+': missing settlement releases at option expiry and continues at base with all risk reserved',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  await x.bot.start();await x.fire('CALL');
  const old=x.bot.pending,oldId=old.orderId;
  x.advance(31499);x.bot.watch();assert.equal(x.bot.pending,old,'do not overlap expiry');
  x.advance(1);x.bot.watch();assert.equal(x.bot.pending,null);
  assert.equal(x.bot.unresolvedBatches.size,1);
  assert.equal(x.bot.unresolvedExposure(),1);
  assert.equal(x.bot.nextClicks(),1);
  assert.equal(x.bot.closed,0);assert.equal(x.bot.net,0);
  await x.fire('PUT');assert.deepEqual(x.calls.map(o=>o.side),['CALL','PUT']);
  assert.equal(x.bot.pending.clickCount,1);
  assert.equal(x.bot.settle({provider,orderId:oldId,netPnl:-1,source:'broker'}),true);
  assert.equal(x.bot.closed,1);assert.equal(x.bot.net,-1);
  assert.equal(x.bot.unresolvedBatches.size,0);
  assert.equal(x.bot.nextClicks(),1,'late loss must not change newer normal cycle');
 });
 test(provider+': late accepted ID and later close still reconcile after recovering next signal',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.driver.execute=async(_p,o)=>{o.captureEntry();o.clicked=true;return{pending:true,localId:o.id};};
  await x.bot.start();await x.fire('CALL');
  const batch=x.bot.pending,oldLocal=batch.orders[0].id;
  assert.equal(batch.orders[0].orderId,null);
  x.advance(75000);x.bot.watch();
  assert.equal(x.bot.pending,null);assert.equal(x.bot.unresolvedBatches.size,1);
  x.bot.sent('request-late',oldLocal);
  x.bot.accepted({provider,requestId:'request-late',localId:oldLocal,orderId:'broker-late',accountId:'10'});
  assert.equal(batch.orders[0].orderId,'broker-late');
  assert.equal(x.bot.settle({provider,orderId:'broker-late',accountId:'10',netPnl:0.86,source:'broker'}),true);
  assert.equal(x.bot.unresolvedBatches.size,0);
  assert.equal(x.bot.net,.86);
  assert.equal(x.bot.closed,1);
  assert.equal(x.bot.martingaleLevel,0);
 });
 test(provider+': unresolved stake conservatively counts toward configured stop loss',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({amount:1,stopLoss:1.5});
  await x.bot.start();await x.fire('CALL');
  x.advance(75000);x.bot.watch();
  assert.equal(x.bot.riskNet(),-1,'unknown click counts as possible loss without recording an actual loss');
  await x.fire('PUT');
  assert.equal(x.calls.length,1,'a second click would exceed the user selected loss threshold');
  assert.equal(x.bot.enabled,false,'user configured hard stop loss must still work');
  assert.equal(x.bot.net,0);
  assert.equal(x.bot.unresolvedBatches.size,1,'late outcome is still tracked');
 });
 test(provider+': missing result from intermediate martingale releases normal next entry',async()=>{
  const x=setup(provider);x.c.brokerBalance=null;
  x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  await x.bot.start();await x.fire('CALL');
  x.advance(30000);
  assert.ok(x.bot.settle({provider,orderId:x.bot.pending.orderId,netPnl:-1,source:'broker'}));
  assert.equal(x.bot.nextClicks(),2);
  x.advance(1000);await x.fire('PUT');
  const old=x.bot.pending;assert.equal(old.orders.length,2);
  x.advance(31500);x.bot.watch();
  assert.equal(x.bot.pending,null);assert.equal(x.bot.unresolvedExposure(),2);
  assert.equal(x.bot.nextClicks(),1);
  const priorCalls=x.calls.length;await x.fire('CALL');
  assert.equal(x.calls.length,priorCalls+1);
  assert.equal(x.bot.pending.clickCount,1);
  assert.equal(x.bot.closed,1,'no invented intermediate broker outcome');
 });

}

test('the broker unknown-click mutex ages out only for its original quarantined batch',async()=>{
 const provider='iq_option',order={id:'original-click',amount:1,side:'CALL',activeId:76,accountId:'10',clicked:true};
 const sent=[];const ui=new BrokerUiExecutor({state:()=>({symbol:'EUR/USD OTC',activeId:76})},{
  ackTimeoutMs:15,onSent:(rid,id)=>sent.push([rid,id])
 });
 let clicks=0;
 ui.controls=async()=>({frame:{locator:()=>({click:async()=>{clicks++;}})},callSelector:'#call',putSelector:'#put'});
 order.captureEntry=()=>{};order.isValid=()=>true;order.asset='EUR/USD OTC';
 const result=await ui.execute(provider,order);
 assert.equal(result.pending,true);
 assert.ok(ui.unidentifiedClick);
 const second={...order,id:'second-click'};
 await assert.rejects(()=>ui.execute(provider,second),/Aguardando identificação/);
 assert.equal(clicks,1);
 ui.retireUnidentifiedBatch({orders:[order]});
 assert.equal(ui.unidentifiedClick,null);
 ui.observe(provider,{name:'open-option',request_id:'old-request',msg:{name:'open-option',body:{price:1,active_id:76,direction:'call',user_balance_id:10}}},'page-out');
 assert.deepEqual(sent,[['old-request','original-click']],'a truly late old request can still attach to original order');
 const later=await ui.execute(provider,second);
 assert.equal(later.pending,true);assert.equal(clicks,2);
});

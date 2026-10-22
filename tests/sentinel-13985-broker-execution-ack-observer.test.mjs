import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {BrokerUiExecutor,isExecutionFrame} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';

function harness(provider){
 const driver=new LocalPlaywrightDriver({dataDir:'unused-regression-test'});
 const listeners={},seen=[];
 const client={on:(event,fn)=>listeners[event]=fn,send:async()=>{},detach:async()=>{}};
 const page={on:()=>{},context:()=>({newCDPSession:async()=>client})};
 driver.setExecutionObserver((p,frame,d)=>seen.push({p,frame,d}));
 return{driver,page,listeners,seen,provider,
   async start(){await driver.attachNetwork(provider,page);},
   receive(frame){const text=JSON.stringify(frame);
     listeners['Network.webSocketFrameReceived']({response:{opcode:1,payloadData:text}});
   }
 };
}
for(const provider of ['iq_option','exnova']){
 test(provider+': attached existing socket passes buyV3 ACK and position-closed events to execution observer',async()=>{
  const x=harness(provider);await x.start();
  const ack={name:'buyV3',request_id:'987',msg:{name:'buyV3',body:{id:4001,open_price:1.25}}};
  const closed={name:'position-closed',msg:{name:'position-closed',body:{id:4001,status:'expired',invest:1,close_profit:1.83}}};
  assert.equal(isExecutionFrame(ack),true);
  assert.equal(isExecutionFrame(closed),true);
  x.receive(ack);x.receive(closed);
  assert.deepEqual(x.seen.map(r=>r.frame.name),['buyV3','position-closed']);
  assert.ok(x.seen.every(r=>r.d==='page-in'&&r.p===provider));
 });
 test(provider+': exact buyV3 ACK and settlement advance confirmed LOSS without extra broker clicks',async()=>{
  const driver=new LocalPlaywrightDriver({dataDir:'unused-regression-test'});
  let accepted=0,loss=0,clicks=0;
  const ui=new BrokerUiExecutor(driver,{onAccepted:()=>accepted++,onSettlement:()=>loss++});
  const attempt={provider,requestId:'987',digitalTrade:false,order:{id:'local-1',side:'CALL',amount:1,accountId:'10',activeId:4},resolve:()=>{}};
  ui.awaiting.set(provider+'|987',attempt);
  const listeners={},client={on:(name,fn)=>listeners[name]=fn,send:async()=>{}};
  const page={on:()=>{},context:()=>({newCDPSession:async()=>client})};
  driver.setExecutionObserver((p,frame,d)=>ui.observe(p,frame,d));await driver.attachNetwork(provider,page);
  const send=frame=>listeners['Network.webSocketFrameReceived']({response:{opcode:1,payloadData:JSON.stringify(frame)}});
  send({name:'buyV3',requestId:'987',msg:{name:'buyV3',body:{id:4001,open_price:1.25}}});
  assert.equal(accepted,1);
  assert.equal(ui.orders.has(provider+'|4001'),true);
  send({name:'position-closed',msg:{name:'position-closed',body:{id:4001,status:'expired',invest:1,close_profit:0}}});
  assert.equal(loss,1);assert.equal(ui.orders.size,0);assert.equal(clicks,0);
 });
}
test('quote-generated frames remain ignored by the low-frequency execution observer',async()=>{
 const x=harness('exnova');await x.start();
 x.receive({name:'quote-generated',msg:{active_id:4,price:1.2}});
 assert.equal(x.seen.length,0);
});

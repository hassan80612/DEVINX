import test from 'node:test';
import assert from 'node:assert/strict';
import {browser} from './helpers/broker-expiry-browser.mjs';
import {installBrokerNativeExpiryKeeper,inspectNativeExpiryBeforeClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
for(const provider of ['iq_option','exnova']){
 for(const duration of [30000,60000,300000])test(provider+': reload restores '+duration+'ms using live Agent state without a UI receipt',async()=>{
  const m=browser('30 s');let requests=0;
  try{
   const five=Object.create(m.options[1]);five._text='5 min';m.options.push(five);
   if(duration===30000)m.control._text='1 min';
   location.hostname=provider==='iq_option'?'iqoption.com':'exnova.com';
   m.storage.set('sentinel-broker-native-expiration-preference-v3:'+provider,String(duration));
   if(duration===30000)m.storage.set('sentinel-broker-native-explicit-default-v4:'+provider,'30000');
   delete window.__sentinelNativeExpiryPermissionV3;
   window.__sentinelRequestNativeExpiryPermission=async()=>({provider,at:m.now,allowed:(requests++,true)});
   installBrokerNativeExpiryKeeper({provider});await flush();
   for(let i=0;i<3;i++){m.now+=2500;m.interval();await flush();}
   assert.equal(m.control._text,duration===30000?'30 s':duration===60000?'1 min':'5 min');assert.ok(requests>0);
   assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,duration);
  }finally{await flush();m.restore();}
 });
 test(provider+': reload recovery never restores during an active click and retries after the executor becomes idle',async()=>{
  const m=browser('30 s');let busy=true;
  try{
   location.hostname=provider==='iq_option'?'iqoption.com':'exnova.com';
   m.storage.set('sentinel-broker-native-expiration-preference-v3:'+provider,'60000');
   delete window.__sentinelNativeExpiryPermissionV3;
   window.__sentinelRequestNativeExpiryPermission=async()=>({provider,at:m.now,allowed:!busy});
   installBrokerNativeExpiryKeeper({provider});await flush();
   m.now+=5000;m.interval();await flush();assert.equal(m.control._text,'30 s');
   busy=false;m.now+=2500;m.interval();await flush();assert.equal(m.control._text,'1 min');
  }finally{await flush();m.restore();}
 });
}
test('a delayed idle reply cannot override a newer pre-click revocation',async()=>{
 const m=browser('30 s',60000);let resolve;
 try{
  delete window.__sentinelNativeExpiryPermissionV3;
  window.__sentinelRequestNativeExpiryPermission=()=>new Promise(r=>{resolve=r;});
  installBrokerNativeExpiryKeeper({provider:'iq_option'});await flush();
  inspectNativeExpiryBeforeClick({requiredDurationMs:60000});
  resolve({provider:'iq_option',at:m.now,allowed:true});await flush();
  assert.equal(window.__sentinelNativeExpiryPermissionV3.allowed,false);
  assert.equal(m.control._text,'30 s');
 }finally{await flush();m.restore();}
});
test('the Node renewal bridge reads current executor state after reload rather than its earlier snapshot',async()=>{
 const driver=new LocalPlaywrightDriver(),bindings=new Map();let state={executing:false,arming:false};
 driver.setNativeExpiryPermissionSource(()=>state);
 const page={exposeFunction:async(n,f)=>bindings.set(n,f),addInitScript:async()=>{},
  evaluate:async()=>true,frames:()=>[],on:()=>{}};
 await driver.installBridge(page,'exnova');
 const renew=bindings.get('__sentinelRequestNativeExpiryPermission');assert.equal(typeof renew,'function');
 assert.equal((await renew()).allowed,true);
 state={executing:true};assert.equal((await renew()).allowed,false);
 driver.setNativeExpiryPermissionSource(null);assert.equal((await renew()).allowed,false);
});
test('178: a detected native mismatch is telemetry and does not gate the requested automatic click',async()=>{
 const m=browser('30 s',60000);let clicks=0;
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  const ui=new BrokerUiExecutor({state:()=>({activeId:76,symbol:'EUR/USD OTC'})});
  ui.controls=async()=>({frame:{evaluate:async(fn,arg)=>fn(arg),locator:()=>({click:async()=>{clicks++;}})},callSelector:'#call',putSelector:'#put'});
  const order={id:'expiry-test',side:'CALL',durationMs:60000,amount:1,asset:'EUR/USD OTC',activeId:76,isValid:()=>true};
  const result=await ui.execute('iq_option',order);
  assert.equal(result.pending,true);assert.equal(clicks,1);assert.equal(order.clicked,true);
  assert.equal(order.nativeExpiryInspection.detectedMismatch,true);
  assert.equal(ui.orders.size,0);
 }finally{m.restore();}
});

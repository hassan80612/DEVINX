import test from 'node:test';
import assert from 'node:assert/strict';
import {browser} from './helpers/broker-expiry-browser.mjs';
import {installBrokerNativeExpiryKeeper,nativeExpiryPermissionForExecutor,inspectNativeExpiryBeforeClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {patchExecutorReadouts} from '../sentinel-trading-lab/agent/worker/executor-readouts.mjs';
const state={provider:'iq_option',enabled:true,executing:false,arming:false,unresolvedBatches:0,pending:null};
const send=(s,at)=>patchExecutorReadouts({revision:at,readout:{},nativeExpiryPermission:nativeExpiryPermissionForExecutor(s,at)});
test('one-second executor receipts restore a 30s rollback after 13 one-minute trades, only between settled operations',()=>{
 const m=browser('1 min',60000);const repairs=[];const original=m.options[1].click;
 m.options[1].click=()=>{repairs.push((m.now-100000)%63000);original.call(m.options[1]);};
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  const start=m.now;
  for(let elapsed=500;elapsed<=15*63000;elapsed+=500){
   m.now=start+elapsed;const phase=elapsed%63000;
   if(elapsed===13*63000)m.control._text='30 s';
   if(elapsed%1000===0)send({...state,pending:phase<61000?{}:null},m.now);
   if(elapsed%2500===0)m.interval();
   if(elapsed>=13*63000&&elapsed<13*63000+61000)assert.equal(m.control._text,'30 s','never open expiry while a trade/settlement is pending');
  }
  assert.equal(m.control._text,'1 min');assert.equal(repairs.length,1);
  assert.ok(repairs.every(x=>x>=61000&&x<63000));
 }finally{m.restore()}
});
test('pre-click inspection blocks a known native rollback, revokes permission, and does not invent an unknown duration',()=>{
 const m=browser('1 min',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});m.control._text='30 s';
  const result=inspectNativeExpiryBeforeClick();assert.equal(result.blocked,true);assert.equal(result.preferredMs,60000);
  assert.equal(window.__sentinelNativeExpiryPermissionV3.allowed,false);
  assert.equal(m.control._text,'30 s','inspection never clicks the expiry control');
  m.control._text='1 min';assert.equal(inspectNativeExpiryBeforeClick().blocked,false);
  delete window.__sentinelNativeExpiryKeeperV3;assert.equal(inspectNativeExpiryBeforeClick().blocked,false);
 }finally{m.restore()}
});
test('an old UI receipt cannot re-authorize repair after a physical-entry revocation',()=>{
 const m=browser('1 min',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});send(state,m.now-1000);
  inspectNativeExpiryBeforeClick();const at=window.__sentinelNativeExpiryPermissionV3.at;
  send(state,at-500);assert.equal(window.__sentinelNativeExpiryPermissionV3.allowed,false);
  m.now+=1000;send({...state,pending:{}},m.now);assert.equal(window.__sentinelNativeExpiryPermissionV3.allowed,false);
 }finally{m.restore()}
});
test('v3 migrates a v2 preference without allowing the older keeper to write',()=>{
 const m=browser('1 min');
 try{
  m.storage.set('sentinel-broker-native-expiration-preference-v2:iq_option','60000');
  window.__sentinelNativeExpiryKeeper={revision:2};window.__sentinelNativeExpiryPermissionV2={allowed:true,at:m.now};
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
  assert.equal(window.__sentinelNativeExpiryPermissionV2.allowed,false);
  const keeper=window.__sentinelNativeExpiryKeeperV3;installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(window.__sentinelNativeExpiryKeeperV3,keeper,'idempotent install adds no new timer');
 }finally{m.restore()}
});
test('existing executor receipt relays expiry permission to nested broker documents',()=>{
 const m=browser('1 min',60000),messages=[];
 try{
  window.frames=[{postMessage:(message,target)=>messages.push({message,target})}];
  send(state,m.now);
  assert.equal(messages.length,1);
  assert.equal(messages[0].message.type,'sentinel-native-expiry-permission-v1');
  assert.equal(messages[0].message.permission.provider,'iq_option');
  assert.equal(messages[0].message.permission.allowed,true);
 }finally{m.restore()}
});
test('a broker child keeper receives the idle lease; foreign senders and busy receipts cannot restore',()=>{
 const m=browser('30 s',60000);let listener;
 try{
  window.parent={};window.frames=[];
  window.addEventListener=(type,fn)=>{if(type==='message')listener=fn;};
  window.removeEventListener=()=>{};
  delete window.__sentinelNativeExpiryPermissionV3;
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(typeof listener,'function');
  m.now+=5000;m.interval();assert.equal(m.control._text,'30 s');
  const event={source:window.parent,origin:'https://iqoption.com',data:{type:'sentinel-native-expiry-permission-v1',permission:{provider:'iq_option',allowed:true,at:m.now}}};
  listener({...event,origin:'https://unrelated.example'});assert.equal(m.control._text,'30 s');
  listener({...event,source:{}});assert.equal(m.control._text,'30 s');
  listener({...event,data:{...event.data,permission:{...event.data.permission,allowed:false}}});assert.equal(m.control._text,'30 s');
  listener(event);assert.equal(m.control._text,'1 min');
 }finally{m.restore()}
});

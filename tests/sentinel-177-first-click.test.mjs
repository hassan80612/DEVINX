import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {browser} from './helpers/broker-expiry-browser.mjs';
import {installBrokerNativeExpiryKeeper,inspectNativeExpiryBeforeClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
for(const provider of ['exnova','iq_option'])for(const durationMs of [30000,60000,300000]){
 test(provider+' '+durationMs+': unknown expiry permits one first click without inventing a native value',async()=>{
  const b=browser('not identified',durationMs);let clicks=0;
  try{
   location.hostname=provider==='exnova'?'exnova.com':'iqoption.com';
   installBrokerNativeExpiryKeeper({provider,requestedMs:durationMs});
   const ui=new BrokerUiExecutor({state:()=>({activeId:76,symbol:'EUR/USD OTC'})},{ackTimeoutMs:15});
   ui.controls=async()=>({frame:{evaluate:async(fn,arg)=>fn(arg),locator:()=>({click:async()=>{clicks++;}})},callSelector:'#call',putSelector:'#put'});
   const order={id:'first-'+provider,side:'CALL',durationMs,asset:'EUR/USD OTC',activeId:76,amount:1,isValid:()=>true};
   const result=await ui.execute(provider,order);
   assert.equal(clicks,1);assert.equal(order.clicked,true);assert.equal(result.pending,true);
   assert.equal(order.nativeExpiryInspection.blocked,false);
   assert.equal(order.nativeExpiryInspection.currentMs,null);
   assert.equal(order.nativeExpiryInspection.validatedSynchronously,false);
   assert.equal(ui.orders.size,0,'pending acknowledgement is not an invented accepted order');
  }finally{b.restore()}
 });
}
test('a keeper not yet installed is not a reason to block the first entry',()=>{
 const b=browser();try{
  for(const requiredDurationMs of [30000,60000,300000])
   assert.equal(inspectNativeExpiryBeforeClick({requiredDurationMs}).blocked,false);
 }finally{b.restore()}
});
test('a generic duration button labelled Tempo is recognized without an expiration CSS class',()=>{
 const b=browser('1 min',60000);
 try{
  b.control.className='input-control';
  b.control.parentElement={textContent:'Tempo\n1 min',parentElement:null};
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(inspectNativeExpiryBeforeClick({requiredDurationMs:60000}).currentMs,60000);
  assert.equal(inspectNativeExpiryBeforeClick({requiredDurationMs:60000}).blocked,false);
 }finally{b.restore()}
});
test('a known different native duration and an active repair still prevent a click',()=>{
 const b=browser('30 s',60000);try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(inspectNativeExpiryBeforeClick({requiredDurationMs:60000}).reason,'expiry-not-synchronized');
  const keeper=window.__sentinelNativeExpiryKeeperV3,snapshot=keeper.snapshot;
  keeper.snapshot=()=>({...snapshot(),repairing:true});
  assert.equal(inspectNativeExpiryBeforeClick({requiredDurationMs:60000}).reason,'expiry-repair-in-progress');
 }finally{b.restore()}
});
test('179 preserves the 168 runtime decisions and reversal detectors exactly',()=>{
 const blob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
 for(const [name,sha] of [
  ['runtime.mjs','414ec2283a5b874e90e5555a87d74a16a811e6ac'],
  ['fast-level-reversal.mjs','810d78b3229d3eeb427e6c28dcb63a8f6647e9aa'],
  ['observed-level-sequence.mjs','cb3c9a914c1f3cc0ea62ab98a2b0e44690572624']
 ])assert.equal(blob(readFileSync(new URL('../sentinel-trading-lab/agent/src/core/'+name,import.meta.url))),sha,name);
});

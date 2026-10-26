import test from 'node:test';
import assert from 'node:assert/strict';
import {browser} from './helpers/broker-expiry-browser.mjs';
import {installBrokerNativeExpiryKeeper,inspectNativeExpiryBeforeClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
test('manual selection retains its verified native opener even when an open picker wrapper contains several duration labels',()=>{
 const m=browser('1 min',60000);
 try{
  Object.defineProperty(m.control,'innerText',{get:()=>m.open?'1 min 30 s 1 min 2 min':m.control._text});
  installBrokerNativeExpiryKeeper({provider:'iq_option'});m.event('pointerdown');m.control.click();
  const option=m.options[2];m.event('pointerdown',option);m.event('click',option);option.click();m.step();
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,120000);
  assert.equal(m.control._text,'2 min');
 }finally{m.restore()}
});
test('disappearing native controls clear the last observation instead of blocking on an old mismatch',()=>{
 const m=browser('30 s',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});assert.equal(inspectNativeExpiryBeforeClick().blocked,true);
  m.control.isConnected=false;assert.equal(inspectNativeExpiryBeforeClick().blocked,false);
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs,null);
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
 }finally{m.restore()}
});
test('queued executor receipts use their source timestamp, never delivery time, for native expiry authorization',async()=>{
 const d=new LocalPlaywrightDriver();let payload;
 d.sessions.set('exnova',{page:{evaluate:async(fn,frame)=>{payload=frame}}});
 await d.updateExecutorReadouts('exnova',{state:{provider:'exnova',enabled:true,config:{}},revision:1800000000000});
 assert.equal(payload.nativeExpiryPermission.at,1800000000000);
 assert.equal(payload.nativeExpiryPermission.provider,'exnova');
});
test('native input duration is read once instead of duplicating value as two ambiguous durations',()=>{
 const m=browser('1 min');
 try{
  Object.defineProperty(m.control,'innerText',{get:()=>''});
  Object.defineProperty(m.control,'textContent',{get:()=>''});
  m.control.value='1 min';
  installBrokerNativeExpiryKeeper({provider:'iq_option'});m.step();
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
 }finally{m.restore()}
});
test('expiry-scoped duration item choices replace an older 30s preference on both brokers',()=>{
 for(const provider of ['iq_option','exnova']){
  const m=browser('30 s',30000);
  try{
   location.hostname=provider==='iq_option'?'iqoption.com':'exnova.com';
   m.storage.set('sentinel-broker-native-expiration-preference-v3:'+provider,'30000');
   window.__sentinelNativeExpiryPermissionV3.provider=provider;
   for(const option of m.options)option.matches=selector=>selector.includes('[class*="item"');
   installBrokerNativeExpiryKeeper({provider});m.event('pointerdown');m.control.click();
   const option=m.options[2];m.event('pointerdown',option);m.event('click',option);option.click();m.step();
   assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,120000,provider);
   m.step(15000);assert.equal(m.control._text,'2 min','must not restore the old 30s choice');
  }finally{m.restore()}
 }
});

test('a trusted picker change to a stable non-default duration survives an unlabelled portal option',()=>{
 const m=browser('30 s',30000);
 try{
  for(const option of m.options){option.matches=()=>false;option.closest=()=>null;}
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.event('pointerdown');m.control.click();
  m.event('pointerdown',m.options[1]);m.event('click',m.options[1]);m.options[1].click();
  m.step();m.step();
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
  m.step(15000);assert.equal(m.control._text,'1 min');
  m.control._text='30 s';m.step();m.step();
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000,'a later automatic rollback cannot become the saved preference');
  assert.equal(inspectNativeExpiryBeforeClick().blocked,true,'an unrecognized repair menu cannot cause a trade at the wrong duration');
 }finally{m.restore()}
});

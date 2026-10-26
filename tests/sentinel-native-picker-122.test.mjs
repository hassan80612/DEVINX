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

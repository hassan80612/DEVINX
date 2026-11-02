import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrokerNativeExpiryKeeper} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {browser} from './helpers/broker-expiry-browser.mjs';

test('reload: an already injected expiry keeper re-reads Agent after the durable bridge arrives late',async()=>{
 const b=browser('30 s',30000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,30000);
  // Browser new document injected keeper before Playwright exposed bridge.
  window.__sentinelGetNativeExpiryChoice=async()=>({durationMs:60000,selectedAt:99999});
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  // Allow the asynchronous Playwright-style exposed-function receipt to
  // settle before inspecting the restored preference.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
  b.step();b.step();b.step();
  assert.equal(b.control._text,'1 min','broker default 30s is restored to Agent choice');
  assert.equal(b.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option'),'60000');
 }finally{b.restore()}
});
test('reload: a stale Agent 1m receipt must never replace a newer trusted manual 30s',async()=>{
 const b=browser('30 s',30000);
 try{
  b.storage.set('sentinel-broker-native-expiration-preference-v3:iq_option:selectedAt','200000');
  b.storage.set('sentinel-broker-native-explicit-default-v4:iq_option','30000');
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  window.__sentinelGetNativeExpiryChoice=async()=>({durationMs:60000,selectedAt:99999});
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  // Allow the asynchronous Playwright-style exposed-function receipt to
  // settle before inspecting the restored preference.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,30000);
  b.step();b.step();
  assert.equal(b.control._text,'30 s');
 }finally{b.restore()}
});
test('reload: old 30s unchosen fallback never supplants durable selected 5m',async()=>{
 const b=browser('30 s',30000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  window.__sentinelGetNativeExpiryChoice=async()=>({durationMs:300000,selectedAt:99999});
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  // Allow the asynchronous Playwright-style exposed-function receipt to
  // settle before inspecting the restored preference.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,300000);
  assert.equal(b.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option'),'300000');
 }finally{b.restore()}
});

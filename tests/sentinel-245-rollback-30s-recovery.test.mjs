import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrokerNativeExpiryKeeper} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {recoverMissingRuntimeExpiryFromNative,lastTrustedExpiryForResume}
 from '../sentinel-trading-lab/agent/worker/native-expiry-resume-228.mjs';
import {browser} from './helpers/broker-expiry-browser.mjs';

test('expiry 245: last native 1m survives missing runtime state instead of constructor 30s',()=>{
 assert.equal(recoverMissingRuntimeExpiryFromNative({nativeDurationMs:60000,currentDurationMs:30000}),60000);
 assert.equal(recoverMissingRuntimeExpiryFromNative({nativeDurationMs:300000,currentDurationMs:30000}),300000);
 assert.equal(recoverMissingRuntimeExpiryFromNative({nativeDurationMs:30000,currentDurationMs:30000}),null);
 assert.equal(recoverMissingRuntimeExpiryFromNative({nativeDurationMs:60000,currentDurationMs:30000,changedDuringRecovery:true}),null);
 assert.equal(recoverMissingRuntimeExpiryFromNative({nativeDurationMs:60000,currentDurationMs:300000}),null);
});
test('expiry 245: explicit native 30 marker from an old page cannot undo Agent 1m',()=>{
 const b=browser('30 s',30000);
 try{
  const k='sentinel-broker-native-expiration-preference-v3:iq_option';
  b.storage.set('sentinel-broker-native-explicit-default-v4:iq_option','30000');
  b.storage.set(k+':selectedAt','100500');
  installBrokerNativeExpiryKeeper({provider:'iq_option',requestedMs:60000,requestedAt:90000});
  const keeper=window.__sentinelNativeExpiryKeeperV3;
  assert.equal(keeper.snapshot().preferredMs,60000);
  assert.equal(b.storage.get(k),'60000');
  b.step();
  b.step();
  assert.equal(keeper.snapshot().currentMs,60000);
 }finally{b.restore()}
});
test('expiry 245: live keeper accepts Agent nondefault after old timestamped 30',()=>{
 const b=browser('30 s',30000);
 try{
  const k='sentinel-broker-native-expiration-preference-v3:iq_option';
  b.storage.set('sentinel-broker-native-explicit-default-v4:iq_option','30000');
  b.storage.set(k+':selectedAt','100500');
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  const keeper=window.__sentinelNativeExpiryKeeperV3;
  assert.equal(keeper.snapshot().preferredMs,30000);
  assert.equal(keeper.setPreferred(60000,{selectedAt:90000}),true);
  assert.equal(keeper.snapshot().preferredMs,60000);
  assert.equal(b.storage.get(k),'60000');
 }finally{b.restore()}
});
test('expiry 245: a stored 30 cannot replace running 1m on resume',()=>{
 assert.equal(lastTrustedExpiryForResume({
   nativeDurationMs:30000,nativeSelectedAt:Date.now(),nativeExplicit30:true,
   currentDurationMs:60000
 }),null);
});

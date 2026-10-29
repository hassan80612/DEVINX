import test from 'node:test';
import assert from 'node:assert/strict';
import {browser} from './helpers/broker-expiry-browser.mjs';
import {installBrokerNativeExpiryKeeper,inspectNativeExpiryBeforeClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
test('177: an unknown native expiry does not block the first automatic entry or startup',()=>{
 const b=browser('not identified',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(inspectNativeExpiryBeforeClick().blocked,false);
  const r=inspectNativeExpiryBeforeClick({requiredDurationMs:60000});
  assert.equal(r.blocked,false);assert.equal(r.reason,null);
  assert.equal(r.currentMs,null);assert.equal(r.preferredMs,60000);
  b.control._text='1 min';
  assert.equal(inspectNativeExpiryBeforeClick({requiredDurationMs:60000}).blocked,false);
 }finally{b.restore()}
});
test('a labelled composite clock is read as the selected duration, not guessed from the preference',()=>{
 const b=browser('Tempo de expiração\n00:30',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(inspectNativeExpiryBeforeClick({requiredDurationMs:60000}).currentMs,30000);
  assert.equal(inspectNativeExpiryBeforeClick({requiredDurationMs:60000}).blocked,true);
 }finally{b.restore()}
});

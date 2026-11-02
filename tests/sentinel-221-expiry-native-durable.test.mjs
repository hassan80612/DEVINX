import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {updateBrokerNativeExpiryPreference,installBrokerNativeExpiryKeeper} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {browser} from './helpers/broker-expiry-browser.mjs';

async function withDriver(receipt,check){
 const dir=mkdtempSync(join(tmpdir(),'sentinel-221-expiry-'));
 try{
  const driver=new LocalPlaywrightDriver({dataDir:dir});
  await driver.nativeExpiryPreferenceReady;
  const evaluations=[];
  driver.sessions.set('iq_option',{page:{
   isClosed:()=>false,frames:()=>[{evaluate:async(fn,arg)=>{
    if(fn===updateBrokerNativeExpiryPreference){evaluations.push(arg);return true;}
    return receipt;
   }}]
  }});
  await driver.setNativeExpiryPreference('iq_option',60000,{preserveExisting:true});
  const reloaded=new LocalPlaywrightDriver({dataDir:dir});await reloaded.nativeExpiryPreferenceReady;
  check({driver,reloaded,evaluations});
 }finally{rmSync(dir,{force:true,recursive:true})}
}
test('221: a browser default 30s with NO manual receipt cannot erase saved 1m',async()=>{
 await withDriver({value:30000,selectedAt:0,explicitDefault:false},({driver,reloaded,evaluations})=>{
  assert.equal(driver.nativeExpiryPreferences.get('iq_option'),60000);
  assert.equal(reloaded.nativeExpiryPreferences.get('iq_option'),60000);
  assert.equal(evaluations.at(-1).preferredMs,60000);
 });
});
test('221: a trusted manual 30s is kept as the actual last user choice',async()=>{
 await withDriver({value:30000,selectedAt:99000,explicitDefault:true},({driver,reloaded})=>{
  assert.equal(driver.nativeExpiryPreferences.get('iq_option'),30000);
  assert.equal(reloaded.nativeExpiryPreferences.get('iq_option'),30000);
 });
});
test('221: stored native 5m from old page wins over runtime fallback 1m',async()=>{
 await withDriver({value:300000,selectedAt:0,explicitDefault:false},({driver,reloaded})=>{
  assert.equal(driver.nativeExpiryPreferences.get('iq_option'),300000);
  assert.equal(reloaded.nativeExpiryPreferences.get('iq_option'),300000);
 });
});
test('221: independently verified native 1m is propagated to Agent even without detected option click',()=>{
 const b=browser('1 min');const received=[];
 try{
  window.__sentinelRememberNativeExpiryChoice=(value,at)=>{received.push([value,at]);return Promise.resolve(true)};
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  b.step();b.step();
  assert.equal(received.length,1);
  assert.equal(received[0][0],60000);
  assert.equal(b.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option'),'60000');
  assert.ok(Number(b.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option:selectedAt'))>0);
 }finally{b.restore()}
});
test('221: an unchosen broker 30s reset never triggers a durable manual-choice callback',()=>{
 const b=browser('1 min',60000);const received=[];
 try{
  window.__sentinelRememberNativeExpiryChoice=(value,at)=>{received.push([value,at]);return Promise.resolve(true)};
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  b.control._text='30 s';b.step();b.step();b.step();b.step();
  assert.equal(received.length,0);
  assert.equal(b.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option'),'60000');
 }finally{b.restore()}
});
test('221: runtime seed only executes for missing durable native preference',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(source,/if\(driver\.nativeExpiryPreferences\.has\(provider\)\)return;/);
 assert.match(source,/setNativeExpiryPreference\(provider,savedRuntimeExpirySeed,\{preserveExisting:true\}\)/);
 assert.match(source,/if\(\[30000,60000,300000\]\.includes\(duration\)\)savedRuntimeExpirySeed=duration/);
});

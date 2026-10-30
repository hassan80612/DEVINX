import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const newIsolatedDriver=()=>new LocalPlaywrightDriver({dataDir:mkdtempSync(join(tmpdir(),'sentinel-native-expiry-test-'))});

import {installBrokerNativeExpiryKeeper,updateBrokerNativeExpiryPreference} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {browser} from './helpers/broker-expiry-browser.mjs';
for(const provider of ['iq_option','exnova'])test(provider+': reconnect must preserve a newer manual native duration over an old 30s analyst request',async()=>{
 let stored='30000';
 const frame={evaluate:async(fn,arg)=>{
  if(fn===updateBrokerNativeExpiryPreference){stored=String(arg.preferredMs);return true;}
  return stored;
 }};
 const driver=newIsolatedDriver();await driver.nativeExpiryPreferenceReady;driver.sessions.set(provider,{page:{frames:()=>[frame],isClosed:()=>false}});
 await driver.setNativeExpiryPreference(provider,30000);
 stored='60000'; // trusted native selection, followed by a reconnect
 await driver.setNativeExpiryPreference(provider,30000);
 assert.equal(stored,'60000');assert.equal(driver.nativeExpiryPreferences.get(provider),60000);
 await driver.setNativeExpiryPreference(provider,300000); // actual analyst selection changed
 assert.equal(stored,'300000');
 await driver.setNativeExpiryPreference(provider,30000,{preserveExisting:false});
 assert.equal(stored,'30000','an explicit new selection still owns the preference');
});
test('an explicit selection waits for its browser persistence, and interrupted navigation retains a pending update',async()=>{
 const driver=newIsolatedDriver();await driver.nativeExpiryPreferenceReady;let finish;
 const page={frames:()=>[{evaluate:()=>new Promise(resolve=>{finish=resolve;})}],isClosed:()=>false};
 driver.sessions.set('exnova',{page});let completed=false;
 const pending=driver.setNativeExpiryPreference('exnova',60000,{preserveExisting:false}).then(()=>{completed=true;});
 for(let i=0;i<150&&typeof finish!=='function';i++)await new Promise(resolve=>setTimeout(resolve,2));
 assert.equal(completed,false);assert.equal(typeof finish,'function','browser persistence must begin');
 finish(true);await pending;
 assert.equal(driver.nativeExpiryPendingApply.has('exnova'),false);
 page.frames=()=>[{evaluate:async()=>{throw Error('navigation interrupted');}}];
 await driver.setNativeExpiryPreference('exnova',300000,{preserveExisting:false});
 assert.equal(driver.nativeExpiryPendingApply.get('exnova'),300000);
 const next={exposeFunction:async()=>{},addInitScript:async()=>{},evaluate:async()=>true,on:()=>{},
  mainFrame:()=>null,frames:()=>[{evaluate:async()=>true}]};
 await driver.installBridge(next,'exnova');
 assert.equal(driver.nativeExpiryPendingApply.has('exnova'),false,'apply is acknowledged in the new document');
});
test('an older reconnect read cannot overwrite a newer explicit choice',async()=>{
 const driver=newIsolatedDriver();await driver.nativeExpiryPreferenceReady;let release,stored='30000';
 const page={isClosed:()=>false,frames:()=>[{evaluate:async(fn,arg)=>{
  if(fn===updateBrokerNativeExpiryPreference){stored=String(arg.preferredMs);return true;}
  return new Promise(resolve=>{release=resolve;});
 }}]};
 driver.sessions.set('exnova',{page});
 const old=driver.setNativeExpiryPreference('exnova',30000);
 await Promise.resolve();await driver.setNativeExpiryPreference('exnova',60000,{preserveExisting:false});
 release('30000');assert.equal(await old,false);assert.equal(stored,'60000');
 assert.equal(driver.nativeExpiryPreferences.get('exnova'),60000);
});
test('a confirmed manual choice is saved before unload, without waiting for the periodic poll',()=>{
 const m=browser('30 s',30000),listeners={};
 try{
  window.addEventListener=(name,fn)=>{listeners[name]=fn;};window.removeEventListener=()=>{};
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.event('click',m.control);m.pick('1 min');
  assert.equal(m.control._text,'1 min');
  listeners.beforeunload();
  assert.equal(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option'),'60000');
 }finally{m.restore();}
});

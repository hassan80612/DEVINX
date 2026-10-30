import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {browser} from './helpers/broker-expiry-browser.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {installBrokerNativeExpiryKeeper,updateBrokerNativeExpiryPreference,inspectNativeExpiryBeforeClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
const KEY='sentinel-broker-native-expiration-preference-v3:iq_option';
test('193: newer Agent 1m survives existing keeper that inherited old 30s on a broker reload',()=>{
 const m=browser('30 s',30000);
 try{
  m.storage.set(KEY+':selectedAt','92000');
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,30000);
  installBrokerNativeExpiryKeeper({provider:'iq_option',requestedMs:60000,requestedAt:99000});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
  assert.equal(m.storage.get(KEY),'60000');
  assert.equal(m.storage.get(KEY+':selectedAt'),'99000');
  for(let i=0;i<3;i++)m.step();
  assert.equal(m.control._text,'1 min');
 }finally{m.restore()}
});
test('193: new document restores saved 5m even if broker paints 30s first',()=>{
 const m=browser('30 s',30000);
 try{
  m.options.push(Object.assign(Object.create(m.options[1]),{_text:'5 min'}));
  m.storage.set(KEY+':selectedAt','94000');
  installBrokerNativeExpiryKeeper({provider:'iq_option',requestedMs:300000,requestedAt:99000});
  for(let i=0;i<3;i++)m.step();
  assert.equal(m.storage.get(KEY),'300000');
  assert.equal(m.control._text,'5 min');
 }finally{m.restore()}
});
test('193: later trusted native manual 30s is never undone by older 1m Agent receipt',()=>{
 const m=browser('1 min',60000);
 try{
  m.storage.set(KEY+':selectedAt','98000');
  installBrokerNativeExpiryKeeper({provider:'iq_option',requestedMs:60000,requestedAt:98000});
  m.now=101000;
  m.event('click',m.control);m.pick('30 s');m.step();
  assert.equal(m.storage.get(KEY),'30000');
  const manualAt=Number(m.storage.get(KEY+':selectedAt'));
  assert.equal(manualAt,101000);
  installBrokerNativeExpiryKeeper({provider:'iq_option',requestedMs:60000,requestedAt:98000});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,30000);
  assert.equal(m.storage.get(KEY),'30000');
  assert.equal(m.storage.get(KEY+':selectedAt'),String(manualAt));
 }finally{m.restore()}
});
test('193: current confirmed native mismatch blocks physical click, unreadable picker is not misrepresented',()=>{
 const m=browser('30 s',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(inspectNativeExpiryBeforeClick({requiredDurationMs:60000}).blocked,true);
  const keeper=window.__sentinelNativeExpiryKeeperV3;
  assert.equal(keeper.revision,17);
  assert.equal(keeper.snapshot().currentMs,30000);
 }finally{m.restore()}
});
test('193: newer receipt from native manual change is persisted across Agent restarts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sentinel-193-reload-'));
 try{
  const d=new LocalPlaywrightDriver({dataDir:dir});
  await d.nativeExpiryPreferenceReady;
  await d.setNativeExpiryPreference('exnova',60000,{preserveExisting:false});
  const manualAt=Date.now()+3000,received=[];
  const frame={evaluate:async(fn,arg)=>{
   if(fn===updateBrokerNativeExpiryPreference){received.push(arg);return true;}
   return {value:300000,selectedAt:manualAt,explicitDefault:false};
  }};
  d.sessions.set('exnova',{page:{frames:()=>[frame],isClosed:()=>false}});
  await d.setNativeExpiryPreference('exnova',60000,{preserveExisting:true});
  assert.equal(d.nativeExpiryPreferences.get('exnova'),300000);
  assert.equal(received.at(-1).selectedAt,manualAt);
  const saved=JSON.parse(readFileSync(join(dir,'native-expiry-preferences.json')));
  assert.equal(saved.exnova.durationMs,300000);
  assert.equal(saved.exnova.selectedAt,manualAt);
  const restarted=new LocalPlaywrightDriver({dataDir:dir});
  await restarted.nativeExpiryPreferenceReady;
  assert.equal(restarted.nativeExpiryPreferences.get('exnova'),300000);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

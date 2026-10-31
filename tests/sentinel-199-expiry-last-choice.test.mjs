import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {browser} from './helpers/broker-expiry-browser.mjs';
import {installBrokerNativeExpiryKeeper,updateBrokerNativeExpiryPreference} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const KEY='sentinel-broker-native-expiration-preference-v3:iq_option';
function addFive(m){m.options.push(Object.assign(Object.create(m.options[1]),{_text:'5 min'}));}
test('199: passive bridge refresh while the native menu is open must preserve the manual choice',()=>{
 const m=browser('1 min',60000);
 try{
  addFive(m);m.storage.set(KEY+':selectedAt','99000');
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.event('click',m.control);
  updateBrokerNativeExpiryPreference({provider:'iq_option',preferredMs:60000,selectedAt:99000});
  m.pick('5 min');m.step();
  assert.equal(m.storage.get(KEY),'300000');
  assert.equal(m.storage.get(KEY+':source'),'manual');
  assert.ok(Number(m.storage.get(KEY+':selectedAt'))>=100000);
 }finally{m.restore()}
});
test('199: empty page storage restores the last durable Agent choice through the fresh-document bridge',async()=>{
 const m=browser('30 s');
 try{
  addFive(m);
  window.__sentinelGetNativeExpiryChoice=async()=>({durationMs:300000,selectedAt:99000});
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  for(let i=0;i<8;i++)await Promise.resolve();
  for(let i=0;i<3;i++)m.step();
  assert.equal(m.storage.get(KEY),'300000');assert.equal(m.control._text,'5 min');
 }finally{m.restore()}
});
test('199: newer same-duration receipt is durable, and a delayed older manual receipt cannot reverse it',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sentinel-199-'));
 try{
  const d=new LocalPlaywrightDriver({dataDir:dir});await d.nativeExpiryPreferenceReady;
  await d.setNativeExpiryPreference('exnova',60000,{preserveExisting:false,selectedAt:1000});
  d.sessions.set('exnova',{page:{isClosed:()=>false,frames:()=>[{evaluate:async(fn)=>fn===updateBrokerNativeExpiryPreference?true:{value:60000,selectedAt:3000}}]}});
  await d.setNativeExpiryPreference('exnova',60000,{preserveExisting:true});
  const saved=JSON.parse(readFileSync(join(dir,'native-expiry-preferences.json')));
  assert.equal(saved.exnova.selectedAt,3000);
  await d.setNativeExpiryPreference('exnova',30000,{preserveExisting:false,selectedAt:2000});
  assert.equal(d.nativeExpiryPreferences.get('exnova'),60000);
  const restarted=new LocalPlaywrightDriver({dataDir:dir});await restarted.nativeExpiryPreferenceReady;
  assert.equal(restarted.nativeExpirySelectedAt.get('exnova'),3000);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
for(const durationMs of [30000,60000,300000])test('199: explicit website '+durationMs+'ms PATCH saves the same native preference for restart',async()=>{
 const {DemoTradingRuntime}=await import('../sentinel-trading-lab/agent/src/core/runtime.mjs');
 const dir=mkdtempSync(join(tmpdir(),'sentinel-199-site-'));
 try{
  const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
  const driver=new LocalPlaywrightDriver({dataDir:dir});await driver.nativeExpiryPreferenceReady;
  const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
  const source=worker.slice(worker.indexOf('async function act('),worker.indexOf('\nlet autoBrokerBusy='));
  const act=new Function('ensureAccess','runtime','driver','activeProvider',source+'\nreturn act;')(()=>{},runtime,driver,'exnova');
  await act('/settings','PATCH',{orderDurationMs:durationMs});
  assert.equal(Number(runtime.settings.orderDurationMs),durationMs);
  const restarted=new LocalPlaywrightDriver({dataDir:dir});await restarted.nativeExpiryPreferenceReady;
  assert.equal(restarted.nativeExpiryPreferences.get('exnova'),durationMs);
  assert.ok(restarted.nativeExpirySelectedAt.get('exnova')>0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('199: a delayed fresh-document getter cannot undo a newer native manual 30s choice',async()=>{
 const m=browser('1 min',60000);let deliver;
 try{
  m.storage.set(KEY+':selectedAt','99000');
  window.__sentinelGetNativeExpiryChoice=()=>new Promise(resolve=>{deliver=resolve});
  installBrokerNativeExpiryKeeper({provider:'iq_option'});await Promise.resolve();
  m.now=102000;m.event('click',m.control);m.pick('30 s');m.step();
  deliver({durationMs:60000,selectedAt:99000});
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(m.storage.get(KEY),'30000');
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,30000);
 }finally{m.restore()}
});
test('199: installed bridge getter reads the current Agent preference, never the initial captured 30s',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sentinel-199-bridge-'));
 try{
  const driver=new LocalPlaywrightDriver({dataDir:dir}),bindings=new Map();
  await driver.nativeExpiryPreferenceReady;
  await driver.setNativeExpiryPreference('iq_option',30000,{preserveExisting:false});
  const frame={evaluate:async()=>true};
  const page={exposeFunction:async(name,fn)=>bindings.set(name,fn),addInitScript:async()=>{},evaluate:async()=>true,on:()=>{},mainFrame:()=>frame,frames:()=>[frame]};
  await driver.installBridge(page,'iq_option');
  await driver.setNativeExpiryPreference('iq_option',300000,{preserveExisting:false});
  const latest=await bindings.get('__sentinelGetNativeExpiryChoice')();
  assert.equal(latest.durationMs,300000);assert.equal(latest.selectedAt,driver.nativeExpirySelectedAt.get('iq_option'));
 }finally{rmSync(dir,{recursive:true,force:true})}
});

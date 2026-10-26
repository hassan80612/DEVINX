import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installBrokerNativeExpiryKeeper} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';

import {browser} from './helpers/broker-expiry-browser.mjs';
test('an option nested inside the native picker is saved as a choice, not a new opener',()=>{
 const m=browser('1 min',60000);
 try{
  m.control.contains=el=>m.options.includes(el);
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.event('pointerdown');m.pick('2 min');m.step();
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option')),120000);
 }finally{m.restore()}
});
test('trusted native select changes record the selected duration',()=>{
 const m=browser('1 min',60000);
 try{
  m.control.matches=selector=>selector==='select';
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.control._text='2 min';m.control.selectedOptions=[{textContent:'2 min'}];
  m.event('change');m.step();
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option')),120000);
 }finally{m.restore()}
});
test('migrates v1 preference but revokes the old keeper repair lease',()=>{
 const m=browser('30 s');
 try{
  m.storage.set('sentinel-broker-native-expiration-preference-v1:iq_option','120000');
  window.__sentinelNativeExpiryKeeperV3={revision:1};
  window.__sentinelNativeExpiryPermission={allowed:true,at:m.now};
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.revision,8);
  assert.equal(window.__sentinelNativeExpiryPermission.allowed,false);
  assert.equal(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option'),'120000');
  m.step();m.step();m.step();
  assert.equal(m.control._text,'2 min');
 }finally{m.restore()}
});
test('retains an existing 1-minute broker duration through a spontaneous 30s reset',()=>{
 const m=browser('1 min',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.control._text='30 s';m.step();m.step();m.step();
  assert.equal(m.control.innerText,'1 min');
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option')),60000);
 }finally{m.restore()}
});
test('a chart timeframe option is never clicked to repair native expiry',()=>{
 const m=browser('30 s',60000);let chartClicks=0;
 try{
  const chart=m.options.find(o=>o._text==='1 min');
  chart.closest=()=>null;chart.click=()=>{chartClicks++};m.options=[chart];
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.step();m.step();m.step();
  assert.equal(chartClicks,0);
  assert.equal(m.control.innerText,'30 s','unknown native menu must remain untouched');
 }finally{m.restore()}
});
test('a trusted click in a chart menu cannot authorize learning an automatic native reset',()=>{
 const m=browser('1 min',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});m.event('pointerdown');
  const chart=m.options.find(o=>o._text==='30 s');chart.closest=()=>null;
  m.event('click',chart);m.control._text='30 s';m.step();
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option')),60000);
 }finally{m.restore()}
});
test('never memorizes a default 30s unless manually selected',()=>{
 const m=browser('30 s');
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.step();m.step();
  assert.equal(m.storage.size,0);
 }finally{m.restore()}
});
test('recognizes an intentional native manual change, not a future Sentinel forecast',()=>{
 const m=browser('1 min',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.event('pointerdown');m.pick('2 min');m.step();
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option')),120000);
 }finally{m.restore()}
});
test('automatic reset to 30s after picker opened is never learned as intentional',()=>{
 const m=browser('1 min',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.event('pointerdown'); // picker opened, no duration selected
  m.control._text='30 s'; // broker silently resets
  for(let i=0;i<9;i++)m.step(); // 12s grace, 4s mismatch proof, then repair
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option')),60000);
  assert.equal(m.control.innerText,'1 min','restore the verified preference, not the unexpected reset');
 }finally{m.restore()}
});
test('a genuine trusted native option click updates even when the choice is 30s',()=>{
 const m=browser('2 min',120000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.event('pointerdown');m.pick('30 s');m.step();
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option')),30000);
  m.control._text='2 min';for(let i=0;i<9;i++)m.step();
  assert.equal(m.control.innerText,'30 s');
 }finally{m.restore()}
});
test('a click outside the expiry options cannot save a spontaneous 30s rollback',()=>{
 const m=browser('1 min',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.event('pointerdown');
  const elsewhere={innerText:'COMPRAR',textContent:'COMPRAR',closest(){return null},matches(){return false}};
  m.event('click',elsewhere);
  m.control._text='30 s';
  m.step();m.step();
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option')),60000);
 }finally{m.restore()}
});
test('explicitly choosing the already displayed 30s replaces an older saved preference',()=>{
 const m=browser('30 s',120000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.event('pointerdown');m.pick('30 s');m.step();
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option')),30000);
  for(let i=0;i<9;i++)m.step();
  assert.equal(m.control.innerText,'30 s');
 }finally{m.restore()}
});
test('never repairs while the Agent reports a busy trade or stale permission',()=>{
 const m=browser('30 s',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  globalThis.window.__sentinelNativeExpiryPermissionV3.allowed=false;
  m.step();m.step();m.step();
  assert.equal(m.control.innerText,'30 s');
  globalThis.window.__sentinelNativeExpiryPermissionV3.allowed=true;
  globalThis.window.__sentinelNativeExpiryPermissionV3.at=m.now-5000;
  m.now+=2500;m.interval(); // No Agent refresh: permission must stay stale.
  assert.equal(m.control.innerText,'30 s');
 }finally{m.restore()}
});
test('all expiry keeper wiring remains outside analysis, candle timeframe and execution',()=>{
 const base=new URL('../sentinel-trading-lab/',import.meta.url);
 const code=readFileSync(new URL('agent/worker/local-playwright-driver.mjs',base),'utf8');
 const web=readFileSync(new URL('agent/worker/broker-native-expiry-keeper.mjs',base),'utf8');
 assert.match(code,/installBrokerNativeExpiryKeeper/);
 assert.match(code,/page\.addInitScript\(installBrokerNativeExpiryKeeper/);
 assert.match(code,/frame\.evaluate\(installBrokerNativeExpiryKeeper/);
 assert.match(code,/nativeExpiryPermissionForExecutor/);
 assert.doesNotMatch(web,/\b(fetch|WebSocket|sendMessage|requestMarketData)\s*\(/);
 const release=JSON.parse(readFileSync(new URL('agent/release.json',base),'utf8'));
 assert.equal(release.version,'13.9.141');
});

test('Exnova native duration field accepts 01:00 and repairs a spontaneous 00:30 reset',()=>{
 const m=browser('01:00');
 try{
  globalThis.location.hostname='exnova.com';
  m.control.className='trade-duration-control';
  m.storage.set('sentinel-broker-native-expiration-preference-v3:exnova','60000');
  installBrokerNativeExpiryKeeper({provider:'exnova'});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs,60000);
  window.__sentinelNativeExpiryPermissionV3={allowed:true,provider:'exnova',at:m.now};
  m.control._text='00:30';
  for(let i=0;i<8;i++){
   m.now+=2500;window.__sentinelNativeExpiryPermissionV3.at=m.now;m.interval();
  }
  assert.equal(m.control.innerText,'1 min');
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs,60000);
 }finally{m.restore()}
});
test('never treats a chart duration field as selected native option expiry',()=>{
 const m=browser('01:00');
 try{
  m.control.className='chart-duration-timeframe';
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs,null);
  assert.equal(m.storage.size,0);
 }finally{m.restore()}
});

test('two confirmed 30-second broker settlements expose a mismatch with selected 60s',()=>{
 let now=1800000000000;
 const bot=new SignalExecutor({clock:()=>now,context:()=>({provider:'exnova',durationMs:60000})});
 const settle=(id,elapsed)=>{
  const clickedAt=now;
  bot.ledger.set('exnova|'+id,{provider:'exnova',orderId:id,accountId:'demo',
   sessionId:bot.sessionId,source:'unresolved',netPnl:0,
   clickedAt,durationMs:60000,amount:1});
  now+=elapsed;
  assert.equal(bot.settle({provider:'exnova',orderId:id,accountId:'demo',netPnl:-1,source:'broker'}),true);
 };
 settle('a',29800);assert.equal(bot.lastBrokerExpiryMismatch,null);
 settle('b',30200);
 assert.equal(bot.lastBrokerExpiryMismatch.expectedDurationMs,60000);
 assert.equal(bot.lastBrokerExpiryMismatch.reportedDurationFromClickMs,30000);
 assert.equal(bot.sessionLosses,2);
 settle('c',60000);
 assert.equal(bot.lastBrokerExpiryMismatch,null,'a proper 60s settlement clears the prior alert');
});

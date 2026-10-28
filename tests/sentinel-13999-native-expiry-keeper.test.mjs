import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installBrokerNativeExpiryKeeper,nativeExpiryPermissionForExecutor} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {installBrokerChartPeriodKeeper} from '../sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';

import {browser} from './helpers/broker-expiry-browser.mjs';
function chartBrowser(initial='30 s',stored=null,className='chart-duration-timeframe'){
 const key='sentinel-broker-chart-period-preference-v1:iq_option';
 const storage=new Map(stored==null?[]:[[key,String(stored)]]),listeners={},old={
  window:globalThis.window,document:globalThis.document,location:globalThis.location,
  innerHeight:globalThis.innerHeight,innerWidth:globalThis.innerWidth,
  localStorage:globalThis.localStorage,setInterval:globalThis.setInterval,
  setTimeout:globalThis.setTimeout,DateNow:Date.now
 };
 let open=false,now=100000;
 const options=['30 s','1 min','5 min'].map(text=>({
  isConnected:true,_text:text,className:'chart-timeframe-option',
  get innerText(){return this._text},get textContent(){return this._text},
  getAttribute(){return null},getBoundingClientRect(){return{width:55,height:22,right:1280,bottom:340,x:1100,y:320,top:318}},
  matches(selector){return selector.includes('role="option"')||selector.includes('timeframe')},
  closest(){return null},contains(){return false},
  click(){control._text=this._text;open=false}
 }));
 const menu={contains:el=>options.includes(el)};
 const control={isConnected:true,className,_text:initial,
  get innerText(){return this._text},get textContent(){return this._text},
  getAttribute(name){return name==='aria-controls'?'chart-period-options':null},
  getBoundingClientRect(){return{width:75,height:30,right:1280,bottom:270,x:1100,y:240,top:240}},
  matches(selector){return selector.includes('button')||selector.includes('role="button"')},
  querySelector(){return null},closest(){return null},contains(el){return open&&options.includes(el)},
  click(){open=!open}
 };
 const mock={storage,control,options,listeners,now,
  interval:null,event(name,target=control){listeners[name]?.({target,isTrusted:true})},
  step(ms=2500){now+=ms;globalThis.window.__sentinelNativeExpiryPermissionV3.at=now;this.now=now;this.interval()},
  restore(){Object.assign(globalThis,old);Date.now=old.DateNow}
 };
 globalThis.location={hostname:'iqoption.com'};globalThis.innerHeight=900;globalThis.innerWidth=1400;
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.window={__sentinelNativeExpiryPermissionV3:{allowed:true,provider:'iq_option',at:now},
  addEventListener(name,fn){listeners['window:'+name]=fn},removeEventListener(name,fn){if(listeners['window:'+name]===fn)delete listeners['window:'+name]}};
 globalThis.document={visibilityState:'visible',addEventListener(name,fn){listeners[name]=fn},
  removeEventListener(name,fn){if(listeners[name]===fn)delete listeners[name]},
  querySelectorAll(selector){
   if(selector.includes('[class*="chart-duration"')||selector.includes('[class*="chart-period"'))return[control];
   if(selector.startsWith('[role="option"]')||selector.includes('[class*="timeframe" i]'))return open?options:[];
   return[];
  },getElementById:id=>id==='chart-period-options'?menu:null};
 globalThis.setInterval=fn=>{mock.interval=fn;return 1};globalThis.setTimeout=fn=>{fn();return 1};Date.now=()=>now;
 return mock;
}
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
test('the chart timeframe is stored separately and restored after a broker reset to 30s',()=>{
 const m=chartBrowser('1 min',60);
 try{
  installBrokerChartPeriodKeeper({provider:'iq_option'});
  assert.equal(window.__sentinelBrokerChartPeriodKeeperV1.snapshot().preferredSeconds,60);
  m.control._text='30 s';m.step();m.step();
  assert.equal(m.control.innerText,'1 min');
  assert.equal(Number(m.storage.get('sentinel-broker-chart-period-preference-v1:iq_option')),60);
  assert.equal(m.storage.get('sentinel-broker-native-expiration-preference-v3:iq_option'),undefined,
   'chart recovery must not write the broker order-expiry preference');
 }finally{m.restore()}
});
test('an explicit manual chart selection replaces the saved chart period',()=>{
 const m=chartBrowser('30 s');
 try{
  installBrokerChartPeriodKeeper({provider:'iq_option'});m.step();
  m.event('pointerdown',m.control);m.control.click();
  const option=m.options.find(o=>o._text==='5 min');
  m.event('pointerdown',option);m.event('click',option);option.click();m.step();
  assert.equal(window.__sentinelBrokerChartPeriodKeeperV1.snapshot().preferredSeconds,300);
  assert.equal(Number(m.storage.get('sentinel-broker-chart-period-preference-v1:iq_option')),300);
 }finally{m.restore()}
});
test('an unlabelled expiry control is never adopted as the chart timeframe',()=>{
 const m=chartBrowser('1 min',60,'expiration-input');
 try{
  installBrokerChartPeriodKeeper({provider:'iq_option'});m.control._text='30 s';m.step();m.step();
  assert.equal(window.__sentinelBrokerChartPeriodKeeperV1.snapshot().currentSeconds,null);
  assert.equal(m.control.innerText,'30 s');
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
 const chart=readFileSync(new URL('agent/worker/broker-chart-period-keeper.mjs',base),'utf8');
 assert.match(code,/installBrokerNativeExpiryKeeper/);
 assert.match(code,/page\.addInitScript\(installBrokerNativeExpiryKeeper/);
 assert.match(code,/frame\.evaluate\(installBrokerNativeExpiryKeeper/);
 assert.match(code,/page\.addInitScript\(installBrokerChartPeriodKeeper/);
 assert.match(code,/frame\.evaluate\(installBrokerChartPeriodKeeper/);
 assert.match(code,/nativeExpiryPermissionForExecutor/);
 assert.doesNotMatch(web,/\b(fetch|WebSocket|sendMessage|requestMarketData)\s*\(/);
 assert.doesNotMatch(chart,/\b(fetch|WebSocket|sendMessage|requestMarketData)\s*\(/);
 const release=JSON.parse(readFileSync(new URL('agent/release.json',base),'utf8'));
 assert.equal(release.version,'13.9.158');
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

test('confirmed trade awaiting settlement does not freeze native expiry recovery for the next order',()=>{
 const pending={clickCount:1,confirmedClicks:1,state:'accepted'};
 const unresolvedDetail={batches:1,orders:1,waitingResult:1,waitingId:0,uncertainAttempts:0};
 const base={provider:'exnova',enabled:true,arming:false,executing:false,
   pending,unresolvedBatches:1,unresolvedDetail};
 assert.equal(nativeExpiryPermissionForExecutor(base,100000).allowed,true);
 assert.equal(nativeExpiryPermissionForExecutor({...base,executing:true},100000).allowed,false);
 assert.equal(nativeExpiryPermissionForExecutor({...base,pending:{clickCount:1,confirmedClicks:0}},100000).allowed,false);
 assert.equal(nativeExpiryPermissionForExecutor({...base,unresolvedDetail:{...unresolvedDetail,waitingId:1}},100000).allowed,false);
 assert.equal(nativeExpiryPermissionForExecutor({...base,unresolvedDetail:{...unresolvedDetail,uncertainAttempts:1}},100000).allowed,false);
});
test('Exnova 60-second native preference is restored even while an accepted order remains pending settlement',()=>{
 const m=browser('1 min',60000);
 try{
  globalThis.location.hostname='exnova.com';
  m.storage.set('sentinel-broker-native-expiration-preference-v3:exnova','60000');
  window.__sentinelNativeExpiryPermissionV3=nativeExpiryPermissionForExecutor({
    provider:'exnova',enabled:true,executing:false,arming:false,
    pending:{clickCount:1,confirmedClicks:1,state:'accepted'},
    unresolvedBatches:1,
    unresolvedDetail:{waitingResult:1,waitingId:0,uncertainAttempts:0}
  },m.now);
  installBrokerNativeExpiryKeeper({provider:'exnova'});
  m.control._text='30 s';
  for(let i=0;i<6;i++){
   m.now+=2500;
   window.__sentinelNativeExpiryPermissionV3.at=m.now;
   m.interval();
  }
  assert.equal(m.control.innerText,'1 min');
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
 }finally{m.restore()}
});

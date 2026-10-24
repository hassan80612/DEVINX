import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installBrokerNativeExpiryKeeper} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';

function browser(initial='1 min',stored=null){
 const storage=new Map(stored==null?[]:[['sentinel-broker-native-expiration-preference-v1:iq_option',String(stored)]]);
 const control={
  isConnected:true,value:'',className:'expiration-input',_text:initial,
  get innerText(){return this._text},get textContent(){return this._text},
  getAttribute(){return null},getBoundingClientRect(){return {width:95,height:34,right:1280,bottom:250,x:1100,y:210,top:210}},
  closest(){return null},contains(){return false},
  matches(){return false},querySelector(){return null},
  click(){mock.open=!mock.open;}
 };
 const option=(txt)=>{
  const el={isConnected:true,_text:txt,closest(){return null},matches(){return false},
   get innerText(){return this._text},get textContent(){return this._text},getBoundingClientRect(){return {width:72,height:30,right:1280,bottom:320,x:1100,y:285,top:285}},
   querySelector(){return null},contains(){return false},click(){control._text=this._text;mock.open=false;}};
  return el;
 };
 const mock={open:false,control,storage,listeners:{},interval:null,now:100000,
  options:[option('30 s'),option('1 min'),option('2 min')]};
 const old={window:globalThis.window,document:globalThis.document,location:globalThis.location,
  innerHeight:globalThis.innerHeight,innerWidth:globalThis.innerWidth,
  localStorage:globalThis.localStorage,setInterval:globalThis.setInterval,
  setTimeout:globalThis.setTimeout,DateNow:Date.now};
 globalThis.location={hostname:'iqoption.com'};
 globalThis.innerHeight=900;globalThis.innerWidth=1400;
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.document={visibilityState:'visible',
  querySelectorAll(selector){return selector.startsWith('[role="option"]')?(mock.open?mock.options:[]):selector.includes('expiration')?[control]:[]},
  addEventListener(name,fn){mock.listeners[name]=fn}};
 globalThis.window={__sentinelNativeExpiryPermission:{allowed:true,at:mock.now}};
 globalThis.setInterval=fn=>{mock.interval=fn;return 1};
 globalThis.setTimeout=fn=>{fn();return 1};
 Date.now=()=>mock.now;
 mock.step=(ms=2500)=>{mock.now+=ms;globalThis.window.__sentinelNativeExpiryPermission.at=mock.now;mock.interval()};
 mock.event=(name)=>mock.listeners[name]?.({target:control,isTrusted:true});
 mock.restore=()=>{Object.assign(globalThis,old);Date.now=old.DateNow;};
 return mock;
}
test('retains an existing 1-minute broker duration through a spontaneous 30s reset',()=>{
 const m=browser('1 min',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  m.control._text='30 s';m.step();m.step();m.step();
  assert.equal(m.control.innerText,'1 min');
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v1:iq_option')),60000);
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
  m.event('pointerdown');
  m.control._text='2 min';m.step();
  assert.equal(Number(m.storage.get('sentinel-broker-native-expiration-preference-v1:iq_option')),120000);
 }finally{m.restore()}
});
test('never repairs while the Agent reports a busy trade or stale permission',()=>{
 const m=browser('30 s',60000);
 try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  globalThis.window.__sentinelNativeExpiryPermission.allowed=false;
  m.step();m.step();m.step();
  assert.equal(m.control.innerText,'30 s');
  globalThis.window.__sentinelNativeExpiryPermission.allowed=true;
  globalThis.window.__sentinelNativeExpiryPermission.at=m.now-5000;
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
 assert.match(code,/__sentinelNativeExpiryPermission/);
 assert.doesNotMatch(web,/\b(fetch|WebSocket|sendMessage|requestMarketData)\s*\(/);
 const release=JSON.parse(readFileSync(new URL('agent/release.json',base),'utf8'));
 assert.equal(release.version,'13.9.102');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrokerChartPeriodKeeper} from '../sentinel-trading-lab/agent/worker/broker-chart-period-keeper.mjs';

function broker(initial='30 s',stored=null,{compactRail=false}={}){
 const storage=new Map(stored==null?[]:[['sentinel-broker-chart-period-preference-v1:exnova',String(stored)]]);
 const remembered=[];
 const events={};let selected,now=100000,open=false,timer=null;
 let later=[];
 const menu={className:'chart-timeframe-menu',getAttribute:()=>null};
 const makeControl=value=>({
  isConnected:true,_text:value,className:compactRail?'compact-button':'chart-period-selector',
  get innerText(){return this._text},get textContent(){return this._text},
  getAttribute:()=>null,closest:()=>null,contains:()=>false,querySelector:()=>null,
  matches:()=>false,
  getBoundingClientRect(){return compactRail?
   {width:42,height:30,right:82,bottom:505,top:475,left:40,x:40,y:475}:
   {width:95,height:30,right:1280,bottom:250,top:210,left:1100,x:1100,y:210}},
  click(){open=!open;}
 });
 let control=makeControl(initial);
 const makeOption=value=>({
  isConnected:true,_text:value,
  get innerText(){return this._text},get textContent(){return this._text},
  getAttribute:()=>null,className:'chart-timeframe-option',
  getBoundingClientRect(){return {width:72,height:30,right:1280,bottom:340,top:290,x:1100,y:290}},
  closest(selector){if(selector.includes('[role="option"]'))return this;
   if(selector.includes('[role="menu"]')||selector.includes('[class*="menu"'))return menu;
   return null;},
  matches(selector){return selector.includes('[role="option"]')},contains:()=>false,
  click(){control._text=value;open=false;}
 });
 const options=['30 s','1 min','5 min'].map(makeOption);
 const old={window:globalThis.window,document:globalThis.document,location:globalThis.location,
  localStorage:globalThis.localStorage,setInterval:globalThis.setInterval,
  setTimeout:globalThis.setTimeout,innerHeight:globalThis.innerHeight,innerWidth:globalThis.innerWidth,DateNow:Date.now};
 globalThis.location={hostname:'exnova.com'};
 globalThis.innerHeight=900;globalThis.innerWidth=1440;
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
 globalThis.window={addEventListener(){},removeEventListener(){},
  __sentinelRememberBrokerChartPeriodChoice(value,at){remembered.push({value,at});return Promise.resolve(true);}};
 globalThis.document={visibilityState:'visible',
  querySelectorAll(selector){if(selector.startsWith('[class*="chart-duration"'))return compactRail?[]:[control];
   if(selector.startsWith('button,[role="button"]'))return compactRail?[control]:[];
   if(selector.startsWith('[role="option"]'))return open?options:[];return [];},
  addEventListener(name,fn){events[name]=fn},removeEventListener(name,fn){if(events[name]===fn)delete events[name]},
  getElementById(){return null}
 };
 globalThis.setTimeout=fn=>{later.push(fn);return 1};
 globalThis.setInterval=fn=>{timer=fn;return 1};
 Date.now=()=>now;
 const flush=()=>{let n=0;while(later.length&&n++<30)later.shift()();assert.ok(n<30,'bounded timers')};
 const event=(name,target)=>events[name]?.({target,isTrusted:true});
 const api={
  storage,remembered,
  event,
  openPicker(){event('click',control);control.click();},
  choose(value,{rerender=false,portal=true}={}){
   const choice=options.find(x=>x._text===value);assert.ok(choice);
   if(!portal)choice.closest=()=>null;
   event('click',choice);
   choice.click();
   if(rerender){control.isConnected=false;control=makeControl(value);}
   flush();
  },
  reset(value='30 s'){control._text=value;},
  tick(n=2500){now+=n;timer?.();flush()},
  current(){return control._text;},
  preference(){return storage.get('sentinel-broker-chart-period-preference-v1:exnova')},
  status(){return globalThis.window.__sentinelBrokerChartPeriodKeeperV1?.snapshot?.()},
  close(){globalThis.window.__sentinelBrokerChartPeriodKeeperV1?.dispose?.();
   Object.assign(globalThis,old);Date.now=old.DateNow;}
 };
 return api;
}
for(const interval of ['1 min','5 min'])test('broker chart: manual '+interval+' survives a portal picker rerender and broker 30s reset',()=>{
 const b=broker();
 try{
  installBrokerChartPeriodKeeper({provider:'exnova'});
  b.openPicker();
  b.choose(interval,{rerender:true});
  b.tick();
  assert.equal(b.preference(),interval==='1 min'?'60':'300');
  b.reset();
  b.tick(13000);
  b.tick(2500);
  assert.equal(b.current(),interval);
  assert.equal(b.preference(),interval==='1 min'?'60':'300');
 }finally{b.close()}
});
test('broker chart: unlabelled portal choice is saved only after selected value changes',()=>{
 const b=broker();
 try{
  installBrokerChartPeriodKeeper({provider:'exnova'});
  b.openPicker();
  b.choose('1 min',{rerender:true,portal:false});
  b.tick();
  assert.equal(b.preference(),'60');
 }finally{b.close()}
});
test('broker chart: a spontaneous 30s reset cannot overwrite saved 1m when no manual picker was opened',()=>{
 const b=broker('30 s',60);
 try{
  installBrokerChartPeriodKeeper({provider:'exnova'});
  b.tick(2500);b.tick(2500);
  assert.equal(b.preference(),'60');
  assert.equal(b.current(),'1 min');
  assert.equal(b.status().preferredSeconds,60);
 }finally{b.close()}
});

test('broker chart: remembered Agent 5m preference repairs a new 30s frame without a saved browser key',()=>{
 const b=broker('30 s');
 try{
  installBrokerChartPeriodKeeper({provider:'exnova',requestedSeconds:300,requestedAt:100000});
  b.tick();b.tick(14000);b.tick(2500);
  assert.equal(b.current(),'5 min');
  assert.equal(b.preference(),'300');
  assert.equal(b.remembered.length,0,'automatic restoration is not a manual selection');
 }finally{b.close()}
});
test('broker chart: the last manual preference reaches the Agent; automatic 30s rollback does not overwrite it',()=>{
 const b=broker('30 s');
 try{
  installBrokerChartPeriodKeeper({provider:'exnova'});
  b.openPicker();b.choose('1 min',{rerender:true});b.tick();
  assert.ok(b.remembered.some(x=>x.value===60));
  const written=b.remembered.length;
  b.reset();b.tick(13000);b.tick(2500);
  assert.equal(b.current(),'1 min');assert.equal(b.remembered.length,written);
 }finally{b.close()}
});

test('Exnova left compact chart rail restores 1m after broker refresh to default 30s',()=>{
 const b=broker('30 s',null,{compactRail:true});
 try{
  installBrokerChartPeriodKeeper({provider:'exnova'});
  b.openPicker();b.choose('1 min',{rerender:true});b.tick();
  assert.equal(b.preference(),'60');
  b.reset();b.tick(13000);b.tick(2500);
  assert.equal(b.current(),'1 min');
  assert.equal(b.remembered.some(x=>x.value===30),false);
 }finally{b.close()}
});
test('Exnova compact rail restores saved 5m preference across a new frame',()=>{
 const b=broker('30 s',300,{compactRail:true});
 try{
  installBrokerChartPeriodKeeper({provider:'exnova'});
  b.tick(13000);b.tick(2500);
  assert.equal(b.current(),'5 min');assert.equal(b.preference(),'300');
 }finally{b.close()}
});

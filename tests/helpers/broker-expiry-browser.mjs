export function browser(initial='1 min',stored=null){
 const storage=new Map(stored==null?[]:[['sentinel-broker-native-expiration-preference-v3:iq_option',String(stored)]]);
 const control={
  isConnected:true,value:'',className:'expiration-input',_text:initial,
  get innerText(){return this._text},get textContent(){return this._text},
  getAttribute(){return null},getBoundingClientRect(){return {width:95,height:34,right:1280,bottom:250,x:1100,y:210,top:210}},
  closest(){return null},contains(){return false},
  matches(){return false},querySelector(){return null},
  click(){mock.open=!mock.open;}
 };
 const option=(txt)=>{
  const el={isConnected:true,_text:txt,closest(selector){return selector.includes('expiration')?mock.expiryRoot:null},matches(){return false},
   get innerText(){return this._text},get textContent(){return this._text},getBoundingClientRect(){return {width:72,height:30,right:1280,bottom:320,x:1100,y:285,top:285}},
   querySelector(){return null},contains(){return false},
   matches(selector){return selector.includes('role="option"')},
   click(){control._text=this._text;mock.open=false;}};
  return el;
 };
 const mock={open:false,control,storage,listeners:{},interval:null,now:100000,expiryRoot:{},
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
  getElementById(){return null},removeEventListener(name,fn){if(mock.listeners[name]===fn)delete mock.listeners[name]},addEventListener(name,fn){mock.listeners[name]=fn}};
 globalThis.window={__sentinelNativeExpiryPermissionV3:{allowed:true,provider:'iq_option',at:mock.now}};
 globalThis.setInterval=fn=>{mock.interval=fn;return 1};
 globalThis.setTimeout=fn=>{fn();return 1};
 Date.now=()=>mock.now;
 mock.step=(ms=2500)=>{mock.now+=ms;globalThis.window.__sentinelNativeExpiryPermissionV3.at=mock.now;mock.interval()};
 mock.event=(name,target=control)=>mock.listeners[name]?.({target,isTrusted:true});
 mock.pick=txt=>{
  const target=mock.options.find(o=>o._text===txt);
  if(!target)throw Error('missing native option: '+txt);
  mock.event('click',target);target.click();
 };
 mock.restore=()=>{Object.assign(globalThis,old);Date.now=old.DateNow;};
 return mock;
}

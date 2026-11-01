import test from 'node:test';
import assert from 'node:assert/strict';
import {browser} from './helpers/broker-expiry-browser.mjs';
import {installBrokerNativeExpiryKeeper,observeNativeExpiryForClick} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';

// Exnova may render "Expiration" and its selected value as separate plain
// div/span nodes. No aria-label, input, combobox or semantic class exists.
function exnovaPlainExpiry(initial='30 s',saved='60000'){
 const m=browser(initial);
 location.hostname='exnova.com';
 m.storage.set('sentinel-broker-native-expiration-preference-v3:exnova',saved);
 window.__sentinelNativeExpiryPermissionV3={provider:'exnova',allowed:true,at:m.now};
 let selected=initial;
 const rect=(left,top,width,height)=>({left,top,x:left,y:top,width,height,right:left+width,bottom:top+height});
 const node=(label,r)=>({
  isConnected:true,className:'',children:[],get innerText(){return label();},
  get textContent(){return label();},getAttribute(){return null},
  getBoundingClientRect(){return r},matches(){return false},closest(){return null},
  contains(){return false},querySelector(){return null},querySelectorAll(){return []}
 });
 const value=node(()=>selected,rect(1110,209,90,30));
 const label=node(()=> 'Expiration',rect(1110,183,90,18));
 const parent=node(()=> 'Expiration '+selected,rect(1080,175,220,85));
 label.parentElement=parent;value.parentElement=parent;
 parent.querySelectorAll=()=>[value];
 parent.click=()=>{m.open=!m.open};
 const opts=['30 s','1 min','5 min'].map(txt=>({
  isConnected:true,innerText:txt,textContent:txt,className:'',getAttribute(){return null},
  getBoundingClientRect(){return rect(1110,230,100,28)},
  contains(){return false},matches(selector){return selector.includes('[role="option"]')},
  closest(selector){return selector.includes('expiry')||selector.includes('expir')?parent:null},
  click(){selected=txt;m.open=false}
 }));
 document.querySelectorAll=selector=>{
  if(selector==='div,span,p,label,strong,small')return [label];
  if(selector.startsWith('[role="option"]'))return m.open?opts:[];
  return [];
 };
 return {m,current:()=>selected,close:()=>m.restore()};
}
test('208: Exnova native plain-text expiry field is readable without mapping',()=>{
 const b=exnovaPlainExpiry('1 min','60000');
 try{
  installBrokerNativeExpiryKeeper({provider:'exnova'});
  const s=window.__sentinelNativeExpiryKeeperV3.snapshot();
  assert.equal(s.currentMs,60000);
  assert.equal(s.preferredMs,60000);
  assert.equal(s.discoveryReason,'identified');
 }finally{b.close();}
});
test('208: Exnova spontaneous 30s expiry reset restores durable 1m without new manual order',()=>{
 const b=exnovaPlainExpiry('30 s','60000');
 try{
  installBrokerNativeExpiryKeeper({provider:'exnova'});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
  b.m.step(2500);b.m.step(2500);b.m.step(2500);
  assert.equal(b.current(),'1 min');
  assert.equal(b.m.storage.get('sentinel-broker-native-expiration-preference-v3:exnova'),'60000');
 }finally{b.close();}
});
test('208: native Exnova 5m remains readable and is not downgraded to 30s',()=>{
 const b=exnovaPlainExpiry('5 min','300000');
 try{
  installBrokerNativeExpiryKeeper({provider:'exnova'});
  b.m.step(2500);b.m.step(2500);
  assert.equal(b.current(),'5 min');
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,300000);
 }finally{b.close();}
});

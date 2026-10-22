import test from 'node:test';
import assert from 'node:assert/strict';
import {BrokerUiExecutor,isDigitalOrderPacket,inspectDigitalNewOperation} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
function harness(provider='exnova'){
 let clicks=0,probes=0,closes=0;
 const frame={evaluate:async()=>{probes++;return{found:true,selector:'#new-operation'}},
   locator:()=>({click:async()=>{clicks++}})};
 const page={frames:()=>[frame],isClosed:()=>false};
 const driver={sessions:new Map([[provider,{page}]]),state:()=>({activeId:4,screenCandidateSymbol:null})};
 const ui=new BrokerUiExecutor(driver,{onSettlement:()=>closes++,isBotEnabled:()=>true});
 return{ui,stats:()=>({clicks,probes,closes})};
}
test('Digital packet is not Blitz or generic binary option',()=>{
 assert.equal(isDigitalOrderPacket('place-digital-option',{}),true);
 assert.equal(isDigitalOrderPacket('buyv3',{instrument_type:'digital-option'}),true);
 assert.equal(isDigitalOrderPacket('buyv3',{instrument_type:'blitz'}),false);
 assert.equal(isDigitalOrderPacket('open-option',{option_type:'binary'}),false);
});
for(const provider of ['iq_option','exnova']){
 test(provider+': a real Digital close must not click New operation or rewrite the user expiry',async()=>{
  const t=harness(provider),o={provider,orderId:'digital-1',activeId:4,digitalTrade:true,amount:2,accountId:'demo'};
  t.ui.orders.set(provider+'|digital-1',o);
  t.ui.observe(provider,{msg:{name:'digital-option-closed',body:{option_id:'digital-1',profit_amount:3}}},'page-in');
  assert.equal(t.stats().closes,1);
  assert.equal(await t.ui.recoverDigitalAfterClose(provider),false);
  assert.equal(t.stats().clicks,0);
  assert.equal(t.stats().probes,0);
  assert.equal(t.ui.digitalRearm.size,0);
 });
}
test('Digital batches never cause a native post-close button click',async()=>{
 const t=harness();
 for(const id of ['D1','D2'])t.ui.orders.set('exnova|'+id,{provider:'exnova',orderId:id,activeId:4,digitalTrade:true,amount:2,accountId:'demo'});
 for(const id of ['D1','D2'])t.ui.observe('exnova',{msg:{name:'digital-option-closed',body:{option_id:id,profit_amount:3}}},'page-in');
 assert.equal(t.stats().closes,2);assert.equal(t.stats().clicks,0);assert.equal(t.stats().probes,0);
});
test('the diagnostic detector can read New operation without executing it',()=>{
 const orig={document:globalThis.document,getComputedStyle:globalThis.getComputedStyle};
 const el={disabled:false,getAttribute:k=>k==='aria-label'?'Nova operação':null,
  getBoundingClientRect:()=>({width:90,height:30}),closest:()=>null,setAttribute(k,v){this[k]=v}};
 try{
  globalThis.getComputedStyle=()=>({display:'block',visibility:'visible'});
  globalThis.document={querySelectorAll:()=>[el]};
  assert.equal(inspectDigitalNewOperation({marker:'x'}).found,true);
 }finally{globalThis.document=orig.document;globalThis.getComputedStyle=orig.getComputedStyle}
});

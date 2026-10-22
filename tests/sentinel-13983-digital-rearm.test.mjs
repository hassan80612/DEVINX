import test from 'node:test';
import assert from 'node:assert/strict';
import {BrokerUiExecutor,isDigitalOrderPacket,inspectDigitalNewOperation} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';

function harness({button=true,enabled=true,activeId=4}={}){
 let clicks=0,probes=0,closes=0;
 const frame={
  evaluate:async()=>{probes++;return button?{found:true,selector:'[data-sentinel-digital-reopen="test"]'}:{found:false}},
  locator:()=>({click:async()=>{clicks++}})
 };
 const page={frames:()=>[frame],isClosed:()=>false};
 const driver={sessions:new Map([['exnova',{page}]]),state:()=>({activeId,screenCandidateSymbol:null})};
 const ui=new BrokerUiExecutor(driver,{isBotEnabled:()=>enabled,onSettlement:()=>{closes++}});
 return {ui,page,stats:()=>({clicks,probes,closes})};
}
test('Digital packet is not Blitz or generic buyv3',()=>{
 assert.equal(isDigitalOrderPacket('place-digital-option',{}),true);
 assert.equal(isDigitalOrderPacket('buyv3',{instrument_type:'digital-option'}),true);
 assert.equal(isDigitalOrderPacket('buyv3',{instrument_type:'blitz'}),false);
 assert.equal(isDigitalOrderPacket('buyv3',{}),false);
 assert.equal(isDigitalOrderPacket('open-option',{option_type:'binary'}),false);
});
test('Digital reopens once only after exact settlement, without CALL/PUT or timeframe calls',async()=>{
 const t=harness(),o={provider:'exnova',orderId:'digital-1',activeId:4,digitalTrade:true,amount:2,accountId:'demo'};
 t.ui.orders.set('exnova|digital-1',o);
 t.ui.observe('exnova',{msg:{name:'digital-option-closed',body:{option_id:'digital-1',profit_amount:3}}},'page-in');
 await t.ui.digitalRearming.get('exnova');
 assert.equal(t.stats().closes,1);
 assert.equal(t.stats().clicks,1);
 assert.equal(t.stats().probes,1);
 await t.ui.recoverDigitalAfterClose('exnova');
 assert.equal(t.stats().clicks,1);
});
test('Blitz close never searches or clicks New operation',async()=>{
 const t=harness();
 t.ui.orders.set('exnova|blitz-1',{provider:'exnova',orderId:'blitz-1',activeId:4,
  digitalTrade:false,amount:2,accountId:'demo'});
 t.ui.observe('exnova',{msg:{name:'option-closed',body:{option_id:'blitz-1',profit_amount:3}}},'page-in');
 assert.deepEqual(t.stats(),{clicks:0,probes:0,closes:1});
});
test('Digital does not reopen before all known orders are settled',async()=>{
 const t=harness();
 const first={provider:'exnova',orderId:'D1',activeId:4,digitalTrade:true,amount:2,accountId:'demo'};
 const second={...first,orderId:'D2'};
 t.ui.orders.set('exnova|D1',first);t.ui.orders.set('exnova|D2',second);
 t.ui.observe('exnova',{msg:{name:'digital-option-closed',body:{option_id:'D1',profit_amount:3}}},'page-in');
 assert.equal(t.stats().clicks,0);
 t.ui.observe('exnova',{msg:{name:'digital-option-closed',body:{option_id:'D2',profit_amount:3}}},'page-in');
 await t.ui.digitalRearming.get('exnova');
 assert.equal(t.stats().clicks,1);
});
test('no native button means no blind click and no navigation',async()=>{
 const t=harness({button:false});
 t.ui.digitalOrderClosed('exnova',{provider:'exnova',activeId:4,digitalTrade:true});
 await t.ui.digitalRearming.get('exnova');
 await t.ui.recoverDigitalAfterClose('exnova');
 assert.equal(t.stats().clicks,0);
 assert.equal(t.stats().probes,2);
});
test('no rearm when bot is off or asset changed',async()=>{
 const off=harness({enabled:false});
 off.ui.digitalOrderClosed('exnova',{provider:'exnova',activeId:4,digitalTrade:true});
 assert.equal(off.stats().clicks,0);
 const switched=harness({activeId:5});
 switched.ui.digitalOrderClosed('exnova',{provider:'exnova',activeId:4,digitalTrade:true});
 if(switched.ui.digitalRearming.get('exnova'))await switched.ui.digitalRearming.get('exnova');
 assert.equal(switched.stats().clicks,0);
});
test('browser native New operation detection requires unique, enabled, visible control',()=>{
 const original={document:globalThis.document,getComputedStyle:globalThis.getComputedStyle};
 const el={disabled:false,getAttribute:k=>k==='aria-label'?'Nova operação':null,
   getBoundingClientRect:()=>({width:90,height:30}),closest:()=>null,
   setAttribute(k,v){this[k]=v}};
 try{
  globalThis.getComputedStyle=()=>({display:'block',visibility:'visible'});
  globalThis.document={querySelectorAll:()=>[el]};
  assert.equal(inspectDigitalNewOperation({marker:'x'}).found,true);
  el.disabled=true;
  assert.equal(inspectDigitalNewOperation({marker:'y'}).found,false);
  el.disabled=false;
  globalThis.document={querySelectorAll:()=>[el,{...el}]};
  assert.equal(inspectDigitalNewOperation({marker:'z'}).found,false);
 }finally{globalThis.document=original.document;globalThis.getComputedStyle=original.getComputedStyle}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {browser} from './helpers/broker-expiry-browser.mjs';
import {installBrokerNativeExpiryKeeper,updateBrokerNativeExpiryPreference} from '../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
for(const provider of ['iq_option','exnova'])for(const durationMs of [30000,60000,300000])for(const mode of ['unknown','mismatch','repairing','read-error']){
 test(provider+' '+durationMs+' '+mode+': first and next confirmed clicks are independent of native expiry detection',async()=>{
  const b=browser(mode==='unknown'?'unidentified':'30 s',durationMs);let clicks=0;
  try{
   location.hostname=provider==='exnova'?'exnova.com':'iqoption.com';
   installBrokerNativeExpiryKeeper({provider,requestedMs:durationMs});
   if(mode==='repairing'){const old=window.__sentinelNativeExpiryKeeperV3.snapshot;
    window.__sentinelNativeExpiryKeeperV3.snapshot=()=>({...old(),repairing:true});}
   const ui=new BrokerUiExecutor({state:()=>({activeId:76,symbol:'EUR/USD OTC'})},{ackTimeoutMs:20});
   ui.controls=async()=>({frame:{evaluate:async(fn,arg)=>{if(mode==='read-error')throw Error('picker unavailable');return fn(arg)},
    locator:()=>({click:async()=>{
     const id=++clicks,rid='r'+id;
     ui.observe(provider,{name:'buyV3',request_id:rid,msg:{name:'buyV3',body:{price:1,direction:'call',active_id:76}}},'page-out');
     ui.observe(provider,{name:'buyV3',request_id:rid,msg:{name:'buyV3',body:{id:1000+id,open_price:1.1}}},'page-in');
    }})},callSelector:'#call',putSelector:'#put'});
   for(let i=0;i<2;i++){
    const order={id:'o'+i,side:'CALL',durationMs,amount:1,asset:'EUR/USD OTC',activeId:76,isValid:()=>true};
    const r=await ui.execute(provider,order);
    assert.equal(r.accepted,true);assert.equal(order.clicked,true);
    assert.equal(order.nativeExpiryInspection.blocked,false);
    if(mode==='unknown'||mode==='read-error')assert.equal(order.nativeExpiryInspection.validatedSynchronously,false);
   }
   assert.equal(clicks,2);assert.equal(ui.awaiting.size,0);
  }finally{b.restore()}
 });
}
test('an inherited 30s default cannot undo a visible 1m choice or a reconnect to it',()=>{
 const b=browser('1 min',30000);try{
  installBrokerNativeExpiryKeeper({provider:'iq_option'});b.step();
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
  updateBrokerNativeExpiryPreference({provider:'iq_option',preferredMs:30000});b.step();
  assert.equal(b.control._text,'1 min');
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,60000);
  updateBrokerNativeExpiryPreference({provider:'iq_option',preferredMs:30000,explicit:true});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().preferredMs,30000);
  assert.equal(b.storage.get('sentinel-broker-native-explicit-default-v4:iq_option'),'30000');
 }finally{b.restore()}
});
test('Tempo and its selected clock can be adjacent DOM text nodes without whitespace',()=>{
 const b=browser('00:30',60000);try{
  b.control.className='plain-field';b.control.parentElement={textContent:'Tempo00:30',parentElement:null};
  installBrokerNativeExpiryKeeper({provider:'iq_option'});
  assert.equal(window.__sentinelNativeExpiryKeeperV3.snapshot().currentMs,30000);
 }finally{b.restore()}
});

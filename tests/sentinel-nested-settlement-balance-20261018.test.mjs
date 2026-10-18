import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

const setup=provider=>{
 const driver=new LocalPlaywrightDriver({dataDir:'ignored'});
 Object.assign(driver.state(provider),{balanceId:10,mode:'demo',activeId:76});
 driver.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:1000},{id:20,type:1,amount:100}]});
 return driver;
};
for(const provider of ['exnova','iq_option']){
 test(provider+': nested settlement is applied before any new quote or account poll',()=>{
  const driver=setup(provider),st=driver.state(provider);
  driver.ingest(provider,{name:'event',msg:{name:'balance-changed',body:{balance_id:10,type:4,current_balance:1008}}});
  assert.equal(st.balance,1008);
  driver.ingest(provider,{name:'quote-generated',msg:{active_id:76,price:1.1,time:Date.now()/1000}});
  assert.equal(st.balance,1008,'market frame must not restore the old cached amount');
  driver.ingest(provider,{name:'balance-changed',msg:{body:{balance_id:20,type:1,amount:120}}});
  assert.equal(st.balance,1008,'inactive account must not replace the selected account');
  assert.equal(st.balanceId,10);assert.equal(st.mode,'demo');
  driver.ingest(provider,{name:'balance-changed',msg:{body:{balance_id:10,type:4,amount:0}}});
  assert.equal(st.balance,0,'zero is a valid balance');
 });
 test(provider+': nested account event bypasses sampled traffic on restored and fallback sockets',async()=>{
  const driver=setup(provider),st=driver.state(provider),wsEvents={},cdpEvents={};
  const page={on:(name,fn)=>{if(name==='websocket')fn({on:(name,fn)=>wsEvents[name]=fn});},
   context:()=>({newCDPSession:async()=>({on:(name,fn)=>cdpEvents[name]=fn,send:async()=>{}})})};
  await driver.attachNetwork(provider,page);
  const frame=amount=>JSON.stringify({name:'event',msg:{name:'balance-changed',body:{balance_id:10,type:4,amount}}});
  cdpEvents['Network.webSocketFrameReceived']({response:{opcode:1,payloadData:frame(1016)}});
  assert.equal(st.balance,1016);
  page.__sentinelAccountCdpReady=false;
  wsEvents.framereceived({payload:frame(998)});
  assert.equal(st.balance,998);
 });
}

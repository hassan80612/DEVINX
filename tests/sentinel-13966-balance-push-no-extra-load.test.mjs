import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
for(const provider of ['iq_option','exnova']){
 test(provider+': received balance changes push immediately with no new network or DOM calls',()=>{
  const driver=new LocalPlaywrightDriver();
  const st=driver.state(provider);Object.assign(st,{balanceId:10,mode:'demo',activeId:76});
  const updates=[];driver.setBalanceUpdateHandler((name,balance)=>updates.push({name,balance}));
  let requests=0;driver.wsSend=()=>{requests++;throw Error('Should never poll')};
  driver.domSnapshot=()=>{requests++;throw Error('Should never access DOM')};
  driver.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:100},{id:20,type:1,amount:500}]});
  assert.equal(updates.length,1);
  assert.equal(updates[0].balance.amount,100);
  assert.equal(updates[0].balance.accountId,'10');
  driver.ingest(provider,{name:'quote-generated',msg:{active_id:76,price:1.1,time:Date.now()/1000}});
  assert.equal(updates.length,1,'market ticks should not republish identical balance');
  driver.ingest(provider,{name:'balance-changed',msg:{body:{balance_id:20,type:1,amount:600}}});
  assert.equal(updates.length,1,'do not switch to non-selected real balance');
  driver.ingest(provider,{name:'event',msg:{name:'balance-changed',body:{balance_id:10,type:4,current_balance:90}}});
  assert.equal(updates.length,2);
  assert.equal(updates.at(-1).balance.amount,90);
  assert.equal(updates.at(-1).balance.revision,2);
  assert.equal(requests,0);
 });
}

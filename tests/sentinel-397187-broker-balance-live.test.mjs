import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
for(const provider of ['iq_option','exnova']){
 test(provider+': passive balance events update PC available balance without touching page or expiry',()=>{
  const d=new LocalPlaywrightDriver({dataDir:'unused-test'});
  const s=d.state(provider),updates=[];
  s.mode='demo';s.balanceId=10;s.candleSize=120;s.expirationDurationMs=120000;
  d.setBalanceUpdateHandler((p,b)=>updates.push([p,b?.amount,b?.revision]));
  d.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:50},{id:20,type:1,amount:1000}]},'page-in');
  const initial=d.accountBalanceSnapshot(provider);
  assert.equal(initial.amount,50);
  d.ingest(provider,{name:'event',msg:{name:'balance-updated',body:{balance_id:10,type:4,current_balance:53}}},'page-in');
  assert.equal(d.accountBalanceSnapshot(provider).amount,53);
  d.ingest(provider,{name:'balance-changed',msg:{body:{balance_id:20,type:1,amount:1200}}},'page-in');
  assert.equal(d.accountBalanceSnapshot(provider).amount,53,'foreign real account never overwrites selected demo');
  d.ingest(provider,{name:'balance_update',msg:{balanceId:10,balance:49}},'page-in');
  assert.equal(d.accountBalanceSnapshot(provider).amount,49);
  assert.ok(d.accountBalanceSnapshot(provider).revision>initial.revision);
  assert.equal(s.candleSize,120);assert.equal(s.expirationDurationMs,120000);
  assert.deepEqual(updates.map(v=>v[1]),[50,53,49]);
 });
 test(provider+': executor status sees passive account balance changes',()=>{
  const d=new LocalPlaywrightDriver({dataDir:'unused-test'}),s=d.state(provider);
  s.mode='demo';s.balanceId=10;
  const executor=new SignalExecutor({context:()=>({durationMs:30000})});
  d.setBalanceUpdateHandler((_p,balance)=>executor.observeBalance(balance));
  d.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:50}]},'page-in');
  assert.equal(executor.status().availableBalance,50);
  d.ingest(provider,{name:'balance-changed',msg:{body:{balance_id:10,current_balance:48}}},'page-in');
  assert.equal(executor.status().availableBalance,48);
 });
}

test('native startup with a visible DOM balance but NO verified account still requests get-balances',async()=>{
 for(const provider of ['iq_option','exnova']){
  const d=new LocalPlaywrightDriver({dataDir:'unused-test'});
  const st=d.state(provider);
  st.balance=50;st.mode='demo';st.balanceId=null;
  st.activeMap.set('EURUSDOTC',76);
  d.sessions.set(provider,{page:{isClosed:()=>false}});
  const commands=[];
  d.wsSend=async(_provider,msg)=>{commands.push(msg.msg.name);return{ok:true}};
  assert.equal(await d.requestBaseData(provider),true);
  assert.deepEqual(commands,['get-balances'],'a DOM balance without account ID cannot satisfy broker confirmation');
  d.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:50}]},'page-in');
  assert.equal(d.accountBalanceSnapshot(provider)?.amount,50);
  await d.requestBaseData(provider);
  assert.equal(commands.length,1,'once confirmed, native chart is left alone');
 }
});

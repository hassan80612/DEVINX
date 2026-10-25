import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {selectedAccountRow,readSelectedBrokerAccount} from '../sentinel-trading-lab/agent/worker/broker-selected-account.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
const balances=[{id:10,type:4,amount:100},{id:20,type:1,amount:72.99}];
for(const provider of ['iq_option','exnova']){
 test(provider+': account with two received balances is selected by native order, without a label or manual balance',()=>{
  const d=new LocalPlaywrightDriver();d.ingest(provider,{name:'balances',msg:balances});
  assert.equal(d.accountBalanceSnapshot(provider),null);
  d.ingest(provider,{name:'sendMessage',msg:{name:'buyV3',body:{user_balance_id:20,price:10}},request_id:'native'},'page-out');
  assert.equal(d.accountBalanceSnapshot(provider).amount,72.99);
  assert.equal(d.accountBalanceSnapshot(provider).accountId,'20');
  // Independent socket's default account must not switch the page back.
  d.ingest(provider,{name:'profile',msg:{balance_id:10,balance_type:4,balance:100}},'direct-in');
  assert.equal(d.accountBalanceSnapshot(provider).amount,72.99);
  d.ingest(provider,{name:'balance-changed',msg:{balance_id:20,type:1,amount:62.99}});
  assert.equal(d.accountBalanceSnapshot(provider).amount,62.99);
 });
 for(const [target,amount] of [['stopLoss',37.25],['stopWin',123.45]])test(provider+': received account → header selection → card/phone → absolute '+target,async()=>{
  const d=new LocalPlaywrightDriver();d.ingest(provider,{name:'balances',msg:balances});
  let reads=0,requests=0;
  d.sessions.set(provider,{page:{evaluate:async fn=>{assert.equal(fn,readSelectedBrokerAccount);reads++;return{amount:100,accountId:null,mode:null}}}});
  d.wsSend=()=>{requests++;throw Error('must not request broker')};
  assert.equal(await d.refreshSelectedAccount(provider),true);
  const c={provider,asset:'EUR/USD',engine:'automatic',state:'running',licensed:true,durationMs:60000};
  const b=new SignalExecutor({context:()=>({...c,brokerBalance:d.accountBalanceSnapshot(provider)}),driver:{prepare:async()=>({amount:10})}});
  b.configure({[target]:amount});await b.start();
  assert.equal(b.status().availableBalance,100);assert.equal(unpackExecutor(packExecutor(b.status())).availableBalance,100);
  assert.match(executorPanel(b.status()),/Disponível: 100\.00/);
  d.setBalanceUpdateHandler((_,balance)=>b.observeBalance(balance));
  d.ingest(provider,{name:'event',msg:{name:'balance-changed',body:{balance_id:10,type:4,amount}}});
  assert.equal(b.enabled,false,'the account event itself enforces the stop');
  assert.equal(b.status().availableBalance,amount);
  assert.equal(reads,1);assert.equal(requests,0);
  await d.refreshSelectedAccount(provider);assert.equal(reads,1,'header recovery is bounded');
 });
}
test('ambiguous amounts or modes never guess an account; explicit zero remains valid',()=>{
 assert.equal(selectedAccountRow([...balances,{id:30,type:1,amount:100}],{amount:100}),null);
 assert.equal(selectedAccountRow(balances,{}),null);
 assert.equal(selectedAccountRow(balances,{mode:'real'}).id,20);
 assert.equal(selectedAccountRow([{id:10,type:4,amount:0}],{amount:0}).id,10);
 assert.equal(selectedAccountRow(balances,{accountId:'missing',amount:100}),null);
});
test('header reader handles currency locales and excludes trading amounts / menus',()=>{
 const element=(text,extra={})=>({textContent:text,closest:()=>null,getBoundingClientRect:()=>({top:40,width:100,height:24}),getAttribute:()=>null,...extra});
 const read=items=>runInNewContext('('+readSelectedBrokerAccount.toString()+')()',{
  document:{querySelectorAll:()=>items},getComputedStyle:()=>({display:'block',visibility:'visible'})});
 assert.equal(read([element('$72.99')]).amount,72.99);
 assert.equal(read([element('R$ 1.234,56')]).amount,1234.56);
 assert.equal(read([element('$0.00')]).amount,0);
 assert.equal(read([element('Investimento $10.00')]),null);
 assert.equal(read([element('$10.00',{getBoundingClientRect:()=>({top:340,width:100,height:24})})]),null);
 assert.equal(read([element('$100.00'),element('$72.99')]),null);
 assert.equal(read([element('$72.99',{closest:()=>({})})]),null);
});

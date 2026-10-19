import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {packExecutor,unpackExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
import {normalizeCanvasBinding} from '../sentinel-trading-lab/agent/worker/canvas-executor-targets.mjs';
import {setup,T} from './fixtures/executor-13946.mjs';
for(const provider of ['iq_option','exnova']){
 test(provider+': received funds are visible before first start and after parameter preparation fails',async()=>{
  const x=setup(provider);x.balance(23.45);x.bot.observeBalance(x.c.brokerBalance);x.bot.configure({martingaleEnabled:true,martingaleLevels:3});
  let s=x.bot.status();assert.equal(s.availableBalance,23.45);assert.equal(s.calculatedBalance,23.45);assert.equal(s.balanceSource,'broker-received-balance');assert.equal(s.riskNetPnl,0);
  x.driver.prepare=async()=>{throw Error('Campo de valor não identificado. Use Mapear controles.');};await assert.rejects(x.bot.start(),/Campo de valor/);s=unpackExecutor(packExecutor(x.bot.status()));assert.equal(s.brokerBalance.amount,23.45);assert.equal(s.availableBalance,23.45);assert.equal(s.balanceSource,'broker-received-balance');assert.equal(s.enabled,false);
 });
 test(provider+': profile selects the sole returned account ID when the profile omits balance_id',()=>{
  const d=new LocalPlaywrightDriver();d.ingest(provider,{name:'profile',msg:{balances:[{id:10,type:4,amount:23.45}]}});const b=d.accountBalanceSnapshot(provider);assert.equal(b.accountId,'10');assert.equal(b.amount,23.45);
 });
 test(provider+': delayed visible account selection reuses a received balance without another broker frame',()=>{
  const d=new LocalPlaywrightDriver();d.ingest(provider,{name:'balances',msg:[{id:10,type:4,amount:23.45},{id:20,type:1,amount:500}]});assert.equal(d.accountBalanceSnapshot(provider),null);
  d.state(provider).visibleAccountMode='demo';const b=d.accountBalanceSnapshot(provider);assert.equal(b.amount,23.45);assert.equal(b.accountId,'10');for(let n=0;n<20;n++)assert.deepEqual(d.accountBalanceSnapshot(provider),b);
  d.state(provider).visibleAccountMode='real';const real=d.accountBalanceSnapshot(provider);assert.equal(real.amount,500);assert.equal(real.accountId,'20');assert.equal(real.receivedAt,b.receivedAt);
 });
 test(provider+': analyst-selected minute governs actual holding period and no entry overlaps it',async()=>{
  const x=setup(provider);x.c.durationMs=60000;await x.bot.start();await x.fire('CALL');assert.equal(x.calls[0].durationMs,60000);assert.equal(x.bot.pending.exitAt,T+60000);
  x.advance(30000);await x.fire('PUT');assert.equal(x.calls.length,1);x.close(.8);await x.fire('PUT');assert.equal(x.calls.length,2);assert.equal(x.calls[1].durationMs,60000);
 });
}
test('empty and zero balances stay distinct; a missing balance never appears as synthetic zero',()=>{
 const x=setup();let s=x.bot.status();assert.equal(s.availableBalance,null);x.balance(0);x.bot.observeBalance(x.c.brokerBalance);s=x.bot.status();assert.equal(s.availableBalance,0);assert.equal(s.brokerBalance.amount,0);assert.equal(s.balanceSource,'broker-received-balance');
});
test('mapping a duration unit preserves CALL/PUT and refuses unknown units',()=>{
 const b={format:'sentinel-canvas-targets-v1',origin:'https://exnova.com',path:'/traderoom',canvas:{id:'room',domPath:'html:1/body:1/canvas:1',width:1000,height:800,viewportWidth:1000,viewportHeight:800,pixelRatio:1},targets:{CALL:{x:900,y:300},PUT:{x:900,y:400}},durationUnit:'min'};assert.equal(normalizeCanvasBinding(b).durationUnit,'min');assert.throws(()=>normalizeCanvasBinding({...b,durationUnit:'hours'}));
});
test('legacy two-point map opens parameter-only mapping; stale geometry permits a full remap',async()=>{
 const {binding}=await import('./fixtures/sentinel-13947-binding.mjs');const calls=[];let stale=false;
 const page={evaluate:async(fn,args)=>{calls.push(args);return args.action==='resolve'&&stale?{error:'zoom changed'}:{ready:true};}};const ui=new BrokerUiExecutor({sessions:new Map([['exnova',{page}]])});ui.canvasBindings.exnova=binding;
 await ui.beginCalibration('exnova');assert.equal(calls.at(-1).parametersOnly,true);assert.deepEqual(calls.at(-1).binding.targets,binding.targets);stale=true;await ui.beginCalibration('exnova');assert.equal(calls.at(-1).parametersOnly,false);assert.equal(calls.at(-1).binding,null);
});

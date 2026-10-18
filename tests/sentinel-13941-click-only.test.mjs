import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
const T=1800000000000;
test('executor only clicks the selected direction; no stake, duration or account reads and no order acknowledgement',async()=>{
 for(const side of ['CALL','PUT']){
  const clicks=[],state={symbol:'EUR/USD OTC',activeId:76},frame={evaluate:async()=>({callSelector:'#call',putSelector:'#put'}),locator:selector=>({click:async()=>clicks.push(selector)})};
  for(const key of ['balance','mode','expirationDurationMs'])Object.defineProperty(state,key,{get(){throw Error('unexpected read '+key);}});
  const driver={sessions:new Map([['exnova',{page:{frames:()=>[frame]}}]]),state:()=>state};
  const ui=new BrokerUiExecutor(driver);await ui.prepare('exnova',{asset:state.symbol,activeId:76});assert.deepEqual(clicks,[]);
  let captured=0;const result=await ui.execute('exnova',{side,asset:state.symbol,activeId:76,amount:10,isValid:()=>true,captureEntry:()=>captured++});
  assert.equal(result.clicked,true);assert.match(result.clickId,/^ui-click-/);assert.equal(result.accepted,undefined);assert.equal(result.orderId,undefined);assert.equal(captured,1);assert.deepEqual(clicks,[side==='CALL'?'#call':'#put']);
 }
});
test('click failure is not retried automatically',async()=>{
 let now=T,attempts=0;const c={state:'running',licensed:true,provider:'exnova',asset:'EUR/USD OTC',activeId:76,durationMs:30000,engine:'automatic',analysis:{}};
 const bot=new SignalExecutor({context:()=>c,clock:()=>now,driver:{prepare:async()=>{},execute:async(p,o)=>{attempts++;o.clicked=true;throw Error('click uncertain');}}});
 bot.configure({amount:1,initialBalance:100,payoutPercent:80});await bot.start();c.analysis={vnext:{futureEntryAnchor:{context:'x',phase:'fired',side:'CALL',entryPrice:1.1,entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000}}};
 bot.pulse();await bot.inflight;for(let n=0;n<10;n++)bot.pulse();assert.equal(attempts,1);assert.equal(bot.enabled,false);assert.equal(bot.executed,0);assert.ok(bot.pending);
});
test('local click accounting keeps the analyst expiry, even when the click is delayed',async()=>{
 let now=T;const c={state:'running',licensed:true,provider:'exnova',asset:'EUR/USD OTC',activeId:76,durationMs:30000,engine:'automatic',analysis:{},quote:1.1,quoteAt:T};
 const bot=new SignalExecutor({context:()=>c,clock:()=>now,driver:{prepare:async()=>{},execute:async(p,o)=>{now+=700;o.captureEntry();return{clicked:true,clickId:'local-1'};}}});
 bot.configure({amount:10,initialBalance:100,payoutPercent:80});await bot.start();c.analysis={vnext:{futureEntryAnchor:{context:'x',phase:'fired',side:'CALL',entryPrice:1.1,entryTriggeredAt:T,holdingSeconds:30,exitAt:T+30000}}};
 bot.pulse();await bot.inflight;assert.equal(bot.pending.exitAt,T+30000);assert.equal(bot.pending.executionSource,'ui-click');assert.match(bot.message,/clique enviado/);
 now=T+30000;c.quote=1.11;c.quoteAt=now;bot.watch();assert.equal(bot.net,8);assert.equal(bot.history[0].source,'quote-estimate');
});
test('panel explains manual broker setup and includes visible action feedback',()=>{
 const html=executorPanel({config:{},message:'Desligado',executed:0,closed:0});assert.match(html,/mesmo valor por entrada/);assert.match(html,/apenas clica CALL\/PUT/);assert.match(html,/data-sentinel-executor-action-msg/);
});
test('worker start does not enable a separate order observer',()=>{
 const text=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const action=text.slice(text.indexOf('async function executorAction'),text.indexOf('function chooseLive'));
 assert.doesNotMatch(action,/setExecutionObserver\?\.\(\(/);assert.doesNotMatch(action,/uiExecutor\.observe/);
});

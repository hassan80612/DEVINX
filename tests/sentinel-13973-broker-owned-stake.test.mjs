import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readBrokerTradeStake} from '../sentinel-trading-lab/agent/worker/broker-trade-stake.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
const T=1800000000000;
function withDom(inputs,run){
 const original={document:globalThis.document,getComputedStyle:globalThis.getComputedStyle};
 globalThis.document={querySelectorAll:selector=>selector.startsWith('input')?inputs:[]};
 globalThis.getComputedStyle=()=>({display:'block',visibility:'visible'});
 try{return run()}finally{globalThis.document=original.document;globalThis.getComputedStyle=original.getComputedStyle}
}
function input({amount,label='Valor',name='amount'}){
 return {value:amount,name,id:'',parentElement:null,textContent:'',getAttribute:k=>({'data-test':'trade-amount','data-testid':'', 'aria-label':label,placeholder:'', 'aria-hidden':null}[k]??null),
 closest:()=>null,getBoundingClientRect:()=>({width:90,height:22})};
}
test('trade input is read without clicking or polling and supports comma decimal',()=>{
 assert.equal(withDom([input({amount:'R$ 12,50'})],readBrokerTradeStake),12.5);
 assert.equal(withDom([input({amount:'15.75'})],readBrokerTradeStake),15.75);
 assert.equal(withDom([input({amount:'0'})],readBrokerTradeStake),null);
 assert.equal(withDom([input({amount:'10'}),input({amount:'12'})],readBrokerTradeStake),null);
});
test('broker amount becomes the source at start and updates every executed order',async()=>{
 let now=T;const sent=[];let ctr=0;
 const ctx={state:'running',licensed:true,provider:'iq_option',asset:'EUR/USD OTC',activeId:1,
  durationMs:60000,engine:'automatic',analysis:{},quote:1.1,quoteAt:T,
  brokerBalance:{provider:'iq_option',accountId:'demo',amount:1000,receivedAt:T,revision:1}};
 const driver={prepare:async()=>({ready:true,amount:2}),
   execute:async(_,order)=>{order.useBrokerStake?.(7);
    order.captureEntry();order.clicked=true;sent.push({amount:order.amount,side:order.side});
    return{accepted:true,orderId:String(++ctr)};}};
 const bot=new SignalExecutor({clock:()=>now,context:()=>ctx,driver});
 bot.configure({amount:0});await bot.start();
 assert.equal(bot.config.amount,2);
 now=T+1500;ctx.quoteAt=now;ctx.analysis={vnext:{futureEntryAnchor:{
  context:'iq_option|EURUSDOTC|automatic|60000',phase:'fired',side:'CALL',
  entryTriggeredAt:now,holdingSeconds:60,exitAt:now+60000}}};
 bot.pulse();await bot.inflight;
 assert.deepEqual(sent,[{amount:7,side:'CALL'}]);
 assert.equal(bot.config.amount,7,'manual value is no longer independently authoritative');
 assert.equal(bot.pending.orders[0].amount,7);
});
test('outgoing broker stake can correct an entered amount after a physical click',async()=>{
 let now=T;let order;
 const context={state:'running',licensed:true,provider:'exnova',asset:'EUR/USD OTC',activeId:3,
  durationMs:30000,engine:'automatic',analysis:{},quote:1.1,quoteAt:T};
 const driver={prepare:async()=>({ready:true,amount:2}),execute:async(_,p)=>{
   order=p;p.captureEntry();p.clicked=true;p.useBrokerStake?.(6,{confirmed:true});
   return{accepted:true,orderId:'broker-id'};}};
 const bot=new SignalExecutor({driver,context:()=>context,clock:()=>now});
 await bot.start();now+=1000;context.quoteAt=now;
 context.analysis={vnext:{futureEntryAnchor:{context:'exnova|EURUSDOTC|automatic|30000',phase:'fired',side:'PUT',
   entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000}}};
 bot.pulse();await bot.inflight;
 assert.equal(order.amount,6);
 assert.equal(bot.pending.amount,6);
 assert.equal(bot.config.amount,6);
});
test('2m and 5m survive Agent restart without becoming 30s',()=>{
 const file=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(file,/\[30000,60000,300000\]\.includes\(Number\(this\.settings\.orderDurationMs\)\)/);
});
test('no new broker network queries, repeated UI scan, or duration-change blocking',()=>{
 const stake=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-trade-stake.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(stake,/\bfetch\s*\(|\bawait\b|setTimeout\s*\(|setInterval\s*\(|XMLHttpRequest|MutationObserver/);
 const broker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(broker,/const currentStake=await c\.frame\.evaluate\(readBrokerTradeStake\)/);
 assert.match(broker,/a\.order\.useBrokerStake/);
 assert.doesNotMatch(broker,/setBrokerExpiration|selectExpiration|setBrokerDuration/);
});

test('cosmetic market-card changes do not force urgent broker UI renders',()=>{
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const start=worker.indexOf('overlayTimingKey=[');
 const section=worker.slice(start,worker.indexOf('overlayUpdates.publish(',start));
 assert.match(section,/const overlayActionKey=/);
 assert.match(section,/const urgentOverlay=overlayActionKey!==lastOverlayActionKey/);
 assert.doesNotMatch(section,/const urgentOverlay=overlayTimingKey!==lastOverlayTimingKey/);
 const scheduler=readFileSync(new URL('../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs',import.meta.url),'utf8');
 assert.match(scheduler,/minIntervalMs=6000/);
 assert.match(scheduler,/this.running||!this.pending/);
});

test('removed virtual keyboard and added safe native broker controls with verified round-trip',()=>{
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const exe=readFileSync(new URL('../sentinel-trading-lab/agent/worker/signal-executor.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(worker,/action==='invest-keypad'/);
 assert.doesNotMatch(driver,/data-sentinel-invest-keypad-toggle|async investKeypad\(/);
 assert.match(worker,/action==='native-invest-map'/);
 assert.doesNotMatch(driver,/data-sentinel-native-map="arm"/);
 assert.doesNotMatch(driver,/data-sentinel-native-map="save"/);
 assert.doesNotMatch(driver,/data-sentinel-native-map="test"/);
 assert.match(driver,/broker-native-invest-controls\.json/);
 assert.match(driver,/await frame\.locator\(steps\[0\]\.selector\)\.click/);
 assert.match(driver,/await frame\.locator\(steps\[1\]\.selector\)\.click/);
 assert.match(driver,/await frame\.locator\(steps\[2\]\.selector\)\.click/);
 assert.match(driver,/await frame\.evaluate\(readNativeInvestAmount/);
 assert.match(driver,/Math\.abs\(Number\(back\)-Number\(base\)\)<=\.011/);
 assert.match(exe,/freshBalance\(/);
});
test('legacy cached Invest above an OLD balance never falsely refuses arming',async()=>{
 const T=1800000000000;
 const context={state:'running',licensed:true,provider:'iq_option',asset:'EUR/USD OTC',activeId:1,
   durationMs:30000,engine:'automatic',analysis:{},quote:1.1,quoteAt:T,
   brokerBalance:{provider:'iq_option',accountId:'demo',amount:5,receivedAt:T-60000,revision:1}};
 const driver={prepare:async()=>({ready:true,amount:10})};
 const bot=new SignalExecutor({driver,context:()=>context,clock:()=>T});
 await bot.start();
 assert.equal(bot.enabled,true,'an old received balance is not authoritative for current Invest');
 bot.stop();
});

test('native Invest route maps opener, multiply and divide with no broker requests',async()=>{
 const file=await import('../sentinel-trading-lab/agent/worker/broker-native-invest-route.mjs');
 for(const name of ['armNativeInvestRoute','readNativeInvestRoute','clearNativeInvestRoute','inspectNativeInvestTarget','readNativeInvestAmount'])
  assert.equal(typeof file[name],'function');
 const text=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-native-invest-route.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(text,/\bfetch\s*\(|XMLHttpRequest|setInterval\s*\(|\.keyboard\./);
 assert.match(text,/pointerdown/);
 assert.match(text,/state\.stage===3/);
});

test('native Invest mapping reports each captured control persistently and never discards partial mapping',()=>{
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const route=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-native-invest-route.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(driver,/<div data-sentinel-native-map-status/);
 assert.doesNotMatch(driver,/data-sentinel-native-map="status"/);
 assert.match(driver,/el\.dataset\.nativeMapStatus/);
 assert.match(driver,/reconcile\(el,template\.content\);[\s\S]*?mappingStatus\.textContent=el\.dataset\.nativeMapStatus/);
 assert.match(driver,/NÃO SALVO · '[+]count[+]'\/3 capturados/);
 assert.match(driver,/if\(complete\.length!==1\)\{[\s\S]*?return\{ok:false,step:count/);
 assert.match(route,/MAPEANDO 1\/3/);
 assert.match(route,/MAPEANDO 2\/3/);
 assert.match(route,/MAPEANDO 3\/3/);
});

test('a DEMO/REAL Invest DOM reset gets one targeted safe field click and fresh stake read',async()=>{
 const {BrokerUiExecutor}=await import('../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs');
 const {readBrokerTradeStake,locateBrokerInvestRecovery}=await import('../sentinel-trading-lab/agent/worker/broker-trade-stake.mjs');
 let reads=0,clicks=0,matched='';
 const frame={
  evaluate:async(fn,arg)=>{
   if(fn===readBrokerTradeStake)return++reads===1?null:12;
   if(fn===locateBrokerInvestRecovery)return{ready:true,selector:'[data-sentinel-invest-recovery="1"]'};
   return true;
  },
  locator:selector=>({click:async()=>{matched=selector;clicks++;}})
 };
 const ui=new BrokerUiExecutor({state:()=>({symbol:'EUR/USD',activeId:76})});
 ui.controls=async()=>({frame});
 const result=await ui.prepare('exnova',{asset:'EUR/USD',activeId:76});
 assert.equal(result.amount,12);
 assert.equal(reads,2);assert.equal(clicks,1);
 assert.equal(matched,'[data-sentinel-invest-recovery="1"]');
});
test('unknown Invest control never creates a trade or guesses stale account value',async()=>{
 const {BrokerUiExecutor}=await import('../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs');
 const {readBrokerTradeStake,locateBrokerInvestRecovery}=await import('../sentinel-trading-lab/agent/worker/broker-trade-stake.mjs');
 let clicks=0;
 const frame={
  evaluate:async fn=>fn===readBrokerTradeStake?null:
   fn===locateBrokerInvestRecovery?{ready:false,reason:'ambiguous'}:null,
  locator:()=>({click:async()=>{clicks++}})
 };
 const ui=new BrokerUiExecutor({state:()=>({symbol:'EUR/USD',activeId:76})});
 ui.controls=async()=>({frame});
 const result=await ui.prepare('exnova',{asset:'EUR/USD',activeId:76});
 assert.equal(result.amount,null);assert.equal(clicks,0);
});
test('map controls is visible beside the PC analysis buttons, no Martingale levels are exposed',()=>{
 const ui=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../sentinel-trading-lab/agent/worker/executor-panel.mjs',import.meta.url),'utf8');
 assert.match(ui,/data-sentinel-action="stop"[\\s\\S]{0,1100}data-sentinel-executor-action="map"/);
 assert.doesNotMatch(panel,/input\\('martingaleLevels'/);
 assert.doesNotMatch(panel,/input\\('martingaleMultiplier'/);
});

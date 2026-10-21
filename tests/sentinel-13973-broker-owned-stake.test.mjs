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
 assert.match(file,/\[5000,10000,15000,30000,60000,120000,300000\]\.includes\(Number\(this\.settings\.orderDurationMs\)\)/);
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
 const section=worker.slice(worker.indexOf('const overlayTimingKey='),worker.indexOf('overlayUpdates.publish('));
 assert.match(section,/const overlayActionKey=/);
 assert.match(section,/const urgentOverlay=overlayActionKey!==lastOverlayActionKey/);
 assert.doesNotMatch(section,/const urgentOverlay=overlayTimingKey!==lastOverlayTimingKey/);
 const scheduler=readFileSync(new URL('../sentinel-trading-lab/agent/worker/latest-overlay-scheduler.mjs',import.meta.url),'utf8');
 assert.match(scheduler,/minIntervalMs=6000/);
 assert.match(scheduler,/this.running||!this.pending/);
});

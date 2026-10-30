import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseConnectedBrokerForReading} from '../sentinel-trading-lab/agent/worker/broker-start-market.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const broker={exnova:{connected:true},iq_option:{connected:true}};
test('an already open broker with no quote can be selected to start analysis',()=>{
 const v=chooseConnectedBrokerForReading({preferred:'exnova',brokers:broker,peek:()=>({open:true,updatedAt:1}),liveStatus:k=>k==='exnova'?{quote:null,candles:[]}: {quote:1.1}});
 assert.equal(v.k,'exnova');assert.equal(v.m.quote,null);
});
test('closed or disconnected broker is never eligible for analysis',()=>{
 assert.equal(chooseConnectedBrokerForReading({preferred:'exnova',brokers:{exnova:{connected:true}},peek:()=>({open:false,updatedAt:1}),liveStatus:()=>({quote:1})}),null);
 assert.equal(chooseConnectedBrokerForReading({preferred:'exnova',brokers:{exnova:{connected:false}},peek:()=>null,liveStatus:()=>({quote:1})}),null);
});
test('analysis can enter RUNNING with attached broker while its market proof is missing',async()=>{
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});
 rt.settings.requireLiveBroker=true;
 rt.setExternalMarket({provider:'exnova',symbol:'EUR/USD OTC',quote:null,quoteTs:0,feedValidated:false,quoteHistory:[],candles:[]});
 await rt.start('test');
 assert.equal(rt.stateName,'running');
 const market=rt._marketSnapshot();
 assert.equal(market.waitingLive,true);
 assert.equal(market.feedValidated,false);
});
test('manual start does not await a new asset click, history or quote',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.ok(src.includes("void Promise.resolve().then(async()=>{\n    await primeVisibleMarket(provider);"));
 assert.ok(!src.includes("if(!live)throw new Error('Aguardando leitura do ativo atual.')"));
 assert.ok(src.includes("driver.domSnapshot?.(provider)"));
 assert.ok(src.includes("return runtime.start(payload.actor||'user')"));
});

test('native broker close matches exact order ID/account and uses its own investment',async()=>{
 const {settlementFromFrame}=await import('../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs');
 const order={orderId:'known-id',accountId:'account-A',amount:1};
 const packet={name:'option-closed',msg:{body:{id:'known-id',balance_id:'account-A',amount:2,profit_amount:3.6}}};
 const settled=settlementFromFrame('exnova',packet,order);
 assert.equal(settled?.netPnl,1.6);
 assert.equal(settled?.amount,2);
 assert.equal(settlementFromFrame('exnova',{name:'option-closed',msg:{body:{id:'known-id',balance_id:'account-B',amount:2,profit_amount:3.6}}},order),null);
});
test('bot session cannot inherit a stale previous-account ID',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/worker/signal-executor.mjs',import.meta.url),'utf8');
 assert.ok(src.includes('this.clock()-Number(candidate.receivedAt)<=2500'));
 assert.ok(src.includes('Number(c.brokerBalance?.receivedAt)>=this.startedAt'));
 assert.ok(src.includes('accountId:broker?.accountId??null'));
 assert.ok(src.includes("this.hardHoldReason||(!c.licensed"));
});

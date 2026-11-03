import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
const T=1800000000000;
for(const side of ['CALL','PUT'])test('233: bot mirrors confirmed '+side+' without reversing it',async()=>{
 const actual=[];
 const context={state:'running',licensed:true,provider:'exnova',asset:'EURUSDOTC',
  activeId:7,engine:'automatic',entryFamily:'automatic',durationMs:60000,
  quote:side==='CALL'?1.5:0.5,quoteAt:T,
  quoteHistory:[{ts:T-500,price:1},{ts:T,price:side==='CALL'?1.5:0.5}],
  analysis:{vnext:{futureEntryAnchor:{context:'exnova|EURUSDOTC|automatic|60000',
   engineId:'automatic',phase:'fired',side,entryTriggeredAt:T,sourceQuoteAt:T,
   exitAt:T+60000,entryPrice:1,holdingSeconds:60}}},
  brokerBalance:{provider:'exnova',accountId:'demo',amount:100,receivedAt:T,revision:1}};
 const driver={prepare:async()=>({ready:true}),execute:async(_provider,order)=>{
  assert.equal(order.side,side);assert.equal(order.isValid(),true);
  actual.push(order.side);return{accepted:true,orderId:'233-'+side};
 }};
 const bot=new SignalExecutor({clock:()=>T,context:()=>context,driver});
 bot.configure({directionMode:'automatic',amount:1,stopLoss:0,stopWin:0,martingaleEnabled:false});
 const signal=context.analysis.vnext.futureEntryAnchor;
 context.analysis.vnext.futureEntryAnchor=null;
 await bot.start();context.analysis.vnext.futureEntryAnchor=signal;
 bot.pulse();await bot.inflight;
 assert.deepEqual(actual,[side]);
 bot.pulse();await bot.inflight;assert.deepEqual(actual,[side],'never duplicate');
});
test('233: blue line shares PC readout, independent of a trade window',()=>{
 const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 const card=readFileSync(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../sentinel-trading-lab/agent/worker/live-bridge.mjs',import.meta.url),'utf8');
 assert.match(worker,/const mobileResult=visual&&visual!==runtime\.lastResult/);
 assert.match(card,/const readingFresh=readingQuoteAt>0/);
 assert.match(card,/\{readingFresh&&observation\?\.marketReading/);
 assert.doesNotMatch(card,/\{running&&observation\?\.marketReading/);
 assert.match(bridge,/\['side','ready','reason','marketReading'/);
});
test('233: broker expiry, account, and order confirmation remain mandatory',()=>{
 const keeper=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs',import.meta.url),'utf8');
 const bot=readFileSync(new URL('../sentinel-trading-lab/agent/worker/signal-executor.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs',import.meta.url),'utf8');
 assert.match(keeper,/source==='manual'\|\|source==='analyst'\|\|explicitDefault/);
 assert.match(bot,/batch\.durationMs===this\.context\(\)\.durationMs/);
 assert.match(ui,/verifyBrokerExpiryForOrder\(/);
});

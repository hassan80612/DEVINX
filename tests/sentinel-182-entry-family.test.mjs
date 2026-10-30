import test from 'node:test';import assert from 'node:assert/strict';
import {entryFamilyOf,reviewEntryFamily,normalizeEntryFamily,supportsEntryFamilies} from '../sentinel-trading-lab/agent/src/core/entry-family.mjs';
import {fiveMinuteReversalOnly} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {SignalExecutor,executorSignal} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
const T=1800000000000;
for(const side of ['CALL','PUT'])for(const family of ['automatic','continuation','reversal'])test(side+' '+family+': all strategies share the final family preference',()=>{
 for(const reason of ['closed-structure-and-live-impulse','historical-level-breakout','break-retest-continuation','confirmed-level-structure-reversal','confirmed-fast-level-reversal','failed-breakout-structure-change','historical-level-rejection','closed-range-extreme-reversal-confirmed']){
  const c={ready:true,side,reason};assert.equal(reviewEntryFamily(c,family).ready,family==='automatic'||entryFamilyOf(c)===family);
  if(family==='automatic'||entryFamilyOf(c)===family)assert.equal(reviewEntryFamily(c,family),c);
 }
});
test('entry preference persists across restore; changing it preserves an already issued operation',()=>{
 const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});rt.patchSettings({entryFamily:'continuation'});
 const anchor={phase:'fired',context:'x',side:'CALL',entryTriggeredAt:T,exitAt:T+60000};rt.vnextWindowState=anchor;rt.patchSettings({entryFamily:'reversal'});assert.equal(rt.vnextWindowState,anchor);
 const restored=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1'});restored.restore(rt.snapshotPersistent());assert.equal(restored.settings.entryFamily,'reversal');
 assert.throws(()=>rt.patchSettings({entryFamily:'invalid'}),/invalid_entry_family/);assert.equal(normalizeEntryFamily('old'),'automatic');
 assert.equal(supportsEntryFamilies('13.9.181'),false);assert.equal(supportsEntryFamilies('13.9.182'),true);
});
for(const side of ['CALL','PUT'])test('5m '+side+': continuation is not an order in any entry mode',()=>{
 const sign=side==='CALL'?1:-1,quotes=Array.from({length:181},(_,i)=>({ts:T-180000+i*1000,receivedAt:T-180000+i*1000,price:100+sign*i*.01})),price=quotes.at(-1).price;
 const candidate={ready:true,side,reason:'closed-structure-and-live-impulse',observedAt:T,entryPrice:price};
 for(const entryFamily of ['automatic','continuation','reversal']){
  const checked=fiveMinuteReversalOnly({candidate,durationMs:300000,quoteAt:T,now:T,price,quoteHistory:quotes,entryFamily});
  assert.equal(checked.ready,false);
  assert.equal(checked.fiveMinuteReversalConfirmed,false);
 }
 assert.equal(fiveMinuteReversalOnly({candidate,durationMs:300000,quoteAt:T,now:T,price,quoteHistory:quotes.slice(-20),entryFamily:'automatic'}).ready,false);
});
test('a family choice does not erase a qualified reversal from the manual market reading',()=>{
 assert.equal(marketReading({candidate:{ready:false,reason:'entry-family-not-selected'},observation:{ready:true,side:'CALL',reason:'confirmed-level-structure-reversal'}}),'REVERSÃO CONFIRMADA · CALL');
});
test('the executor identifies an unqualified 5m horizon as non-reversal',()=>{
 const anchor={phase:'fired',context:'exnova|X|automatic|300000',engineId:'automatic',side:'CALL',entryTriggeredAt:T,exitAt:T+300000,entryPrice:100,holdingSeconds:300,fiveMinuteContextConfirmed:true,entryFamily:'automatic'};
 const s=executorSignal({vnext:{futureEntryAnchor:anchor}});assert.equal(s.fiveMinuteContextConfirmed,true);assert.equal(s.fiveMinuteReversalConfirmed,false);
});

test('automatic 5m executes only a new independently confirmed reversal, never continuation proof',async()=>{
 let executed=0;const anchor={phase:'fired',context:'exnova|X|automatic|300000',engineId:'automatic',side:'CALL',entryTriggeredAt:T,exitAt:T+300000,entryPrice:100,holdingSeconds:300,fiveMinuteContextConfirmed:true,entryFamily:'automatic'};
 const context={state:'running',licensed:true,provider:'exnova',asset:'X',activeId:7,engine:'automatic',entryFamily:'automatic',durationMs:300000,quote:100,quoteAt:T,analysis:{vnext:{futureEntryAnchor:null}},brokerBalance:{provider:'exnova',accountId:'demo',amount:100,receivedAt:T,revision:1}};
 const bot=new SignalExecutor({clock:()=>T,context:()=>context,driver:{prepare:async()=>({ready:true}),execute:async()=>{executed++;return{accepted:true,orderId:'checked-5m'};}}});
 bot.configure({directionMode:'automatic',amount:1,stopLoss:0,stopWin:0,martingaleEnabled:false});await bot.start();
 context.analysis.vnext.futureEntryAnchor=anchor;bot.pulse();await bot.inflight;assert.equal(executed,0);
 context.analysis.vnext.futureEntryAnchor={...anchor,fiveMinuteReversalConfirmed:true};
 bot.pulse();await bot.inflight;assert.equal(executed,1);
});

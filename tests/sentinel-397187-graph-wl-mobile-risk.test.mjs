import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './fixtures/executor-13946.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {observedExpiryQuote} from '../sentinel-trading-lab/agent/src/core/observed-expiry-quote-20261018.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000;
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('actual 1.130275 PUT is WIN only when observed expiry quote is lower; never later quote',()=>{
 const due=T+30000;
 const point=observedExpiryQuote({quoteHistory:[
  {ts:due-500,receivedAt:due-400,price:1.130274},
  {ts:due+200,receivedAt:due+200,price:1.131900}
 ],dueAt:due,now:due+500});
 assert.equal(point?.price,1.130274);
 assert.equal(point.price<1.130275,true);
 assert.equal(observedExpiryQuote({quoteHistory:[
  {ts:due+200,receivedAt:due+200,price:1.131900}
 ],dueAt:due,now:due+500}),null);
});

test('PC opening entry price remains fixed until expiry, next confirmed signal receives fresh price',()=>{
 const ctx={provider:'exnova',asset:'EUR/USD OTC',engineId:'automatic',durationMs:30000};
 const mk=(side,price,ts)=>({ready:true,side,entryPrice:price,observedAt:ts});
 const first=advanceNowOpportunity({...ctx,now:T+60,quoteAt:T,candidate:mk('PUT',1.130275,T)});
 assert.equal(first.entryPrice,1.130275);
 const hold=advanceNowOpportunity({...ctx,previous:first,now:T+7000,
  quoteAt:T+6950,candidate:mk('CALL',1.131111,T+6950)});
 assert.equal(hold.entryPrice,1.130275,'while signal is open');
 const ts=T+30200;
 const next=advanceNowOpportunity({...ctx,previous:hold,now:ts+70,
  quoteAt:ts,candidate:mk('CALL',1.131111,ts)});
 assert.equal(next.entryPrice,1.131111,'a new signal must never reuse the old entry');
});

test('same PC graph counts reach mobile signed snapshot at all receipt budgets',()=>{
 const live={symbol:'EUR/USD OTC',validatedSymbol:'EUR/USD OTC',assetValidated:true,
  analysisFeedValidated:true,lastQuoteAt:T,quote:1.130275};
 const s={state:'running',agentVersion:'3.97.187',
  settings:{engine:'automatic',orderDurationMs:30000,asset:'EUR/USD OTC'},
  lastResult:{asset:'EUR/USD OTC',analysis:{vnext:{
   mode:'now',engineId:'automatic',expirySeconds:30,
   outcomeQuality:{source:'observed-broker-quotes-not-trade-settlements',
     correct:4,failed:2,excludedTies:1},
   nowObservation:{reason:'scanning-now'},cards:[]}}}};
 const state=analystSnapshot(s,live);
 assert.deepEqual(state.lastResult.analysis.vnext.oq,[4,2,1]);
 for(const max of [2920,1800]){
  assert.deepEqual(fitAnalystFrame(state,max).lastResult.analysis.vnext.oq,[4,2,1]);
 }
});

test('mobile receives graph wins/losses; PC original layout intact and broker bot counts separate',()=>{
 const ui=read('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
 const model=read('sentinel-trading-lab/src/lib/live-card-model.ts');
 const style=read('sentinel-trading-lab/src/app/globals.css');
 const pc=read('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
 const bot=read('sentinel-trading-lab/agent/worker/executor-panel.mjs');
 assert.match(ui,/mobile-countdown-graph-wl/);
 assert.match(ui,/m\.graphScore\?\.wins/);
 assert.doesNotMatch(ui,/mobile-countdown-executor-wl/);
 assert.match(model,/graphScore/);
 assert.match(style,/3\.97\.187 mobile layout: stable receipt slots/);
 assert.match(style,/\.liveScenarioCompact \.vnextFutureDirection\{/);
 assert.match(pc,/data-sentinel-executor-clock-wl/);
 assert.match(pc,/outcomeQuality\?\.source==='observed-broker-quotes-not-trade-settlements'/);
 assert.match(pc,/entryPlanActive\?price\(pinnedEntry\.projectedEntryPrice\):'—'/);
 assert.match(bot,/data-sentinel-executor-wl/);
});

test('Stop Loss is not reached by UNCONFIRMED clicks; risk reservation still protects future entries',async()=>{
 const x=setup();x.balance(50);x.bot.configure({amount:1,stopLoss:30,stopWin:70});
 await x.bot.start();
 x.bot.unresolvedBatches.set('unknown',{id:'unknown',sessionId:x.bot.sessionId,
  detached:false,orders:[{clicked:true,dispatchUncertain:false,settled:false,rejected:false,amount:23}]});
 assert.equal(x.bot.riskNet(),-23);
 assert.equal(x.bot.stopLossReached(),false,'unknown loss cannot claim actual bankroll fell to floor');
 assert.equal(x.bot.stopWinReached(),false);
 assert.equal(x.bot.status().lossLimitRemaining,0,'worst-case exposure still reserved');
 x.bot.unresolvedBatches.clear();
 x.bot.net=-20;
 assert.equal(x.bot.stopLossReached(),true);
 x.bot.watch();assert.equal(x.bot.enabled,false);
 assert.match(x.bot.message,/banca calculada 30.*limite 30/);
});

test('Stop Win only at confirmed absolute target 70 with opening bank 50',async()=>{
 const x=setup();x.balance(50);x.bot.configure({amount:1,stopLoss:30,stopWin:70});
 await x.bot.start();
 x.bot.net=19;x.bot.watch();assert.equal(x.bot.enabled,true);
 x.bot.net=20;x.bot.watch();assert.equal(x.bot.enabled,false);
 assert.match(x.bot.message,/banca calculada 70.*limite 70/);
});

test('misconfigured absolute targets are rejected instead of falsely saying reached',async()=>{
 const badLoss=setup();badLoss.balance(50);
 badLoss.bot.configure({stopLoss:55,stopWin:0});
 await assert.rejects(badLoss.bot.start(),/Stop Loss.*menor.*banca inicial/);
 const badWin=setup();badWin.balance(50);
 badWin.bot.configure({stopLoss:0,stopWin:10});
 await assert.rejects(badWin.bot.start(),/Stop Win.*maior.*banca inicial/);
 const editing=setup();editing.balance(50);
 editing.bot.configure({stopLoss:30,stopWin:70});
 await editing.bot.start();
 assert.throws(()=>editing.bot.configure({stopWin:10}),/Stop Win.*maior.*banca inicial/);
 assert.equal(editing.bot.config.stopWin,70);
});

test('Stop UI specifies absolute BANKROLL values, not net-session profit',()=>{
 const ui=read('sentinel-trading-lab/agent/worker/executor-panel.mjs');
 assert.match(ui,/Stop Loss · saldo mínimo da banca/);
 assert.match(ui,/Stop Win · saldo final desejado/);
});

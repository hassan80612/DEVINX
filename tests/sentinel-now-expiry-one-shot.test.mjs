import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const T=1800000000000;
const settings={engine:'automatic',asset:'EUR/USD',orderDurationMs:30000,forecastMode:'continuous'};
function trend(side='CALL',now=T,count=140){
 const sign=side==='CALL'?1:-1;
 return Array.from({length:count},(_,i)=>({
  ts:now-(count-i)*1000,receivedAt:now-(count-i)*1000,
  price:1.1+sign*.000005*(i+1)+Math.sin(i*.31)*.0000002
 }));
}
function fresh(side='CALL',now=T){
 const quotes=trend(side,now);
 const p=1.1+(side==='CALL'?1:-1)*.000005*141;
 return {quoteHistory:[...quotes,{ts:now,receivedAt:now,price:p}],quoteAt:now,price:p,now,durationMs:30000};
}
test('causal current signal uses past completed bars and a real fresh quote, not projected prices',()=>{
 for(const side of ['CALL','PUT']){
  const r=analyzeNowOpportunity(fresh(side));
  assert.equal(r.ready,true,JSON.stringify(r));
  assert.equal(r.side,side);
  assert.equal(r.entryPrice,fresh(side).price);
  assert.equal(Object.hasOwn(r,'projectedExitPrice'),false);
 }
});
test('stale quotes, missing market bars, and live adverse retracement cannot emit a signal',()=>{
 const c=fresh('CALL');
 assert.equal(analyzeNowOpportunity({...c,now:T+2900}).ready,false);
 assert.equal(analyzeNowOpportunity({...c,quoteHistory:c.quoteHistory.slice(-4)}).ready,false);
 const last=c.quoteHistory.at(-1);
 const adverse={...c,price:last.price-.0004,
  quoteHistory:[...c.quoteHistory.slice(0,-1),{...last,price:last.price-.0004}]};
 assert.equal(analyzeNowOpportunity(adverse).ready,false);
});
test('one CALL NOW, no repeated or opposite signal before the exact 30s expiry',()=>{
 const initial=advanceNowOpportunity({candidate:analyzeNowOpportunity(fresh()),now:T,quoteAt:T,
  ...{asset:settings.asset,engineId:settings.engine,durationMs:30000}});
 assert.equal(initial.phase,'fired');
 assert.equal(initial.side,'CALL');assert.equal(initial.entryAt,T);assert.equal(initial.exitAt,T+30000);
 for(const after of [200,1000,15500,29999]){
  const held=advanceNowOpportunity({previous:initial,candidate:{...analyzeNowOpportunity(fresh('PUT',T+after)),
     side:'PUT',ready:true},now:T+after,quoteAt:T+after,
    asset:settings.asset,engineId:settings.engine,durationMs:30000});
  assert.equal(held.phase,'fired');assert.equal(held.side,'CALL');
  assert.equal(held.entryTriggeredAt,T);
  assert.equal(held.entryReadyNow,false);
  assert.equal(held.exitAt,T+30000);
 }
});
test('at expiry reenter at once with new quote; neither reuse old tick nor add cooldown',()=>{
 const original=advanceNowOpportunity({candidate:analyzeNowOpportunity(fresh()),now:T,quoteAt:T,
  asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 const stale=advanceNowOpportunity({previous:original,candidate:analyzeNowOpportunity(fresh('CALL',T+29900)),
  now:T+30050,quoteAt:T+29900,asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 assert.equal(stale.phase,'scanning');
 const stillStale=advanceNowOpportunity({previous:stale,candidate:analyzeNowOpportunity(fresh('CALL',T+29900)),
  now:T+30200,quoteAt:T+29900,asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 assert.equal(stillStale.phase,'scanning','cannot reissue pre-expiry information');
 const next=advanceNowOpportunity({previous:stillStale,candidate:analyzeNowOpportunity(fresh('PUT',T+30500)),
  now:T+30500,quoteAt:T+30500,asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 assert.equal(next.phase,'fired');assert.equal(next.side,'PUT');assert.equal(next.entryAt,T+30500);
 assert.equal(next.exitAt,T+60500);
});
test('duration reset and instrument change do not keep an old locked entry',()=>{
 const a=advanceNowOpportunity({candidate:analyzeNowOpportunity(fresh()),now:T,quoteAt:T,
  asset:'EUR/USD',engineId:'automatic',durationMs:30000});
 const b=advanceNowOpportunity({previous:a,candidate:analyzeNowOpportunity(fresh('PUT',T+1000)),
  now:T+1000,quoteAt:T+1000,asset:'GBP/USD',engineId:'automatic',durationMs:30000});
 assert.equal(b.phase,'fired');assert.equal(b.side,'PUT');
});
test('runtime now mode does not invoke future path and sends exactly the same PC event',()=>{
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 const market=fresh();
 const snap={...market,provider:'iq_option',quoteTs:market.quoteAt,
  brokerExpirationDurationMs:null,brokerExpirationConfidence:0};
 const f=r._signalValidationGate({analysis:{asset:'EUR/USD'},snap,settings,now:T});
 assert.equal(f.allowed,false);
 assert.equal(f.analysis.vnext.mode,'now');
 assert.equal(f.analysis.vnext.receipt,null);
 assert.equal(f.analysis.vnext.futureEntryForecast,null);
 assert.equal(f.analysis.vnext.futureEntryRows.length,0);
 assert.equal(f.analysis.vnext.futureEntryAnchor.entryTriggeredAt,T);
 assert.equal(f.analysis.vnext.futureEntryAnchor.exitAt,T+30000);
 assert.equal(f.analysis.operationalSignal.actionable,false);
 const next=r._signalValidationGate({analysis:{asset:'EUR/USD'},snap:{...snap,...fresh('PUT',T+14000),quoteTs:T+14000},settings,now:T+14000});
 assert.equal(next.analysis.vnext.futureEntryAnchor.side,'CALL');
 assert.equal(r.vnextWindowOutcomes.length,1);
});
test('compact phone broadcast keeps NOW mode, exact PC signal and expiry',()=>{
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 const c=fresh();
 const result=r._signalValidationGate({analysis:{asset:'EUR/USD'},snap:{...c,quoteTs:T,provider:'iq_option'},settings,now:T});
 const snapshot={lastResult:{asset:'EUR/USD',analysis:result.analysis},settings,
   state:'running',lastEvalMs:T};
 const wire=analystSnapshot(snapshot,{symbol:'EUR/USD',validatedSymbol:'EUR/USD',
   assetValidated:true,analysisFeedValidated:true,lastQuoteAt:T,quote:c.price});
 assert.equal(wire.lastResult.analysis.vnext.mode,'now');
 assert.equal(wire.lastResult.analysis.vnext.ea[10],T);
 assert.equal(wire.lastResult.analysis.vnext.ea[7],T+30000);
 assert.ok(fitAnalystFrame(wire,2920));
});

test('lateral whipsaws do not masquerade as current entry opportunities',()=>{
 let fired=0;
 for(let seed=0;seed<80;seed++){
  const q=Array.from({length:151},(_,i)=>{
   const ts=T-(150-i)*1000;
   return{ts,receivedAt:ts,price:1.1+.00035*Math.sin(i*2*Math.PI/22+seed*.23)};
  });
  const outcome=analyzeNowOpportunity({quoteHistory:q,price:q.at(-1).price,
   quoteAt:T,now:T,durationMs:30000});
  if(outcome.ready)fired++;
 }
 assert.equal(fired,0,'do not fire a signal simply because a range wiggle resembles three aligned candles');
});
test('replayed past market quotes do not use future data and never overlap expiries',async()=>{
 const {readFileSync}=await import('node:fs');
 const raw=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url),'utf8'));
 const rows=raw.quoteHistory;
 let state=null,signals=[],verified=0,correct=0;
 for(let i=0;i<rows.length;i++){
  const last=rows[i],history=rows.slice(0,i+1);
  const candidate=analyzeNowOpportunity({
    quoteHistory:history,price:last.price,quoteAt:last.ts,
    now:last.ts,durationMs:30000
  });
  // Deliberately add an unavailable next-day quote: a causal engine
  // may not change its earlier decision because of it.
  if(candidate.ready){
   const future={ts:last.ts+86400000,receivedAt:last.ts+86400000,price:last.price*100};
   assert.deepEqual(analyzeNowOpportunity({
    quoteHistory:[...history,future],price:last.price,quoteAt:last.ts,now:last.ts,durationMs:30000
   }),candidate);
  }
  const next=advanceNowOpportunity({previous:state,candidate,
    now:last.ts,quoteAt:last.ts,asset:'BROKER SAMPLE',
    engineId:'automatic',durationMs:30000});
  if(next.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt){
   if(signals.length)assert.ok(next.entryAt>=signals.at(-1).exitAt,'no overlapping entry or expiry');
   signals.push({entryAt:next.entryAt,exitAt:next.exitAt,side:next.side,
    entryPrice:next.entryPrice});
  }
  state=next;
 }
 for(const x of signals){
  const exit=rows.find(y=>y.ts>=x.exitAt&&y.ts<=x.exitAt+1000);
  if(!exit)continue;
  verified++;
  if(x.side==='CALL'?exit.price>x.entryPrice:exit.price<x.entryPrice)correct++;
 }
 assert.equal(signals.length,4);
 assert.equal(verified,3);
 assert.equal(correct,3);
 // This fixture is 180 seconds in one downtrend. It cannot estimate the
 // market-wide future hit rate or the settlement result at the broker.
});

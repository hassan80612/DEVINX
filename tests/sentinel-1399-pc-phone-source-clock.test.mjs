import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {shouldDiscardVnextFrame} from '../sentinel-trading-lab/agent/worker/vnext-frame-visibility.mjs';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

const T=1800000000000;
function priceHistory(now=T,side='CALL'){
 const mult=side==='CALL'?1:-1;
 return Array.from({length:141},(_,i)=>{
  const ts=now-(140-i)*1000;
  return {ts,receivedAt:ts,price:1.1+mult*.000005*(i+1)+Math.sin(i*.31)*.0000002};
 });
}
function makeRuntime(){
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 r.stateName='running';r.settings.asset='EUR/USD';
 r.settings.engine='automatic';r.settings.forecastMode='continuous';
 r.settings.orderDurationMs=30000;r.settings.forecastHorizonSeconds=30;
 return r;
}
function market(q){
 const last=q.at(-1);
 return {provider:'iq_option',symbol:'EUR/USD',validatedSymbol:'EUR/USD',
  quote:last.price,quoteTs:last.ts,lastQuoteAt:last.ts,quoteHistory:q,
  quoteFeedValidated:true,analysisFeedValidated:true,
  assetValidated:true,feedValidated:true,candles:[],
  mode:'demo',brokerMode:'demo'};
}
function mobileState(runtime,q,now){
 const status={state:'running',runtimeKind:'remote-agent',
  remote:{online:true},settings:runtime.settings,
  lastResult:runtime.lastResult,lastEvalMs:now,
  liveBroker:{symbol:'EUR/USD',validatedSymbol:'EUR/USD',
   assetValidated:true,analysisFeedValidated:true,
   lastQuoteAt:q.at(-1).ts,quote:q.at(-1).price},
  feed:{quoteTs:q.at(-1).ts,price:q.at(-1).price}};
 return status;
}
test('full broker tick must expose an analysis while the worker clock is 500ms ahead',async()=>{
 const q=priceHistory(),r=makeRuntime(),now=T+500;
 r.setExternalMarket(market(q));
 await r.tick(now,{skipStatus:true});
 assert.equal(r.stateName,'running',JSON.stringify(r.incidents.slice(0,2)));
 const a=r.lastResult.analysis;
 assert.equal(a.vnext.mode,'now');
 assert.equal(a.vnext.opportunityWindow.phase,'fired');
 assert.equal(a.vnext.opportunityWindow.windowStartedAt,T,'window belongs to broker quote, NOT worker processing clock');
 assert.ok(!shouldDiscardVnextFrame({analysis:a,quoteAt:T,now}));
 const mobile=liveCardModel(mobileState(r,q,now),now,60,now);
 assert.equal(mobile.fresh,true);
 assert.equal(mobile.vnextMode,'now');
 assert.equal(mobile.vnextFutureEntryAnchor?.side,'CALL');
 assert.equal(mobile.vnextOpportunityWindow?.phase,'fired');
});
test('scanning never fabricates a window that hides the entire PC and mobile analysis',async()=>{
 const r=makeRuntime(),q=priceHistory().slice(-5),now=T+350;
 const last=q.at(-1);
 const a=r._signalValidationGate({
  analysis:{asset:'EUR/USD'},settings:r.settings,
  snap:{provider:'iq_option',price:last.price,quoteTs:T,quoteHistory:q},
  now
 }).analysis;
 assert.equal(a.vnext.opportunityWindow.phase,'scanning');
 assert.ok(!a.vnext.opportunityWindow.windowStartedAt);
 assert.equal(a.operationalSignal.state,'ANALISANDO');
 assert.equal(shouldDiscardVnextFrame({analysis:a,quoteAt:T,now}),false);
 r.lastResult={asset:'EUR/USD',analysis:a};r.lastEvalMs=now;
 const mobile=liveCardModel(mobileState(r,q,now),now,60,now);
 assert.equal(mobile.vnextMode,'now');
 assert.equal(mobile.vnextOpportunityWindow.phase,'scanning');
 assert.equal(mobile.fresh,true);
});
test('old fabricated processing-time start caused the observed ALL-analysis-disappears regression',()=>{
 const q=T-500,now=T;
 const previous={vnext:{mode:'now',opportunityWindow:{
  phase:'scanning',windowStartedAt:now,windowEndsAt:0}}};
 const previousGuardWouldDiscard=Number(previous.vnext.opportunityWindow.windowStartedAt)>q;
 assert.equal(previousGuardWouldDiscard,true);
 assert.equal(shouldDiscardVnextFrame({analysis:previous,quoteAt:q,now}),false);
});
test('do not display a previous fired signal beyond its REAL expiry or for the wrong asset',()=>{
 const a={vnext:{mode:'now',opportunityWindow:{
  phase:'fired',windowStartedAt:T,windowEndsAt:T+30000}}};
 assert.equal(shouldDiscardVnextFrame({analysis:a,quoteAt:T,now:T+500}),false);
 assert.equal(shouldDiscardVnextFrame({analysis:a,quoteAt:T,now:T+30001}),true);
 assert.equal(shouldDiscardVnextFrame({analysis:a,quoteAt:T,now:T+500,switched:true}),true);
});
test('authenticated phone snapshot keeps real NOW analysis and the identical source-clock window',async()=>{
 const q=priceHistory(),r=makeRuntime(),now=T+500;
 r.setExternalMarket(market(q));await r.tick(now,{skipStatus:true});
 const snap=analystSnapshot({
  state:'running',lastResult:r.lastResult,settings:r.settings,lastEvalMs:now
 },{
  symbol:'EUR/USD',validatedSymbol:'EUR/USD',assetValidated:true,
  analysisFeedValidated:true,lastQuoteAt:T,quote:q.at(-1).price
 });
 assert.equal(snap.lastResult.analysis.vnext.mode,'now');
 assert.equal(snap.lastResult.analysis.vnext.ow[1],T);
 assert.equal(snap.lastResult.analysis.vnext.ow[2],now+30000);
});

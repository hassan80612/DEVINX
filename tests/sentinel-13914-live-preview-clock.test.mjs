import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {brokerClockView} from '../sentinel-trading-lab/agent/worker/broker-clock-view.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {analystWireV1} from '../sentinel-trading-lab/src/lib/analyst-wire-v1.mjs';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';
const T=1800000000000;
const engines=['automatic','price_action','support_resistance','trend','mean_reversion','breakout','trendline_breakout','fibonacci_retest','smart_confluence'];
test('unchanged high frequency prices retain elapsed history and do not perpetually reset structure',()=>{
 const d=new LocalPlaywrightDriver({dataDir:'ignored'}),st=d.state('exnova');
 Object.assign(st,{symbol:'EUR/USD OTC',uiSymbol:'EUR/USD OTC',activeId:76,quoteHistory:[]});
 const clock=Date.now;
 try{
  for(let ms=0;ms<=150000;ms+=50){
   Date.now=()=>T+ms;
   d.ingest('exnova',{name:'quote-generated',msg:{active_id:76,
    price:1.1+Math.floor(ms/5000)*.000025,time:(T+ms)/1000}},'page-in');
  }
 }finally{Date.now=clock;}
 assert.ok(st.quoteHistory.length>500);
 assert.ok(st.quoteHistory.at(-1).ts-st.quoteHistory[0].ts>=149000);
 assert.ok(st.quoteHistory.every((q,i,a)=>i===0||q.ts-a[i-1].ts<=500));
 const latest=st.quoteHistory.at(-1);
 const result=analyzeNowOpportunity({quoteHistory:st.quoteHistory,price:latest.price,
  quoteAt:latest.ts,now:latest.ts+100,durationMs:30000});
 assert.equal(result.ready,true,JSON.stringify(result));
 assert.equal(result.side,'CALL');
});
test('provisional direction may flip for every strategy without creating a confirmed signal',()=>{
 for(const engineId of engines){
  const base=Array.from({length:5},(_,i)=>({ts:T-4000+i*1000,price:1.1+i*.00001}));
  const input={quoteHistory:base,price:base.at(-1).price,quoteAt:T,now:T+100,engineId};
  const call=analyzeNowOpportunity(input);
  assert.equal(call.ready,false,engineId);assert.equal(call.side,null);
  assert.equal(call.provisionalSide,'CALL');
  const reversed=base.map(q=>({...q,price:2.2-q.price}));
  const put=analyzeNowOpportunity({...input,quoteHistory:reversed,price:reversed.at(-1).price});
  assert.equal(put.provisionalSide,'PUT');assert.equal(put.ready,false);
  const state=advanceNowOpportunity({candidate:put,quoteAt:T,now:T+100,engineId});
  assert.equal(state.phase,'scanning');assert.equal(state.side,null);
 }
});
test('confirmed side remains locked while opposite observations run and next signal needs a fresh post-expiry quote',()=>{
 const candidate={ready:true,side:'CALL',entryPrice:1.1,observedAt:T};
 const first=advanceNowOpportunity({candidate,now:T+100,quoteAt:T});
 const opposite={ready:true,side:'PUT',entryPrice:1.09,observedAt:T+20000};
 const locked=advanceNowOpportunity({previous:first,candidate:opposite,now:T+20100,quoteAt:T+20000});
 assert.equal(locked.side,'CALL');assert.equal(locked.observationSide,'PUT');
 assert.equal(locked.exitAt,first.exitAt);assert.equal(locked.entryReadyNow,false);
 const scanning=advanceNowOpportunity({previous:locked,candidate:opposite,now:first.exitAt,quoteAt:T+30000});
 assert.equal(scanning.phase,'scanning');
 const next=advanceNowOpportunity({previous:scanning,
  candidate:{...opposite,observedAt:first.exitAt+50},now:first.exitAt+100,quoteAt:first.exitAt+50});
 assert.equal(next.side,'PUT');assert.equal(next.entryReadyNow,true);
});
test('protocol elapsed time is applied once and mobile uses the identical verified clock and provisional reading',()=>{
 const timing={capturedAt:T,source:'broker-visible-readonly',
  purchaseWindow:{closesAt:T+27000},instrumentKind:'digital',
  brokerClock:{verified:true,source:'broker-protocol-timesync',capturedAt:T,
   brokerNowMs:T-18000+4000,ageMs:4000}};
 const clock=brokerClockView({timing,now:T+4000});
 assert.equal(clock.wallTimeMs,T-14000);
 const observation={side:null,provisionalSide:'PUT',ready:false,reason:'observing',observedAt:T+4000,evaluatedAt:T+4100};
 const frame=analystSnapshot({state:'running',lastEvalMs:T+4100,
  settings:{engine:'automatic',clockMode:'broker',orderDurationMs:30000},
  lastResult:{asset:'EUR/USD',analysis:{vnext:{mode:'now',engineId:'automatic',nowObservation:observation}}}},
  {symbol:'EUR/USD',validatedSymbol:'EUR/USD',assetValidated:true,analysisFeedValidated:true,
   quote:1.1,lastQuoteAt:T+4000,brokerTiming:timing});
 assert.deepEqual(brokerClockView({timing:frame.liveBroker.brokerTiming,now:T+4000}),clock);
 const mobile=liveCardModel(frame,T+4200);
 assert.equal(mobile.nowObservation.provisionalSide,'PUT');
 // Even the saturated fallback keeps the real observation and clock.
 frame.lastResult.analysis.vnext.cards=[{id:'x'.repeat(5000)}];
 const fitted=fitAnalystFrame(frame);
 assert.ok(fitted);assert.equal(fitted.lastResult.analysis.vnext.nowObservation.provisionalSide,'PUT');
 assert.deepEqual(fitted.liveBroker.brokerTiming.brokerClock,timing.brokerClock);
});
test('new NOW observation and broker clock authenticate after actual sender and relay key reordering',()=>{
 const key='b'.repeat(64),bridge=new SignedLiveBridge('realtime:sentinel-'+'a'.repeat(48),key);
 let sent;bridge.socket={readyState:1,send:s=>sent=JSON.parse(s)};
 const frame={v:1,at:T,seq:1,settings:{clockMode:'broker'},lastResult:{analysis:{vnext:{
  mode:'now',engineId:'automatic',nowObservation:{side:null,provisionalSide:'PUT',observedAt:T,ready:false}}}}};
 assert.equal(bridge.send('broadcast',{event:'analyst',payload:frame}),true);
 const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,reorder(v[k])])):v;
 const received=reorder(sent.payload.payload),sig=received.sig;
 const mac=v=>createHmac('sha256',Buffer.from(key,'hex')).update(analystWireV1(v)).digest('hex');
 assert.equal(mac(received),sig);
 received.lastResult.analysis.vnext.nowObservation.provisionalSide='CALL';
 assert.notEqual(mac(received),sig);
});

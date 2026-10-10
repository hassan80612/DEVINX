import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';

const start=1800000000000;
function snapshot(ts){
 return {v:1,at:ts,lastEvalMs:start,state:'running',
  liveBroker:{symbol:'EUR/GBP OTC',lastQuoteAt:ts,quote:0.85164},
  feed:{price:0.85164,quoteTs:ts},
  lastResult:{asset:'EUR/GBP OTC',analysis:{operationalSignal:{
   side:'CALL',state:'JANELA ABERTA',scenario:{side:'CALL',status:'OPEN',deadline:start+50000}}}}};
}
test('fresh price ticks reach mobile through realtime broadcast without the old 4 second wait',()=>{
 let now=start;const sent=[];const bridge=new SignedLiveBridge('realtime:sentinel-'+'c'.repeat(48),'d'.repeat(64),{clock:()=>now});
 bridge.joined=true;bridge.verifiedViewerAt=now;
 bridge.socket={readyState:1,send:x=>sent.push(JSON.parse(x))};
 assert.equal(bridge.publish(snapshot(now)),true);
 now+=1200;
 assert.equal(bridge.publish(snapshot(now)),true,'new quote delivered at ordinary 1.1s budget');
 now+=500;
 assert.equal(bridge.publish(snapshot(now)),false,'normal quote updates stay coalesced below interval');
 now+=700;
 assert.equal(bridge.publish(snapshot(now)),true,'no 4-second unchanged-scenario bottleneck');
 assert.equal(sent.length,3);
 bridge.close();
});
function state(quoteTs){
 return {state:'running',runtimeKind:'remote-agent',remote:{online:true},settings:{asset:'EUR/GBP OTC',forecastHorizonSeconds:60,orderDurationMs:30000},
  liveBroker:{symbol:'EUR/GBP OTC',validatedSymbol:'EUR/GBP OTC',assetValidated:true,analysisFeedValidated:true,lastQuoteAt:quoteTs,quote:.85164},
  feed:{quoteTs,price:.85164},lastEvalMs:start,
  lastResult:{asset:'EUR/GBP OTC',analysis:{operationalSignal:{asset:'EUR/GBP OTC',side:'CALL',state:'JANELA ABERTA',forecastHorizonSeconds:60,durationMs:30000,
   scenario:{side:'CALL',confidence:69,createdAt:start-1000,deadline:start+53000,status:'OPEN'},
   entryAnalyst:{independent:true,signal:{side:'CALL',ready:true,actionable:true,activeUntil:start+3000}}},
   generalConsensus:{rapid:{callPct:55},strategies:{callPct:60},displayCallPct:56}}}};
}
test('6-second-old quote cannot show live price, CALL-now, or live average guidance',()=>{
 const s=state(start-6000);const m=liveCardModel(s,start);
 assert.equal(m.quoteAge,6);assert.equal(m.quoteFresh,false);assert.equal(m.fresh,false);
 assert.equal(m.entrySide,null);assert.equal(m.side,null);assert.equal(m.average,57);
 assert.equal(m.averageSide,'AGUARDAR');
 assert.equal(m.totalsStale,true);
});
test('new broker quote restores the scenario without a new artificial multi-second lock',()=>{
 const m=liveCardModel(state(start-1200),start);
 assert.equal(m.quoteFresh,true);assert.equal(m.fresh,true);assert.equal(m.side,'CALL');
 assert.equal(m.scenarioTone,'call');
});
test('phone forecast headline fits and scenario colors respond only to validated direction',async()=>{
 const base=new URL('../sentinel-trading-lab/',import.meta.url);
 const s=await readFile(new URL('src/components/LiveScenarioCard.tsx',base),'utf8');
 const css=await readFile(new URL('src/app/globals.css',base),'utf8');
 assert.match(s,/mobileScenarioDirection\?'CENÁRIO '\+mobileScenarioDirection/);
 assert.doesNotMatch(s,/CENÁRIO '\+mobileScenarioDirection\+' · AGUARDE ENTRADA/);
 assert.match(s,/mobileWatchTone/);assert.match(s,/m\.fresh\?m\.scenarioTone:'neutral'/);
 assert.match(css,/\.liveDecision\.watch-call/);assert.match(css,/\.liveDecision\.watch-put/);
 assert.match(css,/\.compactScenario\.call/);assert.match(css,/\.compactScenario\.put/);
 assert.match(css,/white-space:normal!important;overflow-wrap:anywhere/);
});
test('mobile does not brand delayed prices as realtime',async()=>{
 const s=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 assert.match(s,/COTAÇÃO ATRASADA/);assert.match(s,/Última cotação/);
 assert.doesNotMatch(s,/Preço em tempo real/);
});

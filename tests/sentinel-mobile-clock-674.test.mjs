import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

const read=async p=>readFile(new URL('../sentinel-trading-lab/'+p,import.meta.url),'utf8');
const base=1800000000000;
const asset='EUR/USD OTC';
const anchor=(issuedAt,side='CALL')=>({
 engineId:'automatic',asset,side,delaySeconds:30,holdingSeconds:30,issuedAt,
 entryAt:issuedAt+30000,exitAt:issuedAt+60000,
 projectedEntryPrice:1.101,projectedExitPrice:side==='CALL'?1.102:1.100
});
const snapshot=a=>analystSnapshot({
 agentVersion:'13.4.67.4',state:'running',lastEvalMs:base,
 settings:{engine:'automatic',asset,orderDurationMs:30000},
 lastResult:{asset,analysis:{operationalSignal:{state:'PROJETANDO',side:'WAIT'},
   vnext:{engineId:'automatic',expirySeconds:30,computedStatus:'forecast-created',
     futureEntryAnchor:a,receipt:{engineId:'automatic',asset,side:'CALL',
       issuedAt:base,expirySeconds:30,projectedPrice:1.101}}}}
},{symbol:asset,validatedSymbol:asset,assetValidated:true,analysisFeedValidated:true,
  quote:1.101,lastQuoteAt:base});

test('new entry future clock is broadcast urgently with SAME market quote',()=>{
 let now=base;
 const sent=[];
 const bridge=new SignedLiveBridge('realtime:sentinel-'+'a'.repeat(48),'d'.repeat(64),{clock:()=>now});
 bridge.joined=true;bridge.verifiedViewerAt=now;
 bridge.socket={readyState:1,send:x=>sent.push(JSON.parse(x))};
 assert.equal(bridge.publish(snapshot(anchor(base))),true);
 now+=550;
 assert.equal(bridge.publish(snapshot(anchor(base+30000,'PUT'))),true,
   'new pinned clock must not wait for next broker quote or full cloud status');
 assert.equal(sent.length,2);
 assert.equal(sent.at(-1).payload.payload.lastResult.analysis.vnext.ea[4],base+30000);
 assert.equal(sent.at(-1).payload.payload.lastResult.analysis.vnext.ea[1],'PUT');
 assert.ok(sent.at(-1).payload.payload.sig.length===64,'HMAC remains active');
 bridge.close();
});

test('mobile countdown advances locally, without triggering full card render for every tick',async()=>{
 const card=await read('src/components/LiveScenarioCard.tsx');
 assert.match(card,/function MobileFutureEntryClock\(/);
 assert.match(card,/timer=setInterval\(update,200\)/);
 assert.match(card,/const countdownSeconds=pinned\?Math\.max\(0,Math\.ceil\(\(plannedAt-now\)\/1000\)\):null/);
 assert.match(card,/<MobileFutureEntryClock plannedAt=\{plannedAt\}/);
 assert.equal((card.match(/data-testid="forecast-countdown-clock"/g)||[]).length,1);
 assert.equal((card.match(/\{forecastReceipt\}/g)||[]).length,2,'same forecast in standard and floating card');
 assert.match(card,/document\.visibilityState==='visible'/);
 assert.match(card,/const strategyAdvice=useMemo\(/);
 assert.doesNotMatch(card,/fetch\(/,'local clock must never fetch price or forecasts');
});

test('all original risk/freshness and engine gates are intact',async()=>{
 const model=await read('src/lib/live-card-model.ts');
 const worker=await read('agent/worker/index.mjs');
 const signed=await read('agent/worker/signed-live-bridge.mjs');
 assert.match(model,/const quoteFresh=quoteAt>0&&now-quoteAt<=2500/);
 assert.match(worker,/await runtime\.tick\(loopNow,\{skipStatus:true\}\)/);
 assert.match(worker,/mobileEntry\?\.issuedAt,mobileEntry\?\.entryAt,mobileEntry\?\.side/);
 assert.match(signed,/a\.vnext\?\.ea\?\.\[4\]/);
});

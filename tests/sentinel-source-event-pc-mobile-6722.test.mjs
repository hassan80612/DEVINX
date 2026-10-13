import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

test('PC never generates phantom PUT when the Agent has not confirmed direction',()=>{
 const code=readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.match(code,/opportunityPhase==='open'&&scheduledSide\?/);
 assert.match(code,/const confirmedSide=entryPlanReady\?pinnedEntry\.side:null/);
 assert.match(code,/entryMoment&&confirmedSide/);
 assert.match(code,/data-side="\$\{confirmedSide\|\|''\}"/);
 assert.doesNotMatch(code,/entryMoment\?\s*\('ENTRADA AGORA/);
});
test('source window and confirmed entry are prioritized in BOTH PC and signed phone',()=>{
 const worker=readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
 const bridge=readFileSync('sentinel-trading-lab/agent/worker/live-bridge.mjs','utf8');
 for(const field of ['pcWindow?.phase','pcWindow?.windowStartedAt','pcWindow?.windowEndsAt','mobileEntry?.entryTriggeredAt']){
   assert.ok(worker.includes(field),field);
 }
 assert.match(worker,/sourceEventKey!==lastLiveSourceEventKey/);
 assert.match(worker,/sourceEvent\?0:urgent\?500:1100/);
 assert.match(worker,/\{urgent,sourceEvent\}/);
 assert.match(bridge,/sourceEvent\?0:urgent\?500:this\.minIntervalMs/);
});
test('event publish passes through unchanged, and normal quote updates remain rate-limited',()=>{
 // Actual signed bridge is covered by existing integration tests. This
 // unit check asserts no extra frames for stale/unchanged render state.
 const code=readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
 assert.match(code,/lastLiveSourceEventKey=sourceEventKey/);
 assert.match(code,/lastLiveSentDecisionKey=decisionKey/);
 const pc=readFileSync('sentinel-trading-lab/src/lib/pc-authoritative-window.mjs','utf8');
 assert.match(pc,/phase==='fired'/);
 assert.match(pc,/triggered\+1500/);
});

test('actual signed channel sends a confirmed PC event immediately, even less than 500ms after the prior frame',()=>{
 const base=1800000000000;let now=base;const messages=[];
 const asset='EUR/GBP OTC';
 const bridge=new SignedLiveBridge('realtime:sentinel-'+'e'.repeat(48),'d'.repeat(64),{clock:()=>now});
 bridge.joined=true;bridge.verifiedViewerAt=base;
 bridge.socket={readyState:1,send:x=>messages.push(JSON.parse(x))};
 const snap=(phase,triggered,quoteAt=base)=>analystSnapshot({
  agentVersion:'13.4.67.22',state:'running',lastEvalMs:base,settings:{asset,engine:'automatic',forecastMode:'continuous',orderDurationMs:30000},
  lastResult:{asset,analysis:{operationalSignal:{side:'WAIT',state:'ANALISANDO'},
    vnext:{engineId:'automatic',expirySeconds:30,receipt:null,
     opportunityWindow:{phase,windowStartedAt:base,windowEndsAt:base+30000},
     futureEntryAnchor:{side:'CALL',asset,engineId:'automatic',delaySeconds:30,issuedAt:base,holdingSeconds:30,entryAt:base+14000,exitAt:base+44000,phase,entryTriggeredAt:triggered}}}}
 },{symbol:asset,validatedSymbol:asset,assetValidated:true,analysisFeedValidated:true,lastQuoteAt:quoteAt,quote:0.84345});
 assert.equal(bridge.publish(snap('open',0),{sourceEvent:true,urgent:true}),true);
 now+=80;
 assert.equal(bridge.publish(snap('fired',base+80),{sourceEvent:true,urgent:true}),true,'confirmed CALL must not wait the former 500ms gate');
 assert.equal(messages.length,2);
 const confirmed=messages[1].payload.payload.lastResult.analysis.vnext.ea;
 assert.equal(confirmed[1],'CALL');
 assert.equal(confirmed[10],base+80);
 assert.equal(messages[1].payload.payload.lastResult.analysis.vnext.ow[0],'fired');
 now+=70;
 assert.equal(bridge.publish(snap('fired',base+80,base+149),{sourceEvent:false,urgent:false}),false,'ordinary quotes still respect 1100ms pacing');
 bridge.close();
});

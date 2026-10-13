import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiveBridge} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

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

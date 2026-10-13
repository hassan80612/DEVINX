import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

const base=1800000000000;
const asset='EUR/USD OTC';
const make=(start,phase='scanning')=>analystSnapshot({
  state:'running',lastEvalMs:base,settings:{asset,engine:'automatic',orderDurationMs:30000},
  lastResult:{asset,analysis:{operationalSignal:{side:'WAIT',state:'ANALISANDO'},
    vnext:{engineId:'automatic',expirySeconds:30,
      opportunityWindow:{phase,windowStartedAt:start,windowEndsAt:start+30000,entryAt:null},
      futureEntryAnchor:null,receipt:null,cards:[]}}}
},{symbol:asset,validatedSymbol:asset,assetValidated:true,
  analysisFeedValidated:true,lastQuoteAt:base,quote:1.102});

test('same-phase PC window rollover is an urgent signed event without a new broker quote',()=>{
  let now=base;const messages=[];
  const bridge=new SignedLiveBridge('realtime:sentinel-'+'a'.repeat(48),'b'.repeat(64),{clock:()=>now});
  bridge.joined=true;bridge.verifiedViewerAt=base;
  bridge.socket={readyState:1,send:x=>messages.push(JSON.parse(x))};
  assert.equal(bridge.publish(make(base)),true);
  now+=600;
  assert.equal(bridge.publish(make(base+30000)),true);
  assert.equal(messages.length,2);
  assert.equal(messages[1].payload.payload.lastResult.analysis.vnext.ow[1],base+30000);
  assert.equal(messages[1].payload.payload.lastResult.analysis.vnext.ow[2],base+60000);
  bridge.close();
});

test('publisher marks new PC deadline urgent even if opportunity phase did not change',()=>{
  const worker=readFileSync('sentinel-trading-lab/agent/worker/index.mjs','utf8');
  assert.match(worker,/pcWindow\?\.windowStartedAt,pcWindow\?\.windowEndsAt/);
  const card=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
  // Newer 67.22 contract forbids extrapolating a second 30s PC window.
  assert.match(card,/pcAuthoritativeWindow\(/);
  assert.doesNotMatch(card,/windowEndsAt\+cycle\*period/);
  assert.match(card,/phase==='fired'/);
  assert.doesNotMatch(card,/readyNow=\{entryMoment\}/);
});
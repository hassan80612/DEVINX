import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewLastMileEvidence} from '../sentinel-trading-lab/agent/worker/last-mile-evidence-222.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';

const fired=(durationMs,side='PUT')=>({id:'verified-123',at:1234,side,durationMs});
const evidence=(durationMs,side='PUT',overrides={})=>({
 source:'now-structural-v1',signalAt:1234,finalSide:side,
 finalReason:'confirmed-fast-level-reversal',levelReaction:'rejection',
 levelExpiryProof:{confirmed:false,durationMs,reason:'medium-path-not-supporting'},...overrides});
for(const ms of [30000,60000,300000]){
 test('222: explicit same-tick failed reversal vetoes '+ms+'ms automatic click',()=>{
  assert.equal(reviewLastMileEvidence({signal:fired(ms),evidence:evidence(ms)}).allowed,false);
  assert.equal(reviewLastMileEvidence({signal:fired(ms,'CALL'),evidence:evidence(ms,'CALL')}).allowed,false);
 });
 test('222: other valid entry families and confirmed reversal preserved '+ms,()=>{
  assert.equal(reviewLastMileEvidence({signal:fired(ms),evidence:evidence(ms,'PUT',{levelReaction:'breakout',finalReason:'historical-level-breakout'})}).allowed,true);
  assert.equal(reviewLastMileEvidence({signal:fired(ms),evidence:evidence(ms,'PUT',{levelExpiryProof:{confirmed:true,durationMs:ms}})}).allowed,true);
  assert.equal(reviewLastMileEvidence({signal:fired(ms),evidence:null}).allowed,true);
  assert.equal(reviewLastMileEvidence({signal:fired(ms),evidence:evidence(ms,'PUT',{signalAt:1233})}).allowed,true);
  assert.equal(reviewLastMileEvidence({signal:fired(ms),evidence:evidence(60000,'PUT')}).allowed,ms!==60000);
 });
}
test('222: manual and independent broker execution unaffected',()=>{
 const s={...fired(60000),independent:true};
 assert.equal(reviewLastMileEvidence({signal:s,evidence:evidence(60000)}).allowed,true);
 assert.equal(reviewLastMileEvidence({signal:fired(60000),evidence:evidence(60000),mode:'call'}).allowed,true);
});

test('227: legacy 222 warning is advisory and never consumes a valid analyst signal',()=>{
 const anchor={context:'exnova|EURUSD|automatic|60000',engineId:'automatic',phase:'fired',
  entryTriggeredAt:1234,exitAt:61234,holdingSeconds:60,side:'PUT',entryPrice:1.13,entryFamily:'automatic'};
 const context={durationMs:60000,engine:'automatic',entryFamily:'automatic',
  analysis:{vnext:{futureEntryAnchor:anchor}}};
 const executor=new SignalExecutor({clock:()=>1235,context:()=>context,driver:{}});
 executor.enabled=true;
 executor.watch=()=>{};
 executor.session={accountId:null};
 executor.driver={send:async()=>{}};
 executor.onAuditEvent=null;
 const proof=evidence(60000,'PUT');
 executor.pulse(anchor,proof);
 const id=anchor.context+'|'+anchor.entryTriggeredAt;
 assert.ok(executor.seen.has(id),'valid signal reaches the normal executor path');
 assert.doesNotMatch(executor.message,/entrada descartada: confirmação de reversão contrária/);
 executor.pulse();
 assert.equal(executor.sequence,1,'ordinary backup never duplicates the same trade');
});

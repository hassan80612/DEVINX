import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const root=new URL('../sentinel-trading-lab/',import.meta.url);
const worker=readFileSync(new URL('agent/worker/index.mjs',root),'utf8');
const runtime=readFileSync(new URL('agent/src/core/runtime.mjs',root),'utf8');

test('234: no pending settlement avoids cloning the whole live quote history',()=>{
  const r=new DemoTradingRuntime();
  r.pending=[];
  r._marketSnapshot=()=>{throw Error('unnecessary live market copy')};
  assert.doesNotThrow(()=>r._settleDue(Date.now()));
  assert.doesNotThrow(()=>r._riskState(Date.now(),{quoteTs:Date.now()}));
});
test('234: live decision consumes one fixed snapshot in engine and risk without mutating quotes',()=>{
  assert.match(runtime,/const snap=this\.externalMarket\?market:this\._marketSnapshot\(\)/);
  assert.match(runtime,/state:this\._riskState\(now,snap\),balanceOverride:snap\.balance/);
  assert.match(runtime,/const feed=\{snapshot:\(\)=>snap\}/);
});
test('234: overlay, journal and maintenance leave the busy quote-decision lock',()=>{
  const click=worker.indexOf('  executor.pulse();',worker.indexOf('async function loop()'));
  const refresh=worker.indexOf('  schedulePostDecisionWork(tickStarted);',click);
  const release=worker.indexOf("finally{busy=false}",refresh);
  const maintenance=worker.indexOf('function runPostDecisionWork(tickStarted){',release);
  assert.ok(click>0&&refresh>click&&release>refresh&&maintenance>release);
  assert.match(worker,/setTimeout\(\(\)=>\{\s*postDecisionScheduled=false;/);
  assert.match(worker,/postDecisionScheduled=true/);
  assert.match(worker,/const livePublishTimer=setInterval\(\(\)=>\{void publishLiveFrame\(\)\},220\)/);
  const brokerQuote=worker.slice(worker.indexOf('driver.setMarketUpdateHandler?.('),worker.indexOf('async function ensureLocalCockpitBroker'));
  assert.match(brokerQuote,/realtimeQuotes\.request\(\)/);
  assert.doesNotMatch(brokerQuote,/void publishLiveFrame\(\)/,'mobile serialization must not precede decision');
});
test('234: admission telemetry is read-only and measures source quote age and final-block waiting',()=>{
  assert.match(runtime,/const blockedProposal=proposalReady&&eligible\.ready!==true/);
  assert.match(runtime,/status:blockedProposal\?'final-guard-blocked'/);
  assert.match(runtime,/waitingMs:blockedProposal\?Math\.max\(0,now-firstSeenAt\):0/);
  assert.match(worker,/admission:runtime\.entryLatencyEvidence\|\|null/);
  assert.match(worker,/Number\(fired\.entryTriggeredAt\)-Number\(fired\.sourceQuoteAt\)/);
});
test('234: original 1m no-duplicate windows, confirmation requirements and expiry remain in place',()=>{
  const q=1800000000000;
  const evidence={ready:true,side:'CALL',observedAt:q,entryPrice:1.1};
  const args={candidate:evidence,now:q,quoteAt:q,asset:'EURGBPOTC',provider:'exnova',engineId:'automatic',durationMs:60000};
  const issued=advanceNowOpportunity(args);
  assert.equal(issued.phase,'fired');
  assert.equal(issued.side,'CALL');
  assert.equal(issued.holdingSeconds,60);
  const during=advanceNowOpportunity({...args,previous:issued,now:q+1000,quoteAt:q+1000});
  assert.equal(during.phase,'fired');
  assert.equal(during.entryReadyNow,false,'no second signal during live expiry');
  const expiry=advanceNowOpportunity({...args,previous:issued,now:q+60000,quoteAt:q+59999});
  assert.equal(expiry.phase,'scanning','cannot reuse quote from before expiry');
  const late=advanceNowOpportunity({...args,previous:issued,now:q+60001,quoteAt:q+60001});
  assert.equal(late.phase,'scanning','old observedAt proof cannot be reused as confirmation');
  assert.match(runtime,/const entryQuoteFresh=quoteAgeMs>=0&&quoteAgeMs<=maxEntryQuoteAgeMs/);
  assert.match(runtime,/eligible=reviewH207UnifiedAdmission\(\{/);
  assert.match(runtime,/eligible=reviewLateImpulseEntry\(\{/);
  assert.match(runtime,/eligible=reviewStretchedContinuationEntry\(\{/);
  assert.match(runtime,/eligible=reviewOneMinuteRejectionProof\(\{/);
  assert.match(runtime,/eligible=reviewPreEntryRisk\(\{/);
  const native=readFileSync(new URL('agent/worker/broker-native-expiry-keeper.mjs',root),'utf8');
  assert.match(native,/defaultRollback=current===30000&&preferredMs!==30000/);
});

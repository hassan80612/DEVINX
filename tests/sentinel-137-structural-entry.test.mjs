import test from 'node:test';
import assert from 'node:assert/strict';
import {threeClosedCandleEvidence,guardOpeningCandidate,
  confirmedStructuralReversal,brokerDurationGuard} from
  '../sentinel-trading-lab/agent/src/core/structural-entry-guard-137.mjs';
import {evolveOpportunity} from
  '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';

const T=1800000000000,H=30000,asset='EUR/USD OTC';
const settings={asset,engine:'automatic',forecastMode:'continuous',orderDurationMs:H};
const trend=(side='PUT')=>{
 const dir=side==='PUT'?-1:1,arr=[];
 for(let s=30;s<120;s++)arr.push({ts:T+s*1000,receivedAt:T+s*1000,
  price:1.2+dir*.000012*(s-30)});
 return arr;
};
const candidate=(side,at=T+120000)=>({
 side,issuedAt:at,entryAt:at+15000,exitAt:at+45000,
 projectedEntryPrice:1.2,projectedExitPrice:side==='PUT'?1.19:1.21,
 delaySeconds:30,holdingSeconds:30
});

test('13.7 admits selected PUT on three COMPLETE bearish bars, not a forming candle',()=>{
 const q=trend(),now=T+120000,snap={quoteHistory:q,quoteTs:now-1000};
 const accepted=guardOpeningCandidate({candidate:candidate('PUT'),snap,settings,now});
 assert.equal(accepted.allowed,true);
 assert.equal(accepted.evidence.bars.length,3);
 assert.equal(accepted.evidence.side,'PUT');
 assert.equal(guardOpeningCandidate({candidate:candidate('CALL'),snap,settings,now}).allowed,false);
 // Violent current-candle tick must not rewrite already closed bars.
 q.push({ts:now+1000,price:1.23});
 assert.equal(threeClosedCandleEvidence({quoteHistory:q,now:now+1100,holdingSeconds:30}).side,'PUT');
});

test('three unavailable or sideways closed bars cannot issue a new entry',()=>{
 const incomplete=trend().filter(q=>q.ts>=T+90000);
 assert.equal(threeClosedCandleEvidence({quoteHistory:incomplete,now:T+120000}).ready,false);
 const flat=[];
 for(let s=30;s<120;s++)flat.push({ts:T+s*1000,price:1.2+(s%2)*.000001});
 const e=threeClosedCandleEvidence({quoteHistory:flat,now:T+120000});
 assert.equal(e.side,null);
});

test('verified 5s broker expiry cannot validate a 30s holding forecast',()=>{
 const now=T+120000;
 const snap={brokerExpirationKind:'selected-duration',
  brokerExpirationConfidence:.9,brokerExpirationDurationMs:5000,
  brokerExpirationUpdatedAt:now-1000};
 assert.equal(brokerDurationGuard({snap,settings,now}).allowed,false);
 assert.equal(brokerDurationGuard({snap:{...snap,brokerExpirationUpdatedAt:now-10000},
  settings,now}).allowed,true,'old screen timing is not verified');
 assert.equal(brokerDurationGuard({snap:{...snap,brokerExpirationKind:'fixed-clock'},
  settings,now}).allowed,true,'a fixed clock is not a 5s order duration');
});

test('two completed post-opening bullish bars break a locked PUT structurally',()=>{
 const openAt=T+120000,old=trend(),e=threeClosedCandleEvidence({quoteHistory:old,now:openAt});
 const step=old.at(-1).price,quotes=old.slice();
 for(let i=0;i<=12;i++)quotes.push({ts:openAt+i*1000,price:step+.00006*(i+1)});
 const window={phase:'open',side:'PUT',openedAt:openAt,windowStartedAt:openAt,
  windowEndsAt:openAt+30000,guardBaseline:{lastClose:e.lastClose}};
 const r=confirmedStructuralReversal({window,snap:{quoteTs:openAt+12000,quoteHistory:quotes},now:openAt+12000});
 assert.equal(r.invalidated,true,JSON.stringify(r));
 const cancelled=evolveOpportunity({previous:{...candidate('PUT',openAt),...window,context:
  'EUR/USD OTC|continuous|automatic|30000'},settings,now:openAt+12000,
  quoteAt:openAt+12000,invalidationReason:r.reason,
  confirmation:{side:'PUT',projectedEntryPrice:1.2,projectedExitPrice:1.1}});
 assert.equal(cancelled.phase,'cancelled');
 assert.equal(cancelled.entryReadyNow,false);
 assert.equal(evolveOpportunity({previous:cancelled,candidate:candidate('CALL',openAt+13000),
  settings,now:openAt+13000,quoteAt:openAt+13000}).phase,'cancelled');
});

test('small rebound or one candle alone does not cancel PUT',()=>{
 const openAt=T+120000,old=trend(),e=threeClosedCandleEvidence({quoteHistory:old,now:openAt});
 const step=old.at(-1).price,quotes=old.slice();
 for(let i=0;i<=12;i++)quotes.push({ts:openAt+i*1000,price:step+.0000001*(i+1)});
 const window={phase:'open',side:'PUT',openedAt:openAt,
  guardBaseline:{lastClose:e.lastClose}};
 const result=confirmedStructuralReversal({window,snap:{quoteTs:openAt+12000,quoteHistory:quotes},now:openAt+12000});
 assert.equal(result.invalidated,false);
});

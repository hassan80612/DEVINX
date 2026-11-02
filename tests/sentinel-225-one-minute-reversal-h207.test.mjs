import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewH207UnifiedAdmission} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {reviewStretchedContinuationEntry} from '../sentinel-trading-lab/agent/src/core/stretched-continuation-admission.mjs';

const at=1800000010000,spot=1.1006;
const ticks=[
 {ts:at-2000,price:1.1003,receivedAt:at-2000},
 {ts:at-1000,price:1.1005,receivedAt:at-1000},
 {ts:at,price:spot,receivedAt:at}
];
const candidate=(side='CALL')=>({
 ready:true,side,reason:'confirmed-level-structure-reversal',observedAt:at,entryPrice:spot,
 earlyTurnEvidence:{kind:'level-microstructure-first-turn',withoutThreeClosedBars:true},
 priceStructure:{confirmedReversal:{kind:'confirmed-level-structure-reversal',side,confirmedAt:at,
   level:{level:1.1001},microTurn:{observedAt:at,extreme:1.0995,firstBreak:1.1004,
    retest:1.1002}}}
});
const run=(c,ms=60000,updates={})=>reviewH207UnifiedAdmission({
 candidate:c,quoteHistory:ticks,quoteAt:at,now:at,price:spot,durationMs:ms,...updates
});
test('225: 1m allows independent same-quote and two-real-tick verified reversal, no new wait',()=>{
 const c=candidate(),copy=structuredClone(c),o=run(c);
 assert.strictEqual(o,c,'admission preserves original already-qualified object and entry time');
 assert.deepEqual(c,copy);
 assert.equal(o.observedAt,at);
 assert.equal(o.side,'CALL');
});
test('225: 30s H207 reversal veto stays exactly as before, 5m remains identity',()=>{
 const c=candidate(),o=run(c,30000);
 assert.equal(o.ready,false);
 assert.equal(o.entryRisk.kind,'h207-structural-reversal-excluded');
 assert.strictEqual(run(c,300000),c);
});
test('225: stale, unsupported, contradictory or unproven reversals are still blocked in 1m',()=>{
 const base=candidate();
 const mutated=[
 {...base,observedAt:at-1000},
 {...base,entryPrice:1.1005},
 {...base,priceStructure:{confirmedReversal:{...base.priceStructure.confirmedReversal,confirmedAt:at-2000}}},
 {...base,priceStructure:{confirmedReversal:{...base.priceStructure.confirmedReversal,side:'PUT'}}},
 {...base,priceStructure:{confirmedReversal:{...base.priceStructure.confirmedReversal,level:{level:null}}}},
 {...base,priceStructure:{confirmedReversal:{...base.priceStructure.confirmedReversal,microTurn:{...base.priceStructure.confirmedReversal.microTurn,observedAt:at-1000}}}},
 {...base,priceStructure:{}},
 ];
 for(const c of mutated){
  const o=run(c); assert.equal(o.ready,false,'should require independent, current evidence');
  assert.equal(o.entryRisk.kind,'h207-structural-reversal-excluded');
 }
 assert.equal(run(base,60000,{quoteHistory:[ticks[0],{...ticks[1],price:1.10062},ticks[2]]}).ready,false,'no oscillating noise');
 assert.equal(run(base,60000,{quoteHistory:[ticks[0],ticks[1],{...ticks[2],receivedAt:at+1000}]}).ready,false,'no future receipt');
 assert.equal(run(base,60000,{now:at+2300}).ready,false,'expired quote cannot authorize click');
 assert.equal(run(base,60000,{quoteHistory:[ticks[0],ticks[2]]}).ready,false,'single movement is not two');
});
test('225: PUT uses identical mirrored evidence',()=>{
 const v=candidate('PUT');
 v.entryPrice=spot;v.priceStructure.confirmedReversal.microTurn={
  observedAt:at,extreme:1.1013,firstBreak:1.1008,retest:1.1009
 };
 const descending=[
  {ts:at-2000,price:1.1009,receivedAt:at-2000},
  {ts:at-1000,price:1.1007,receivedAt:at-1000},
  {ts:at,price:spot,receivedAt:at}
 ];
 assert.strictEqual(run(v,60000,{quoteHistory:descending}),v);
});
test('225: H207 late 1m breakout contradiction still blocks; early breakout still allowed',()=>{
 const late=1800000040000,price=1.1006;
 const breakout={ready:true,side:'CALL',reason:'historical-level-breakout',
  observedAt:late,entryPrice:price};
 const tape=[{ts:late-60000,price:1.1008,receivedAt:late-60000},
  {ts:late-5000,price:1.1005,receivedAt:late-5000},
  {ts:late,price,receivedAt:late}];
 const blocked=reviewH207UnifiedAdmission({candidate:breakout,quoteHistory:tape,
  quoteAt:late,now:late,price,durationMs:60000});
 assert.equal(blocked.ready,false);
 assert.equal(blocked.entryRisk.kind,'h207-late-breakout-contradiction');
 assert.strictEqual(reviewH207UnifiedAdmission({candidate:breakout,quoteHistory:tape,
  quoteAt:late-30000,now:late-30000,price,durationMs:60000}),breakout);
});
test('225: do not modify separate stretched 1m continuation policy or 30s/5m admission',()=>{
 const ready={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
 assert.strictEqual(reviewH207UnifiedAdmission({candidate:ready,quoteHistory:ticks,
  quoteAt:at,now:at,price:spot,durationMs:60000}),ready);
 assert.strictEqual(reviewStretchedContinuationEntry({candidate:ready,quoteHistory:ticks,
  quoteAt:at,now:at,price:spot,durationMs:60000}),ready);
});

test('225: legacy weak pivot crossing remains blocked even with a same-tick higher low',()=>{
 const c=candidate();
 delete c.earlyTurnEvidence;
 c.priceStructure.confirmedReversal={
  kind:'confirmed-level-structure-reversal',side:'CALL',confirmedAt:at,
  level:{level:1.1001,confirmedPivots:1,independentRejections:0},
  pivotPrice:1.1004,turnPrice:1.1002
 };
 const o=run(c);
 assert.equal(o.ready,false);
 assert.equal(o.entryRisk.kind,'h207-structural-reversal-excluded');
});

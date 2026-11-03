import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewEarlyVerifiedTurn} from '../sentinel-trading-lab/agent/src/core/early-reversal-transition.mjs';
import {reviewFirstImpulseReversal} from '../sentinel-trading-lab/agent/src/core/impulse-lifecycle-227.mjs';
import {reviewH207UnifiedAdmission} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {verifiedFirstQuoteTurnAtLevel} from '../sentinel-trading-lab/agent/src/core/shared-pivot-guard.mjs';

const AT=1800000000000,PEAK=1.14235,TOL=.00012;
const prices=[1.14200,1.14205,1.14210,1.14215,1.14220,1.14225,1.14230,PEAK,
 PEAK-.00006,PEAK-.00008,PEAK-.00004,PEAK-.000095,PEAK-.00013,PEAK-.00017];
const quotes=prices.map((price,i)=>({
 ts:AT-(prices.length-1-i)*1000,receivedAt:AT-(prices.length-1-i)*1000,price
}));
const spot=prices.at(-1),oldTrend='CALL',earlyTurn='PUT';
const z=(offset=0)=>({
 low:PEAK+offset-.00004,high:PEAK+offset+.00004,level:PEAK+offset,
 supportPivots:0,supportRejections:0,resistancePivots:1,resistanceRejections:1,
 confirmedPivots:1,independentRejections:1,independentTests:2,
 tests:[{age:22},{age:15}]
});
const map=levels=>({observedCandles:70,asOf:AT-60000,tolerance:TOL,levels});
const candidate={ready:true,side:oldTrend,reason:'closed-structure-and-live-impulse',
 observedAt:AT,entryPrice:spot};
const args={candidate,quoteHistory:quotes,quoteAt:AT,now:AT,price:spot,durationMs:60000};

test('236: recognizer returns PUT before green candle changes color, with a single verified resistance',()=>{
 assert.ok(spot>prices[0],'observed 1m leg still net upward');
 const result=reviewFirstImpulseReversal({...args,map:map([z()]),candles:[]});
 assert.equal(result.ready,true);
 assert.equal(result.side,earlyTurn);
 assert.equal(result.reason,'confirmed-level-structure-reversal');
 assert.equal(result.priceStructure?.confirmedReversal?.microTurn?.extremeAt,AT-6000);
});

// Regression: one genuine early PUT can be supported by several old resistance
// zones. This test invokes the recognizer, not a fabricated confirmed signal.
test('236: two independent nearby resistances confirming PUT are NOT conflicting directions',()=>{
 const selected=reviewFirstImpulseReversal({...args,map:map([z(),z(.000018)]),candles:[]});
 assert.equal(selected.ready,true);
 assert.equal(selected.side,'PUT');
 assert.equal(selected.reason,'confirmed-level-structure-reversal');
 assert.equal(verifiedFirstQuoteTurnAtLevel({
  reversalEvidence:selected.priceStructure.confirmedReversal,
  quoteHistory:quotes,quoteAt:AT,now:AT,price:spot,side:'PUT',durationMs:60000
 }),true);
 assert.equal(reviewH207UnifiedAdmission({candidate:selected,quoteHistory:quotes,
  quoteAt:AT,now:AT,price:spot,durationMs:60000,allowVerifiedEarlyReversal:true}).ready,true);
});

test('236: early retest recognizer preserves both corroborating same-side historical levels',()=>{
 const single=reviewEarlyVerifiedTurn({...args,map:map([z()])});
 const multi=reviewEarlyVerifiedTurn({...args,map:map([z(),z(.000018)])});
 for(const r of [single,multi]){
  assert.equal(r.ready,true);
  assert.equal(r.side,'PUT');
  assert.equal(r.reason,'confirmed-level-structure-reversal');
  assert.equal(r.priceStructure.confirmedReversal.microTurn.extremeAt,AT-6000);
 }
});

test('236: a weak level and one contrary tick cannot manufacture PUT',()=>{
 const unsupported=z();unsupported.resistancePivots=0;unsupported.resistanceRejections=0;
 for(const fn of [reviewEarlyVerifiedTurn,reviewFirstImpulseReversal]){
  const weak=fn({...args,map:map([unsupported]),candles:[]});
  assert.equal(weak.side,'CALL','unproven resistance cannot change the existing direction');
  const noTurn=quotes.map(x=>({...x}));
  noTurn[noTurn.length-2].price=noTurn.at(-3).price;
  const last=noTurn.at(-1);last.price=noTurn.at(-2).price-.00001;
  const stale=fn({...args,quoteHistory:noTurn,price:last.price,map:map([z()]),candles:[]});
  assert.notEqual(stale.side,'PUT','no two current confirming ticks');
 }
});

test('236: strict expiry and previous final admission guards remain untouched',()=>{
 const root=new URL('../sentinel-trading-lab/agent/',import.meta.url);
 const keeper=readFileSync(new URL('worker/broker-native-expiry-keeper.mjs',root),'utf8');
 const runtime=readFileSync(new URL('src/core/runtime.mjs',root),'utf8');
 assert.match(keeper,/defaultRollback=current===30000&&preferredMs!==30000/);
 assert.match(runtime,/eligible=reviewPreEntryRisk\(/);
 assert.match(runtime,/eligible=reviewH207UnifiedAdmission\(/);
 assert.match(runtime,/eligible=reviewOneMinuteRejectionProof\(/);
 assert.match(runtime,/eligible=reviewStretchedContinuationEntry\(/);
});

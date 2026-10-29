import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lateUnverifiedFloorImpulseRisk,reviewDirectionalPersistence,fiveMinuteReversalOnly}
 from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {reviewEntryPrice} from '../sentinel-trading-lab/agent/src/core/entry-price-timing.mjs';
const T=1800000000000;

// A 90-second received-only downtrend ends by printing a fresh low. The
// recent low alone cannot verify the future 60s continuation. No order data
// or after-entry quote is used in this fixture.
function freshFloor(){
 const quoteHistory=Array.from({length:91},(_,i)=>({
  ts:T-90000+i*1000,
  price:i<=80?101-i*.01:100.2-(i-80)*.035
 }));
 const price=quoteHistory.at(-1).price;
 return {quoteHistory,quoteAt:T,now:T,price,durationMs:60000};
}
function candidate(a,reason='closed-structure-and-live-impulse',side='PUT',extra={}){
 return {ready:true,side,reason,observedAt:a.quoteAt,entryPrice:a.price,...extra};
}
test('60s: a newly printed floor without independent follow-through is not a verified continuation',()=>{
 const a=freshFloor(),c=candidate(a),risk=lateUnverifiedFloorImpulseRisk({...a,candidate:c});
 assert.equal(risk?.kind,'unverified-late-put-near-recent-floor');
 assert.ok(risk.position<=.20);
 assert.equal(risk.rangeSeconds,90);
 // Does not invert side into CALL; no synthetic reversal is manufactured.
 assert.equal(c.side,'PUT');
});
test('60s: a real break/retest with fresh independent confirmation remains eligible',()=>{
 const a=freshFloor(),c=candidate(a,'closed-structure-and-live-impulse','PUT',{
  priceStructure:{observedSequence:{continuation:{kind:'break-retest-continuation',
   side:'PUT',confirmedAt:a.quoteAt-1000}}}
 });
 assert.equal(lateUnverifiedFloorImpulseRisk({...a,candidate:c}),null);
 assert.equal(reviewEntryPrice({...a,candidate:c}).side,'PUT');
});
test('60s: independent breakpoint and reversal families retain the previous behavior',()=>{
 const a=freshFloor();
 for(const reason of ['historical-level-breakout','break-retest-continuation',
  'confirmed-fast-level-reversal','closed-range-extreme-reversal-confirmed']){
  assert.equal(lateUnverifiedFloorImpulseRisk({...a,candidate:candidate(a,reason)}),null,reason);
 }
 for(const proof of [null,{kind:'break-retest-continuation',side:'PUT',confirmedAt:T+1},
  {kind:'break-retest-continuation',side:'PUT',confirmedAt:T-8000}]){
  const c=candidate(a,'closed-structure-and-live-impulse','PUT',{
   priceStructure:{observedSequence:{continuation:proof}}
  });
  assert.equal(lateUnverifiedFloorImpulseRisk({...a,candidate:c})?.kind,
   'unverified-late-put-near-recent-floor');
 }
});
test('a valid continuation with room above a prior floor and 30s/5m are untouched',()=>{
 const a=freshFloor();
 const bounced={...a,quoteHistory:a.quoteHistory.map(q=>({...q}))};
 bounced.quoteHistory.at(-1).price=100.6;
 bounced.price=100.6;
 assert.equal(lateUnverifiedFloorImpulseRisk({...bounced,candidate:candidate(bounced)}),null);
 assert.equal(lateUnverifiedFloorImpulseRisk({...a,durationMs:30000,candidate:candidate(a)}),null);
 assert.equal(lateUnverifiedFloorImpulseRisk({...a,durationMs:300000,candidate:candidate(a)}),null);
 assert.equal(lateUnverifiedFloorImpulseRisk({...a,candidate:candidate(a,'closed-structure-and-live-impulse','CALL')}),null);
 // The same pure entry decision still has no persistent waiting or re-arming.
 const c=candidate(a,'confirmed-fast-level-reversal');
 assert.equal(reviewDirectionalPersistence({...a,candidate:c}).ready,true);
 assert.equal(fiveMinuteReversalOnly({...a,durationMs:300000,candidate:c}).ready,false);
});
test('1m quote admissibility never outlives the existing 1450ms market safeguards',()=>{
 const raw=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(raw,/Number\(settings\.orderDurationMs\)<=30000\?1450:\s*Number\(settings\.orderDurationMs\)<=60000\?1450:2500/);
 assert.doesNotMatch(raw,/Number\(settings\.orderDurationMs\)<=60000\?1950/);
});

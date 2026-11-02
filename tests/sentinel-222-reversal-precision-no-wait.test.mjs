import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPreEntryRisk} from '../sentinel-trading-lab/agent/src/core/pre-entry-risk-review.mjs';

for(const durationMs of [30000,60000]){
 const at=1780000500000,price=1.07321;
 const context={quoteAt:at,now:at+100,price,durationMs,quoteHistory:[],candles:[]};
 test('reversals '+durationMs+': pre-entry check never mutates a decision in place',()=>{
  const candidate={ready:true,side:'PUT',reason:'confirmed-fast-level-reversal',regime:'directional',
   observedAt:at,entryPrice:price};
  const before=structuredClone(candidate);
  const reviewed=reviewPreEntryRisk({...context,candidate});
  assert.deepEqual(candidate,before);
  assert.equal(candidate.reason,'confirmed-fast-level-reversal');
  assert.equal(reviewed.reason,'confirmed-fast-level-reversal');
  assert.equal(reviewed.ready,true);
 });
 test('reversals '+durationMs+': independent present-price turn may proceed without waiting for more candles',()=>{
  const candidate={ready:true,side:'PUT',reason:'closed-range-extreme-reversal-confirmed',
   regime:'observed-range-turn',observedAt:at,entryPrice:price,
   priceStructure:{confirmedReversal:{side:'PUT',confirmedAt:at},
    reactionProof:{confirmed:true,side:'PUT',durationMs}}};
  const reviewed=reviewPreEntryRisk({...context,candidate});
  assert.equal(reviewed,candidate,'already-confirmed turn is not delayed by retrospective range label');
 });
 test('reversals '+durationMs+': weak or wrong-horizon turns remain filtered',()=>{
  for(const proof of [{confirmed:false,side:'PUT',durationMs},
   {confirmed:true,side:'PUT',durationMs:300000}]){
   const candidate={ready:true,side:'PUT',reason:'closed-range-extreme-reversal-confirmed',
    regime:'observed-range-turn',observedAt:at,entryPrice:price,
    priceStructure:{confirmedReversal:{side:'PUT',confirmedAt:at},reactionProof:proof}};
   const reviewed=reviewPreEntryRisk({...context,candidate});
   assert.equal(reviewed.ready,false);
   assert.equal(reviewed.side,null);
   assert.equal(candidate.ready,true,'candidate itself must never be overwritten');
  }
 });
}
test('5m: no revision to reversal admission or execution behavior',()=>{
 const candidate={ready:true,side:'CALL',reason:'closed-range-extreme-reversal-confirmed',
  regime:'observed-range-turn',observedAt:1234,entryPrice:1.2};
 assert.equal(reviewPreEntryRisk({candidate,quoteAt:1234,now:1240,price:1.2,durationMs:300000}),candidate);
});

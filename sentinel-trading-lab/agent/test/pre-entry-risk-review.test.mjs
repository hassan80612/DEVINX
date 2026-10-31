import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPreEntryRisk} from '../src/core/pre-entry-risk-review.mjs';

const at=1800000000000,price=1.2345;
function candidate(reason,extra={}){
 return {ready:true,side:'CALL',reason,observedAt:at,entryPrice:price,...extra};
}
function review(candidate,durationMs=60000,original=null){
 return reviewPreEntryRisk({candidate,original,durationMs,quoteAt:at,now:at,price,
  quoteHistory:[{ts:at,receivedAt:at,price}]});
}

test('60s observed-range turns are declined at final admission',()=>{
 const result=review(candidate('closed-range-extreme-reversal-confirmed',{
  regime:'observed-range-turn'
 }));
 assert.equal(result.ready,false);
 assert.equal(result.side,null);
 assert.equal(result.provisionalSide,'CALL');
 assert.equal(result.entryRisk.reasons[0],'one-minute-observed-range-turn');
});

test('60s confirmed historical-level rejection proof is declined',()=>{
 const result=review(candidate('historical-level-rejection',{
  priceStructure:{reactionProof:{confirmed:true,kind:'sustained-level-reversal',side:'CALL',durationMs:60000}}
 }));
 assert.equal(result.ready,false);
 assert.equal(result.side,null);
 assert.equal(result.entryRisk.reasons[0],'one-minute-confirmed-level-rejection');
});

test('structural reversals and failed breakouts remain admitted, including a matching proof',()=>{
 for(const reason of ['confirmed-level-structure-reversal','failed-breakout-structure-change']){
  const original=candidate(reason,{priceStructure:{reactionProof:{
   confirmed:true,kind:'sustained-level-reversal',side:'CALL',durationMs:60000
  }}});
  const result=review({...original},60000,original);
  assert.equal(result.ready,true,reason);
  assert.equal(result.side,'CALL',reason);
 }
});

test('30s and 5m expiry candidates are returned untouched',()=>{
 const range=candidate('closed-range-extreme-reversal-confirmed',{regime:'observed-range-turn'});
 const rejection=candidate('historical-level-rejection',{
  priceStructure:{reactionProof:{confirmed:true,kind:'sustained-level-reversal',side:'CALL',durationMs:60000}}
 });
 for(const durationMs of [30000,300000]){
  assert.equal(review(range,durationMs),range);
  assert.equal(review(rejection,durationMs),rejection);
 }
});

test('same 60s family without an exact confirmed expiry proof is preserved',()=>{
 const item=candidate('historical-level-rejection',{
  priceStructure:{reactionProof:{confirmed:true,kind:'sustained-level-reversal',side:'CALL',durationMs:300000}}
 });
 assert.equal(review(item),item);
});

test('stale or opposite-side proof does not veto the current rejection',()=>{
 const item=candidate('historical-level-rejection',{
  priceStructure:{reactionProof:{confirmed:true,kind:'sustained-level-reversal',side:'PUT',durationMs:60000}}
 });
 assert.equal(review(item),item);
});

test('a matching original signal can supply the exact expiry proof',()=>{
 const original=candidate('historical-level-rejection',{
  priceStructure:{reactionProof:{confirmed:true,kind:'sustained-level-reversal',side:'CALL',durationMs:60000}}
 });
 const finalCandidate={...original,priceStructure:null};
 const result=review(finalCandidate,60000,original);
 assert.equal(result.ready,false);
 assert.equal(result.entryRisk.reasons[0],'one-minute-confirmed-level-rejection');
});

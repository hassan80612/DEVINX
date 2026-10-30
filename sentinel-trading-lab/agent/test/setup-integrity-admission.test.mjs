import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewSetupIntegrity} from '../src/core/setup-integrity-admission.mjs';
const at=1800000000000;
function tape(side='CALL'){
  // 33s of already-received quotes, a short drift followed by a terminal leg.
  const s=side==='CALL'?1:-1;
  return Array.from({length:34},(_,i)=>{
    const distance=i<=13?i/13*.00003:i<=28?.00003+(i-13)/15*.00013:.00016+(i-28)/5*.00009;
    return {ts:at-(33-i)*1000,price:1+s*distance,receivedAt:at-(33-i)*1000};
  });
}
function candidate(side,reason){return {ready:true,side,reason,entryPrice:tape(side).at(-1).price,
 observedAt:at,priceStructure:{reaction:{kind:reason==='historical-level-rejection'?'rejection':'breakout',side}}};}
function check(side,reason,horizon=60000,history=tape(side),now=at){
  const c=candidate(side,reason);c.entryPrice=history.at(-1)?.price;
  return reviewSetupIntegrity({candidate:c,quoteHistory:history,quoteAt:at,now,price:c.entryPrice,durationMs:horizon});
}
test('terminal historical resistance rejection is declined without suggesting CALL',()=>{
 const c=check('PUT','historical-level-rejection');
 assert.equal(c.ready,false);assert.equal(c.side,null);
 assert.equal(c.provisionalSide,'PUT');assert.equal(c.reason,'historical-rejection-entry-after-extreme');
});
test('late historical breakout is declined, not inverted',()=>{
 const c=check('CALL','historical-level-breakout');
 assert.equal(c.ready,false);assert.equal(c.side,null);
 assert.equal(c.reason,'historical-breakout-late-range-extension');
});
test('established structural continuations and other reversals are unchanged',()=>{
 for(const reason of ['closed-structure-and-live-impulse','failed-breakout-structure-change']){
  const c=check('CALL',reason);assert.equal(c.ready,true);assert.equal(c.side,'CALL');
 }
});
test('5m logic, stale quotes and incomplete tapes are untouched',()=>{
 assert.equal(check('CALL','historical-level-breakout',300000).ready,true);
 assert.equal(check('CALL','historical-level-breakout',60000,tape('CALL'),at+3000).ready,true);
 assert.equal(check('CALL','historical-level-breakout',60000,tape('CALL').slice(-8)).ready,true);
});

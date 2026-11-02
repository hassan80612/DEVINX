import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewH207UnifiedAdmission} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const at=1800000010000,price=1.1006;
const tape=[{ts:at-2000,price:1.1003,receivedAt:at-2000},
 {ts:at-1000,price:1.1005,receivedAt:at-1000},{ts:at,price,receivedAt:at}];
const c=(side='CALL')=>({ready:true,side,reason:'confirmed-level-structure-reversal',
 observedAt:at,entryPrice:price,
 earlyTurnEvidence:{kind:'level-microstructure-first-turn',withoutThreeClosedBars:true},
 priceStructure:{confirmedReversal:{kind:'confirmed-level-structure-reversal',side,confirmedAt:at,
 level:{level:1.1001},microTurn:{observedAt:at,extreme:1.0995,firstBreak:1.1004,retest:1.1002}}}});
const review=(candidate,durationMs=60000)=>reviewH207UnifiedAdmission({candidate,quoteHistory:tape,quoteAt:at,now:at,price,durationMs});
test('225: preserve 224 runtime exactly, including timing, order admission, all H207 rules',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url));
 const sha=createHash('sha1').update('blob '+source.length+String.fromCharCode(0)).update(source).digest('hex');
 assert.equal(sha,'1f4a453b3c5609a50dd0c7b36687e0ae26fc2d8d');
});
test('225: 1m and 30s structural reversals still follow existing H207 exclusion, no new early clicks',()=>{
 for(const ms of [30000,60000])for(const side of ['CALL','PUT']){
  const source=c(side),out=review(source,ms);
  assert.equal(out.ready,false);assert.equal(out.side,null);
  assert.equal(out.entryRisk?.kind,'h207-structural-reversal-excluded');
  assert.equal(source.ready,true,'must not mutate analysis');
 }
});
test('225: 5m and unrelated approved signals stay exactly as before',()=>{
 const structural=c();
 assert.strictEqual(review(structural,300000),structural);
 for(const ms of [30000,60000,300000]){
  const other={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
  assert.strictEqual(review(other,ms),other);
 }
});

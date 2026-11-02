import test from 'node:test';
import assert from 'node:assert/strict';
import {POLICY,reviewPreEntryRisk,evaluatePreEntryRisk}
 from '../sentinel-trading-lab/agent/src/core/pre-entry-risk-review.mjs';

const quoteAt=1_800_000_300_000,price=1.075;
const offer=(durationMs,reason='closed-range-extreme-reversal-confirmed',overrides={})=>({
 ready:true,side:'PUT',reason,regime:'observed-range-turn',
 observedAt:quoteAt,entryPrice:price,...overrides
});
const input=durationMs=>({quoteAt,now:quoteAt+100,price,durationMs,
 quoteHistory:[{ts:quoteAt,receivedAt:quoteAt,price}],candles:[]});
test('short 30s and 1m share the same bounded risk review, 5m remains untouched',()=>{
 assert.deepEqual(POLICY.scopeMs,[30000,60000]);
 for(const durationMs of [30000,60000]){
  const candidate=offer(durationMs);
  const rejected=reviewPreEntryRisk({candidate,...input(durationMs)});
  assert.equal(rejected.ready,false);
  assert.equal(rejected.side,null);
  assert.equal(rejected.entryRisk.blocked,true);
  assert.equal(rejected.entryRisk.details.durationMs,durationMs);
 }
 const five=offer(300000);
 assert.equal(reviewPreEntryRisk({candidate:five,...input(300000)}),five);
});
test('30s and 1m reject horizon-matched historically weak level rejection only',()=>{
 for(const durationMs of [30000,60000]){
  const candidate=offer(durationMs,'historical-level-rejection',{
   regime:'directional',
   priceStructure:{reactionProof:{confirmed:true,kind:'sustained-level-reversal',
    side:'PUT',durationMs}}
  });
  const blocked=reviewPreEntryRisk({candidate,...input(durationMs)});
  assert.equal(blocked.ready,false);
  const wrongProof={...candidate,
   priceStructure:{reactionProof:{...candidate.priceStructure.reactionProof,durationMs:300000}}};
  assert.equal(reviewPreEntryRisk({candidate:wrongProof,...input(durationMs)}),wrongProof);
 }
});
test('neither duration waits for future quotes, changes side, or blocks unrelated confirmed setup',()=>{
 for(const durationMs of [30000,60000]){
  const candidate=offer(durationMs,'failed-breakout-structure-change',{regime:'directional'});
  const next=reviewPreEntryRisk({candidate,...input(durationMs)});
  assert.equal(next,candidate);
  assert.equal(next.side,'PUT');
  const wrongTimestamp=offer(durationMs,'closed-range-extreme-reversal-confirmed',{observedAt:quoteAt-1000});
  assert.equal(reviewPreEntryRisk({candidate:wrongTimestamp,...input(durationMs)}),wrongTimestamp);
 }
});
test('review with stale quote cannot fabricate a 30s risk rejection',()=>{
 const x=input(30000);
 assert.equal(evaluatePreEntryRisk({...x,side:'CALL',reason:'historical-level-breakout',now:quoteAt+5000}).blocked,false);
});

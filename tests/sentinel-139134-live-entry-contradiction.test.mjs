import test from 'node:test';
import assert from 'node:assert/strict';
import {liveEntryContradiction as check} from '../sentinel-trading-lab/agent/src/core/live-entry-contradiction.mjs';
import {lateUnverifiedFloorImpulseRisk} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1800000000000;
const run=(values,side,reason)=>{
 const quoteHistory=values.map((price,i)=>({price,ts:T-8000+i*1000,receivedAt:T-8000+i*1000}));
 return check({candidate:{ready:true,side,reason,observedAt:T,entryPrice:values.at(-1)},
 quoteHistory,quoteAt:T,now:T,price:values.at(-1)});
};
test('continuation that turns back materially is not blindly followed',()=>{
 assert.equal(run([100,101,102,103,104,105,104,103,102],'CALL','closed-structure-and-live-impulse')?.kind,'live-continuation-turned-back');
 assert.equal(run([105,104,103,102,101,100,101,102,103],'PUT','break-retest-continuation')?.kind,'live-continuation-turned-back');
});
test('a reversal that visibly resumes old trend is not blindly followed',()=>{
 assert.equal(run([100,101,102,103,104,105,106,107,108],'PUT','historical-level-rejection')?.kind,'live-reversal-not-holding');
 assert.equal(run([108,107,106,105,104,103,102,101,100],'CALL','closed-range-extreme-reversal-confirmed')?.kind,'live-reversal-not-holding');
});
test('legitimate early continuations and actual turns are retained',()=>{
 assert.equal(run([100,101,102,103,104,105,106,107,108],'CALL','historical-level-breakout'),null);
 assert.equal(run([100,102,104,106,108,106,104,102,100],'PUT','historical-level-rejection'),null);
});
test('stale observations cannot manufacture an opposing verdict',()=>{
 assert.equal(check({candidate:{ready:true,side:'CALL',reason:'breakout',observedAt:T-200,entryPrice:102},
 quoteAt:T,now:T,price:102,quoteHistory:[]}),null);
});

test('completed downward impulse near a prior floor is not blindly chased with PUT',()=>{
 const rows=Array.from({length:91},(_,i)=>({ts:T-90000+i*1000,
  receivedAt:T-90000+i*1000,price:1.005-i*.00005}));
 const spot=rows.at(-1).price;
 const entry={ready:true,side:'PUT',reason:'closed-structure-and-live-impulse',
  observedAt:T,entryPrice:spot,expirySeconds:60};
 const params={candidate:entry,quoteHistory:rows,quoteAt:T,now:T,price:spot};
 assert.equal(lateUnverifiedFloorImpulseRisk(params)?.kind,'unverified-late-put-near-recent-floor');
 assert.equal(lateUnverifiedFloorImpulseRisk({...params,candidate:{...entry,side:'CALL'}}),null);
 assert.equal(lateUnverifiedFloorImpulseRisk({...params,candidate:{...entry,expirySeconds:5}}),null);
 assert.equal(lateUnverifiedFloorImpulseRisk({...params,candidate:{...entry,reason:'historical-level-breakout'}}),null);
 assert.equal(lateUnverifiedFloorImpulseRisk({...params,candidate:{...entry,reason:'closed-range-extreme-reversal-confirmed'}}),null);
});
test('a genuine newly established low remains eligible for independent breakout evidence',()=>{
 const rows=Array.from({length:91},(_,i)=>({ts:T-90000+i*1000,
  receivedAt:T-90000+i*1000,price:i<85?1.005-(i*.000005):1.00458-(i-84)*.0001}));
 const spot=rows.at(-1).price;
 assert.equal(lateUnverifiedFloorImpulseRisk({candidate:{ready:true,side:'PUT',
  reason:'closed-structure-and-live-impulse',observedAt:T,entryPrice:spot,expirySeconds:60},
  quoteHistory:rows,quoteAt:T,now:T,price:spot}),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {liveEntryContradiction as check} from '../sentinel-trading-lab/agent/src/core/live-entry-contradiction.mjs';
import {lateUnverifiedFloorImpulseRisk,reviewChangedOpportunitySide} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
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

test('60s shared decision refuses late-floor PUT across trend and level labels, leaving 30s unmodified',()=>{
 const rows=Array.from({length:91},(_,i)=>({ts:T-90000+i*1000,
  receivedAt:T-90000+i*1000,price:1.005-i*.00005}));
 const spot=rows.at(-1).price;
 for(const durationMs of [30000,60000]){
  for(const reason of ['closed-structure-and-live-impulse','historical-level-rejection',
    'confirmed-level-structure-reversal','failed-breakout-structure-change',
    'break-retest-continuation']){
   const candidate={ready:true,side:'PUT',reason,observedAt:T,entryPrice:spot,
    expirySeconds:durationMs/1000};
   const params={candidate,quoteHistory:rows,quoteAt:T,now:T,price:spot,durationMs};
   const risk=lateUnverifiedFloorImpulseRisk(params);
   assert.equal(risk?.kind, durationMs===60000?
    'unverified-late-put-near-recent-floor':undefined,reason);
   if(durationMs===60000){
    const revised=reviewChangedOpportunitySide({...params,previousSide:'CALL'});
    assert.equal(revised.ready,false,'final side must not bypass extreme context: '+reason);
    assert.equal(revised.side,null);
   }
  }
 }
});
test('same current range does not turn every floor touch into an opposite CALL',()=>{
 const rows=Array.from({length:91},(_,i)=>({ts:T-90000+i*1000,
  receivedAt:T-90000+i*1000,price:1.005-i*.00005}));
 const spot=rows.at(-1).price;
 const candidate={ready:true,side:'CALL',reason:'confirmed-level-structure-reversal',
  observedAt:T,entryPrice:spot,expirySeconds:60};
 assert.equal(lateUnverifiedFloorImpulseRisk({candidate,quoteHistory:rows,quoteAt:T,
  now:T,price:spot}),null);
});
test('missing data or future receipts do not manufacture a floor veto',()=>{
 const rows=Array.from({length:91},(_,i)=>({ts:T-90000+i*1000,
  receivedAt:T-90000+i*1000,price:1.005-i*.00005}));
 const spot=rows.at(-1).price;
 const candidate={ready:true,side:'PUT',reason:'historical-level-rejection',
  observedAt:T,entryPrice:spot,expirySeconds:60};
 const p={candidate,quoteHistory:rows,quoteAt:T,now:T,price:spot};
 assert.equal(lateUnverifiedFloorImpulseRisk({...p,quoteHistory:rows.slice(0,30)}),null);
 assert.equal(lateUnverifiedFloorImpulseRisk({...p,quoteHistory:rows.map((r,i)=>i>80?{...r,receivedAt:T+2000}:r)}),null);
 assert.equal(lateUnverifiedFloorImpulseRisk({...p,quoteHistory:rows.filter(r=>r.ts<T-20000||r.ts>T-13000)}),null);
});

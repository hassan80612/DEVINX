import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyRejectionExpiry as qualify} from '../experiments/rejection-expiry-agreement-20261018.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1792250040000;
for(const side of ['CALL','PUT']){
 const opposite=side==='CALL'?'PUT':'CALL';
 for(const reason of ['historical-level-rejection','multiscale-candle-rejection']){
  const candidate={ready:true,side,reason,observedAt:T,entryPrice:100};
  test(`${reason} ${side}: independent ready agreement preserves the exact candidate`,()=>{
   assert.equal(qualify({candidate,original:{ready:true,side},decision:{ready:true,side}}),candidate);
   assert.equal(qualify({candidate,original:{ready:true,side},decision:{ready:false,side:null}}),candidate);
  });
  test(`${reason} ${side}: disagreement/unavailable expiry evidence cannot release a micro-reaction`,()=>{
   for(const [original,decision] of [[{ready:true,side:opposite},{ready:true,side}],
    [{ready:false,side:null},{ready:true,side}],[{ready:true,side},{ready:true,side:opposite}]]){
    const q=qualify({candidate,original,decision});assert.equal(q.ready,false);assert.equal(q.side,null);
    assert.equal(q.provisionalSide,side);assert.equal(candidate.side,side);assert.equal(candidate.ready,true);
   }
   assert.equal(qualify({candidate,original:{ready:true,side},decision:{ready:true,side},mode:'sequence-only'}).ready,false);
  });
 }
}
test('structural reversal/retest/clear-room and other routes are not altered',()=>{
 for(const reason of ['failed-breakout-structure-change','break-retest-continuation','rejection-followthrough-clear-room',
  'historical-level-breakout','closed-structure-and-live-impulse','causal-expiry-analogue',
  'observed-trend-and-30s-cycle-projection']){
  const candidate={ready:true,side:'CALL',reason};
  for(const mode of ['expiry-agreement','sequence-only'])assert.equal(qualify({candidate,mode}),candidate);
 }
});
test('other durations and already-unready candidates retain their identity',()=>{
 const candidate={ready:true,side:'CALL',reason:'historical-level-rejection'};
 for(const durationMs of [5000,10000,15000,20000,60000])assert.equal(qualify({candidate,durationMs}),candidate);
 const waiting={...candidate,ready:false,side:null};assert.equal(qualify({candidate:waiting}),waiting);
});
test('a conflict during an issued signal cannot reverse or shorten the immutable window',()=>{
 const candidate={ready:true,side:'CALL',reason:'historical-level-rejection',entryPrice:100,observedAt:T};
 const admitted=qualify({candidate,original:{ready:true,side:'CALL'},decision:{ready:true,side:'CALL'}});
 const first=advanceNowOpportunity({candidate:admitted,now:T,quoteAt:T,durationMs:30000});
 const conflict=qualify({candidate:{...candidate,side:'PUT',entryPrice:101,observedAt:T+10000},
  original:{ready:true,side:'CALL'},decision:{ready:true,side:'PUT'}});
 const held=advanceNowOpportunity({previous:first,candidate:conflict,now:T+10000,quoteAt:T+10000,durationMs:30000});
 assert.equal(held.side,'CALL');assert.equal(held.entryPrice,100);
 assert.equal(held.exitAt,T+30000);assert.equal(held.entryAt,T);
});

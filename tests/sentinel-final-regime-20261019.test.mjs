import {test} from 'node:test';import assert from 'node:assert/strict';
import {observedRegime,finalRegimeArbiter} from '../experiments/final-regime-arbiter-20261019.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1792380000000;
const history=()=>Array.from({length:91},(_,i)=>({ts:T-(90-i)*1000,price:1+i*.00001,receivedAt:T-(90-i)*1000}));
const decide=(extra={})=>finalRegimeArbiter({candidate:{ready:true,side:'CALL',reason:'observed-trend-and-30s-cycle-projection'},projection:{ready:true,side:'CALL'},quoteHistory:history(),now:T,quoteAt:T,...extra});
test('final authority admits an aligned trend and vetoes a contradictory projection',()=>{
 assert.equal(decide().ready,true);const blocked=decide({projection:{ready:true,side:'PUT'}});
 assert.equal(blocked.ready,false);assert.equal(blocked.side,null);assert.equal(blocked.reason,'unresolved-30s-structure-conflict');
});
test('current counter-trend leg is classified before the final admission',()=>{
 const qs=history();for(let i=85;i<qs.length;i++)qs[i].price=qs[84].price-(i-84)*.00001;
 assert.equal(observedRegime({quoteHistory:qs,now:T,quoteAt:T}).kind,'pullback');
 assert.equal(decide({quoteHistory:qs}).reason,'trend-retracement-in-progress');
});
test('late-arriving historical and future quotes cannot change regime or admission',()=>{
 const a=decide(),qs=[...history(),{ts:T+1000,price:100,receivedAt:T},
  {ts:T-3000,price:100,receivedAt:T+1000}];assert.deepEqual(decide({quoteHistory:qs}),a);
 assert.equal(decide({quoteHistory:history().slice(-20)}).ready,false);
 assert.equal(decide({quoteAt:T-2000}).ready,false);
});
test('oscillation requires an observed turn aligned with the current leg',()=>{
 const qs=history().map((q,i)=>({...q,price:1+Math.sin(i/6)*.0001}));
 assert.equal(observedRegime({quoteHistory:qs,now:T,quoteAt:T}).kind,'oscillation');
 const side=observedRegime({quoteHistory:qs,now:T,quoteAt:T}).recentSide;
 assert.equal(decide({quoteHistory:qs,candidate:{ready:true,side,reason:'observed-trend-and-30s-cycle-projection'},projection:{ready:true,side}}).ready,false);
 assert.equal(decide({quoteHistory:qs,candidate:{ready:true,side,reason:'failed-breakout-structure-change'},projection:{ready:true,side}}).ready,true);
});
test('other durations and an already-fired 30s window remain unchanged',()=>{
 const c={ready:true,side:'PUT'};assert.equal(decide({durationMs:60000,candidate:c}),c);
 const args={now:T,quoteAt:T,asset:'EUR/GBP OTC',provider:'iq_option',engineId:'automatic',durationMs:30000};
 const active=advanceNowOpportunity({...args,candidate:decide()});
 const next=advanceNowOpportunity({...args,now:T+1000,quoteAt:T+1000,previous:active,candidate:decide({projection:{ready:true,side:'PUT'}})});
 assert.equal(next.side,active.side);assert.equal(next.exitAt,active.exitAt);assert.equal(next.entryTriggeredAt,active.entryTriggeredAt);
});

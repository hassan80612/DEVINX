import test from 'node:test';
import assert from 'node:assert/strict';
import {adjudicateExpiryTrend} from '../sentinel-trading-lab/agent/src/core/expiry-trend-adjudicator.mjs';
const T=1800000000000;
const rows=Array.from({length:91},(_,i)=>({ts:T-(90-i)*1000,price:1.1+i*.00001}));
test('a final direction correction requires an actually observed path between its anchors',()=>{
 const horizons=[[5000,8,4],[10000,11,6],[15000,14,8],[30000,18,11],
  [60000,28,17],[120000,50,30],[300000,80,46]];
 for(const [durationMs,oldest,next] of horizons)for(const mirror of [false,true]){
  const quoteHistory=mirror?rows.map(q=>({...q,price:2.2-q.price})):rows;
  const side=mirror?'CALL':'PUT',input={candidate:{ready:true,side,reason:'closed-structure-and-live-impulse'},
   quoteHistory,quoteAt:T,now:T,price:quoteHistory.at(-1).price,durationMs};
  const full=adjudicateExpiryTrend(input);
  assert.equal(full.side,mirror?'PUT':'CALL');
  const gapped=quoteHistory.filter(q=>!(q.ts>T-oldest*1000&&q.ts<T-next*1000));
  const delayed=quoteHistory.map(q=>q.ts>T-oldest*1000&&q.ts<T-next*1000?{...q,receivedAt:T+1000}:q);
  assert.equal(adjudicateExpiryTrend({...input,quoteHistory:delayed}).side,side);
  assert.equal(adjudicateExpiryTrend({...input,quoteHistory:gapped}).side,side,
   'anchor agreement cannot replace the missing observed path: '+durationMs);
 }
});

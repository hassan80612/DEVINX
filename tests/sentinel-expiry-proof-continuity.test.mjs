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

import {setup} from './fixtures/executor-13946.mjs';
test('identified Exnova trade closing at 30s while configured for 60s suspends only future orders',async()=>{
 const x=setup('exnova');x.c.durationMs=60000;
 await x.bot.start();await x.fire('PUT');
 const order=x.bot.pending?.orders[0];assert.ok(order?.orderId);
 x.advance(29700);
 assert.equal(x.bot.settle({provider:'exnova',accountId:'10',orderId:order.orderId,
  source:'broker',netPnl:-1}),true);
 assert.equal(x.bot.sessionLosses,1,'preserve existing settlement accounting');
 assert.equal(x.bot.enabled,true,'analyst and bot stay online');
 assert.match(x.bot.suspensionReason,/corretora encerrou em 30s/);
 assert.equal(x.bot.lastBrokerExpiryMismatch.estimatedNativeDurationMs,30000);
 x.bot.stop('manual',{reset:true});
 assert.equal(x.bot.lastBrokerExpiryMismatch,null);
});
test('legitimate 30s settlement does not invent a drift and a 45s glitch is insufficient',async()=>{
 const x=setup('exnova');await x.bot.start();await x.fire('CALL');
 const p=x.bot.pending.orders[0];x.advance(29600);
 assert.ok(x.bot.settle({provider:'exnova',accountId:'10',orderId:p.orderId,source:'broker',netPnl:.86}));
 assert.equal(x.bot.hardHoldReason,null);
 assert.equal(x.bot.registerObservedExpiryMismatch(60000,45000,'unconfirmed'),false);
 assert.equal(x.bot.hardHoldReason,null);
});

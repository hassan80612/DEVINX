import test from 'node:test';
import assert from 'node:assert/strict';
import {LateImpulseReview,stretchedImpulse} from '../sentinel-trading-lab/agent/src/core/late-impulse-review.mjs';
const T=1800000000000;
function fixture(mirror=false){
 const rows=Array.from({length:71},(_,i)=>({ts:T-70000+i*1000,price:100+i*.02}));
 // A final burst is large relative to earlier equal-duration movements.
 for(let i=66;i<=70;i++)rows[i].price+=.15*(i-65);
 if(mirror)for(const q of rows)q.price=200-q.price;
 return rows;
}
function input(rows,side='CALL',durationMs=30000,reason='closed-structure-and-live-impulse'){
 const q=rows.at(-1);return {candidate:{ready:true,side,reason,observedAt:q.ts,entryPrice:q.price},
  context:'exnova|EURUSD|'+durationMs,quoteHistory:rows,quoteAt:q.ts,now:q.ts,price:q.price,durationMs};
}
test('extended impulses are reviewed in both directions, both short expiries and all reason families',()=>{
 for(const mirror of [false,true])for(const duration of [30000,60000])
 for(const reason of ['closed-structure-and-live-impulse','failed-breakout-structure-change',
  'confirmed-level-structure-reversal','historical-level-breakout','confirmed-fast-level-reversal']){
  const p=input(fixture(mirror),mirror?'PUT':'CALL',duration,reason);
  assert.ok(stretchedImpulse({...p,side:p.candidate.side}));
  const result=new LateImpulseReview().review(p);
  assert.equal(result.ready,false);assert.equal(result.side,null);
  assert.equal(result.entryTimingReview.phase,'waiting-retest');
 }
});
test('ordinary trend, early breakout, and a different candle second do not acquire a fixed wait',()=>{
 const rows=Array.from({length:71},(_,i)=>({ts:T-70000+i*1000,price:100+i*.02}));
 for(const shift of [0,41000]){
  const p=input(rows.map(q=>({...q,ts:q.ts+shift})));
  assert.equal(new LateImpulseReview().review(p),p.candidate);
 }
 const p=input(fixture().slice(0,-4));
 assert.equal(new LateImpulseReview().review(p),p.candidate);
});
test('a real retest and fresh local pivot break releases without waiting for a candle or deadline',()=>{
 for(const mirror of [false,true])for(const duration of [30000,60000]){
  const side=mirror?'PUT':'CALL',review=new LateImpulseReview(),rows=fixture(mirror);
  assert.equal(review.review(input(rows,side,duration)).ready,false);
  const path=[101.90,101.70,101.85,102.00,102.10,102.20];
  let out;
  for(const [i,p] of path.entries()){
   rows.push({ts:T+(i+1)*1000,price:mirror?200-p:p});
   out=review.review(input(rows,side,duration));
  }
  assert.equal(out.ready,true);assert.equal(out.side,side);
  assert.equal(out.entryTimingReview.phase,'price-confirmed');
 }
});
test('relabeling the same impulse or a succession of newer ticks cannot renew its deadline',()=>{
 const review=new LateImpulseReview(),rows=fixture();
 const first=review.review(input(rows));
 for(let i=1;i<=12;i++)rows.push({ts:T+i*1000,price:rows.at(-1).price+.1});
 const out=review.review(input(rows,'CALL',30000,'historical-level-breakout'));
 assert.equal(out.ready,false);assert.equal(out.entryTimingReview.phase,'expired');
 assert.equal(out.entryTimingReview.expiresAt,first.entryTimingReview.expiresAt);
});
test('missing or future quotes cannot manufacture a confirming retest',()=>{
 const review=new LateImpulseReview(),rows=fixture();review.review(input(rows));
 rows.push({ts:T+1000,price:101.7},{ts:T+2000,price:102.4,receivedAt:T+9000});
 const out=review.review(input(rows));
 assert.equal(out.ready,false);assert.equal(out.entryTimingReview.phase,'waiting-price');
});
test('provider, asset and horizon changes clear the old pending context; 5m keeps its own rule',()=>{
 const review=new LateImpulseReview(),rows=fixture();review.review(input(rows));
 const regular=Array.from({length:71},(_,i)=>({ts:T-70000+i*1000,price:100+i*.02}));
 const p={...input(regular),context:'iqoption|GBPUSD|30000'};
 assert.equal(review.review(p),p.candidate);
 const five=input(rows,'CALL',300000);
 assert.equal(review.review(five),five.candidate);
});

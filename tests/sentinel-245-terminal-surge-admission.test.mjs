import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewStretchedContinuationEntry} from '../sentinel-trading-lab/agent/src/core/stretched-continuation-admission.mjs';

const AT=1800000000000;
const prices=Array.from({length:61},(_,i)=>{
 if(i<=30)return 100+i*.01/30;
 if(i<=40)return 100.01-(i-30)*.0002;
 if(i<=48)return 100.008-(i-40)*.00025;
 return 100.006+(i-48)*(.004/12);
});
const tape=prices.map((price,i)=>({ts:AT-60000+i*1000,receivedAt:AT-60000+i*1000,price}));
const spot=prices.at(-1);
const continuation={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
const reversal={ready:true,side:'CALL',reason:'confirmed-level-structure-reversal'};
const review=(candidate=continuation,durationMs=60000,quoteHistory=tape)=>reviewStretchedContinuationEntry({
 candidate,quoteHistory,quoteAt:AT,now:AT,price:spot,durationMs
});

test('245: 12s final surge is not missed when 20s net distance is small',()=>{
 const out=review();
 assert.equal(out.ready,false);
 assert.equal(out.side,null);
 assert.equal(out.provisionalSide,'CALL');
 assert.equal(out.entryRisk?.details?.fastSurge12s,true);
 assert.equal(out.entryRisk?.details?.movement20Fraction<.4,true);
});
test('245: protect existing reversal and 30s / 5m routes',()=>{
 assert.strictEqual(review(reversal),reversal);
 assert.strictEqual(review(continuation,30000),continuation);
 assert.strictEqual(review(continuation,300000),continuation);
});
test('245: missing 60s or 12s history never forces a decision or timer',()=>{
 assert.strictEqual(review(continuation,60000,tape.slice(30)),continuation);
 const bad=tape.filter(row=>row.ts!==AT-12000&&row.ts!==AT-13000&&row.ts!==AT-14000);
 assert.strictEqual(review(continuation,60000,bad),continuation);
});
test('245: do not veto while the proposed trade is far from its directional extreme',()=>{
 const down=tape.map((row,i)=>i===60?{...row,price:100.005}:row);
 const candidate={...continuation};
 const out=reviewStretchedContinuationEntry({
  candidate,quoteHistory:down,quoteAt:AT,now:AT,price:100.005,durationMs:60000
 });
 assert.strictEqual(out,candidate);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adjudicateExpiryTrend} from '../sentinel-trading-lab/agent/src/core/expiry-trend-adjudicator.mjs';
import {reviewDirectionalPersistence} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const T=1800000000000;
const reasons=[
 'confirmed-level-structure-reversal','confirmed-fast-level-reversal'
];
const make=(durationMs,kind='opposing')=>{
 // The broker's observed 1s quotes, not future candles or auxiliary forecasts.
 const n=durationMs===30000?45:durationMs===300000?100:80;
 const quotes=Array.from({length:n+1},(_,i)=>{
  const age=n-i,down=1.017-i*.0001;
  // A REAL present turn starts BEFORE this signal: a 5s rising path.
  const price=kind==='turn'&&i>=n-5?(1.017-(n-5)*.0001)+(i-(n-5))*.00045:down;
  return {ts:T-age*1000,price,receivedAt:T-age*1000};
 });
 const last=quotes.at(-1);
 return {quoteHistory:quotes,price:last.price,quoteAt:T,now:T,durationMs};
};
const candidate=(reason,price)=>({
 ready:true,side:'CALL',reason,entryPrice:price,observedAt:T,
 priceStructure:{confirmedReversal:{kind:reason,side:'CALL',confirmedAt:T},
  observedSequence:{continuation:{kind:reason,side:'CALL',confirmedAt:T}}}
});
test('211: restore 207 independent confirmed reversal decisions instead of blanket opposite-trend veto',()=>{
 for(const durationMs of [30000,60000])for(const reason of reasons){
  const args=make(durationMs),c=candidate(reason,args.price),frozen=structuredClone(c);
  const a=reviewDirectionalPersistence({candidate:c,...args});
  assert.equal(a.ready,true,reason+'/'+durationMs+'/207 reversal persistence');
  assert.equal(a.side,'CALL');
  const b=adjudicateExpiryTrend({candidate:c,...args});
  assert.equal(b.ready,true,reason+'/'+durationMs+'/207 expiry-matched observation');
  assert.equal(b.side,'CALL','no opposite-side order manufactured');
  assert.deepEqual(c,frozen,'candidate must not be mutated');
 }
});
test('210: real observed live counterturn stays eligible, not a blanket anti-reversal filter',()=>{
 for(const durationMs of [30000,60000]){
  const args=make(durationMs,'turn'),c=candidate('confirmed-level-structure-reversal',args.price);
  assert.equal(reviewDirectionalPersistence({candidate:c,...args}),c);
  assert.equal(adjudicateExpiryTrend({candidate:c,...args}),c);
 }
});
test('210: absent/late/contradictory observations do not fabricate a veto',()=>{
 const args=make(60000),c=candidate('confirmed-level-structure-reversal',args.price);
 assert.equal(adjudicateExpiryTrend({candidate:c,...args,quoteHistory:args.quoteHistory.slice(-5)}),c);
 assert.equal(reviewDirectionalPersistence({candidate:c,...args,quoteHistory:args.quoteHistory.slice(-5)}),c);
 const late={...args,now:T+5000};
 assert.equal(adjudicateExpiryTrend({candidate:c,...late}),c);
 assert.equal(reviewDirectionalPersistence({candidate:c,...late}),c);
});
test('210: five-minute confirmed turns and broker expiry policy remain completely out of scope',()=>{
 const args=make(300000),c=candidate('confirmed-level-structure-reversal',args.price);
 assert.equal(reviewDirectionalPersistence({candidate:c,...args}),c);
 assert.equal(adjudicateExpiryTrend({candidate:c,...args}),c);
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs',import.meta.url),'utf8');
 assert.match(s,/revision:17/);
});
test('210: no experimental probability estimator becomes a mandatory vote or opposite-side trade',()=>{
 const file=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/66-probability-integration.mjs',import.meta.url),'utf8');
 assert.match(file,/calibratedWinProbability:false/);
 const adj=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/expiry-trend-adjudicator.mjs',import.meta.url),'utf8');
 assert.match(adj,/if\(!points\|\|isProtected\(candidate\.reason\)\)/);
 assert.match(adj,/opposite-trend-near-confirmed-wall/);
 assert.doesNotMatch(adj,/setTimeout\(|setInterval\(|setNativeExpiry|\.click\(/);
});

test('210: confirmed range, failed-breakout and multiscale reversals retain their validated expiry-trend policy',()=>{
 for(const durationMs of [30000,60000,300000]){
  const args=make(durationMs);
  for(const reason of ['closed-range-extreme-reversal-confirmed',
   'failed-breakout-structure-change','multiscale-candle-rejection']){
   const c=candidate(reason,args.price);
   assert.equal(adjudicateExpiryTrend({candidate:c,...args}),c,reason+'/'+durationMs);
  }
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedFastLevelReversal} from '../sentinel-trading-lab/agent/src/core/fast-level-reversal.mjs';
import {assessDirectionalPersistence,reviewDirectionalPersistence} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const T=1800000000000;
function evidence(mirror=false){
 const invert=p=>mirror?200-p:p;
 // A substantial decline into a pre-existing support, followed by an
 // observed, independently confirming V. The prior 12s/20s direction
 // remains down even as the LIVE short leg has turned up.
 const knots=[[-180000,106],[-20000,100.95],[-12000,100.85],
  [-8000,100.55],[-7000,100.22],[-6000,100.12],[-5000,100.055],
  [-4000,100.045],[-2000,100.015],[0,100.01]];
 const interpolated=ms=>{
  for(let i=1;i<knots.length;i++){
   const [a,pa]=knots[i-1],[b,pb]=knots[i];
   if(ms>=a&&ms<=b)return pa+(pb-pa)*(ms-a)/(b-a);
  }
  throw Error('time outside fixture');
 };
 const quoteHistory=Array.from({length:721},(_,i)=>{
  const ms=-180000+i*250;
  return {ts:T+ms,price:invert(interpolated(ms))};
 });
 for(const [i,p] of [100.005,100.001,99.99,100.018,100.044,100.065,100.11,100.15].entries())
  quoteHistory.push({ts:T+(i+1)*250,price:invert(p)});
 const zone=(p,role)=>({low:invert(p),high:invert(p),level:invert(p),
  touches:3,pivots:1,tests:[{age:1},{age:3}],windows:[3,10,20,50,100],
  confirmedPivots:1,independentTests:3,independentRejections:2,
  supportPivots:role==='support'?1:0,resistancePivots:role==='resistance'?1:0,
  supportRejections:role==='support'?2:0,resistanceRejections:role==='resistance'?2:0,
  supportWick:role==='support'?.8:0,resistanceWick:role==='resistance'?.8:0});
 const map={observedCandles:100,asOf:T-60000,tolerance:.07,
  levels:[zone(100,mirror?'resistance':'support'),
   zone(101,mirror?'support':'resistance')]};
 const last=quoteHistory.at(-1);
 return {map,quoteHistory,quoteAt:last.ts,now:last.ts,price:last.price,
  side:mirror?'PUT':'CALL'};
}

test('168: verified fast V is not vetoed solely for recovering <25% of the old move on 30s/1m',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const v=evidence(mirror),args={...v,durationMs};
  const proof=confirmedFastLevelReversal(args);
  assert.equal(proof?.side,v.side,JSON.stringify({mirror,durationMs,proof}));
  const persistence=assessDirectionalPersistence(args);
  assert.equal(persistence.phase,'reversal-testing',JSON.stringify({mirror,durationMs,persistence}));
  assert.ok(persistence.retracement<.25,JSON.stringify(persistence));
  assert.notEqual(persistence.side,v.side);
  const candidate={ready:true,side:v.side,reason:'confirmed-fast-level-reversal',
   observedAt:v.quoteAt,entryPrice:v.price,priceStructure:{confirmedReversal:proof}};
  const out=reviewDirectionalPersistence({...args,candidate});
  assert.equal(out.ready,true,JSON.stringify({mirror,durationMs,out}));
  assert.equal(out.side,v.side);
 }
});

test('168: an invented or outdated V label cannot bypass the previous opposition guard',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const v=evidence(mirror),args={...v,durationMs},proof=confirmedFastLevelReversal(args);
  assert.ok(proof);
  for(const invalid of [null,{...proof,confirmedAt:proof.confirmedAt-10000},
   {...proof,side:mirror?'CALL':'PUT'}]){
   const candidate={ready:true,side:v.side,reason:'confirmed-fast-level-reversal',
    observedAt:v.quoteAt,entryPrice:v.price,priceStructure:{confirmedReversal:invalid}};
   const out=reviewDirectionalPersistence({...args,candidate});
   assert.equal(out.ready,false,JSON.stringify({mirror,durationMs,invalid}));
   assert.equal(out.side,null);
  }
 }
});

test('168: 5m admission and expiry are outside the short-horizon change',()=>{
 const v=evidence(),candidate={ready:true,side:v.side,
  reason:'confirmed-fast-level-reversal'};
 assert.equal(reviewDirectionalPersistence({...v,durationMs:300000,candidate}),candidate);
});

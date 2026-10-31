import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {reviewEarlyDistantReversal} from '../sentinel-trading-lab/agent/src/core/historical-extreme-timing.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-202-quote-age-boundary.json',import.meta.url)));
test('202: the identical recorded 1m resistance never becomes CALL merely because quote age crosses 1450ms',()=>{
 for(const age of [1400,1450,1451,1500,1900,1950]){
  const out=analyzeNowOpportunity({...fixture,now:fixture.quoteAt+age});
  assert.equal(out.ready,false,'age='+age+' '+out.reason);
  assert.equal(out.reason,'historical-level-pressure-unconfirmed');
 }
});
const T=1800000000000;
const map={observedCandles:100,asOf:T-60000,tolerance:.0003,
 windows:[{size:100,available:true,observed:100,levels:[100]}],
 levels:[{level:100,low:99.9998,high:100.0002,confirmedPivots:2,
  resistancePivots:2,resistanceRejections:2,supportPivots:0,supportRejections:0,
  independentTests:3,resistanceWick:.8,supportWick:0,
  tests:[{age:36,independent:true,rejectedHigh:true}]}]};
const quotes=values=>values.map((price,i)=>({ts:T-(values.length-1-i)*1000,receivedAt:T-(values.length-1-i)*1000,price}));
const tape=quotes([99.9970,99.9980,99.9990,100.0000,100.0003,100.0003,100.0002,100.0000,99.9998]);
test('202: a ready CALL continuation does not bypass the same independent PUT reversal proof already used while waiting',()=>{
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
 const input={candidate,map,quoteHistory:tape,quoteAt:T,now:T,price:99.9998,durationMs:60000};
 const out=reviewEarlyDistantReversal(input);
 assert.equal(out.ready,true);assert.equal(out.side,'PUT');assert.equal(out.reason,'multiscale-candle-rejection');
 assert.equal(out.earlyLevelProof.confirmedTicks,2);
 assert.deepEqual(candidate,{ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'});
});
test('202: no reversal is manufactured from missing context, one counter-tick, or an already qualified reversal',()=>{
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
 const input={candidate,map,quoteHistory:tape,quoteAt:T,now:T,price:99.9998,durationMs:60000};
 assert.equal(reviewEarlyDistantReversal({...input,map:null}),candidate);
 const oneTick=quotes([99.9970,99.9980,99.9990,100.0000,100.0003,100.0003,100.0002,100.0003,99.9998]);
 assert.equal(reviewEarlyDistantReversal({...input,quoteHistory:oneTick}),candidate);
 for(const durationMs of [30000,300000])assert.equal(reviewEarlyDistantReversal({...input,durationMs}),candidate);
 const reversal={...candidate,reason:'confirmed-fast-level-reversal'};
 assert.equal(reviewEarlyDistantReversal({...input,candidate:reversal}),reversal);
 const sameSide={...candidate,side:'PUT'};
 assert.equal(reviewEarlyDistantReversal({...input,candidate:sameSide}),sameSide);
});
test('202: existing 30s and 5m decisions match the published 201 across fresh and stale quote ages',()=>{
 const cases=JSON.parse(readFileSync(new URL('./fixtures/sentinel-202-preserved-horizons.json',import.meta.url)));
 for(const {durationMs,age,expected} of cases){
  const out=analyzeNowOpportunity({...fixture,durationMs,now:fixture.quoteAt+age});
  assert.deepEqual({ready:out.ready,side:out.side??null,reason:out.reason},expected,JSON.stringify({durationMs,age}));
 }
});
test('202: opposite-level review rejects future or stale evidence and preserves genuine same-side continuation',()=>{
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse'};
 const input={candidate,map,quoteHistory:tape,quoteAt:T,now:T,price:99.9998,durationMs:60000};
 assert.equal(reviewEarlyDistantReversal({...input,now:T+1951}),candidate);
 assert.equal(reviewEarlyDistantReversal({...input,quoteHistory:tape.map(q=>({...q,receivedAt:T+2000}))}),candidate);
 const breakout={...candidate,side:'PUT',reason:'historical-level-breakout'};
 assert.equal(reviewEarlyDistantReversal({...input,candidate:breakout}),breakout);
});

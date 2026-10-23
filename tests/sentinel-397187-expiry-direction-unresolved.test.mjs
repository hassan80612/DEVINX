import test from 'node:test';
import assert from 'node:assert/strict';
import {adjudicateExpiryTrend} from '../sentinel-trading-lab/agent/src/core/expiry-trend-adjudicator.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

// Build a causal, observable, four-interval trend opposing a STALE candidate.
// Only 3 of 4 intervals agree: strong contradictory movement, but no 4/4
// price proof and no independent forecast. The engine must not blindly
// retain the old opposite signal or flip unverified to the new side.
const T=1792709000000;
const scales={
  5000:[1,2,4,8],10000:[2,3,6,11],15000:[2,4,8,14],
  30000:[3,6,11,18],60000:[4,9,17,28],
  120000:[7,15,30,50],300000:[10,24,46,80]
};
const quoteWave=(points,down=false)=>{
 const t=[-points[3],-points[2],-points[1],-points[0],0];
 const up=[1.1,1.099995,1.10055,1.1010,1.1015];
 const levels=down?up.map((v,i)=>2.2-v):up;
 return Array.from({length:Math.max(101,points[3]+12)},(_,ix)=>{
  const offset=ix-(Math.max(101,points[3]+12)-1);
  const j=t.findIndex((v,k)=>k<t.length-1&&offset>=v&&offset<=t[k+1]);
  const price=j<0?(offset<t[0]?levels[0]:levels.at(-1)):
   levels[j]+(levels[j+1]-levels[j])*(offset-t[j])/(t[j+1]-t[j]);
  return {ts:T+offset*1000,receivedAt:T+offset*1000,price};
 });
};

for(const [duration,points] of Object.entries(scales)){
 test('unresolved '+duration+'ms: no stale or blind opposite-direction entry',()=>{
  const quotes=quoteWave(points),q=quotes.at(-1);
  const base={ready:true,side:'PUT',reason:'closed-structure-and-live-impulse',strength:91};
  const result=adjudicateExpiryTrend({candidate:base,quoteHistory:quotes,quoteAt:q.ts,
   price:q.price,now:q.ts,durationMs:Number(duration)});
  assert.equal(result.ready,false);
  assert.equal(result.side,null);
  assert.equal(result.reason,'expiry-scale-direction-unresolved');
  assert.equal(result.originalSide,'PUT');
  const next=advanceNowOpportunity({candidate:{...result,observedAt:q.ts,entryPrice:q.price},
    now:q.ts,quoteAt:q.ts,asset:'EUR/USD OTC',provider:'exnova',
    durationMs:Number(duration),engineId:'automatic'});
  assert.notEqual(next?.phase,'fired','no click when direction lacks independent confirmation');
  // A separately verified reversal IS still actionable and must be analyzed
  // rather than being blocked indiscriminately.
  const confirmed=adjudicateExpiryTrend({candidate:base,quoteHistory:quotes,quoteAt:q.ts,
   price:q.price,now:q.ts,durationMs:Number(duration),
   estimate:{pCall:.80,pPut:.20}});
  assert.equal(confirmed.ready,true);
  assert.equal(confirmed.side,'CALL');
  // Observed reversal evidence remains authoritative.
  const protectedSignal=adjudicateExpiryTrend({
   candidate:{...base,reason:'closed-range-extreme-reversal-confirmed'},
   quoteHistory:quotes,quoteAt:q.ts,price:q.price,now:q.ts,durationMs:Number(duration)});
  assert.equal(protectedSignal.ready,true);
  assert.equal(protectedSignal.side,'PUT');
 });
 test('unresolved '+duration+'ms: symmetric downside check',()=>{
  const quotes=quoteWave(points,true),q=quotes.at(-1);
  const result=adjudicateExpiryTrend({candidate:{ready:true,side:'CALL',
   reason:'closed-structure-and-live-impulse'},quoteHistory:quotes,quoteAt:q.ts,
   price:q.price,now:q.ts,durationMs:Number(duration)});
  assert.equal(result.ready,false);
  assert.equal(result.side,null);
 });
}
test('adjudicator inspects only causal broker quotes and has no waits or broker actions',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/expiry-trend-adjudicator.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/setTimeout\s*\(|setInterval\s*\(|page\.click\s*\(|fetch\s*\(/);
});

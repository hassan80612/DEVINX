import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewEntryPrice} from '../sentinel-trading-lab/agent/src/core/entry-price-timing.mjs';
import {expiryPositionRisk,reviewExpiryEntryPosition}
 from '../sentinel-trading-lab/agent/src/core/expiry-entry-position.mjs';

const T=1800000000000;
const sha=raw=>createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex');
function scenario(durationMs=60000,mirror=false,{stall=true}={}){
 const duration=durationMs/1000;
 const rows=Array.from({length:Math.round(duration*2.5)+1},(_,i)=>{
  const t=i-Math.round(duration*2.5);
  let p;
  if(t<=-duration*.5)p=100+(t+duration*2.5)*.006;
  else{
   const v=100+(duration*2)*.006;
   const elapsed=t+duration*.5;
   p=v+elapsed*(stall?.009:.008);
   if(stall&&t>=-2)p=v+(duration*.5-2)*.009;
  }
  return {ts:T+t*1000,receivedAt:T+t*1000,price:mirror?200-p:p};
 });
 const spot=rows.at(-1).price,side=mirror?'PUT':'CALL';
 const candidate={ready:true,side,reason:'closed-structure-and-live-impulse',
  observedAt:T,entryPrice:spot};
 return {candidate,quoteHistory:rows,quoteAt:T,now:T,price:spot,durationMs};
}
for(const durationMs of [30000,60000])for(const mirror of [false,true]){
 const name=durationMs+' '+(mirror?'PUT':'CALL');
 test(name+': a completed move followed by stall at the extreme is not a fresh entry',()=>{
  const a=scenario(durationMs,mirror),r=expiryPositionRisk(a);
  assert.equal(r?.kind,'expiry-entry-price-late-after-confirmed-move');
  const result=reviewEntryPrice(a);
  assert.equal(result.ready,false);assert.equal(result.side,null);
  assert.equal(result.provisionalSide,a.candidate.side);
  assert.equal(result.reason,'expiry-entry-too-late-for-current-price');
  assert.equal(result.entryTiming.durationMs,durationMs);
  assert.equal(result.entryTiming.evidence,'short-push-stalled');
  assert.equal(a.candidate.ready,true,'no mutation of the baseline candidate');
  assert.deepEqual(reviewEntryPrice(a),result,'idempotent; no delayed/rearmed signal');
 });
 test(name+': strong ongoing momentum at the same range edge remains eligible',()=>{
  const a=scenario(durationMs,mirror,{stall:false});
  assert.equal(expiryPositionRisk(a),null);
  assert.equal(reviewEntryPrice(a),a.candidate);
 });
 test(name+': a proven current level event retains full authority',()=>{
  const a=scenario(durationMs,mirror);
  for(const reason of ['confirmed-fast-level-reversal','confirmed-level-structure-reversal',
   'historical-level-breakout','historical-level-rejection','failed-breakout-structure-change']){
   const c={...a.candidate,reason};
   assert.equal(expiryPositionRisk({...a,candidate:c}),null,reason);
  }
  for(const priceStructure of [{confirmedReversal:{side:a.candidate.side}},
   {reactionProof:{confirmed:true}},
   {observedSequence:{continuation:{side:a.candidate.side,confirmedAt:T-1000}}}]){
   assert.equal(expiryPositionRisk({...a,candidate:{...a.candidate,priceStructure}}),null);
  }
 });
}
test('old or forged proof cannot bypass the observed expiry position',()=>{
 const a=scenario();
 for(const stamp of [T-10000,T+1000]){
  const c={...a.candidate,priceStructure:{observedSequence:{
   continuation:{side:a.candidate.side,confirmedAt:stamp}}}};
  assert.equal(expiryPositionRisk({...a,candidate:c})?.kind,
   'expiry-entry-price-late-after-confirmed-move');
 }
});
test('no extra broker access, timers or adverse packet lookahead; 5m remains exactly unchanged',()=>{
 const a=scenario(),out=reviewExpiryEntryPosition(a);
 const injected={...a,quoteHistory:[...a.quoteHistory,
  {ts:T+1000,receivedAt:T+1000,price:99}]};
 assert.deepEqual(reviewExpiryEntryPosition(injected),out);
 assert.equal(reviewEntryPrice({...a,now:T+1600}),a.candidate);
 assert.equal(reviewEntryPrice({...a,durationMs:300000}),a.candidate);
 const code=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/expiry-entry-position.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/setTimeout|setInterval|WebSocket|\.click\(|page\.evaluate|setNativeExpiry|patchSettings|requestMarket/);
});
test('178 preserves the old entry-price policy outside the explicit extended-pivot revision',()=>{
 const raw=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/entry-price-timing.mjs',import.meta.url),'utf8');
 const add="import {reviewExpiryEntryPosition} from './expiry-entry-position.mjs';\n";
 const invocation=' if(!risk)return reviewExpiryEntryPosition({candidate,quoteHistory,quoteAt,now,price,durationMs});';
 assert.equal(raw.split(add).length,2);
 assert.equal(raw.split(invocation).length,2);
 const oldPivot=" // A current higher-low/lower-high plus its FIRST pivot break also supplies\n // the price confirmation for an already qualified continuation. A past\n // break or a jump far beyond the trigger is not a new entry opportunity.\n const first=proof&&rows.find(q=>q.ts>proof.turnAt&&d*(q.price-proof.pivotPrice)>proof.amplitude);\n const currentBreak=proof&&proof.turnAt>risk.startedAt&&first&&\n  first.ts<=at&&now-first.ts<=1450&&\n  d*(spot-proof.pivotPrice)<=proof.amplitude+risk.typicalMove*.5?{...proof,confirmedAt:first.ts}:null;\n if(ownProof||currentBreak)return {...candidate,entryTiming:{kind:'current-price-confirmed',proof:ownProof||currentBreak}};\n";
 const newPivot=" // A small local pivot break cannot renew a leg that is already extended.\n // Only the independently verified reversal/rejection proof above can\n // authorize this price; do not wait for another break of the same old leg.\n if(ownProof)return {...candidate,entryTiming:{kind:'current-price-confirmed',proof:ownProof}};\n";
 assert.equal(raw.split(newPivot).length,2);
 const normalized=raw.replace(newPivot,oldPivot).replace("entryTiming:{...risk,kind:'entry-price-already-extended',setup:candidate.reason}","entryTiming:{kind:'entry-price-already-extended',...risk}");
 const restored=Buffer.from(normalized.replace(add,'').replace(invocation,' if(!risk)return candidate;'));
 assert.equal(sha(restored),'36ddcb35492721a7a92fc11466a77f43541f0778');
});

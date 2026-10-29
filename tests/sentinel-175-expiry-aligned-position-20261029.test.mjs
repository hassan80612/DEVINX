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
test('the old entry-price policy is byte-identical after stripping one import and call',()=>{
 const raw=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/entry-price-timing.mjs',import.meta.url),'utf8');
 const add="import {reviewExpiryEntryPosition} from './expiry-entry-position.mjs';\n";
 const invocation=' if(!risk)return reviewExpiryEntryPosition({candidate,quoteHistory,quoteAt,now,price,durationMs});';
 assert.equal(raw.split(add).length,2);
 assert.equal(raw.split(invocation).length,2);
 const restored=Buffer.from(raw.replace(add,'').replace(invocation,' if(!risk)return candidate;'));
 assert.equal(sha(restored),'36ddcb35492721a7a92fc11466a77f43541f0778');
});

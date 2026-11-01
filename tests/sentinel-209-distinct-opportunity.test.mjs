import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewDistinctOpportunity,rememberFiredOpportunity} from '../sentinel-trading-lab/agent/src/core/distinct-opportunity-review.mjs';
const T=1800000000000,MS=60000;
const candidate=(side='CALL',reason='closed-structure-and-live-impulse',at=T+MS,price=100.12)=>({
 ready:true,side,reason,observedAt:at,entryPrice:price
});
const last=(side='CALL',family='continuation')=>({
 provider:'exnova',asset:'EUR/GBP OTC',durationMs:MS,
 at:T,exitAt:T+MS,side,entryPrice:100,family,level:null,
 reason:'closed-structure-and-live-impulse'
});
function ctx({values=Array.from({length:61},(_,i)=>100+i*.002),side='CALL',
 reason='closed-structure-and-live-impulse',durationMs=MS,previous=last(),at=T+MS}={}){
 const quoteHistory=values.map((price,i)=>({ts:T+i*1000,receivedAt:T+i*1000,price}));
 const price=values.at(-1),now=at;
 return {candidate:candidate(side,reason,at,price),last:previous,provider:'exnova',
  asset:'EUR/GBP OTC',durationMs,quoteHistory,quoteAt:at,now,price,tolerance:.003};
}
function pullback(){
 return Array.from({length:61},(_,i)=>i<=10?100+i*.002:
  i<=26?100.02-(i-10)*.0012:100.0008+(i-26)*.002);
}
test('209: repeated qualified CALL from the same uninterrupted impulse is vetoed only after expiry',()=>{
 for(const durationMs of [30000,60000]){
  const input=ctx({durationMs,previous:{...last(),durationMs,exitAt:T+durationMs}});
  const untouched=structuredClone(input);
  const out=reviewDistinctOpportunity(input);
  assert.equal(out.ready,false);assert.equal(out.side,null);
  assert.equal(out.provisionalSide,'CALL');
  assert.equal(out.entryRisk.kind,'same-opportunity-after-expiry');
  assert.deepEqual(input,untouched,'admission must be read-only');
 }
});
test('209: a real observed post-entry pullback and current resumed impulse authorizes immediately at expiry',()=>{
 const input=ctx({values:pullback()});
 assert.equal(reviewDistinctOpportunity(input),input.candidate);
 assert.equal(input.now,input.last.exitAt,'no fixed delay is required');
});
test('209: reverse-side confirmed CALL/PUT are untouched regardless of proximity to previous trade',()=>{
 for(const [priorSide,nextSide] of [['CALL','PUT'],['PUT','CALL']]){
  const input=ctx({side:nextSide,reason:'confirmed-level-structure-reversal',
    previous:last(priorSide,'continuation')});
  assert.equal(reviewDistinctOpportunity(input),input.candidate);
 }
});
test('209: new independent confirmed reversal family is not treated as previous continuation',()=>{
 const input=ctx({reason:'confirmed-level-structure-reversal',previous:last('CALL','continuation')});
 assert.equal(reviewDistinctOpportunity(input),input.candidate);
});
test('209: same-level structural reversal cannot be recycled without a new observed swing',()=>{
 const input=ctx({reason:'confirmed-level-structure-reversal',
  previous:{...last('CALL','reversal'),level:100}});
 input.candidate.priceStructure={confirmedReversal:{level:{level:100}}};
 assert.equal(reviewDistinctOpportunity(input).ready,false);
 input.candidate.priceStructure.confirmedReversal.level.level=100.1;
 assert.equal(reviewDistinctOpportunity(input),input.candidate,
  'a different confirmed historical level must be eligible');
});
test('209: five-minute decisions and prior in-progress operations are unchanged',()=>{
 const input=ctx({durationMs:300000});
 assert.equal(reviewDistinctOpportunity(input),input.candidate);
 const stillOpen=ctx({previous:{...last(),exitAt:T+MS+10000}});
 assert.equal(reviewDistinctOpportunity(stillOpen),stillOpen.candidate);
});
test('209: incomplete or unreceived market history cannot manufacture a false new opportunity veto',()=>{
 const input=ctx();
 const tiny={...input,quoteHistory:input.quoteHistory.slice(-3)};
 assert.equal(reviewDistinctOpportunity(tiny),input.candidate);
 const unreceived={...input,quoteHistory:input.quoteHistory.map((q,i)=>i>55?{...q,receivedAt:input.now+10000}:q)};
 assert.equal(reviewDistinctOpportunity(unreceived),input.candidate);
});
test('209: unrelated broker, asset, manually changed expiry or new strategy family is untouched',()=>{
 const input=ctx();
 for(const patch of [{provider:'iq_option'},{asset:'EUR/USD OTC'},{last:{...last(),durationMs:30000}}]){
  const run={...input,...patch};
  assert.equal(reviewDistinctOpportunity(run),input.candidate);
 }
 const newFamily={...input,candidate:{...input.candidate,reason:'confirmed-level-structure-reversal'}};
 assert.equal(reviewDistinctOpportunity(newFamily),newFamily.candidate);
});
test('209: fired NOW signal is remembered once and survives future scanning frames',()=>{
 const input=ctx(),memory=rememberFiredOpportunity({candidate:input.candidate,
   signal:{phase:'fired',side:'CALL',entryTriggeredAt:T,exitAt:T+MS,entryPrice:100},
   provider:'exnova',asset:'EUR/GBP OTC',durationMs:MS});
 assert.equal(memory.at,T);assert.equal(memory.exitAt,T+MS);
 assert.equal(memory.family,'continuation');
 assert.equal(rememberFiredOpportunity({candidate:input.candidate,
   signal:{phase:'scanning',side:null},provider:'exnova',asset:'EUR/GBP OTC',durationMs:MS}),null);
 assert.equal(reviewDistinctOpportunity({...input,last:memory}).ready,false);
 const runtime=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.ok(runtime.indexOf('eligible=reviewDistinctOpportunity(')>runtime.indexOf('eligible=reviewPreEntryRisk('));
 assert.ok(runtime.indexOf('eligible=reviewDistinctOpportunity(')<runtime.indexOf('let next=advanceNowOpportunity('));
 assert.match(runtime,/if\(freshSignal\)\{\s*this\.lastDistinctOpportunity=rememberFiredOpportunity\(/);
});
test('209: pure causal check, no delays, loops, broker mutations or changes to expiry duration',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/distinct-opportunity-review.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/setTimeout|setInterval|await\b|\bfetch\(|\.click\(|setNativeExpiry|orderDurationMs\s*=/);
 const runtime=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(runtime,/this\.lastDistinctOpportunity=null/);
});

test('209: independent continuation reason stays eligible without being mistaken for the old setup',()=>{
 const input=ctx({reason:'historical-level-breakout'});
 assert.equal(reviewDistinctOpportunity(input),input.candidate);
});
test('209: an older setup whose entry has fallen out of the recorded quote buffer cannot be vetoed',()=>{
 const input=ctx();
 input.last={...last(),at:T-6*MS,exitAt:T-5*MS};
 assert.equal(reviewDistinctOpportunity(input),input.candidate);
});
test('209: two reversal labels sharing a VERIFIED old level still need an observed new swing',()=>{
 const input=ctx({reason:'confirmed-level-structure-reversal',
   previous:{...last('CALL','reversal'),reason:'failed-breakout-structure-change',level:100}});
 input.candidate.priceStructure={confirmedReversal:{level:{level:100}}};
 assert.equal(reviewDistinctOpportunity(input).entryRisk?.kind,'same-opportunity-after-expiry');
 input.last.level=null;assert.equal(reviewDistinctOpportunity(input),input.candidate,
   'unknown old level may not counterfeit identical structural setup');
});

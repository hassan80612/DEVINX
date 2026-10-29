import test from 'node:test';
import assert from 'node:assert/strict';
import {LateImpulseReview,stretchedImpulse} from '../sentinel-trading-lab/agent/src/core/late-impulse-review.mjs';
import {confirmedLevelReversal} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {confirmedFastLevelReversal} from '../sentinel-trading-lab/agent/src/core/fast-level-reversal.mjs';
import {entryObservationStatus} from '../sentinel-trading-lab/agent/src/core/entry-observation-status.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
const T=1800000000000;
function reversal(mirror=false,durationMs=30000){
 const rows=Array.from({length:71},(_,i)=>({ts:T-70000+i*1000,price:100+i*.005}));
 const path=[100.2,100,100.3,100.6,100.4,100.6,100.9,101.3,100.9,101,101.1,101.32];
 path.forEach((price,i)=>{rows[rows.length-path.length+i].price=price;});
 if(mirror)rows.forEach(q=>{q.price=200-q.price;});
 const level=mirror?99.6:100.4,side=mirror?'PUT':'CALL';
 const map={observedCandles:100,asOf:T-60000,tolerance:.05,levels:[{
  level,low:level-.05,high:level+.05,confirmedPivots:2,independentTests:3,
  supportPivots:mirror?0:2,supportRejections:mirror?0:3,
  resistancePivots:mirror?2:0,resistanceRejections:mirror?3:0}]};
 const input={context:'exnova|EURUSD|'+durationMs,quoteHistory:rows,
  quoteAt:T,now:T,price:rows.at(-1).price,durationMs};
 const proof=confirmedLevelReversal({...input,map});
 assert.equal(proof?.side,side);
 return {...input,candidate:{ready:true,side,reason:proof.kind,
  observedAt:T,entryPrice:input.price,priceStructure:{confirmedReversal:proof}}};
}
test('a current real reversal at its first pivot crossing needs no second retest in 30s or 1m, CALL or PUT',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const input=reversal(mirror,durationMs);
  assert.ok(stretchedImpulse({...input,side:input.candidate.side}),'the accumulated leg would otherwise trigger the extra wait');
  const review=new LateImpulseReview(),out=review.review(input);
  assert.equal(out.ready,true);assert.equal(out.side,input.candidate.side);
  assert.equal(out.entryTimingReview.phase,'reversal-price-confirmed');
  assert.equal(review.pending.size,0);
 }
});
test('reversal names, stale proof, mismatched pivot and a price already far beyond the trigger cannot bypass late review',()=>{
 for(const mirror of [false,true]){
  const base=reversal(mirror),sign=mirror?-1:1;
  const cases=[
   {...base,candidate:{...base.candidate,priceStructure:{}}},
   {...base,candidate:{...base.candidate,priceStructure:{confirmedReversal:{...base.candidate.priceStructure.confirmedReversal,confirmedAt:T-2000}}}},
   {...base,candidate:{...base.candidate,priceStructure:{confirmedReversal:{...base.candidate.priceStructure.confirmedReversal,pivotPrice:base.price+sign}}}},
   {...base,price:base.price+sign*.5,quoteHistory:base.quoteHistory.map((q,i,a)=>i===a.length-1?{...q,price:q.price+sign*.5}:q)}
  ];
  for(const input of cases)assert.equal(new LateImpulseReview().review(input).ready,false);
 }
});
test('an old pending impulse cannot mask a new independently confirmed nearby reversal',()=>{
 const input=reversal(),review=new LateImpulseReview();
 // A previously detected leg remains in review while its real pullback forms.
 const risk=stretchedImpulse({...input,side:'CALL'});
 review.pending.set('CALL',{...risk,detectedAt:T-5000,expiresAt:T+4000});review.context=input.context;
 const out=review.review(input);
 assert.equal(out.ready,true);assert.equal(review.pending.size,0);
});
test('5m retains its separate admission and is not released by the short reversal exception',()=>{
 const input=reversal(false,300000);
 assert.equal(new LateImpulseReview().review(input),input.candidate);
});
test('a freshly reverified fast rejection can resolve an older pending leg, but a relabeled proof cannot',()=>{
 for(const mirror of [false,true])for(const durationMs of [30000,60000]){
  const transform=p=>mirror?200-p:p,side=mirror?'PUT':'CALL';
  const rows=Array.from({length:720},(_,i)=>({ts:T-180000+i*250,price:transform(106-(106-100.11)*i/720)}));
  for(const [i,p] of [100.11,100.07,100.025,99.99,100.018,100.044,100.065].entries())rows.push({ts:T+i*250,price:transform(p)});
  const zone=(p,support)=>({low:transform(p),high:transform(p),level:transform(p),confirmedPivots:1,independentTests:3,
   supportPivots:support?1:0,supportRejections:support?2:0,resistancePivots:support?0:1,resistanceRejections:support?0:2});
  const input={context:'test',quoteHistory:rows,quoteAt:rows.at(-1).ts,now:rows.at(-1).ts,price:rows.at(-1).price,durationMs};
  const proof=confirmedFastLevelReversal({...input,map:{observedCandles:100,asOf:T-60000,tolerance:.07,levels:[zone(100,!mirror),zone(101,mirror)]}});
  assert.equal(proof?.side,side);
  input.candidate={ready:true,side,reason:proof.kind,priceStructure:{confirmedReversal:proof}};
  const review=new LateImpulseReview();review.context=input.context;
  const old={startedAt:T-20000,detectedAt:T-7000,expiresAt:T+5000,originPrice:transform(99.7),peakPrice:transform(100.15),leg:.45,typicalMove:.03};
  review.pending.set(side,old);
  const result=review.review(input);assert.equal(result.ready,true);assert.equal(result.entryTimingReview.phase,'reversal-price-confirmed');
  review.pending.set(side,old);
  input.candidate.priceStructure.confirmedReversal={...proof,touchAt:proof.touchAt-250};
  assert.equal(review.review(input).ready,false,'the received tape must independently verify the exact proof');
 }
});
test('wait messages distinguish late impulse, expired candidate, conflicting level and 5m proof',()=>{
 const cases=[
  ['impulso-estendido-aguardando-reteste-e-quebra-de-pivo','AGUARDANDO RETESTE E ROMPIMENTO'],
  ['candidato-de-impulso-expirado','BUSCANDO NOVA OPORTUNIDADE'],
  ['final-side-continuation-wall-pressure','AGUARDANDO SUPERAÇÃO DO NÍVEL'],
  ['five-minute-reversal-only-awaiting-proof','AGUARDANDO EXTREMO + REVERSÃO'],
  ['shared-base-live-evidence-conflict','PREÇO E ESTRUTURA EM CONFLITO'],
  ['late-quote-no-entry','AGUARDANDO COTAÇÃO ATUAL']
 ];
 for(const [reason,label] of cases){
  const candidate={ready:false,reason},copy=structuredClone(candidate);
  const out=entryObservationStatus({candidate});
  assert.equal(out.waitLabel,label);assert.ok(out.waitDetail.length>10);
  assert.deepEqual(candidate,copy,'presentation never changes admission');
 }
});
test('mobile broadcast carries the same actual wait explanation as the PC runtime',()=>{
 const status=entryObservationStatus({candidate:{reason:'candidato-de-impulso-expirado'}});
 const snap=analystSnapshot({settings:{engine:'automatic'},lastResult:{analysis:{vnext:{mode:'now',nowObservation:{ready:false,...status}}}}},{});
 assert.equal(snap.lastResult.analysis.vnext.nowObservation.waitLabel,status.waitLabel);
 assert.equal(snap.lastResult.analysis.vnext.nowObservation.waitDetail,status.waitDetail);
});

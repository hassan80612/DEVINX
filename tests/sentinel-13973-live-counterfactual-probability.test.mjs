import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFileSync} from 'node:fs';
import {CausalProbabilityReview} from '../sentinel-trading-lab/agent/src/core/causal-probability-review.mjs';
import {combine66WithProbability} from '../sentinel-trading-lab/agent/src/core/66-probability-integration.mjs';
const context='iq_option|EUR/USD|automatic|30000';
const candidate={ready:true,side:'CALL',strength:35,reason:'closed-structure-and-live-impulse'};
const prob={pCall:.29,pPut:.71};
const price=1.12345;
const anchor=1792500000000;
function feed(review,{contextId=context,duration=30000,sideAtExit='PUT',n=16,missing=false}={}){
 let summary;
 for(let i=0;i<n;i++){
  const at=anchor+i*(duration+2000),exitAt=at+duration;
  review.observe({context:contextId,now:at,quoteAt:at,price,quoteHistory:[{ts:at,price}],
   expiryMs:duration,original:candidate,estimate:prob,marketValid:true,payout:.8});
  const exit=sideAtExit==='PUT'?price-.00015:price+.00015;
  summary=review.observe({context:contextId,now:exitAt+100,quoteAt:missing?exitAt+100:exitAt,
   price:exit,quoteHistory:missing?[{ts:exitAt+100,price:exit}]:[{ts:at,price},{ts:exitAt,price:exit}],
   expiryMs:duration,original:null,estimate:null,marketValid:false,payout:.8});
 }
 return summary;
}
test('16 independent, non-overlapping live opposite wins permit a weak-signal inversion',()=>{
 const audit=new CausalProbabilityReview();
 const p=feed(audit);
 assert.equal(p.n,16);
 assert.equal(p.oppositeWins,16);
 assert.equal(p.originalWins,0);
 assert.equal(p.approved,true);
 const modified=combine66WithProbability(candidate,prob,{durationMs:30000,proof:p});
 assert.equal(modified.side,'PUT');
 assert.equal(modified.probabilityOverride,true);
 assert.equal(modified.originalSide,'CALL');
});
test('no automatic inversion before live evidence exists',()=>{
 const audit=new CausalProbabilityReview(),p=feed(audit,{n:5});
 assert.equal(p.approved,false);
 const result=combine66WithProbability(candidate,prob,{durationMs:30000,proof:p});
 assert.equal(result.side,'CALL');
 assert.equal(result.probabilityOverride,false);
});
test('strong original decisions and protected reversals are never inverted',()=>{
 const p=feed(new CausalProbabilityReview());
 for(const original of [{...candidate,strength:75},{...candidate,reason:'closed-range-extreme-reversal-confirmed',strength:null}]){
  assert.equal(combine66WithProbability(original,prob,{durationMs:30000,proof:p}).side,'CALL');
 }
});
test('wrong opposite direction blocks promotion instead of learning the wrong market',()=>{
 const p=feed(new CausalProbabilityReview(),{sideAtExit:'CALL'});
 assert.equal(p.n,16);
 assert.equal(p.oppositeWins,0);
 assert.equal(p.approved,false);
 assert.equal(combine66WithProbability(candidate,prob,{durationMs:30000,proof:p}).side,'CALL');
});
test('a quote after expiry cannot be used to grade an earlier expiry',()=>{
 const p=feed(new CausalProbabilityReview(),{missing:true});
 assert.equal(p.n,0);
 assert.equal(p.approved,false);
});
test('probability quality is scoped by broker, asset, strategy, and duration',()=>{
 const audit=new CausalProbabilityReview();
 feed(audit);
 for(const c of ['exnova|EUR/USD|automatic|30000','iq_option|EUR/USD OTC|automatic|30000','iq_option|EUR/USD|trend|30000','iq_option|EUR/USD|automatic|60000']){
  assert.equal(audit.summary(c,.8).approved,false);
 }
 const p=feed(audit,{contextId:'iq_option|EUR/USD|automatic|60000',duration:60000,n:16});
 assert.equal(p.approved,true);
 assert.equal(audit.summary(context,.8).n,16);
});
test('missing broker payout permits directional evidence but never claims profitability',()=>{
 const audit=new CausalProbabilityReview();feed(audit);
 const unpriced=audit.summary(context,null);
 assert.equal(unpriced.approved,true);
 assert.equal(unpriced.payoutVerified,false);
 assert.equal(unpriced.directionalOnly,true);
 assert.equal(unpriced.threshold,null);
 assert.equal(audit.summary(context,.2).payoutVerified,false);
});
test('review is bounded, synchronous, and does not introduce a 30-second wait on individual quotes',()=>{
 const audit=new CausalProbabilityReview();
 const started=performance.now();
 for(let i=0;i<400;i++)audit.observe({context,now:anchor,quoteAt:anchor,price,
  quoteHistory:[{ts:anchor,price}],expiryMs:30000,original:candidate,estimate:prob,marketValid:true,payout:.8});
 assert.ok(performance.now()-started<500);
 assert.equal(audit.summary(context,.8).n,0);
});

test('both REAL and DEMO use the same evidence without extra broker/page queries',()=>{
 const rt=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 const review=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/causal-probability-review.mjs',import.meta.url),'utf8');
 const probability=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/66-probability-integration.mjs',import.meta.url),'utf8');
 const entry=rt.slice(rt.indexOf('const probabilityProof='),rt.indexOf('const eligible=',rt.indexOf('const probabilityProof=')));
 assert.ok(entry.includes('combine66WithProbability'));
 assert.doesNotMatch(entry,/settings\.mode|===['"]demo['"]|===['"]real['"]/);
 assert.ok(entry.includes('lastFastProbability')===false);
 for(const code of [review,probability]){
  assert.doesNotMatch(code,/\bawait\b|\bfetch\s*\(|setInterval\s*\(|setTimeout\s*\(|\bWebSocket\b|\bdriver\./);
 }
 assert.ok(rt.includes('quoteTs-cached.quoteTs<650'));
 assert.ok(rt.includes('(original66.ready!==true||locked)'));
});

test('a recent market regime change revokes opposite-side authority without delaying original 66',()=>{
 const audit=new CausalProbabilityReview();
 const initial=feed(audit,{n:16});
 assert.equal(initial.approved,true);
 const duration=30000,step=duration+2000;
 let updated=initial;
 for(let j=0;j<3;j++){
  const at=anchor+(16+j)*step,due=at+duration;
  audit.observe({context,now:at,quoteAt:at,price,
   quoteHistory:[{ts:at,price}],expiryMs:duration,original:candidate,
   estimate:prob,marketValid:true,payout:.8});
  updated=audit.observe({context,now:due+100,quoteAt:due,price:price+.00015,
   quoteHistory:[{ts:at,price},{ts:due,price:price+.00015}],
   expiryMs:duration,original:null,estimate:null,marketValid:false,payout:.8});
 }
 assert.equal(updated.n,19);
 assert.ok(updated.observedOppositeRate>=.78,'lifetime accuracy alone is still deceptively high');
 assert.equal(updated.approved,false,'recent 3 contrary results must remove inversion authority');
 const final=combine66WithProbability(candidate,prob,{durationMs:duration,proof:updated});
 assert.equal(final.ready,true);
 assert.equal(final.side,'CALL','previously qualified original decision must still flow');
 assert.equal(final.probabilityOverride,false);
});
test('PC and mobile explain existing market waits; the first historical edge is evaluated without third-pivot waiting',()=>{
 const current=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 const pc=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const mobile=readFileSync(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 const review=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/causal-probability-review.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(current,/if\(pivots.length===2\)return /);
 for(const display of [pc,mobile]){
  assert.match(display,/AGUARDANDO 3ª VIRADA/);
  assert.match(display,/AGUARDANDO REVERSÃO/);
  assert.match(display,/MERCADO LATERAL/);
  assert.match(display,/AGUARDANDO COTAÇÃO/);
 }
 for(const code of [review,pc,mobile]){
  assert.doesNotMatch(code,/setTimeout\s*\(\s*.*regime|new WebSocket|new XMLHttpRequest/);
 }
});

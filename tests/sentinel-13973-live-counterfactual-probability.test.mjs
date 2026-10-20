import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
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
test('if broker payout is unavailable, no shadow score is treated as profitable',()=>{
 const audit=new CausalProbabilityReview();feed(audit);
 assert.equal(audit.summary(context,null).approved,false);
 assert.equal(audit.summary(context,.2).approved,false);
});
test('review is bounded, synchronous, and does not introduce a 30-second wait on individual quotes',()=>{
 const audit=new CausalProbabilityReview();
 const started=performance.now();
 for(let i=0;i<400;i++)audit.observe({context,now:anchor,quoteAt:anchor,price,
  quoteHistory:[{ts:anchor,price}],expiryMs:30000,original:candidate,estimate:prob,marketValid:true,payout:.8});
 assert.ok(performance.now()-started<500);
 assert.equal(audit.summary(context,.8).n,0);
});

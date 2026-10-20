import test from 'node:test';
import assert from 'node:assert/strict';
import {
  probabilityFeatures,fitProbability,callProbability,payoutDecision,
  verifyProbability,Probabilistic30s,cleanQuotes
} from '../sentinel-trading-lab/agent/src/core/probability-30s.mjs';
const origin=1792000000000;
const ticks=Array.from({length:190},(_,i)=>({ts:origin+i*1000,price:1.12+i*.000002+Math.sin(i*.3)*.000004}));
test('30s features use ONLY timestamps at or before the decision',()=>{
 const at=origin+180000;
 const baseline=probabilityFeatures(ticks,at);
 assert.equal(baseline.length,9);
 const poisoned=probabilityFeatures([...ticks,{ts:at+1000,price:20}],at);
 assert.deepEqual(poisoned,baseline);
 assert.equal(probabilityFeatures(ticks,origin+30_000),null);
});
test('invalid or sparse feed produces no feature and no trade',()=>{
 assert.equal(probabilityFeatures(ticks.filter((_,i)=>i%4===0),origin+180000),null);
 assert.equal(payoutDecision(null,.8).side,'AGUARDAR');
 assert.equal(payoutDecision(.8,null).side,'AGUARDAR');
});
test('economic threshold is direction symmetric at 80 percent payout',()=>{
 assert.equal(payoutDecision(.58,.8).side,'AGUARDAR');
 assert.equal(payoutDecision(.60,.8).side,'CALL');
 assert.equal(payoutDecision(.40,.8).side,'PUT');
 assert.ok(Math.abs(payoutDecision(.60,.8).breakEven-1/1.8)<1e-10);
});
test('logistic requires at least 160 settled outcomes and yields bounded probabilities',()=>{
 const samples=Array.from({length:200},(_,i)=>({t:origin+i*30000,dueAt:origin+(i+1)*30000,x:[i%2?2:-2,...Array(8).fill(0)],y:i%2}));
 assert.equal(fitProbability(samples.slice(0,159)),null);
 const model=fitProbability(samples);
 assert.ok(model);
 assert.ok(callProbability(model,[2,...Array(8).fill(0)])>.65);
 assert.ok(callProbability(model,[-2,...Array(8).fill(0)])<.35);
});
test('walk-forward requires three sessions and many economically qualified unseen decisions',()=>{
 const rows=Array.from({length:400},(_,i)=>{
  const t=origin+Math.floor(i/130)*86400000+(i%130)*30000;
  const x=[i%2?2:-2,...Array(8).fill(0)];
  return {t,dueAt:t+30000,x,y:i%2};
 });
 const score=verifyProbability(rows,.8);
 assert.equal(score.sessions,3);
 assert.equal(score.qualified,true);
 assert.ok(score.trades>=100);
 assert.ok(score.lower99>score.breakEven);
 assert.ok(score.brier<score.baselineBrier);
});
test('uninformative walk-forward cannot be authorized by payout rule',()=>{
 let state=341;
 const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 const rows=Array.from({length:440},(_,i)=>{
  const t=origin+Math.floor(i/140)*86400000+(i%140)*30000;
  return {t,dueAt:t+30000,x:[rand()*4-2,...Array(8).fill(0)],y:rand()>.5?1:0}
 });
 const out=verifyProbability(rows,.8);
 assert.equal(out.qualified,false);
});
test('live history collects a pending forward sample, never backlabels it immediately',()=>{
 const f=new Probabilistic30s();
 const o=f.observe({provider:'iq_option',asset:'EUR/USD',quotes:ticks,quoteAt:origin+189000,price:ticks.at(-1).price,now:origin+189000,payout:.8});
 assert.equal(o.decision.side,'AGUARDAR');
 assert.equal(o.samples,0);
 assert.ok(f.snapshot().contexts['iq_option|EUR/USD']);
 const restored=new Probabilistic30s(f.snapshot());
 assert.equal(restored.observe({provider:'iq_option',asset:'EUR/USD',quotes:ticks,quoteAt:origin+189000,price:ticks.at(-1).price,now:origin+189000,payout:.8}).decision.side,'AGUARDAR');
});
test('feed normalization retains valid final duplicate and ignores future timestamps',()=>{
 const q=cleanQuotes([{ts:origin,price:2},{ts:origin,price:3},{ts:origin+1000,price:999}],origin);
 assert.deepEqual(q,[{ts:origin,price:3}]);
});

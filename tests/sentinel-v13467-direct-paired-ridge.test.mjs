import test from 'node:test';
import assert from 'node:assert/strict';
import {entryRegimeFeatures} from '../sentinel-trading-lab/agent/src/core/vnext-residual-reversal-research.mjs';
import {directPairedForecast,progressDirectPairedStudy}
 from '../sentinel-trading-lab/agent/src/core/vnext-direct-paired-ridge-research.mjs';
const start=1800000000000;
const quotes=Array.from({length:1300},(_,i)=>({
 ts:start+i*1000,price:1.10+Math.sin(i/17)*.00007+i*.0000003
}));
const anchor=start+1199000;
const plan={
 side:'CALL',engineId:'automatic',asset:'EUR/USD OTC',delaySeconds:30,
 holdingSeconds:30,issuedAt:anchor,entryAt:anchor+30000,
 exitAt:anchor+60000,projectedEntryPrice:1.1000,
 projectedExitPrice:1.10004,actionable:false
};
const history=quotes.filter(q=>q.ts<=anchor);
test('research cannot mutate approved 67 or invent probability and is inert before settled examples',()=>{
 const original=structuredClone(plan);
 const result=progressDirectPairedStudy({basePlan:plan,quoteHistory:history,now:anchor});
 assert.deepEqual(plan,original);
 assert.equal(result.study.directSide,plan.side);
 assert.equal(result.study.correction,0);
 assert.equal(result.study.originalUntouched,true);
 assert.equal(result.study.researchOnly,true);
 assert.equal(result.study.actionable,false);
 assert.equal(result.pending.length,1);
 assert.equal(result.completed.length,0);
});
test('future quotes and outcomes never leak into learning before entry/expiry',()=>{
 const forecast=progressDirectPairedStudy({basePlan:plan,quoteHistory:history,now:anchor});
 const bad=[...history,{ts:anchor+30000,price:0.01},{ts:anchor+60000,price:150}];
 const same=progressDirectPairedStudy({basePlan:plan,quoteHistory:bad,now:anchor});
 assert.deepEqual(same.study,forecast.study);
 assert.deepEqual(same.pending,forecast.pending);
 const early=progressDirectPairedStudy({previous:forecast,basePlan:plan,
  quoteHistory:bad,now:anchor+59000});
 assert.equal(early.completed.length,0);
 assert.equal(early.pending.length,1);
 const onTime=progressDirectPairedStudy({previous:early,basePlan:plan,
  quoteHistory:bad,now:anchor+60000});
 assert.equal(onTime.completed.length,1);
 assert.ok(onTime.completed[0].actualLogReturn>0);
 const later=progressDirectPairedStudy({previous:onTime,basePlan:null,
  quoteHistory:bad,now:anchor+62000});
 assert.equal(later.completed.length,1);
});
test('stale entry or exit prints cannot create fabricated winning labels',()=>{
 const first=progressDirectPairedStudy({basePlan:plan,quoteHistory:history,now:anchor});
 const late=[...history,{ts:anchor+34000,price:.99},{ts:anchor+64000,price:1.5}];
 const next=progressDirectPairedStudy({previous:first,basePlan:null,
  quoteHistory:late,now:anchor+65000});
 assert.equal(next.completed.length,0);
 const out=progressDirectPairedStudy({previous:next,basePlan:null,
  quoteHistory:late,now:anchor+80000});
 assert.equal(out.pending.length,0);
 assert.equal(out.completed.length,0);
});
test('same motor and horizon learn past direct entry-to-expiry return without a cross-motor vote',()=>{
 const first=progressDirectPairedStudy({basePlan:plan,quoteHistory:history,now:anchor});
 const frame=first.pending[0];
 const settled=Array.from({length:42},(_,i)=>({
  ...frame,entryAt:anchor-120000-(i+1)*75000,
  exitAt:anchor-90000-(i+1)*75000,
  issuedAt:anchor-150000-(i+1)*75000,
  baseLogReturn:.00004,actualLogReturn:-.00022,
  issuedScale:.00010
 }));
 const learned=directPairedForecast({basePlan:plan,completed:settled,
  quoteHistory:history,now:anchor});
 assert.ok(learned.correction<0,JSON.stringify(learned));
 assert.ok(learned.independentExamples>=14);
 assert.equal(learned.originalUntouched,true);
 const alien=directPairedForecast({basePlan:plan,
  completed:settled.map(x=>({...x,engineId:'trend'})),
  quoteHistory:history,now:anchor});
 assert.equal(alien.correction,0);
 const unknown=directPairedForecast({basePlan:plan,
  completed:settled.map(x=>({...x,delaySeconds:60})),
  quoteHistory:history,now:anchor});
 assert.equal(unknown.correction,0);
});
test('feature windows follow expiry and do not access prices after issue time',()=>{
 const hs=[5,10,30,60,120,300];
 for(const h of hs){
  const original=entryRegimeFeatures(history,anchor,h);
  assert.ok(original,'unavailable feature for '+h);
  const poison=[...history,{ts:anchor+700,price:.001},{ts:anchor+10000,price:100}];
  assert.deepEqual(entryRegimeFeatures(poison,anchor,h),original);
  assert.equal(original.delaySeconds,h);
 }
});

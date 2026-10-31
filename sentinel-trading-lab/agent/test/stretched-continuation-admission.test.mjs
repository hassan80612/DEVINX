import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewStretchedContinuationEntry as review} from '../src/core/stretched-continuation-admission.mjs';

const T=1800000000000;
function tape({mirror=false,mode='stretched'}={}){
 const out=[];
 for(let i=0;i<=75;i++){
  let p;
  if(mode==='stretched')p=1+i*.000003+Math.max(0,i-55)*.000030;
  else if(mode==='flat-finish')p=1+Math.min(i,55)*.000014;
  else if(mode==='middle')p=1+(i<35?i*.000045:.001575-(i-35)*.000032)+
    Math.max(0,i-55)*.000022;
  else throw new Error('unknown fixture');
  const ts=T-(75-i)*1000;
  out.push({ts,price:mirror?2-p:p,receivedAt:ts});
 }
 return out;
}
function input({side='CALL',mode='stretched',reason='closed-structure-and-live-impulse',
  durationMs=60000,now=T,quoteHistory=tape({mirror:side==='PUT',mode})}={}){
 return {candidate:{ready:true,side,reason,observedAt:T},
   quoteHistory,quoteAt:T,now,price:quoteHistory.at(-1).price,durationMs};
}
test('reject late 20-second stretched 1m continuations at an observed extreme, CALL and PUT',()=>{
 for(const side of ['CALL','PUT']){
  const x=input({side}),out=review(x);
  assert.equal(out.ready,false);
  assert.equal(out.side,null);
  assert.equal(out.provisionalSide,side);
  assert.equal(out.entryRisk.kind,'causal-stretched-continuation');
  assert.equal(x.candidate.ready,true);
  assert.equal(out.entryRisk.details.durationMs,60000);
 }
});
test('an earlier movement that has stopped advancing is not deemed a new sprint',()=>{
 const x=input({mode:'flat-finish'});
 assert.equal(review(x),x.candidate);
});
test('do not veto the middle of a traded range solely because the last 20s moved',()=>{
 const x=input({mode:'middle'});
 assert.equal(review(x),x.candidate);
});
test('preserve all 30s and 5m candidates, including stretched extremes',()=>{
 for(const durationMs of [30000,300000]){
  const x=input({durationMs});
  assert.equal(review(x),x.candidate);
 }
});
test('preserve independently confirmed reversals at extremes; never flip a continuation',()=>{
 for(const reason of ['confirmed-level-structure-reversal','failed-breakout-structure-change']){
  const x=input({reason});
  assert.equal(review(x),x.candidate);
 }
 const x=input({});
 const out=review(x);
 assert.equal(out.side,null);
 assert.equal(out.provisionalSide,'CALL');
});
test('missing 60s history, stale quote, detached price and unavailable 20s anchor never veto',()=>{
 const x=input();
 for(const q of [
  {...x,quoteHistory:x.quoteHistory.slice(-42)},
  {...x,now:T+2000},
  {...x,price:x.price+.00001},
  {...x,quoteHistory:x.quoteHistory.filter(q=>q.ts!==T-20000&&q.ts!==T-21000&&q.ts!==T-22000&&q.ts!==T-23000)},
  {...x,quoteHistory:x.quoteHistory.map(q=>({...q,receivedAt:T+50}))}
 ])assert.equal(review(q),q.candidate);
});
test('future-received quotes cannot supply 60s range or fresh directional confirmation',()=>{
 const x=input(),q=x.quoteHistory.map((r,i)=>i<35?{...r,receivedAt:T+999}:r);
 assert.equal(review({...x,quoteHistory:q}),x.candidate);
});
test('the reviewer adds no time-based lock, network calls or new expiry state',()=>{
 const s=readFileSync(new URL('../src/core/stretched-continuation-admission.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/\bawait\b|setTimeout\s*\(|setInterval\s*\(|fetch\s*\(|broker\./);
 const runtime=readFileSync(new URL('../src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(runtime,/eligible=reviewStretchedContinuationEntry\(/);
 assert.match(runtime,/quoteAt:snap\.quoteTs,now,price:snap\.price,durationMs:settings\.orderDurationMs/);
});

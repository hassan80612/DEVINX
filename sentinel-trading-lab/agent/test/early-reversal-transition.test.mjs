import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewEarlyVerifiedTurn as review} from '../src/core/early-reversal-transition.mjs';
import {analyzeNowOpportunity} from '../src/core/now-opportunity-engine.mjs';
const T=1800000000000;
const forward=[.99902,.99918,.99940,.99962,.99985,1.00001,1.00010,
 1.00002,.99988,.99978,.99991,.99970,.99954];
const tape=(side='PUT',v=forward)=>v.map((p,i)=>({
 ts:T-(v.length-i-1)*1000,price:side==='PUT'?p:2-p,
 receivedAt:T-(v.length-i-1)*1000
}));
const level={level:1,low:.99985,high:1.00015,resistancePivots:2,supportPivots:2,
 resistanceRejections:2,supportRejections:2,independentTests:3,
 tests:[{age:20},{age:14}]};
const map={observedCandles:30,asOf:T-60000,tolerance:.0003,levels:[level]};
const candidate={ready:false,side:null,reason:'completed-structure-not-ready'};
function ctx({side='PUT',c=candidate,history=tape(side),m=map,ms=60000,now=T}={}){
 return {candidate:c,map:m,quoteHistory:history,price:history.at(-1).price,
   quoteAt:T,now,durationMs:ms};
}
test('1m confirms the FIRST lower high and micro-break at an old resistance, without three closed candles',()=>{
 const x=ctx(),copy=structuredClone(x.candidate),out=review(x);
 assert.equal(out.ready,true);assert.equal(out.side,'PUT');
 assert.equal(out.reason,'confirmed-level-structure-reversal');
 assert.equal(out.earlyTurnEvidence.withoutThreeClosedBars,true);
 assert.equal(out.priceStructure.confirmedReversal.microTurn.retest,.99991);
 assert.deepEqual(x.candidate,copy);
});
test('30s mirrored confirmed higher low can qualify before three completed bars',()=>{
 const x=ctx({side:'CALL',ms:30000}),out=review(x);
 assert.equal(out.ready,true);assert.equal(out.side,'CALL');
 assert.equal(out.entryPrice,x.price);
});
test('a qualified continuation is replaced only by independently observed old-level counterstructure',()=>{
 const original={ready:true,side:'CALL',observedAt:T,entryPrice:forward.at(-1),reason:'closed-structure-and-live-impulse'};
 const out=review(ctx({c:original}));
 assert.equal(out.ready,true);assert.equal(out.side,'PUT');
 assert.deepEqual(original,{ready:true,side:'CALL',observedAt:T,entryPrice:forward.at(-1),reason:'closed-structure-and-live-impulse'});
});
test('an existing confirmed reversal is unchanged',()=>{
 const c={ready:true,side:'CALL',reason:'confirmed-level-structure-reversal'};
 assert.equal(review(ctx({c})),c);
});
test('one-tick bounce, simple first reversal leg, and breakout through old resistance do not create orders',()=>{
 const noRetest=[.99902,.99918,.99940,.99962,.99985,1.00001,1.00010,
    1.00004,.99996,.99987,.99978,.99967,.99954];
 const oneTick=[.99902,.99918,.99940,.99962,.99985,1.00001,1.00010,
   1.00013,1.00016,1.00017,1.00012,1.00015,1.00008];
 const breakthrough=[.99902,.99918,.9994,.99962,.99985,1.00001,1.00030,
   1.00002,.99988,.99978,.99991,.99970,.99954];
 for(const rows of [noRetest,oneTick,breakthrough]){
  const x=ctx({history:tape('PUT',rows)});
  assert.equal(review(x),x.candidate);
 }
});
test('a zone without old role proof is not a valid reversal',()=>{
 for(const zone of [
  {...level,resistancePivots:0,resistanceRejections:0},
  {...level,independentTests:1},
  {...level,tests:[{age:3}]},
  {...level,resistancePivots:1,resistanceRejections:0}
 ]){
  const x=ctx({m:{...map,levels:[zone]}});
  assert.equal(review(x),x.candidate);
 }
});
test('5m is completely untouched; stale, future, incomplete and disconnected quotes do not qualify',()=>{
 const full=tape('PUT');
 for(const x of [
  ctx({ms:300000}),ctx({now:T+2100}),ctx({m:{...map,asOf:T+1000}}),
  ctx({m:{...map,observedCandles:10}}),
  ctx({history:full.slice(-7)}),
  ctx({history:full.map((x,i)=>i===10?{...x,receivedAt:T+5000}:x)}),
  ctx({history:full.map((x,i)=>i===5?{...x,ts:x.ts-4000}:x)})
 ])assert.equal(review(x),x.candidate);
});
test('continuations still require 3 of 4 fully closed bars; no expiry, polling or timer alterations',()=>{
 const core=readFileSync(new URL('../src/core/now-opportunity-engine.mjs',import.meta.url),'utf8');
 assert.match(core,/const bars=closingBars\(quotes,Number\(quoteAt\),barMs\)/);
 assert.match(core,/if\(aligned<3\)return waiting\('lateral-or-mixed-structure'\)/);
 assert.match(core,/reviewEarlyVerifiedTurn\(/);
 const src=readFileSync(new URL('../src/core/early-reversal-transition.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/setTimeout|setInterval|\bawait\b|fetch\(|broker\./);
});

test('the shared engine admits a first level micro-turn before its normal four-bar continuation can qualify',()=>{
 const base={quoteHistory:tape('PUT'),quoteAt:T,now:T,price:forward.at(-1),
   durationMs:60000,engineId:'automatic',entryFamily:'automatic'};
 const old=analyzeNowOpportunity({...base,qualityPolicy:'adaptive-market-v1'});
 assert.equal(old.ready,false);
 assert.equal(old.reason,'completed-structure-not-ready');
 const proven={...level,confirmedPivots:4,independentRejections:2,windows:[3,10,20]};
 const historic={...map,levels:[proven],
   windows:[3,10,20,50,100].map(size=>({size,available:size<=30,observed:Math.min(size,30),levels:[1]}))};
 const structure={asOf:T-60000,tolerance:.0003,atr:.0003,candleLevelMap:historic};
 const updated=analyzeNowOpportunity({...base,qualityPolicy:'adaptive-market-v17',
   structureCache:{get:()=>structure}});
 assert.equal(updated.ready,true);
 assert.equal(updated.side,'PUT');
 assert.equal(updated.reason,'confirmed-level-structure-reversal');
 assert.equal(updated.earlyTurnEvidence.withoutThreeClosedBars,true);
});

test('a deep retest with a weak three-second comeback is not promoted to an early reversal',()=>{
 const values=[.99902,.99918,.99940,.99962,.99985,1.00001,1.00010,
  1.00002,.99980,.99962,.99982,.99972,.99957];
 const h=tape('PUT',values);
 const historic={...map,levels:[{...level,level:.99988,low:.99975,high:1.00015}]};
 const x=ctx({history:h,m:historic});
 assert.equal(review(x),x.candidate);
 const alreadyConfirmed={ready:true,side:'PUT',reason:'confirmed-level-structure-reversal'};
 assert.equal(review({...x,candidate:alreadyConfirmed}),alreadyConfirmed);
});
test('the same retest with a genuine three-second break retains its first qualified entry',()=>{
 const values=[.99902,.99918,.99940,.99962,.99985,1.00001,1.00010,
  1.00002,.99980,.99962,.99982,.99972,.99939];
 const h=tape('PUT',values);
 const historic={...map,levels:[{...level,level:.99988,low:.99975,high:1.00015}]};
 for(const ms of [30000,60000]){
  const out=review(ctx({history:h,m:historic,ms}));
  assert.equal(out.ready,true,'expiry '+ms);
  assert.equal(out.side,'PUT');
  assert.equal(out.reason,'confirmed-level-structure-reversal');
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {causalForwardPath as baseline} from './fixtures/sentinel-1393-full-forecast.mjs';
import {causalForwardPath as candidate} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {rangePhaseMove as oldPhase} from './fixtures/sentinel-1393-range-phase.mjs';
import {rangePhaseMove as newPhase} from '../sentinel-trading-lab/agent/src/core/range-phase-trajectory-experimental.mjs';
const sign=x=>x>0?'CALL':x<0?'PUT':null;
const periodKinds=['range-40','range-55','range-70','range-85','irregular','chop','shifting','noise','up','down','taper-up','taper-down','turn-up','turn-down'];
function quotes(kind,n=1150,seed=1){
 let lp=Math.log(1.122),rows=[],last=0;
 const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296-.5};
 const period=kind.startsWith('range-')?Number(kind.slice(6)):kind==='irregular'?65:55;
 for(let i=0;i<n;i++){
  const w=(p)=>Math.sin(2*Math.PI*i/p);
  const noise=.0000025*Math.sin(i*1.83)+rng()*.000001;
  const trend=kind==='up'?.000005*i:kind==='down'?-.000005*i:
   kind==='taper-up'?.000006*Math.min(i,760)+.0000007*Math.max(0,i-760):
   kind==='taper-down'?-.000006*Math.min(i,760)-.0000007*Math.max(0,i-760):
   kind==='turn-up'?(i<700?-.000005*i:-.000005*700+.000009*(i-700)):
   kind==='turn-down'?(i<700?.000005*i:.000005*700-.000009*(i-700)):0;
  let wave=kind.startsWith('range-')?.00057*w(period):0;
  if(kind==='chop')wave=.0005*w(44)+.00029*w(26);
  if(kind==='irregular')wave=.00053*Math.sin(2*Math.PI*i/(70+8*Math.sin(i/170)))+.00013*w(29);
  if(kind==='shifting')wave=.00057*Math.sin(2*Math.PI*i/(i<710?52:86));
  if(kind==='noise')wave=.00025*w(13)+.00016*w(21)+.00009*w(31);
  if(kind.startsWith('taper'))wave+=.000016*w(78);
  if(kind==='up'||kind==='down')wave+=.000012*w(100);
  lp=Math.log(1.122)+trend+wave+noise;last=lp;
  rows.push({ts:1791500000000+i*1000,receivedAt:1791500000000+i*1000,price:Math.exp(lp)});
 }
 return rows;
}
function replay(kind,horizon=30,seed=1){
 const all=quotes(kind,1150,seed),summary={kind,horizon,seed,samples:0,baseCorrect:0,newCorrect:0,
  baselineMeanAbsLogError:0,newMeanAbsLogError:0,changed:0,rangeSamples:0,
  baselineRanged:0,trendChanged:0,upgraded:0,downgraded:0};
 for(let i=400;i+2*horizon<all.length;i+=16){
  const input={quoteHistory:all.slice(0,i+1),asOf:all[i].ts,holdingSeconds:horizon,maxSeconds:2*horizon};
  const old=baseline(input),next=candidate(input);
  if(old.status!=='causal-forward-path'||next.status!=='causal-forward-path')continue;
  const prices=[old,next].map(m=>[m.priceAt(horizon),m.priceAt(horizon*2)]);
  if(prices.flat().some(v=>!(v>0)))continue;
  const actual=sign(all[i+2*horizon].price-all[i+horizon].price);
  const sides=prices.map(x=>sign(x[1]-x[0]));
  summary.samples++;summary.baseCorrect+=Number(sides[0]===actual);
  summary.newCorrect+=Number(sides[1]===actual);
  const real=Math.log(all[i+2*horizon].price);
  summary.baselineMeanAbsLogError+=Math.abs(Math.log(prices[0][1])-real);
  summary.newMeanAbsLogError+=Math.abs(Math.log(prices[1][1])-real);
  if(sides[0]!==sides[1]){
   summary.changed++;
   if(sides[0]===actual)summary.downgraded++;
   else if(sides[1]===actual)summary.upgraded++;
  }
  summary.rangeSamples+=Number(next.regime==='range');
  summary.baselineRanged+=Number(old.regime==='range');
  if(next.regime!=='range'&&old.regime!=='range'&&
   (prices[0][0]!==prices[1][0]||prices[0][1]!==prices[1][1]))summary.trendChanged++;
 }
 summary.baselineMeanAbsLogError/=Math.max(1,summary.samples);
 summary.newMeanAbsLogError/=Math.max(1,summary.samples);
 return summary;
}
test('range curve stays zero displacement at present and finite throughout supported future horizons',()=>{
 const pts=Array.from({length:10},(_,i)=>.1+.0006*Math.sin(i*.8));
 for(const h of [0,5,15,30,60,120,180,300]){
  const v=newPhase({points:pts,horizonSeconds:h,baselineMove:0,sigma:.00011});
  assert.ok(Number.isFinite(v),h);
  assert.ok(Math.abs(v)<=.00011*Math.sqrt(Math.max(1,h))*2.4+1e-12,h);
 }
 assert.equal(newPhase({points:pts,horizonSeconds:0,baselineMove:0,sigma:.00011}),0);
});
test('measured effect of range-anchor adjustment on matched unseen future expiries',()=>{
 const names=periodKinds,results=names.flatMap(kind=>[15,30,60,120].map(h=>replay(kind,h,3)));
 console.log('[1394 PREVALIDATION matched synthetic, NOT broker win rate] '+JSON.stringify(results));
 for(const r of results){assert.ok(r.samples>=20,JSON.stringify(r));assert.equal(r.trendChanged,0,r.kind);}
 const lateral=results.filter(r=>['range-','irregular','chop','shifting','noise'].some(n=>r.kind.startsWith(n)));
 const trending=results.filter(r=>['up','down','taper','turn'].some(n=>r.kind.startsWith(n)));
 const tally=rows=>({samples:rows.reduce((a,x)=>a+x.samples,0),
  baselineCorrect:rows.reduce((a,x)=>a+x.baseCorrect,0),
  candidateCorrect:rows.reduce((a,x)=>a+x.newCorrect,0),
  changed:rows.reduce((a,x)=>a+x.changed,0),
  degraded:rows.reduce((a,x)=>a+x.downgraded,0),
  improved:rows.reduce((a,x)=>a+x.upgraded,0)});
 const summary={lateral:tally(lateral),trending:tally(trending)};
 console.log('[1394 ANCHOR SUMMARY] '+JSON.stringify(summary));
 assert.ok(summary.trending.samples>0);
});
test('actual recorded broker quote fixture covers only 180 seconds and cannot validate trade accuracy',async()=>{
 const {readFileSync}=await import('node:fs');
 const data=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url)));
 assert.equal(data.quoteHistory.length,180);
 console.log('[1394 DATA COVERAGE] '+JSON.stringify({quotes:180,seconds:179,representative:false,realSettlements:0}));
});

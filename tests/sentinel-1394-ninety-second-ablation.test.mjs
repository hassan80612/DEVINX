import test from 'node:test';
import assert from 'node:assert/strict';
import {causalForwardPath as production} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {causalForwardPath as without90s} from './fixtures/sentinel-1393-without-90s-detector.mjs';
import {readFileSync} from 'node:fs';
const T=1791500000000,sgn=x=>x>1e-13?'CALL':x< -1e-13?'PUT':null;
function series(kind,n,seed=1){
 let rng=seed;const random=()=>{rng=(1664525*rng+1013904223)>>>0;return rng/4294967296-.5};
 const out=[];
 for(let i=0;i<n;i++){
  const osc=(period,amp,phase=0)=>amp*Math.sin(2*Math.PI*i/period+phase);
  let p=0;
  if(kind==='range-44')p=osc(44,.00062);
  if(kind==='range-61')p=osc(61,.00062);
  if(kind==='range-82')p=osc(82,.00062);
  if(kind==='range-109')p=osc(109,.00062);
  if(kind==='range-150')p=osc(150,.00062);
  if(kind==='range-chop')p=osc(55,.0006)+osc(29,.00024);
  if(kind==='range-uneven')p=.00065*Math.sin(2*Math.PI*i/(68+15*Math.sin(i/120)))+osc(39,.0001);
  if(kind==='range-breakout')p=osc(78,.00055)+(i>820?.0000075*(i-820):0);
  if(kind==='range-degrading')p=osc(61,.00067)*Math.max(.24,1-(i-420)/750);
  if(kind==='up')p=.000005*i+osc(96,.000018);
  if(kind==='down')p=-.000005*i+osc(96,.000018);
  if(kind==='up-pullback')p=.000005*i+osc(120,.000065);
  if(kind==='down-pullback')p=-.000005*i+osc(120,.000065);
  if(kind==='true-reversal')p=i<830?.000006*i:.000006*830-.000011*(i-830);
  if(kind==='noise')p=osc(13,.00022)+osc(19,.00016)+osc(31,.00013);
  const price=Math.exp(Math.log(1.1)+p+osc(7,.000005)+random()*.000006);
  out.push({ts:T+i*1000,receivedAt:T+i*1000,price});
 }
 return out;
}
function compare(quotes,h){
 const result={evaluated:0,changed:0,qualified90:0,unchangedNonRange:0,
  oldCorrect:0,newCorrect:0,improved:0,degraded:0,upgraded:0,oldRange:0,newRange:0,sameNonRangePriceChanged:0,sameNonRangeDirectionChanged:0};
 for(let i=410;i+2*h<quotes.length;i+=15){
  const args={quoteHistory:quotes.slice(0,i+1),asOf:quotes[i].ts,holdingSeconds:h,maxSeconds:2*h};
  const a=without90s(args),b=production(args);
  if(a.status!=='causal-forward-path'||b.status!=='causal-forward-path')continue;
  const ap=[a.priceAt(h),a.priceAt(2*h)],bp=[b.priceAt(h),b.priceAt(2*h)];
  if(ap.concat(bp).some(x=>!(x>0)))continue;
  const observed=sgn(quotes[i+2*h].price-quotes[i+h].price);
  const oldSide=sgn(ap[1]-ap[0]),newSide=sgn(bp[1]-bp[0]);
  result.evaluated++;result.oldCorrect+=Number(oldSide===observed);
  result.newCorrect+=Number(newSide===observed);
  result.oldRange+=Number(a.regime==='range');
  result.newRange+=Number(b.regime==='range');
  if(a.regime!=='range'&&b.regime==='range')result.qualified90++;
  if(oldSide!==newSide){
   result.changed++;result.improved+=Number(newSide===observed);
   result.degraded+=Number(oldSide===observed);
  }
  if(a.regime===b.regime&&a.regime!=='range'){
   result.unchangedNonRange++;
   if(ap[0]!==bp[0]||ap[1]!==bp[1])result.sameNonRangePriceChanged++;
   if(oldSide!==newSide)result.sameNonRangeDirectionChanged++;
  }
 }
 return result;
}
test('90s detector ablation, one exact 13.9.3 model with and without its 90s classification',()=>{
 const kinds=['range-44','range-61','range-82','range-109','range-150','range-chop',
  'range-uneven','range-breakout','range-degrading','up','down','up-pullback',
  'down-pullback','true-reversal','noise'];
 const data=[];
 for(const kind of kinds)for(const h of [15,30,60,120]){
  const r=compare(series(kind,1300,kind.length*51),h);
  data.push({kind,h,...r});
 }
 const sum=items=>{
  const keys=['evaluated','changed','qualified90','unchangedNonRange','oldCorrect','newCorrect','improved','degraded','oldRange','newRange','sameNonRangePriceChanged','sameNonRangeDirectionChanged'];
  return Object.fromEntries(keys.map(k=>[k,items.reduce((x,v)=>x+v[k],0)]));
 };
 const ranges=data.filter(x=>x.kind.startsWith('range')||x.kind==='noise');
 const trends=data.filter(x=>!ranges.includes(x));
 console.log('[1393 ABLATION 90s matched SYNTHETIC breakdown] '+JSON.stringify(data));
 console.log('[1393 ABLATION 90s SYNTHETIC summary] '+JSON.stringify({ranges:sum(ranges),trends:sum(trends),all:sum(data)}));
 assert.ok(data.every(r=>r.evaluated>=20),JSON.stringify(data));
 assert.ok(sum(ranges).qualified90>0,'test must have oscillations newly recognized by 90s');
});
test('available recorded quote fixture cannot validate 90s utility, report coverage',()=>{
 const obj=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url)));
 const quotes=obj.quoteHistory;
 console.log('[1393 ABLATION available REAL fixture] '+JSON.stringify({quotes:quotes.length,
  spanSeconds:(quotes.at(-1).ts-quotes[0].ts)/1000,
  outcomeLabels:'unavailable',lengthEnoughForFutureWindows:false}));
 assert.ok(quotes.length>0);
});

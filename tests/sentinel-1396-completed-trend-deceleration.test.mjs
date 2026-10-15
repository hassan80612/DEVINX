import test from 'node:test';
import assert from 'node:assert/strict';
import {causalForwardPath as baseline} from './fixtures/sentinel-1395-forecast-frozen.mjs';
import {causalForwardPath as experiment} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {terminalTrendCurvature} from '../sentinel-trading-lab/agent/src/core/terminal-trend-curvature-1396.mjs';
const T=1791500000000,sign=x=>x>0?'CALL':x<0?'PUT':null;
const cases=['up-steady','down-steady','up-accelerating','down-accelerating',
 'up-taper-turn','down-taper-turn','up-taper-plateau','down-taper-plateau',
 'up-taper-resume','down-taper-resume','up-pullback','down-pullback',
 'range-60','range-mixed','chop','turn-shock'];
function quotes(kind,n=1120,seed=3){
 let value=Math.log(1.124),r=seed>>>0,rows=[];
 const rand=()=>{r=(Math.imul(1664525,r)+1013904223)>>>0;return r/2**32-.5;};
 const down=kind.startsWith('down-'),dir=down?-1:1;
 for(let i=0;i<n;i++){
  let v=0;
  if(kind==='up-steady'||kind==='down-steady')v=dir*.000007;
  if(kind.endsWith('accelerating'))v=dir*(.000004+i*.000000005);
  if(kind.includes('taper')){
   const length=kind.includes('resume')?48:39;
   if(i<625)v=dir*.000008;
   else if(i<790)v=dir*(.000008*Math.exp(-(i-625)/length));
   else v=dir*(kind.includes('turn')?-.000007:
    kind.includes('resume')?.000009:0);
  }
  if(kind.endsWith('pullback'))v=dir*(.000007+.000006*Math.sin(2*Math.PI*i/95));
  if(kind==='range-60'||kind==='range-mixed'||kind==='chop'){
    v=(kind==='range-60'?.000038*Math.sin(2*Math.PI*i/60):
      kind==='range-mixed'?.000035*Math.sin(2*Math.PI*i/75)+.000025*Math.sin(2*Math.PI*i/39):
      .000052*Math.sin(2*Math.PI*i/16));
  }
  if(kind==='turn-shock')v=i<730?.000007:-.000014;
  const noise=.000001*Math.sin(i*1.19+seed)+rand()*.0000009;
  value+=v+noise;
  const ts=T+i*1000;rows.push({ts,receivedAt:ts,price:Math.exp(value)});
 }
 return rows;
}
function shadowPrice(quotes,now,model,h){
 const original=model.priceAt(h);
 if(!(original>0))return original;
 const closed=Math.floor(now/10000)*10000,points=[];
 for(let k=9;k>=0;k--){
  const wall=closed-k*10000;
  const row=quotes.findLast(q=>q.ts<=wall);
  if(!row||wall-row.ts>3500)return original;
  points.push(Math.log(row.price));
 }
 const bars=points.slice(1).map((p,i)=>p-points[i]);
 const priorSign=Math.sign(points[6]-points[0]);
 const correction=terminalTrendCurvature({bars,priorSign,
  persistentTrend:model.trendContinuation,regime:model.regime,
  sigma:model.sigmaPerSqrtSecond,horizonSeconds:h});
 return original*Math.exp(correction);
}
function compare(kind,h,seed){
 const all=quotes(kind,1120,seed),r={kind,h,seed,samples:0,
   baselineCorrect:0,newCorrect:0,baselineWrong:0,newWrong:0,draws:0,
   changed:0,improved:0,degraded:0,unchangedStrong:0,changedStrong:0,
   lateStageCases:0,lateChanged:0,oldRange:0,newRange:0};
 for(let i=420;i+2*h<all.length;i+=12){
  const args={quoteHistory:all.slice(0,i+1),asOf:all[i].ts,holdingSeconds:h,maxSeconds:h*2};
  const a=baseline(args),b=experiment(args);
  if(a.status!=='causal-forward-path'||b.status!=='causal-forward-path')continue;
  const values=[[a.priceAt(h),a.priceAt(2*h)],
   [shadowPrice(args.quoteHistory,args.asOf,b,h),
    shadowPrice(args.quoteHistory,args.asOf,b,2*h)]];
  if(values.flat().some(x=>!(x>0)))continue;
  const actual=sign(all[i+2*h].price-all[i+h].price);
  if(!actual){r.draws++;continue;}
  const aSide=sign(values[0][1]-values[0][0]);
  const bSide=sign(values[1][1]-values[1][0]);
  r.samples++;r.baselineCorrect+=Number(aSide===actual);
  r.newCorrect+=Number(bSide===actual);
  r.baselineWrong+=Number(aSide!==actual);
  r.newWrong+=Number(bSide!==actual);
  if(aSide!==bSide){
   r.changed++;r.improved+=Number(bSide===actual);r.degraded+=Number(aSide===actual);
  }
  if(a.regime==='range')r.oldRange++;
  if(b.regime==='range')r.newRange++;
  if(a.trendContinuation&&a.streakStage?.lateRisk<.05&&!kind.includes('taper')){
   r.unchangedStrong++;
   if(values[0][0]!==values[1][0]||values[0][1]!==values[1][1])r.changedStrong++;
  }
  if(kind.includes('taper')&&i>=620&&i<=820){r.lateStageCases++;
   if(aSide!==bSide)r.lateChanged++;}
  if(a.regime==='range'||a.regime==='reversal'){
   assert.deepEqual(values[0],values[1],'no change outside trend '+JSON.stringify({kind,i,h}));
  }
 }
 return r;
}
test('pure curvature has no effect on continuous stable bars and never reads future quotes',()=>{
 for(const dir of [-1,1])for(const h of [15,30,60,120]){
  const b=[.00008,.00008,.00008].map(x=>dir*x);
  assert.equal(terminalTrendCurvature({bars:b,persistentTrend:true,regime:'trend',
   priorSign:dir,sigma:.000005,horizonSeconds:h}),0);
  assert.equal(terminalTrendCurvature({bars:[.00009,.00006,.000035].map(x=>dir*x),
   persistentTrend:false,regime:'trend',priorSign:dir,sigma:.000005,horizonSeconds:h}),0);
 }
});
test('matched settlement comparison: 13.9.5 versus closed-trend deceleration candidate',()=>{
 const results=cases.flatMap(kind=>[15,30,60,120].flatMap(h=>[2,9].map(seed=>compare(kind,h,seed))));
 console.log('[1396 TREND matched simulated kind/horizon] '+JSON.stringify(results));
 const sum=ar=>['samples','baselineCorrect','newCorrect','changed','improved','degraded',
   'unchangedStrong','changedStrong','lateStageCases','lateChanged']
 .reduce((a,k)=>(a[k]=ar.reduce((s,row)=>s+row[k],0),a),{});
 const trend=results.filter(x=>x.kind.endsWith('steady')||x.kind.endsWith('accelerating'));
 const ending=results.filter(x=>x.kind.includes('taper-turn')||x.kind.includes('taper-plateau'));
 const resumes=results.filter(x=>x.kind.includes('taper-resume'));
 const other=results.filter(x=>!trend.includes(x)&&!ending.includes(x)&&!resumes.includes(x));
 console.log('[1396 TREND synthetic summaries] '+JSON.stringify({
  strong:sum(trend),ending:sum(ending),resumeRisk:sum(resumes),other:sum(other),all:sum(results)}));
 assert.ok(results.every(x=>x.samples>=20),JSON.stringify(results.filter(x=>x.samples<20)));
 assert.ok(sum(trend).samples>100);
 assert.equal(sum(trend).changedStrong,0,'must preserve unchanged confident trends');
});

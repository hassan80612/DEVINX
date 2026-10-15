import test from 'node:test';
import assert from 'node:assert/strict';
import {causalForwardPath as with90s} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {causalForwardPath as without90s} from './fixtures/sentinel-1395-forecast-without-90s.mjs';
const T=1791500000000,side=d=>d>0?'CALL':d<0?'PUT':null;
const kinds=['phase-shift','variable-period','drifting-center','range-breakout',
 'breakout-fake','amplitude-decay','amplitude-boost','triangle-skew',
 'trend-range','range-trend','bursts','resuming-up','resuming-down'];
const seeds=[1,4,13];
function data(kind,seed=1,n=1240){
 const out=[];let s=seed>>>0;
 const rand=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/2**32-.5};
 const sin=(p,amp,phase=0,i=0)=>amp*Math.sin(i*2*Math.PI/p+phase);
 let accumulated=0;
 for(let i=0;i<n;i++){
  const shock=i>770,post=i-770;
  let p=0;
  if(kind==='phase-shift')p=sin(shock?85:62,.00058,shock?2.1:0,i);
  if(kind==='variable-period')p=.00058*Math.sin(2*Math.PI*i/(67+15*Math.sin(i/150)));
  if(kind==='drifting-center')p=sin(67,.00056,0,i)+i*.0000008;
  if(kind==='range-breakout')p=sin(62,.00060,0,i)+Math.max(0,post)*.0000045;
  if(kind==='breakout-fake')p=sin(67,.00062,0,i)+
    (shock?Math.max(0,1-Math.abs(post-35)/35)*.00065:0);
  if(kind==='amplitude-decay')p=sin(65,.00066*(shock?.35:1),0,i);
  if(kind==='amplitude-boost')p=sin(65,.00034*(shock?2.4:1),0,i);
  if(kind==='triangle-skew')p=.00066*(2/Math.PI)*Math.asin(Math.sin(i*2*Math.PI/(shock?69:55)));
  if(kind==='trend-range')p=shock?770*.0000045+sin(68,.00056,0,post):i*.0000045;
  if(kind==='range-trend')p=shock?sin(65,.0006,0,770)+post*.0000045:sin(65,.0006,0,i);
  if(kind==='bursts')p=sin(73,.00045,0,i)+(Math.sin(i*2*Math.PI/19)>0?.00014:-.00014);
  if(kind==='resuming-up'||kind==='resuming-down'){
   const dir=kind==='resuming-up'?1:-1;
   p=dir*(i*.000004+sin(80,.00005,0,i)+(shock?post*.000003:0));
  }
  accumulated=p+(rand()-.5)*.000008;
  const ts=T+i*1000;out.push({ts,receivedAt:ts,price:1.14*Math.exp(accumulated)});
 }
 return out;
}
function replay(kind,h,seed){
 const q=data(kind,seed);
 const r={kind,h,seed,total:0,baseCorrect:0,newCorrect:0,changed:0,
  improved:0,degraded:0,newRanges:0,transitionSamples:0,transitionChanged:0,
  transitionImproved:0,transitionDegraded:0,unchangedStrong:0,changedStrong:0};
 for(let i=420;i+2*h<q.length;i+=14){
  const args={quoteHistory:q.slice(0,i+1),asOf:q[i].ts,
   holdingSeconds:h,maxSeconds:2*h};
  const base=without90s(args),next=with90s(args);
  if(base.status!=='causal-forward-path'||next.status!=='causal-forward-path')continue;
  const p=[base,next].map(m=>[m.priceAt(h),m.priceAt(2*h)]);
  if(p.flat().some(x=>!(x>0)))continue;
  const actual=side(q[i+2*h].price-q[i+h].price);
  if(!actual)continue;
  const a=side(p[0][1]-p[0][0]),b=side(p[1][1]-p[1][0]);
  r.total++;r.baseCorrect+=Number(a===actual);r.newCorrect+=Number(b===actual);
  const changed=a!==b;
  const transition=i>=690&&i<=880;
  r.changed+=Number(changed);r.improved+=Number(changed&&b===actual);
  r.degraded+=Number(changed&&a===actual);
  r.newRanges+=Number(base.regime!=='range'&&next.regime==='range');
  r.transitionSamples+=Number(transition);
  r.transitionChanged+=Number(transition&&changed);
  r.transitionImproved+=Number(transition&&changed&&b===actual);
  r.transitionDegraded+=Number(transition&&changed&&a===actual);
  if(base.trendContinuation&&next.trendContinuation){
   r.unchangedStrong++;
   r.changedStrong+=Number(changed);
  }
 }
 return r;
}
test('90s effect specifically across changing oscillation periods and breakouts',()=>{
 const all=kinds.flatMap(kind=>[15,30,60,120].flatMap(h=>seeds.map(seed=>replay(kind,h,seed))));
 const totals=x=>['total','baseCorrect','newCorrect','changed','improved','degraded',
  'newRanges','transitionSamples','transitionChanged','transitionImproved',
  'transitionDegraded','unchangedStrong','changedStrong']
  .reduce((a,k)=>(a[k]=x.reduce((s,r)=>s+r[k],0),a),{});
 const classes={
  irregular:all.filter(x=>!['resuming-up','resuming-down'].includes(x.kind)),
  trends:all.filter(x=>['resuming-up','resuming-down'].includes(x.kind))
 };
 console.log('[1396 IRREGULAR 90s ablation summaries] '+JSON.stringify({
  irregular:totals(classes.irregular),trends:totals(classes.trends),all:totals(all),
  byKind:kinds.map(kind=>({kind,...totals(all.filter(x=>x.kind===kind))}))}));
 assert.ok(all.every(x=>x.total>=20),JSON.stringify(all.filter(x=>x.total<20)));
});

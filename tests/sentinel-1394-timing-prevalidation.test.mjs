import test from 'node:test';
import assert from 'node:assert/strict';
import {causalForwardPath} from './fixtures/sentinel-1393-full-forecast.mjs';
import {planEntryWindow} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
import {coherentInterval,observedNoise} from '../sentinel-trading-lab/agent/src/core/forward-direction-quality.mjs';
const T=1791500000000,side=x=>x>0?'CALL':x<0?'PUT':null;
function quotes(kind,count=1150){
 const rows=[];let p=0;
 for(let i=0;i<count;i++){
  const wave=(period,amplitude)=>amplitude*Math.sin(i*2*Math.PI/period);
  if(kind==='up')p=.000005*i+wave(101,.000018);
  if(kind==='down')p=-.000005*i+wave(101,.000018);
  if(kind==='late-up')p=.000007*Math.min(i,770)+.0000004*Math.max(0,i-770)+wave(66,.000025);
  if(kind==='late-down')p=-.000007*Math.min(i,770)-.0000004*Math.max(0,i-770)+wave(66,.000025);
  if(kind==='range')p=wave(62,.0006);
  if(kind==='oscillation')p=wave(51,.00055)+wave(33,.00016);
  if(kind==='reversal')p=i<690?i*.000005:690*.000005-(i-690)*.000008;
  const ts=T+i*1000;
  rows.push({ts,receivedAt:ts,price:1.1*Math.exp(p+.000002*Math.sin(i*1.19))});
 }
 return rows;
}
function analyze(kind,holdingSeconds){
 const all=quotes(kind),s={kind,holdingSeconds,samples:0,
  oldValid:0,newValid:0,oldWins:0,newWins:0,oldLeadTotal:0,newLeadTotal:0,
  earlier:0,later:0,changedSide:0};
 for(let i=400;i+holdingSeconds+70<all.length;i+=16){
  const history=all.slice(0,i+1),now=all[i].ts;
  const path=causalForwardPath({quoteHistory:history,asOf:now,
   holdingSeconds,maxSeconds:holdingSeconds+60});
  if(path.status!=='causal-forward-path')continue;
  const noise=observedNoise({quotes:history,now,horizonSeconds:holdingSeconds});
  const evaluateLead=t=>{
   const entry=path.priceAt(t),exit=path.priceAt(t+holdingSeconds);
   const check=coherentInterval({entryPrice:entry,exitPrice:exit,noise,noiseFraction:.35});
   if(!check.qualified)return null;
   return {side:check.side,projectedEntryPrice:entry,projectedExitPrice:exit,
    selectionStrength:Math.min(3,Math.abs(check.relativeMove)/Math.max(noise||1e-12,1e-12))};
  };
  const plan=planEntryWindow({windowSeconds:30,holdingSeconds,now,evaluateLead});
  if(!plan.side)continue;
  const oldT=plan.entryOffsetSeconds;
  // Offline candidate only. Does NOT change deployed or experimental
  // scheduling. Compare adjacent 1s offsets against the locked side.
  let best={t:oldT,...evaluateLead(oldT)};
  const score=c=>c.selectionStrength-.018*c.t/30;
  for(const t of [oldT-2,oldT-1,oldT+1,oldT+2]){
   if(t<1||t>30)continue;
   const c=evaluateLead(t);
   if(!c||c.side!==plan.side)continue;
   const alternative={t,...c};
   if(score(alternative)>score(best)+.035)best=alternative;
  }
  const actual=x=>side(all[i+x+holdingSeconds].price-all[i+x].price);
  s.samples++;s.oldValid++;s.newValid++;
  s.oldWins+=Number(actual(oldT)===plan.side);
  s.newWins+=Number(actual(best.t)===plan.side);
  s.oldLeadTotal+=oldT;s.newLeadTotal+=best.t;
  s.earlier+=Number(best.t<oldT);s.later+=Number(best.t>oldT);
  s.changedSide+=Number(best.side!==plan.side);
 }
 return s;
}
test('offline local entry-second optimization vs original planner, no production scheduling changed',()=>{
 const kinds=['up','down','late-up','late-down','range','oscillation','reversal'];
 const rows=kinds.flatMap(kind=>[15,30,60].map(h=>analyze(kind,h)));
 console.log('[1394 TIMING matched SYNTHETIC entry-to-expiry] '+JSON.stringify(rows));
 assert.ok(rows.every(x=>x.samples>=10),JSON.stringify(rows));
 assert.ok(rows.every(x=>x.changedSide===0));
 const trends=rows.filter(x=>['up','down','late-up','late-down'].includes(x.kind));
 console.log('[1394 TIMING SUMMARY] '+JSON.stringify({
  samples:rows.reduce((a,x)=>a+x.samples,0),
  oldWins:rows.reduce((a,x)=>a+x.oldWins,0),
  newWins:rows.reduce((a,x)=>a+x.newWins,0),
  changedEntry:rows.reduce((a,x)=>a+x.earlier+x.later,0),
  trendOldWins:trends.reduce((a,x)=>a+x.oldWins,0),
  trendNewWins:trends.reduce((a,x)=>a+x.newWins,0)
 }));
});

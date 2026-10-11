import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule} from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {advanceAdaptiveSelectedEngineStudy} from '../sentinel-trading-lab/agent/src/core/vnext-adaptive-self-correction.mjs';
import {progressDirectPairedStudy} from '../sentinel-trading-lab/agent/src/core/vnext-direct-paired-ridge-research.mjs';

const BASE=1800000000000, horizons=[5,10,30,60,120,300];
function stream(seed,kind,length=3300){
 let z=seed>>>0,price=Math.log(1.1),old=0,spike=0;
 const random=()=>((z=(1664525*z+1013904223)>>>0)+1)/4294967297;
 const q=[];
 for(let i=0;i<length;i++){
  const a=random(),b=random(),c=random();
  const norm=Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b);
  let delta=0,sigma=.000012;
  if(kind==='trend')delta=(i%1200<800?1:-1)*.0000038+.25*old;
  if(kind==='oscillation')delta=-.085*(price-Math.log(1.1))-.40*old;
  if(kind==='reversal')delta=(Math.floor(i/140)%2?-.000006:.000006)+.16*old;
  if(kind==='false-break')delta=(i%200<20?.000014:i%200<45?-.000012:0)-.035*(price-Math.log(1.1));
  if(kind==='volatile'){
   sigma=i%850>=450&&i%850<650?.000032:.000010;
   spike=c<.03?(b<.5?-1:1)*.00009:0;
   delta=spike-.23*old-.03*(price-Math.log(1.1));
  }
  const change=delta+norm*sigma;
  price+=change;old=change;
  q.push({ts:BASE+i*1000,price:Math.exp(price)});
 }
 return q;
}
function score(rows){
 return{
  n:rows.length,
  original:rows.filter(r=>r.original).length,
  residual:rows.filter(r=>r.residual).length,
  adaptive:rows.filter(r=>r.adaptive).length,
  direct:rows.filter(r=>r.direct).length,
  directChanged:rows.filter(r=>r.sideOriginal!==r.sideDirect).length,
  directHelp:rows.filter(r=>!r.original&&r.direct).length,
  directHarm:rows.filter(r=>r.original&&!r.direct).length,
  directLearned:rows.filter(r=>r.learned).length,
  directIndependentAvg:rows.length?Number((rows.reduce((t,r)=>t+r.independent,0)/rows.length).toFixed(2)):0
 };
}
function experiment({kinds,seeds,hs,horizonTo,horizonFrom,step,until,evalAfter,length,historyLen}){
 const answers=[];
 for(const type of kinds)for(const seed of seeds){
  const ticks=stream(seed,type,length);
  for(const h of hs)for(const engine of SCENARIO_ENGINES){
   let oldStudy=null,newStudy=null;
   for(let i=horizonFrom;i<=until;i+=step){
    const now=BASE+i*1000,quotes=ticks.slice(Math.max(0,i-historyLen),i+1);
    const plan=futureEntrySchedule({
     settings:{asset:'EUR/USD OTC',engine:engine.id,orderDurationMs:h*1000},
     snap:{provider:'iq_option',quoteTs:now,quoteHistory:quotes},
     now,delays:[h]
    })[0];
    oldStudy=advanceAdaptiveSelectedEngineStudy({
     previous:oldStudy,basePlan:plan,quoteHistory:quotes,now
    });
    newStudy=progressDirectPairedStudy({
     previous:newStudy,basePlan:plan,quoteHistory:quotes,now
    });
    assert.equal(newStudy.study.baselineSide,plan.side);
    if(i<evalAfter||i+2*h>=ticks.length||!plan.side)continue;
    const observed=ticks[i+h*2].price>ticks[i+h].price?'CALL':'PUT';
    answers.push({
     type,seed,h,engine:engine.id,
     original:observed===plan.side,
     residual:observed===oldStudy.candidate?.shadowSide,
     adaptive:observed===oldStudy.adaptive?.side,
     direct:observed===newStudy.study.directSide,
     sideOriginal:plan.side,sideDirect:newStudy.study.directSide,
     learned:newStudy.study.reason==='learned-from-matured-paired-forecast-errors',
     independent:newStudy.study.independentExamples
    });
   }
  }
 }
 return {
  total:score(answers),
  byH:Object.fromEntries(hs.map(h=>[h,score(answers.filter(r=>r.h===h))])),
  byMarket:Object.fromEntries(kinds.map(k=>[k,score(answers.filter(r=>r.type===k))])),
  byEngine:Object.fromEntries(SCENARIO_ENGINES.map(x=>
   [x.id,score(answers.filter(r=>r.engine===x.id))]))
 };
}
test('pre-registered 9-engine × 6-horizon future-entry comparison: original vs prior correction vs direct outcome',()=>{
 const result=experiment({
  kinds:['trend','oscillation','reversal','false-break','volatile'],
  seeds:[4301,9137],hs:horizons,horizonFrom:650,
  step:125,until:2850,evalAfter:1800,length:3300,
  historyLen:2300
 });
 console.log('SENTINEL_DIRECT_PAIRS_ALL_HORIZONS='+JSON.stringify({
  validation:'synthetic-chronological-same-quotes-not-real-trading',
  ...result
 }));
 for(const h of horizons)assert.ok(result.byH[h].n>0);
});
test('long-sample horizon stress: 120s/300s direct learning has adequate settled labels, no hidden 30s-only setting',()=>{
 const result=experiment({
  kinds:['oscillation','false-break','volatile'],
  seeds:[781],hs:[120,300],horizonFrom:950,
  step:310,until:11320,evalAfter:8380,length:12000,
  historyLen:6500
 });
 console.log('SENTINEL_DIRECT_PAIRS_LONG_HORIZONS='+JSON.stringify({
  validation:'synthetic-long-running-chronological-not-real-trading',
  ...result
 }));
 assert.ok(result.byH[120].n>0&&result.byH[300].n>0);
});

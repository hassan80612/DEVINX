import test from 'node:test';
import assert from 'node:assert/strict';
import {singleEngineForecast as baseline70} from '../baseline70/sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {selectedForecast as latest76} from '../sentinel-trading-lab/agent/src/core/unified-strategy-forecast.mjs';
import {singleEngineForecast as old67Specialist} from '../sentinel-trading-lab/agent/src/core/research-baseline-13467/vnext-single-engine.mjs';
import {SCENARIO_ENGINES} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {PAIR_STRATEGIES} from '../sentinel-trading-lab/agent/src/core/pair-strategy-catalog.mjs';
import {DemoTradingRuntime as Runtime70} from '../baseline70/sentinel-trading-lab/agent/src/core/runtime.mjs';
import {DemoTradingRuntime as Runtime76} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

const MODES=['trend','range','cycle','reversal','false_breakout','breakout','volatility','random'];
const SEEDS=[12013,13579,14621,15767,19001], HORIZONS=[30,60,180,300], ISSUES=[1750,2820];
const START=1800000000000;
function make(seed,kind,len=3500){
 let state=seed>>>0,p=Math.log(1.1),last=0,start=p,side=1;
 const u=()=>((state=(1664525*state+1013904223)>>>0)+1)/4294967297;
 const points=[];
 for(let i=0;i<len;i++){
  const a=u(),b=u(),c=u(),d=Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b);
  let delta=d*.000011;
  if(kind==='trend')delta+=(i%1400<850?.000006:-.000005)+.24*last;
  if(kind==='range')delta+=-.09*(p-start)-.25*last;
  if(kind==='cycle'){
   const period=72+seed%53;
   const level=x=>.0007*Math.sin(2*Math.PI*x/period+.2*seed)+.00019*Math.sin(2*Math.PI*x/(period*.43));
   delta+=level(i)-level(i-1);
  }
  if(kind==='reversal')delta+=(Math.floor(i/175)%2?.000006:-.000006)+.13*last;
  if(kind==='false_breakout')delta+=(i%240<24?.000014:i%240<70?-.000013:0)-.04*(p-start);
  if(kind==='breakout')delta+=(i%415<85?.0000003:i%415<178?.000007:0)+.13*last;
  if(kind==='volatility')delta+=d*((i%680>240&&i%680<490)?.000023:.000002)+
   (c<.022?(b<.5?-.00008:.00008):0)-.28*last-.015*(p-start);
  if(kind==='random')delta+=d*.000005;
  p+=delta;last=delta;
  points.push({ts:START+i*1000,price:Math.exp(p)});
 }
 return points;
}
const metric=()=>({sent:0,correct:0,miss:0,errorSum:0,coverage:0});
const pct=(yes,total)=>total?Number((100*yes/total).toFixed(2)):null;
const mean=(sum,total)=>total?Number((sum/total).toFixed(3)):null;
function record(state,r,actual,ref){
 const receipt=r?.receipt;
 if(!receipt||!['CALL','PUT'].includes(receipt.side)){state.miss++;return false}
 state.sent++;
 const truth=actual>ref?'CALL':actual<ref?'PUT':'DRAW';
 if(receipt.side===truth)state.correct++;
 state.errorSum+=Math.abs(Math.log(Number(receipt.projectedPrice)/actual))*10000;
 return true;
}
function report(state,total){return {sent:state.sent,coveragePct:pct(state.sent,total),hitPct:pct(state.correct,state.sent),
 maePriceBasisPoints:mean(state.errorSum,state.sent),waitPct:pct(total-state.sent,total)}}
const fmt=x=>Math.round(x*1e10)/1e10;
test('13.4.70 versus 13.4.76: same unseen synthetic quote histories, direct model output, exact expiry and paired-subset comparison',()=>{
 const all=Object.fromEntries(HORIZONS.map(h=>[h,{n:0,models:Object.fromEntries(SCENARIO_ENGINES.map(x=>[x.id,{old:metric(),latest:metric(),mismatch:0}])) ,
 pairs:Object.fromEntries(PAIR_STRATEGIES.map(p=>[p.id,{out:metric(),baseAutoSubset:metric(),baseFirstSubset:metric(),first:metric(),second:metric(),opposite:0}]))}]));
 const regimes={},secondsSpent=Date.now();let noLeakChecked=0;
 for(const kind of MODES){
  const reg=regimes[kind]={};
  for(const h of HORIZONS)reg[h]={n:0,baselineAuto:metric(),latestAuto:metric(),
    pairs:Object.fromEntries(PAIR_STRATEGIES.map(p=>[p.id,{out:metric(),baselineAutoCovered:metric()}]))};
  for(const seed of SEEDS){
   const ticks=make(seed,kind);
   for(const index of ISSUES){
    const now=ticks[index].ts;
    const history=ticks.slice(Math.max(0,index-2300),index+1);
    const snap={quoteHistory:history,quoteTs:now,price:ticks[index].price,
      provider:'iq_option',instrument:'EUR/USD OTC',analysisFeedValidated:true};
    for(const h of HORIZONS){
     const cfg={engine:'automatic',orderDurationMs:h*1000,asset:'EUR/USD OTC'};
     const stat=all[h],regstat=reg[h];
     const actual=ticks[index+h].price,reference=ticks[index].price;
     stat.n++;regstat.n++;
     const old={},latest={};
     for(const engine of SCENARIO_ENGINES){
      const settings={...cfg,engine:engine.id};
      const a=baseline70({settings,snap,now,provider:snap.provider});
      const b=latest76({settings,snap,now,provider:snap.provider});
      old[engine.id]=a;latest[engine.id]=b;
      const z=stat.models[engine.id];
      if(JSON.stringify(a.receipt)!==JSON.stringify(b.receipt))z.mismatch++;
      record(z.old,a,actual,reference);
      record(z.latest,b,actual,reference);
      assert.equal(b.engineId,engine.id);
      if(b.receipt){
       assert.equal(b.receipt.targetAt,now+h*1000);
       assert.equal(b.receipt.expirySeconds,h);
       assert.equal(b.receipt.issuedAt,now);
      }
     }
     record(regstat.baselineAuto,old.automatic,actual,reference);
     record(regstat.latestAuto,latest.automatic,actual,reference);
     for(const pair of PAIR_STRATEGIES){
      const p=latest76({settings:{...cfg,engine:pair.id},snap,now,provider:snap.provider});
      assert.equal(p.engineId,pair.id);
      const q=stat.pairs[pair.id],qR=regstat.pairs[pair.id];
      const member=(n)=>pair.versions[n]===67?old67Specialist({
       settings:{...cfg,engine:pair.engines[n]},snap,now,provider:snap.provider
      }):latest[pair.engines[n]];
      const first=member(0),second=member(1);
      record(q.first,first,actual,reference);
      record(q.second,second,actual,reference);
      const base70=old.automatic;
      if(p.receipt){
       assert.equal(p.receipt.issuedAt,now);
       assert.equal(p.receipt.targetAt,now+h*1000);
       assert.ok(first.receipt&&second.receipt);
       assert.equal(p.receipt.side,first.receipt.side);
       assert.equal(p.receipt.side,second.receipt.side);
       record(q.baseAutoSubset,base70,actual,reference);
       record(q.baseFirstSubset,first,actual,reference);
       record(qR.baselineAutoCovered,base70,actual,reference);
      }else{
       assert.ok(p.computedStatus==='pair-disagreement'||p.computedStatus==='pair-estimate-unavailable');
       q.opposite+=Number(first.receipt?.side!==second.receipt?.side);
      }
      record(q.out,p,actual,reference);
      record(qR.out,p,actual,reference);
     }
     if(noLeakChecked<12){
      const future={ts:now+5000,price:0.000001};
      const chosen=PAIR_STRATEGIES[noLeakChecked%3].id;
      const setting={...cfg,engine:chosen};
      const before=latest76({settings:setting,snap,now}).receipt;
      const after=latest76({settings:setting,snap:{...snap,quoteHistory:[...history,future]},now}).receipt;
      assert.deepEqual(before,after,'No future quote may influence the issued projection');
      noLeakChecked++;
     }
    }
   }
  }
 }
 const summary={method:'same unseen synthetic 1-second streams, no broker, not profit or observed win rate',
  versions:['13.4.70','13.4.76'],scenarios:Object.values(all).reduce((n,v)=>n+v.n,0),
  pairedUse13_4_67Specialists:true,forecastModelsSameSource:true,
  horizons:Object.fromEntries(Object.entries(all).map(([h,z])=>[h,{
    n:z.n,
    auto70:report(z.models.automatic.old,z.n),
    auto76:report(z.models.automatic.latest,z.n),
    engines:Object.fromEntries(Object.entries(z.models).map(([engine,v])=>[engine,{
      base70:report(v.old,z.n),current76:report(v.latest,z.n),outputMismatches:v.mismatch}])),
    pairs:Object.fromEntries(Object.entries(z.pairs).map(([name,v])=>[name,{
      new76:report(v.out,z.n),old70AutoSameTimes:report(v.baseAutoSubset,v.out.sent),
      firstIndividualSameTimes:report(v.baseFirstSubset,v.out.sent),
      firstOverall:report(v.first,z.n),secondOverall:report(v.second,z.n),
      disagreementCount:z.n-v.out.sent,opposingDirections:v.opposite
    }]))
  }])),
  regimes:Object.fromEntries(Object.entries(regimes).map(([name,horiz])=>[name,
    Object.fromEntries(Object.entries(horiz).map(([h,v])=>[h,{
      n:v.n,auto70:report(v.baselineAuto,v.n),auto76:report(v.latestAuto,v.n),
      pairs:Object.fromEntries(Object.entries(v.pairs).map(([name,p])=>[name,{
        new76:report(p.out,v.n),old70AutoSameTimes:report(p.baselineAutoCovered,p.out.sent)}]))
    }]))
  ])),
  elapsedSeconds:Math.round((Date.now()-secondsSpent)/1000)
 };
 console.log('SENTINEL_70_VS_76_DIRECT_BENCHMARK='+JSON.stringify(summary));
 assert.equal(summary.scenarios,MODES.length*SEEDS.length*ISSUES.length*HORIZONS.length);
 assert.equal(summary.scenarios,320);
 for(const h of HORIZONS)for(const obj of Object.values(all[h].models))
  assert.equal(obj.mismatch,0,'The 9 original forecasts should not change between versions');
});
test('70 and 76 default automatic have same main forecast; selected pair changes the primary forecast',()=>{
 const history=make(12013,'cycle').slice(0,2400);
 const now=history.at(-1).ts,snap={quoteHistory:history,quoteTs:now,price:history.at(-1).price,provider:'iq_option'};
 const oldRuntime=new Runtime70({enableVNext:true});
 const newRuntime=new Runtime76({enableVNext:true});
 for(const h of [30,180]){
  const settings={asset:'EUR/USD OTC',engine:'automatic',orderDurationMs:h*1000};
  const x=oldRuntime._signalValidationGate({analysis:{side:'WAIT'},snap,settings,now});
  const y=newRuntime._signalValidationGate({analysis:{side:'WAIT'},snap,settings,now});
  assert.deepEqual(x.analysis.vnext.receipt,y.analysis.vnext.receipt);
  assert.equal(x.allowed,false);assert.equal(y.allowed,false);
  assert.equal(y.analysis.vnext.engineId,'automatic');
  assert.equal(y.analysis.vnext.futureQualification,null);
 }
 for(const pair of PAIR_STRATEGIES){
  const settings={asset:'EUR/USD OTC',engine:pair.id,orderDurationMs:180000};
  const out=newRuntime._signalValidationGate({analysis:{side:'WAIT'},snap,settings,now});
  assert.equal(out.analysis.vnext.engineId,pair.id);
  assert.equal(out.allowed,false);
  assert.equal(out.analysis.vnext.combinedResearch,null);
  assert.equal(newRuntime.settings.demoAutopilot,false);
 }
});

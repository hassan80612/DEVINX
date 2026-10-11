import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {branchingFutureForecast67} from '../sentinel-trading-lab/agent/src/core/offline-branching-future-path-67.mjs';
const START=1800000000000;
const SEEDS=[12013,13579,14621,15767,19001];
const MODES=['trend','range','cycle','reversal','false_breakout','breakout','volatility','random'];
const HORIZONS=[30,60,180],INDICES=[1500,2600];
const result=()=>({n:0,oldSignal:0,newSignal:0,oldWins:0,newWins:0,
 oldErr:0,newErr:0,changed:0,eligible:0,earlyTurns:0,turnOldWins:0,turnNewWins:0,
 regimeBreakdown:{}});
function generate(seed,kind,len=3000){
 let state=seed>>>0,price=Math.log(1.1),last=0,origin=price;
 const u=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)+1)/4294967297;
 const samples=[];
 for(let i=0;i<len;i++){
  const x=u(),y=u(),z=u(),g=Math.sqrt(-2*Math.log(x))*Math.cos(2*Math.PI*y);
  let move=g*.000011;
  if(kind==='trend')move+=(i%1400<850?.000006:-.000005)+.24*last;
  if(kind==='range')move+=-.09*(price-origin)-.25*last;
  if(kind==='cycle'){
   const period=72+seed%53;
   const wave=t=>.0007*Math.sin(2*Math.PI*t/period+seed*.2)+.00019*Math.sin(2*Math.PI*t/(period*.43));
   move+=wave(i)-wave(i-1);
  }
  if(kind==='reversal')move+=(Math.floor(i/175)%2?.000006:-.000006)+.13*last;
  if(kind==='false_breakout')move+=(i%240<24?.000014:i%240<70?-.000013:0)-.04*(price-origin);
  if(kind==='breakout')move+=(i%415<85?.0000003:i%415<178?.000007:0)+.13*last;
  if(kind==='volatility')move+=g*((i%680>240&&i%680<490)?.000023:.000002)+(z<.022?(y<.5?-.00008:.00008):0)-.28*last-.015*(price-origin);
  if(kind==='random')move+=g*.000005;
  price+=move;last=move;
  samples.push({ts:START+i*1000,price:Math.exp(price)});
 }
 return samples;
}


const FIXED_POLICY={
  30:{mode:'branches',minBps:.5,minDirShare:.5,maxDistance:1.3,minStrength:0,agree:'any'},
  60:{mode:'baseline',minBps:0,minDirShare:0,maxDistance:99,minStrength:.2,agree:'same'},
  180:{mode:'branches',minBps:1,minDirShare:.5,maxDistance:99,minStrength:0,agree:'same'},
};
const HOLDOUT_SEEDS=Array.from({length:64},(_,i)=>210007+i*11789);
const side=(a,b)=>a<b?'CALL':a>b?'PUT':'DRAW';
function sideAt(f,baseline,branch){
 return f.mode==='baseline'?baseline.side:branch.side;
}
function allowed(f,baseline,branch,ref){
 const obs=branch.branching;
 if(!obs||!['CALL','PUT'].includes(sideAt(f,baseline,branch)))return false;
 const prediction=f.mode==='baseline'?baseline:branch;
 const dir=obs.historicalDirectionShare?.[prediction.side]??0;
 const size=Math.abs(Math.log(Number(prediction.projectedPrice)/ref))*10000;
 const normalized=size/Math.max(.1,obs.neighborReturnDispersionBps??99);
 if(dir<f.minDirShare||size<f.minBps||normalized<f.minStrength||
   (obs.averageNeighborDistance??99)>f.maxDistance)return false;
 if(f.agree==='same'&&baseline.side!==branch.side)return false;
 return true;
}
const counters=()=>({total:0,emitted:0,wins:0,mae:0,reversals:0,reversalEmitted:0,reversalWins:0,
 wrong:0,byRegime:{}});
function wilson(w,n){if(!n)return null;const z=1.9599639845,p=w/n,den=1+z*z/n;
 const left=(p+z*z/(2*n)-z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/den;
 const right=(p+z*z/(2*n)+z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/den;
 return [+(100*left).toFixed(2),+(100*right).toFixed(2)];
}
function stat(x){
 const pct=(n,d)=>d?+(100*n/d).toFixed(2):null;
 return {n:x.total,emitted:x.emitted,coveragePct:pct(x.emitted,x.total),
  accuracyPct:pct(x.wins,x.emitted),ci95Pct:wilson(x.wins,x.emitted),
  endpointMaeBps:x.emitted?+(x.mae/x.emitted).toFixed(5):null,
  reversals:x.reversals,reversalEmitted:x.reversalEmitted,
  reversalAccuracyPct:pct(x.reversalWins,x.reversalEmitted),
  byRegime:Object.fromEntries(Object.entries(x.byRegime).map(([r,v])=>[r,{
   n:v.n,emitted:v.emitted,wins:v.wins,accuracyPct:pct(v.wins,v.emitted)
  }]))};
}
test('frozen horizon-specific selective policy: compare unmodified 67 on entirely new 64-seed holdout',()=>{
 const outcome=Object.fromEntries(HORIZONS.map(h=>[h,{
  base:counters(),filtered:counters(),rawBranches:counters()
 }]));
 for(const regime of MODES)for(const seed of HOLDOUT_SEEDS){
  const data=generate(seed,regime);
  for(const index of INDICES){
   const history=data.slice(Math.max(0,index-2399),index+1),now=data[index].ts,
    current=data[index].price;
   const snap={quoteHistory:history,quoteTs:now,price:current,provider:'iq_option'};
   for(const h of HORIZONS){
    const base=singleEngineForecast({settings:{engine:'automatic',asset:'EUR/USD OTC',
     orderDurationMs:h*1000},snap,now,provider:'iq_option'}).receipt;
    // A neutral prediction is no issued trade direction. Include it in the
    // opportunity denominator rather than dropping it (coverage integrity).
    const branch=branchingFutureForecast67({quoteHistory:history,asOf:now,
     selectedSeconds:h,baseline:{receipt:base},mode:'standalone'});
    const actual=data[index+h].price,correct=side(current,actual);
    const turning=side(data[index-20].price,current)!==correct;
    const f=FIXED_POLICY[h];
    for(const [kind,candidate,emit] of [
     ['base',base,!!base&&['CALL','PUT'].includes(base.side)],
     ['rawBranches',branch,!!branch&&['CALL','PUT'].includes(branch.side)],
     ['filtered',f.mode==='baseline'?base:branch,!!base&&allowed(f,base,branch,current)]
    ]){
     const c=outcome[h][kind];c.total++;if(turning)c.reversals++;
     const v=c.byRegime[regime]||{n:0,emitted:0,wins:0};v.n++;c.byRegime[regime]=v;
     if(!emit)continue;c.emitted++;v.emitted++;
     if(turning)c.reversalEmitted++;
     if(candidate.side===correct){c.wins++;v.wins++;if(turning)c.reversalWins++}
     else c.wrong++;
     c.mae+=Math.abs(Math.log(candidate.projectedPrice/actual))*10000;
    }
   }
  }
 }
 const o=Object.fromEntries(Object.entries(outcome).map(([h,methods])=>[h,
  Object.fromEntries(Object.entries(methods).map(([m,c])=>[m,stat(c)]))]));
 const all=Object.fromEntries(['base','filtered','rawBranches'].map(k=>[k,
  stat(Object.values(outcome).reduce((a,row)=>{
   const x=row[k];for(const col of ['total','emitted','wins','mae','reversals','reversalEmitted','reversalWins','wrong'])a[col]+=x[col];
   return a;
  },counters()))]));
 console.log('SENTINEL_67_FROZEN_POLICY_HOLDOUT='+JSON.stringify({
   source:'synthetic deterministic paths, NOT IQ Option/Exnova actual prices',
   seeds:HOLDOUT_SEEDS,heldOut:true,precommittedPolicy:FIXED_POLICY,
   samples:HORIZONS.length*HOLDOUT_SEEDS.length*MODES.length*INDICES.length,
   byHorizon:o,overall:all,liveBrokerAccuracyMeasured:false
 }));
 assert.equal(HORIZONS.length*HOLDOUT_SEEDS.length*MODES.length*INDICES.length,3072);
});
test('archived broker-like fixture cannot be counted as accuracy validation when history too short',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('fixtures/sentinel-continuation-prices.json',import.meta.url),'utf8'));
 assert.ok(Array.isArray(f.quoteHistory));
 assert.ok(f.quoteHistory.length<350);
});

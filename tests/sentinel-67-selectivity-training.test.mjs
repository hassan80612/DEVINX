import test from 'node:test';
import assert from 'node:assert/strict';
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


const TRAIN_SEEDS=[12013,13579,14621,15767,19001,44021,47801,55777,60607,71237,
 83011,83123,84503,86101,88493,90149,91907,94841,97073,101903];
const modeParams={
 modes:['baseline','branches'],
 shares:[0,.5,.6,.7,.8],
 strengths:[0,.2,.5,1],
 minBps:[0,.2,.5,1],
 distances:[.5,.8,1.3,99],
 agree:['any','same','opposite'],
 branches:['any','continuation','reversal'],
};
// Manual selection is based only on TRAIN_SEEDS, never on final held out stream.
const direction=(a,b)=>a<b?'CALL':a>b?'PUT':'DRAW';
function observation(data,quoteIndex,h){
 const history=data.slice(quoteIndex-2399,quoteIndex+1),now=data[quoteIndex].ts;
 const snap={quoteHistory:history,quoteTs:now,price:data[quoteIndex].price,provider:'iq_option'};
 const original=singleEngineForecast({settings:{engine:'automatic',asset:'EUR/USD OTC',
   orderDurationMs:h*1000},snap,now,provider:snap.provider}).receipt;
 const branch=branchingFutureForecast67({quoteHistory:history,asOf:now,selectedSeconds:h,
  baseline:{receipt:original},mode:'standalone'});
 const actual=data[quoteIndex+h].price,cur=data[quoteIndex].price;
 const prior=data[quoteIndex-20].price;
 return {kind:null,cur,actual,original,branch,
  actualSide:direction(cur,actual),
  reversed:direction(prior,cur)!==direction(cur,actual)};
}
function qualifies(item,p){
 const pred=p.model==='baseline'?item.original:item.branch;
 const report=item.branch?.branching;
 if(!pred||!report||!['CALL','PUT'].includes(pred.side))return false;
 const share=report.historicalDirectionShare?.[pred.side]??0;
 const distance=report.averageNeighborDistance??99;
 const dispersion=report.neighborReturnDispersionBps??99;
 const size=Math.abs(Math.log(pred.projectedPrice/item.cur))*10000;
 const strength=size/Math.max(.1,dispersion);
 const isSame=item.original?.side===item.branch?.side;
 if(p.agree==='same'&&!isSame||p.agree==='opposite'&&isSame)return false;
 if(p.branch!=='any'&&report.expectedBranch!==p.branch)return false;
 return share>=p.share&&distance<=p.distance&&size>=p.minBps&&strength>=p.strength;
}
function compact(stat,total){
 return {n:stat.n,coveragePct:+(100*stat.n/total).toFixed(2),
  accuracyPct:stat.n?+(100*stat.w/stat.n).toFixed(2):null,
  reversalN:stat.r,reversalAccuracyPct:stat.r?+(100*stat.rw/stat.r).toFixed(2):null};
}
function summaries(data,policies,h){
 const out=[];
 for(const p of policies){
  let n=0,w=0,r=0,rw=0;
  for(const o of data)if(qualifies(o,p)){
   n++;if(o.actualSide===(p.model==='baseline'?o.original.side:o.branch.side))w++;
   if(o.reversed){r++;if(o.actualSide===(p.model==='baseline'?o.original.side:o.branch.side))rw++}
  }
  const stat={n,w,r,rw};
  if(n>=Math.ceil(data.length*.26)){
   const accuracy=w/n;
   out.push({p,...compact(stat,data.length),
    objective:(accuracy-.8)*3+Math.sqrt(n/data.length)*.14+Math.min(.04,rw/Math.max(1,r)*.025)});
  }
 }
 out.sort((a,b)=>b.objective-a.objective);
 return out.slice(0,12);
}
test('training-only retrospective selectivity search: show rates and coverage, not win-rate promise',()=>{
 const samples=Object.fromEntries(HORIZONS.map(h=>[h,[]]));
 for(const kind of MODES)for(const seed of TRAIN_SEEDS){
  const data=generate(seed,kind);
  for(const i of INDICES)for(const h of HORIZONS){
   const o=observation(data,i,h);o.kind=kind;samples[h].push(o);
  }
 }
 const policies=[];
 for(const model of modeParams.modes)for(const share of modeParams.shares)
 for(const strength of modeParams.strengths)for(const minBps of modeParams.minBps)
 for(const distance of modeParams.distances)for(const agree of modeParams.agree)
 for(const branch of modeParams.branches)
 policies.push({model,share,strength,minBps,distance,agree,branch});
 const out=Object.fromEntries(HORIZONS.map(h=>[h,{
  total:samples[h].length,top:summaries(samples[h],policies,h)
 }]));
 console.log('SENTINEL_SELECTIVE_67_TRAINING='+JSON.stringify({
  provenance:'training-only deterministic synthetic streams; NOT real market quotes',
  compared:policies.length,total:TRAIN_SEEDS.length*MODES.length*INDICES.length*HORIZONS.length,
  out}));
 assert.equal(out[30].total,320);
});

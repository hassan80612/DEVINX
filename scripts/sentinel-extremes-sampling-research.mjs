import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptiveDirectTrajectory as baseForecast} from '../sentinel-trading-lab/agent/src/core/adaptive-direct-trajectory.mjs';
import {adaptiveDirectTrajectory as denseForecast} from '../sentinel-trading-lab/agent/src/core/adaptive-extremes-research.mjs';
const START=1800000000000;
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


const bucket=()=>({cases:0,topWithin10s:0,bottomWithin10s:0,topTimeError:0,bottomTimeError:0,
 topPriceErrorBps:0,bottomPriceErrorBps:0});
const minmax=(items,value)=>({
 top:items.reduce((a,b)=>value(b)>value(a)?b:a),
 bottom:items.reduce((a,b)=>value(b)<value(a)?b:a)
});
const base=bucket(),dense=bucket(),byHolding={},byRegime={};
const seeds=[610031,610043,610051,610081],kinds=['cycle','trend','reversal','volatility'];
for(const kind of kinds)for(const seed of seeds){
 const rows=generate(seed,kind,4800),issue=4200;
 const history=rows.slice(issue-3599,issue+1),now=rows[issue].ts;
 for(const holdingSeconds of [30,60,120,300]){
  const options={quoteHistory:history,asOf:now,entryDelaySeconds:30,holdingSeconds};
  const old=baseForecast(options),newer=denseForecast({...options,trajectorySamples:32});
  assert.equal(old.status,'adaptive-direct-trajectory');assert.equal(newer.status,old.status);
  assert.equal(newer.side,old.side,'direction must not be changed to improve an extrema score');
  assert.ok(Math.abs(old.expectedPairedLogReturn-newer.expectedPairedLogReturn)<1e-11);
  const truth=minmax(rows.slice(issue+30,issue+30+holdingSeconds+1),q=>q.price);
  const actualTopSeconds=(truth.top.ts-now)/1000,actualBottomSeconds=(truth.bottom.ts-now)/1000;
  byHolding[holdingSeconds]??={base:bucket(),dense:bucket()};
  byRegime[kind]??={base:bucket(),dense:bucket()};
  for(const [name,forecast,all] of [['base',old,base],['dense',newer,dense]]){
   const path=forecast.expectedPath.filter(p=>p.secondsFromNow>=30&&p.secondsFromNow<=30+holdingSeconds);
   const estimated=minmax(path,p=>p.price);
   const topError=Math.abs(estimated.top.secondsFromNow-actualTopSeconds);
   const bottomError=Math.abs(estimated.bottom.secondsFromNow-actualBottomSeconds);
   for(const b of [all,byHolding[holdingSeconds][name],byRegime[kind][name]]){
    b.cases++;b.topWithin10s+=topError<=10;b.bottomWithin10s+=bottomError<=10;
    b.topTimeError+=topError;b.bottomTimeError+=bottomError;
    b.topPriceErrorBps+=Math.abs(Math.log(estimated.top.price/truth.top.price))*10000;
    b.bottomPriceErrorBps+=Math.abs(Math.log(estimated.bottom.price/truth.bottom.price))*10000;
   }
  }
 }
}
const summary=b=>({cases:b.cases,
 topWithin10sPct:100*b.topWithin10s/b.cases,bottomWithin10sPct:100*b.bottomWithin10s/b.cases,
 meanTopTimeErrorSeconds:b.topTimeError/b.cases,meanBottomTimeErrorSeconds:b.bottomTimeError/b.cases,
 meanTopPriceErrorBps:b.topPriceErrorBps/b.cases,meanBottomPriceErrorBps:b.bottomPriceErrorBps/b.cases});
const report={source:'64 synthetic scenarios, NOT broker data',baseline:'released 13.4.67.2 frozen',
 hypothesis:'32 sampled future points versus 8; same direct-return direction',
 directionPreservedInEveryCase:true,entryDelaySeconds:30,toleranceSeconds:10,
 base:summary(base),dense:summary(dense),
 byHolding:Object.fromEntries(Object.entries(byHolding).map(([h,x])=>[h,{base:summary(x.base),dense:summary(x.dense)}])),
 byRegime:Object.fromEntries(Object.entries(byRegime).map(([k,x])=>[k,{base:summary(x.base),dense:summary(x.dense)}])),
 productionChanged:false};
console.log(JSON.stringify(report));
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');

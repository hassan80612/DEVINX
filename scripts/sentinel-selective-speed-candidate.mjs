import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
const {forwardHorizonMatrix}=await import(pathToFileURL(root+'/sentinel-trading-lab/agent/src/core/forward-horizon-matrix.mjs').href);
const {autonomousSelectiveEntry}=await import(pathToFileURL(root+'/sentinel-trading-lab/agent/src/core/selective-autonomous.mjs').href);
const base=1900000000000;
const samples=Array.from({length:3201},(_,i)=>({
 ts:base+(i-3200)*1000,
 price:1.1+.0015*Math.sin(i*2*Math.PI/108)+.0003*Math.sin(i*2*Math.PI/41)+.00000045*i
}));
const cases=[];
for(const h of [30,60]){
 for(let j=0;j<4;j++){
  const now=base+j*1000,q=samples.slice(j,3201);
  const snap={price:q.at(-1).price,quoteHistory:q,quoteTs:now,provider:'iq_option'};
  const settings={asset:'TEST',engine:'automatic',forecastMode:'selective',orderDurationMs:h*1000};
  const t=performance.now(),entry=autonomousSelectiveEntry({quoteHistory:q,now,quoteTs:now,delaySeconds:h,holdingSeconds:h,asset:'TEST'});
  const standaloneMs=performance.now()-t;
  const t2=performance.now();const matrix=forwardHorizonMatrix({settings,snap,now,forecastModel:'original-67',adaptiveHistory:q});
  const matrixMs=performance.now()-t2;
  cases.push({h,iteration:j,singleMs:Number(standaloneMs.toFixed(2)),matrixMs:Number(matrixMs.toFixed(2)),
   valid:matrix.entryRows.length>=6,status:entry.status,side:entry.side,selected:matrix.entryRows.find(x=>x.delaySeconds===h)?.side||null});
 }
}
const avg=(key)=>Number((cases.reduce((s,c)=>s+c[key],0)/cases.length).toFixed(2));
console.log(JSON.stringify({cases,averageSingleMs:avg('singleMs'),averageMatrixMs:avg('matrixMs')},null,2));
if(cases.some(c=>!c.valid))process.exitCode=1;

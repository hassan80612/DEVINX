// Computation benchmark only. Generated workload is NOT price evidence.
import {performance} from 'node:perf_hooks';
import {models} from './base-direction-study.mjs';
const T=Date.UTC(2026,9,16,12),result={};
const pct=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];
for(const count of [360,3600,6800]){
 const step=count===360?500:50;
 const quotes=Array.from({length:count},(_,i)=>({ts:T+i*step,receivedAt:T+i*step,
  price:1.1*Math.exp(i*.0000002+.00015*Math.sin(i*.017)+.00002*Math.sin(i*.5))}));
 const q=quotes.at(-1),input={quoteHistory:quotes,price:q.price,quoteAt:q.ts,now:q.ts,
  engineId:'automatic',durationMs:30000,qualityPolicy:'adaptive-market-v17'};
 const group={};
 for(const [name,predict]of Object.entries(models)){
  for(let i=0;i<12;i++)predict(input);
  const ms=[];
  for(let i=0;i<100;i++){const t=performance.now();predict(input);ms.push(performance.now()-t);}
  group[name]={p50:pct(ms,.5),p95:pct(ms,.95),max:Math.max(...ms)};
 }
 result[count]={quoteIntervalMs:step,models:group};
}
console.log(JSON.stringify({scope:'model computation only; excludes browser, network, Windows and UI transport',schedulerIntervalMs:80,workloads:result},null,2));

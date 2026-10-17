// RESEARCH ONLY: test sensitivity to the observed fitting window.
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
export class ProjectionWindowCache {
 constructor(){this.key=null;this.value=null;}
 get(args,periodSearch){
  const key=[args.context,args.quoteAt,args.price,args.projectionTargetAt,periodSearch,args.quoteHistory.length,args.quoteHistory[0]?.ts].join('|');
  if(this.key!==key){
   this.key=key;
   this.value=[90000,120000].map(span=>thirtySecondCycleForecast({...args,durationMs:30000,periodSearch,
    quoteHistory:args.quoteHistory.filter(q=>q.ts>=args.quoteAt-span)}));
  }
  return this.value;
 }
}
export class ProjectionWindowStability extends CompletedExpiryDirection {
 constructor({mode='median',cache=new ProjectionWindowCache()}={}){super();this.mode=mode;this.windowCache=cache;}
 reset(context){super.reset(context);this.lastStability=null;this.stabilityCounts={unstable:0,changed:0,suppressed:0,noiseEligible:0};}
 observe(args){
  const base=super.observe(args);
  if(!base.ready||!Number.isFinite(base.expectedLogMove))return base;
  const periodSearch=['bootstrap-expiry-penalized-fit','completed-expiry-outcomes-adaptive-cycle'].includes(base.reason)?'wide':'baseline';
  const short=this.windowCache.get(args,periodSearch);
  const unstable=short.every(f=>f.ready&&f.side!==base.side);
  this.lastStability={at:args.quoteAt,base:base.side,short:short.map(f=>f.ready?f.side:null),unstable};
  if(!unstable)return base;
  this.stabilityCounts.unstable++;
  if(this.mode==='noise-gate'){
   const ratio=observedChoppiness(args);
   this.lastStability.choppiness=ratio;
   if(ratio<2)return base;
   this.stabilityCounts.noiseEligible++;
  }
  if(this.mode==='gate'||this.mode==='noise-gate'){
   this.stabilityCounts.suppressed++;
   return {...base,ready:false,side:null,projectionSuppressed:true,reason:'research-window-direction-disagreement'};
  }
  this.stabilityCounts.changed++;
  const middle=[base,...short].sort((a,b)=>a.expectedLogMove-b.expectedLogMove)[1];
  return {...base,...middle,reason:'research-window-median-projection'};
 }
}
export function observedChoppiness({quoteHistory=[],quoteAt,now=quoteAt}){
 const rows=quoteHistory.filter(q=>q.ts<=quoteAt&&(q.receivedAt??q.ts)<=now&&q.ts>=quoteAt-90000&&Number.isFinite(q.price)&&q.price>0).sort((a,b)=>a.ts-b.ts);
 const xs=[];let j=rows.length-1;
 for(let t=quoteAt;t>=quoteAt-90000;t-=1000){
  while(j>=0&&rows[j].ts>t)j--;
  if(j>=0&&t-rows[j].ts<=500)xs.push({ts:t,p:Math.log(rows[j].price)});
 }
 xs.reverse();
 if(xs.length<61||xs.some((x,i)=>i&&x.ts-xs[i-1].ts>1000))return 0;
 let one=0,five=0;
 for(let i=1;i<xs.length;i++)one+=Math.abs(xs[i].p-xs[i-1].p);
 for(let i=5;i<xs.length;i+=5)five+=Math.abs(xs[i].p-xs[i-5].p);
 return five>1e-14?one/five:0;
}

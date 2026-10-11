/**
 * Research-only forward path from COMPLETED historical quote trajectories.
 * No broker orders, no invented win probability, no access to future ticks.
 * This runs in memory; do not confuse its output with a verified forecast.
 */
const good=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n));
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
const quantile=(arr,q)=>{const s=arr.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!s.length)return null;const p=clip(q,0,1)*(s.length-1),i=Math.floor(p);
 return s[i]+(s[Math.min(s.length-1,i+1)]-s[i])*(p-i);
};
function prepare(input,asOf){
 const seen=new Map();
 for(const q of Array.isArray(input)?input:[]){
  if(!good(q?.ts)||!good(q?.price))continue;
  const t=Number(q.ts),p=Number(q.price);
  if(t<=asOf&&t>=0&&p>0)seen.set(t,Math.log(p));
 }
 return [...seen].sort((a,b)=>a[0]-b[0]).map(([ts,l])=>({ts,l}));
}
function before(rows,t){
 let lo=0,hi=rows.length-1,ans=-1;
 while(lo<=hi){const m=(lo+hi)>>1;if(rows[m].ts<=t){ans=m;lo=m+1}else hi=m-1}
 return ans<0?null:rows[ans];
}
function feature(rows,t){
 const now=before(rows,t),a=before(rows,t-5000),b=before(rows,t-20000),c=before(rows,t-60000);
 if(!now||!a||!b||!c||now.ts-a.ts>7000||now.ts-b.ts>23000||now.ts-c.ts>64000)return null;
 const look=rows.filter(q=>q.ts>=t-60000&&q.ts<=t);
 if(look.length<16)return null;
 let path=0,sq=0;
 for(let i=1;i<look.length;i++){const d=look[i].l-look[i-1].l;
  path+=Math.abs(d);sq+=d*d;
 }
 const net=now.l-look[0].l;
 const top=Math.max(...look.map(x=>x.l)),bot=Math.min(...look.map(x=>x.l));
 const v=Math.sqrt(sq/Math.max(1,look.length-1));
 return {last:now.l,ts:now.ts,v:Math.max(v,1e-10),
  value:[(now.l-a.l)/Math.max(v,1e-10)/Math.sqrt(5),
   (now.l-b.l)/Math.max(v,1e-10)/Math.sqrt(20),
   (now.l-c.l)/Math.max(v,1e-10)/Math.sqrt(60),
   path>0?Math.abs(net)/path:0,
   top>bot?(now.l-bot)/(top-bot):.5]};
}
function distance(a,b){
 let sum=0;
 const scales=[1.2,1.2,1.2,.24,.32];
 for(let i=0;i<5;i++){const x=(a.value[i]-b.value[i])/scales[i];sum+=x*x}
 return Math.sqrt(sum/5);
}
export function historicalFuturePath({quoteHistory=[],asOf=Date.now(),horizonSeconds=90,minNeighbors=8,maxNeighbors=18}={}){
 const H=Number(horizonSeconds);
 if(!Number.isFinite(H)||H<5||H>1800||!Number.isFinite(Number(asOf)))
  return {status:'invalid-horizon',ready:false};
 const rows=prepare(quoteHistory,Number(asOf)),last=rows.at(-1),first=rows[0];
 if(!last||!first||rows.length<80||last.ts-first.ts<(H+90)*1000)
  return {status:'insufficient-complete-path-history',ready:false,historyQuotes:rows.length};
 const current=feature(rows,last.ts);
 if(!current)return {status:'insufficient-structure-history',ready:false};
 const sampleSeconds=[...new Set([0,H,...Array.from({length:20},(_,i)=>H*(i+1)/20)])].sort((a,b)=>a-b);
 const earliest=first.ts+65000,latest=last.ts-H*1000-1500;
 const strideMs=Math.max(4000,Math.min(30000,H*350));
 const candidates=[];
 for(let anchor=earliest;anchor<=latest;anchor+=strideMs){
  const anchorRow=before(rows,anchor),f=feature(rows,anchor);
  if(!f||!anchorRow||anchor-anchorRow.ts>2500)continue;
  const projected=[];let complete=true;
  for(const seconds of sampleSeconds){
   const target=anchor+seconds*1000,q=before(rows,target);
   if(!q||target-q.ts>Math.max(1500,Math.min(4000,H*30))){complete=false;break}
   projected.push(q.l-f.last);
  }
  if(complete)candidates.push({at:anchor,d:distance(current,f),projected});
 }
 if(candidates.length<Math.max(6,minNeighbors))
  return {status:'insufficient-historical-neighbors',ready:false,comparisons:candidates.length};
 candidates.sort((a,b)=>a.d-b.d);
 const chosen=[],separationMs=Math.max(4000,Math.min(45000,H*700));
 for(const x of candidates){
  if(chosen.every(c=>Math.abs(c.at-x.at)>=separationMs))chosen.push(x);
  if(chosen.length>=maxNeighbors)break;
 }
 if(chosen.length<minNeighbors)
  return {status:'correlated-neighbors-insufficient',ready:false,comparisons:candidates.length,independentNeighbors:chosen.length};
 const expectedPath=sampleSeconds.map((s,j)=>{
  const arr=chosen.map(x=>x.projected[j]);
  return {secondsFromNow:Number(s.toFixed(3)),
   projectedPrice:Number(Math.exp(current.last+quantile(arr,.5)).toPrecision(12)),
   low:Number(Math.exp(current.last+quantile(arr,.15)).toPrecision(12)),
   high:Number(Math.exp(current.last+quantile(arr,.85)).toPrecision(12))};
 });
 const extremes=chosen.map(x=>{
  const high=Math.max(...x.projected),low=Math.min(...x.projected);
  return {highSeconds:sampleSeconds[x.projected.indexOf(high)],
   lowSeconds:sampleSeconds[x.projected.indexOf(low)]}
 });
 const peakTimes=extremes.map(x=>x.highSeconds),troughTimes=extremes.map(x=>x.lowSeconds);
 return {status:'experimental-path',ready:true,asOf:Number(asOf),
  referenceQuoteAt:last.ts,referencePrice:Math.exp(current.last),
  horizonSeconds:H,comparisons:candidates.length,independentNeighbors:chosen.length,
  expectedPath,
  extremeTimes:{
   peak:{estimateSeconds:quantile(peakTimes,.5),windowSeconds:[quantile(peakTimes,.2),quantile(peakTimes,.8)]},
   trough:{estimateSeconds:quantile(troughTimes,.5),windowSeconds:[quantile(troughTimes,.2),quantile(troughTimes,.8)]}
  },
  // Individual neighbor paths are retained in memory for conditional windows,
  // not serialized to the broker card.
  _researchNeighbors:chosen.map(x=>x.projected),
  calibrated:false,actionable:false};
}
export function conditionalPathWindow(path,leadSeconds,holdingSeconds){
 const H=Number(holdingSeconds),D=Number(leadSeconds);
 if(!path?.ready||!(D>=0)||!(H>0)||D+H>path.horizonSeconds+1e-6)
  return {status:'unavailable',side:null,actionable:false};
 const points=path.expectedPath;
 const nearest=s=>points.reduce((a,b)=>Math.abs(a.secondsFromNow-s)<Math.abs(b.secondsFromNow-s)?a:b);
 const entry=nearest(D),exit=nearest(D+H);
 const predictedMove=Math.log(exit.projectedPrice/entry.projectedPrice);
 const eps=1e-11;
 const side=predictedMove>eps?'CALL':predictedMove< -eps?'PUT':null;
 // Directional share is a share of prior analogous outcomes, NOT win probability.
 const i=points.indexOf(entry),j=points.indexOf(exit);
 const outcomes=path._researchNeighbors.map(x=>x[j]-x[i]);
 const aligned=outcomes.filter(x=>side==='CALL'?x>0:side==='PUT'?x<0:false).length;
 const agreement=outcomes.length?aligned/outcomes.length:null;
 const proposed=side&&agreement>=.66?side:null;
 return {status:proposed?'candidate':'weak-conditional-evidence',side:proposed,
  referenceSide:side,entrySeconds:D,holdingSeconds:H,
  projectedEntryPrice:entry.projectedPrice,projectedExitPrice:exit.projectedPrice,
  observedNeighborShare:agreement,independentNeighbors:outcomes.length,
  riskOfReversal:'unvalidated',calibrated:false,actionable:false};
}

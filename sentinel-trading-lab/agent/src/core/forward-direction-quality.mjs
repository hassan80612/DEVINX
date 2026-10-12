// Reusable causal check for projected future direction. These values are
// NOT hit probabilities. No external broker reads, timing delays, or trades.
export function observedNoise({quotes=[],now=Date.now(),horizonSeconds=30}={}){
 const h=Number(horizonSeconds),known=quotes.filter(q=>Number(q?.ts)<=now&&
  Number(q?.receivedAt??q?.ts)<=now&&Number(q?.ts)>=now-180000&&
  Number(q?.price)>0).sort((a,b)=>Number(a.ts)-Number(b.ts));
 let sq=0,seconds=0,pairs=0;
 for(let i=1;i<known.length;i++){
  const dt=(Number(known[i].ts)-Number(known[i-1].ts))/1000;
  if(dt<=0||dt>10)continue;
  const diff=Math.log(Number(known[i].price)/Number(known[i-1].price));
  sq+=diff*diff;seconds+=dt;pairs++;
 }
 return h>0&&seconds>=12&&pairs>=3&&sq>0?
  Math.sqrt(sq/seconds)*Math.sqrt(h):null;
}
export function coherentInterval({entryPrice,exitPrice,side,noise=null,noiseFraction=.15}={}){
 const p1=Number(entryPrice),p2=Number(exitPrice);
 const invalid={qualified:false,side:null,reason:'invalid-or-inconsistent-projection'};
 if(!(p1>0&&p2>0&&Number.isFinite(p1)&&Number.isFinite(p2)))return invalid;
 const move=Math.log(p2/p1);
 if(!Number.isFinite(move)||Math.abs(move)<=1e-12)return invalid;
 const projected=move>0?'CALL':'PUT';
 if(side&&side!==projected)return invalid;
 // Reject near-zero moves when a real volatility scale is observable.
 if(Number.isFinite(noise)&&noise>0&&Math.abs(move)<noise*noiseFraction)
  return {qualified:false,side:null,reason:'projection-below-observed-noise'};
 return {qualified:true,side:projected,reason:'coherent-interval',relativeMove:move};
}

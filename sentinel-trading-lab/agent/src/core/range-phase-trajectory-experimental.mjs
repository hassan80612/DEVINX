// Experimental range-only phase projection, isolated from trend/reversal.
// Uses ONLY already closed 10-second boundary prices. No extra entry veto,
// cooldown, candle-color restriction, broker read or signals.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function fitCycle(points,seconds,period){
 const n=seconds.length;
 const w=2*Math.PI/period;
 const x=seconds.map(t=>[1,Math.cos(w*t),Math.sin(w*t)]);
 const matrix=Array.from({length:3},(_,i)=>Array.from({length:4},(_,j)=>
  j===3?x.reduce((sum,row,k)=>sum+row[i]*points[k],0):
  x.reduce((sum,row)=>sum+row[i]*row[j],0)));
 for(let i=0;i<3;i++){
  let best=i;
  for(let k=i+1;k<3;k++)if(Math.abs(matrix[k][i])>Math.abs(matrix[best][i]))best=k;
  if(Math.abs(matrix[best][i])<1e-13)return null;
  [matrix[i],matrix[best]]=[matrix[best],matrix[i]];
  const pivot=matrix[i][i];
  for(let j=i;j<4;j++)matrix[i][j]/=pivot;
  for(let k=0;k<3;k++){
   if(k===i)continue;
   const v=matrix[k][i];
   for(let j=i;j<4;j++)matrix[k][j]-=v*matrix[i][j];
  }
 }
 const [center,cos,sin]=matrix.map(row=>row[3]);
 return {center,cos,sin,period,at:t=>center+cos*Math.cos(w*t)+sin*Math.sin(w*t)};
}
/**
 * Return a range price-path delta (log units), never a trading decision.
 * A period must first explain withheld completed points better than a
 * no-change estimate; otherwise retain the existing baseline formula.
 * The blending factor is continuous and not an entry permission filter.
 */
export function rangePhaseMove({points=[],horizonSeconds=0,baselineMove=0,
 sigma=0}={}){
 const h=Number(horizonSeconds);
 if(!Array.isArray(points)||points.length<10||!(h>0)||!(sigma>0))
  return Number(baselineMove)||0;
 const xs=points.slice(-10).map(Number);
 if(xs.some(x=>!Number.isFinite(x)))return baselineMove;
 const ref=xs.at(-1),ys=xs.map(x=>x-ref),
  times=xs.map((_,i)=>(i-(xs.length-1))*10);
 const train=7,stop=times.slice(0,train),held=times.slice(train);
 const flat=ys[train-1];
 const flatSse=ys.slice(train).reduce((sum,y)=>sum+(y-flat)**2,0);
 if(!(flatSse>1e-16))return baselineMove;
 const fullMean=ys.reduce((a,b)=>a+b,0)/ys.length;
 const total=ys.reduce((sum,y)=>sum+(y-fullMean)**2,0);
 if(!(total>1e-16))return baselineMove;
 let best=null;
 for(const period of [40,45,50,55,60,65,70,75,80,85,90]){
  const fit=fitCycle(ys.slice(0,train),stop,period);
  if(!fit)continue;
  const heldSse=held.reduce((sum,t,i)=>
   sum+(fit.at(t)-ys[train+i])**2,0);
  const heldSkill=1-heldSse/flatSse;
  const allFit=fitCycle(ys,times,period);
  if(!allFit)continue;
  const fitSse=times.reduce((sum,t,i)=>
   sum+(allFit.at(t)-ys[i])**2,0);
  const fitSkill=1-fitSse/total;
  const consistency=Math.min(heldSkill,fitSkill);
  if(!best||consistency>best.consistency)best={fit:allFit,consistency};
 }
 // Strong evidence of a completed repeating path contributes a smoothly
 // weighted projection. A noisy/choppy or not-yet-repeating sideways leg
 // retains the previous forecast rather than a manufactured reversal.
 const mix=best?clamp((best.consistency-.15)/.65,0,.8):0;
 if(mix===0)return baselineMove;
 const {fit}=best,w=2*Math.PI/fit.period;
 const waveNow=fit.cos;
 const waveFuture=Math.exp(-h/150)*
   (fit.cos*Math.cos(w*h)+fit.sin*Math.sin(w*h));
 const phased=waveFuture-waveNow+(1-Math.exp(-h/150))*(fit.center);
 const displacement=baselineMove*(1-mix)+phased*mix;
 const cap=sigma*Math.sqrt(Math.max(1,h))*2.4;
 return clamp(displacement,-cap,cap);
}

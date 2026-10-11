/**
 * Independent, OFFLINE ONLY Sentinel 67 future-path research.
 * Operates on past quotes known at issuance; never publishes to the site,
 * routes orders, or changes 67's engine.
 *
 * A harmonic trajectory model is used ONLY if multiple previously observed
 * swing cycles explain the latest detrended quote path. Otherwise fallback to
 * the exact original 67 prediction (no invented edge).
 */
const finite=n=>Number.isFinite(n);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function prepare(quoteHistory,asOf){
 const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>
  finite(Number(q?.ts))&&finite(Number(q?.price))&&Number(q.price)>0&&
  Number(q.ts)<=asOf&&Number(q.ts)>=asOf-720000)
 .map(q=>({ts:Number(q.ts),log:Math.log(Number(q.price))}))
 .sort((a,b)=>a.ts-b.ts);
 if(rows.length<100)return [];
 const unique=[];
 for(const row of rows)if(unique.at(-1)?.ts===row.ts)unique[unique.length-1]=row;
   else unique.push(row);
 return unique;
}
function regularized(rows){
 const last=rows.at(-1)?.ts??0,first=rows[0]?.ts??last;
 const historySeconds=Math.min(540,Math.floor((last-first)/1000));
 if(historySeconds<130)return [];
 let index=0,outputs=[];
 for(let seconds=historySeconds;seconds>=0;seconds-=2){
  const target=last-seconds*1000;
  while(index+1<rows.length&&rows[index+1].ts<=target)index++;
  const matched=rows[index];
  if(!matched||target-matched.ts>3500)return [];
  outputs.push({t:-seconds,log:matched.log});
 }
 return outputs;
}
function regression(samples){
 const n=samples.length;
 if(n<3)return null;
 let sx=0,sy=0,sxx=0,sxy=0;
 for(const r of samples){sx+=r.t;sy+=r.log;sxx+=r.t*r.t;sxy+=r.t*r.log}
 const d=n*sxx-sx*sx;if(!(d>0))return null;
 const slope=(n*sxy-sx*sy)/d;
 return {intercept:(sy-slope*sx)/n,slope};
}
function chooseCycle(rows,trend){
 // Candidate periods are fixed before seeing any holdout result.
 const periods=[36,44,52,60,72,84,96,112,128,148,172,200,230];
 const latest=rows.at(-1)?.log??0;
 const detrended=rows.map(p=>p.log-(trend.intercept+trend.slope*p.t));
 const variance=detrended.reduce((s,y)=>s+y*y,0);
 if(!(variance>1e-12))return null;
 let best=null;
 for(const period of periods){
  const omega=2*Math.PI/period;
  let cc=0,ss=0,cs=0,cy=0,sy=0;
  for(let i=0;i<rows.length;i++){
   const c=Math.cos(omega*rows[i].t),s=Math.sin(omega*rows[i].t),y=detrended[i];
   cc+=c*c;ss+=s*s;cs+=c*s;cy+=c*y;sy+=s*y;
  }
  const det=cc*ss-cs*cs;
  if(det<=1e-8)continue;
  const a=(cy*ss-sy*cs)/det,b=(sy*cc-cy*cs)/det;
  if(!finite(a)||!finite(b))continue;
  let residual=0;
  for(let i=0;i<rows.length;i++){
   const model=a*Math.cos(omega*rows[i].t)+b*Math.sin(omega*rows[i].t);
   residual+=(detrended[i]-model)**2;
  }
  const fit=clamp(1-residual/variance,0,1);
  // Avoid selecting a period longer than the history available.
  const cycles=(rows.at(-1).t-rows[0].t)/period;
  const adjusted=fit*Math.min(1,cycles/2.1);
  if(!best||adjusted>best.score)best={period,omega,a,b,fit,score:adjusted,
   amplitude:Math.hypot(a,b),residualVariance:residual/rows.length,
   currentFit:trend.intercept+a,offset:latest-(trend.intercept+a)};
 }
 return best;
}
export function trajectoryResearch67({quoteHistory=[],asOf=Date.now(),selectedSeconds=60,
 baseline=null}={}){
 const rows=prepare(quoteHistory,Number(asOf));
 const latest=rows.at(-1),oldPrice=Number(baseline?.receipt?.referencePrice);
 const baseProjected=Number(baseline?.receipt?.projectedPrice);
 const horizon=Number(selectedSeconds);
 if(!latest||!finite(oldPrice)||!(oldPrice>0)||!finite(baseProjected)||
  !(baseProjected>0)||!(horizon>=5&&horizon<=900)){
  return {status:'fallback-67',side:baseline?.receipt?.side||null,
   projectedPrice:baseProjected>0?baseProjected:null,expectedPath:[],cycle:null};
 }
 const sampled=regularized(rows);
 const originalMove=Math.log(baseProjected/oldPrice);
 if(sampled.length<68)return {status:'fallback-67',side:baseline.receipt.side,
  projectedPrice:baseProjected,expectedPath:[],cycle:null};
 const reg=regression(sampled);
 if(!reg)return {status:'fallback-67',side:baseline.receipt.side,
  projectedPrice:baseProjected,expectedPath:[],cycle:null};
 const cycle=chooseCycle(sampled,reg);
 const recent=sampled.filter(x=>x.t>=-60),p60=regression(recent);
 const reversalContext=!!(p60&&reg.slope*p60.slope<0);
 // Fixed evidence gate: no cycle correction when past path is not reliably periodic.
 const eligible=!!(cycle&&cycle.score>=.52&&cycle.fit>=.57&&
  cycle.amplitude>Math.sqrt(Math.max(1e-14,cycle.residualVariance))*.65);
 const trajectory=[];
 const horizons=[Math.max(5,Math.round(horizon*.15)),Math.max(6,Math.round(horizon*.35)),
  Math.max(7,Math.round(horizon*.65)),horizon];
 const unique=[...new Set(horizons.filter(x=>x<=horizon))].sort((a,b)=>a-b);
 const omega=cycle?.omega||0;
 const cyc=t=>cycle?.a*(Math.cos(omega*t)-1)+cycle?.b*Math.sin(omega*t)||0;
 // No extrapolation of an unbounded straight slope into the future.
 const mildSlope=clamp(reg.slope,-.0002,.0002);
 const drift=t=>mildSlope*85*(1-Math.exp(-t/85));
 // Model keeps 67's original endpoint as a safety baseline. On historical
 // repeated swings, replace a bounded portion with a causal trajectory.
 const weight=eligible?clamp((cycle.score-.48)*1.6,.10,.72):0;
 for(const t of unique){
  const baselineMove=originalMove*Math.min(1,t/horizon);
  const structuralMove=drift(t)+cyc(t);
  const move=baselineMove*(1-weight)+structuralMove*weight;
  trajectory.push({secondsFromNow:t,price:Number((oldPrice*Math.exp(move)).toPrecision(12))});
 }
 const target=trajectory.at(-1)?.price||baseProjected;
 const move=Math.log(target/oldPrice);
 const side=Math.abs(move)<=1e-12?'NEUTRAL':move>0?'CALL':'PUT';
 const rev=eligible&&
  trajectory.slice(1).some((p,i)=>Math.sign(Math.log(p.price/oldPrice))!==
   Math.sign(move)&&Math.abs(Math.log(p.price/oldPrice))>1e-10);
 return {status:eligible?'swing-trajectory':'fallback-67',
  side:eligible?side:baseline.receipt.side,projectedPrice:target,
  expectedPath:eligible?trajectory:[],cycle:eligible?{
   periodSeconds:cycle.period,fit:cycle.fit,score:cycle.score,
   amplitude:cycle.amplitude,estimatedReversalInsideHorizon:rev,
   recentTrendConflict:reversalContext,historySeconds:-sampled[0].t
  }:null,weight,modelVersion:'offline-67-swing-path-1',
  actionable:false,calibrated:false};
}

/**
 * SENTINEL 13.4.67 — oscillation-phase / inflection research (shadow only)
 *
 * Root issue: current 67 projects independent P(t+H) and P(t+2H),
 * after modeling slopes/path efficiency and only the most recent position
 * in a range. It does not retain oscillatory phase or estimate cycle period.
 *
 * Fit a LOCAL LINEAR + DAMPED HARMONIC* price-level model from past quotes,
 * score multiple periods strictly against recent past HOLDOUT data, refit
 * the most reproducible period only using the known past, then predict the
 * DIRECT signed move from t+H to t+2H.
 *
 * *Harmonic coefficients are regularized, not mechanically damped by time.
 * A continuous weight is learned from out-of-sample historical reduction
 * in price-level MSE. There is no trade wait, no veto, no cross-engine vote,
 * no future data or fake accuracy. Approved side remains unchanged.
 *
 * This is mathematical phase estimation, NOT evidence of real broker edge.
 */
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const logReturn=p=>{
 const a=Number(p?.projectedEntryPrice),b=Number(p?.projectedExitPrice);
 return a>0&&b>0?Math.log(b/a):null;
};
function clean(data,t){
 const seen=new Map();
 for(const row of Array.isArray(data)?data:[]){
  const ts=Number(row?.ts),price=Number(row?.price);
  if(finite(ts)&&finite(price)&&ts<=t&&ts>0&&price>0)
   seen.set(ts,Math.log(price));
 }
 return [...seen].sort((a,b)=>a[0]-b[0]).map(([ts,y])=>({ts,y}));
}
function before(rows,t){
 let low=0,hi=rows.length-1,found=-1;
 while(low<=hi){
  const m=(low+hi)>>1;
  if(rows[m].ts<=t){found=m;low=m+1}else hi=m-1;
 }
 return found>=0?rows[found]:null;
}
function resample(rows,asOf,h){
 if(rows.length<30||rows.at(-1).ts<asOf-2500)return [];
 const span=Math.max(210,Math.min(3600,12*h));
 const step=Math.max(1,Math.min(20,Math.round(h/12)));
 const out=[];
 const to=rows.at(-1).ts;
 for(let t=to-span*1000;t<=to;t+=step*1000){
  const q=before(rows,t);
  if(q&&t-q.ts<=Math.max(1600,Math.min(3500,step*1000)))
   out.push({t:(t-to)/1000,y:q.y});
 }
 return out;
}
function linearSolve(A,v){
 const n=v.length,g=A.map((r,i)=>[...r,v[i]]);
 for(let j=0;j<n;j++){
  let p=j;for(let k=j+1;k<n;k++)if(Math.abs(g[k][j])>Math.abs(g[p][j]))p=k;
  if(Math.abs(g[p][j])<1e-12)return null;
  [g[j],g[p]]=[g[p],g[j]];
  const factor=g[j][j];for(let k=j;k<=n;k++)g[j][k]/=factor;
  for(let k=0;k<n;k++)if(k!==j){
   const x=g[k][j];
   for(let q=j;q<=n;q++)g[k][q]-=x*g[j][q];
  }
 }
 return g.map(r=>r[n]);
}
const frame=(t,period)=>period?
 [1,t/period,Math.cos(2*Math.PI*t/period),Math.sin(2*Math.PI*t/period)]:
 [1,t/100];
function fit(rows,period){
 const dim=period?4:2;
 if(rows.length<25)return null;
 const A=Array.from({length:dim},()=>Array(dim).fill(0)),b=Array(dim).fill(0);
 const reference=rows.at(-1).y;
 for(let idx=0;idx<rows.length;idx++){
  const row=rows[idx],x=frame(row.t,period);
  const weight=.55+.45*(idx+1)/rows.length;
  for(let i=0;i<dim;i++){
   b[i]+=weight*x[i]*(row.y-reference);
   for(let j=0;j<dim;j++)A[i][j]+=weight*x[i]*x[j];
  }
 }
 const strength=rows.length*.015;
 for(let i=0;i<dim;i++)
  A[i][i]+=i>=2?strength:1e-9;
 const solution=linearSolve(A,b);
 return solution?{solution,reference,period}:null;
}
function value(model,t){
 const basis=frame(t,model.period);
 return model.reference+
  basis.reduce((sum,z,i)=>sum+z*model.solution[i],0);
}
function error(model,rows){
 if(!model||!rows.length)return Infinity;
 let mse=0;
 for(const p of rows){
  const delta=p.y-value(model,p.t);
  mse+=delta*delta;
 }
 return mse/rows.length;
}
function candidatePeriods(h,span){
 const list=[];
 // Geometric grid includes sub-horizon, same-horizon and multi-horizon
 // rhythms while requiring >=2 cycles inside the TRAINING window.
 for(let p=8;p<=Math.min(2000,span/2.1);p*=1.3){
  if(p>=Math.max(8,h*.25))list.push(p);
 }
 return list;
}
export function oscillatoryPhaseForecast({
 basePlan,quoteHistory=[],now=Date.now()
}={}){
 const base=logReturn(basePlan);
 const initial={baselineSide:basePlan?.side||null,
  phaseSide:basePlan?.side||null,baselineLogReturn:base,
  phaseLogReturn:base,rawPhaseLogReturn:null,
  correction:0,weight:0,periodSeconds:null,
  pastHoldoutGain:0,pastHoldoutMse:null,model:'local-harmonic-phase',
  researchOnly:true,actionable:false,originalUntouched:true,
  calibrated:false,reason:'insufficient-tick-evidence'};
 const h=Number(basePlan?.delaySeconds),hold=Number(basePlan?.holdingSeconds||h);
 if(!basePlan?.side||!finite(base)||!(h>0&&h<=3600)||!(hold>0&&hold<=3600))
  return initial;
 const rows=clean(quoteHistory,now);
 const observed=resample(rows,now,h);
 if(observed.length<70)return initial;
 const n=observed.length,split=Math.floor(n*.7);
 const train=observed.slice(0,split),validation=observed.slice(split);
 const trainedLinear=fit(train,null),linearError=error(trainedLinear,validation);
 if(!finite(linearError)||linearError<1e-21)return initial;
 const periods=candidatePeriods(h,train.at(-1).t-train[0].t);
 let winner=null;
 for(const period of periods){
  const trainModel=fit(train,period);
  if(!trainModel)continue;
  const mse=error(trainModel,validation);
  if(!finite(mse))continue;
  // Complexity penalty is multiplicative; prevents calling a 4-parameter
  // harmonic an improvement over a 2-parameter linear model due to chance.
  const complexity=(train.length+4)/(Math.max(1,train.length-4));
  const penalized=mse*complexity;
  if(!winner||penalized<winner.mse)
   winner={period,mse:penalized,linearError};
 }
 if(!winner)return initial;
 // Continuous strength, not a minimum-confidence CALL/PUT gate.
 const gain=clamp((winner.linearError-winner.mse)/winner.linearError,-4,1);
 const weight=.9*Math.pow(Math.max(0,gain),.6);
 if(!(weight>0))return {...initial,pastHoldoutGain:gain,
  reason:'past-phase-not-better-than-local-trend'};
 const refit=fit(observed,winner.period);
 if(!refit)return initial;
 const entryDelta=value(refit,h)-value(refit,0);
 const exitDelta=value(refit,h+hold)-value(refit,0);
 const directMovement=exitDelta-entryDelta;
 if(!finite(directMovement))return initial;
 const blended=base*(1-weight)+directMovement*weight;
 return {...initial,
  phaseSide:blended>0?'CALL':blended<0?'PUT':null,
  phaseLogReturn:blended,rawPhaseLogReturn:directMovement,
  correction:blended-base,weight,
  periodSeconds:winner.period,pastHoldoutGain:gain,
  pastHoldoutMse:winner.mse,reason:'validated-past-oscillation-phase'};
}

/**
 * Sentinel 13.4.67 shadow research — direct entry-to-expiry model.
 *
 * The original 13.4.67 side, prices, engine and quote snapshot are untouched.
 * Instead of subtracting TWO independently forecast endpoints, learn the
 * error of that prediction on previously ISSUED forecasts whose true
 * entry and expiry quotes have both arrived.
 *
 * Trains a regularized paired-outcome regression per engine/asset/horizon.
 * One prediction is scored only after its real target expiry, and the
 * correction available at t can use only fully matured observations < t.
 * No ensemble votes, no CALL/PUT suppression, no confidence gate, no orders,
 * no web/DB/Supabase access, no existing UI/card/worker changes.
 */
import {entryRegimeFeatures} from './vnext-residual-reversal-research.mjs';
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const direction=log=>log>0?'CALL':log<0?'PUT':null;
const baselineReturn=(plan)=>{
 if(typeof plan?.expectedLogReturn==='number'&&Number.isFinite(plan.expectedLogReturn))
  return plan.expectedLogReturn;
 const entry=Number(plan?.projectedEntryPrice),exit=Number(plan?.projectedExitPrice);
 return entry>0&&exit>0?Math.log(exit/entry):null;
};
const scaleOf=(features,h)=>Math.max(1e-9,
 Number(features.sigma)*Math.sqrt(Number(h)||30));
function vector(features,baseLog,scale){
 const f=features.features;
 const logVol=Math.log(Math.max(.1,features.volatilityRatio||1));
 return [
  1,clip(baseLog/scale,-5,5)/3,
  clip(f[0],-6,6)/4,clip(f[2],-6,6)/4,
  2*features.eff-1,
  2*f[5]-1,
  clip(4*features.turning-1,-1,2),
  clip((features.failedUp-features.failedDown)/2,-1.5,1.5),
  clip(f[9]/4,-1.5,1.5),
  clip(logVol/1.4,-1.6,1.6),
  clip((features.jumpIntensity-2.3)/4,-1,1.5)
 ];
}
// Small ridge solver, deterministic pivoting, zero-mean correction prior.
function solve(A,y){
 const n=y.length,m=A.map((row,i)=>[...row,y[i]]);
 for(let c=0;c<n;c++){
  let best=c;
  for(let r=c+1;r<n;r++)if(Math.abs(m[r][c])>Math.abs(m[best][c]))best=r;
  if(Math.abs(m[best][c])<1e-10)return null;
  [m[c],m[best]]=[m[best],m[c]];
  const d=m[c][c];for(let j=c;j<=n;j++)m[c][j]/=d;
  for(let r=0;r<n;r++)if(r!==c){
   const q=m[r][c];if(q===0)continue;
   for(let j=c;j<=n;j++)m[r][j]-=q*m[c][j];
  }
 }
 return m.map(r=>r[n]);
}
function independent(rows,h){
 // Multiple highly-overlapping settlements are not independent examples.
 const sorted=rows.slice().sort((a,b)=>b.entryAt-a.entryAt);
 const picked=[];let prior=Infinity;
 for(const r of sorted){
  if(prior-r.exitAt<Math.max(1000,Number(h)*1000))continue;
  picked.push(r);prior=r.entryAt;
  if(picked.length>=160)break;
 }
 return picked;
}
export function directPairedForecast({basePlan,completed=[],quoteHistory=[],now=Date.now()}={}){
 const baseline=baselineReturn(basePlan);
 const fallback={
  method:'same-selected-engine-direct-paired-residual',
  baselineSide:basePlan?.side||null,directSide:basePlan?.side||null,
  baselineLogReturn:baseline,directLogReturn:baseline,
  correction:0,examples:0,independentExamples:0,
  originalUntouched:true,researchOnly:true,actionable:false,
  calibrated:false,reason:'no-completed-evidence'
 };
 if(!basePlan?.side||!finite(baseline))return fallback;
 const f=entryRegimeFeatures(quoteHistory,now,basePlan.delaySeconds);
 if(!f)return{...fallback,reason:'insufficient-current-structure'};
 const h=Number(basePlan.holdingSeconds||basePlan.delaySeconds);
 const eligible=(Array.isArray(completed)?completed:[]).filter(r=>
  r.engineId===basePlan.engineId&&r.asset===basePlan.asset&&
  r.delaySeconds===basePlan.delaySeconds&&r.holdingSeconds===h&&
  r.exitAt<=now&&finite(r.actualLogReturn)&&finite(r.baseLogReturn)&&
  finite(r.issuedScale)&&r.issuedScale>0&&
  Array.isArray(r.features)&&r.features.length===11);
 const picked=independent(eligible,h);
 // Small histories do not support estimating 11 regression coefficients.
 // This is a statistical prior (base=67), not a signal wait/veto.
 if(picked.length<14)return{...fallback,
  examples:eligible.length,independentExamples:picked.length,
  reason:'not-enough-independent-paired-outcomes'};
 const k=11;
 const X=Array.from({length:k},()=>Array(k).fill(0));
 const y=Array(k).fill(0);
 const usable=picked.slice(0,160);
 for(const r of usable){
  const x=r.features,delta=(r.actualLogReturn-r.baseLogReturn)/r.issuedScale;
  const target=clip(delta,-5,5);
  // Age is measured in consecutive settled case count, not simulated days.
  const idx=usable.indexOf(r),weight=Math.exp(-idx/90);
  for(let i=0;i<k;i++){
   y[i]+=weight*x[i]*target;
   for(let j=0;j<k;j++)X[i][j]+=weight*x[i]*x[j];
  }
 }
 // Positive-definite regularization shrinks the learned correction toward
 // zero unless prior, settled examples genuinely support it.
 for(let i=0;i<k;i++)X[i][i]+=12;
 const beta=solve(X,y);
 if(!beta)return{...fallback,examples:eligible.length,
  independentExamples:picked.length,reason:'unresolved-regression'};
 const scale=scaleOf(f,h);
 const x=vector(f,baseline,scale);
 const normalized=clip(x.reduce((sum,v,i)=>sum+v*beta[i],0),-2.5,2.5);
 const correction=normalized*scale;
 const proposed=baseline+correction;
 return {
  ...fallback,baselineLogReturn:baseline,directLogReturn:proposed,
  directSide:direction(proposed),correction,
  examples:eligible.length,independentExamples:picked.length,
  regime:f.regime,volatilityRatio:f.volatilityRatio,
  jumpIntensity:f.jumpIntensity,reason:'learned-from-matured-paired-forecast-errors'
 };
}
const matchQuote=(quotes,target,asOf)=>{
 let a=0,b=quotes.length-1,i=-1;
 while(a<=b){const m=(a+b)>>1;if(quotes[m].ts>=target){i=m;b=m-1}else a=m+1}
 const q=i>=0?quotes[i]:null;
 return q&&q.ts<=asOf&&q.ts-target<=1100?q:null;
};
function knownQuotes(history,now){
 const unique=new Map();
 for(const q of Array.isArray(history)?history:[]){
  const ts=Number(q?.ts),price=Number(q?.price);
  if(finite(ts)&&finite(price)&&ts<=now&&ts>0&&price>0)
   unique.set(ts,Math.log(price));
 }
 return [...unique].sort((a,b)=>a[0]-b[0]).map(([ts,lp])=>({ts,lp}));
}
export function progressDirectPairedStudy({
 previous=null,basePlan=null,quoteHistory=[],now=Date.now()
}={}){
 const prior=previous||{},known=knownQuotes(quoteHistory,now);
 const records=Array.isArray(prior.completed)?[...prior.completed]:[];
 const queue=[];
 for(const item of prior.pending||[]){
  if(now<item.exitAt){queue.push(item);continue}
  const entry=matchQuote(known,item.entryAt,now);
  const exit=matchQuote(known,item.exitAt,now);
  if(entry&&exit){
   records.push({...item,actualLogReturn:exit.lp-entry.lp});
  }else if(now-item.exitAt<=16000)queue.push(item);
 }
 const study=directPairedForecast({basePlan,completed:records,quoteHistory,now});
 const signature=basePlan?.side&&basePlan?.entryAt>now&&
  basePlan?.exitAt>basePlan?.entryAt&&finite(baselineReturn(basePlan))?
  [basePlan.engineId,basePlan.asset,basePlan.delaySeconds,basePlan.issuedAt].join('|'):null;
 if(signature&&signature!==prior.lastRegistered){
  const f=entryRegimeFeatures(quoteHistory,now,basePlan.delaySeconds);
  if(f){
   const scale=scaleOf(f,basePlan.holdingSeconds||basePlan.delaySeconds);
   queue.push({
    engineId:basePlan.engineId,asset:basePlan.asset,
    delaySeconds:basePlan.delaySeconds,
    holdingSeconds:basePlan.holdingSeconds||basePlan.delaySeconds,
    issuedAt:basePlan.issuedAt,entryAt:basePlan.entryAt,
    exitAt:basePlan.exitAt,baseLogReturn:baselineReturn(basePlan),
    directLogReturn:study.directLogReturn,
    baselineSide:basePlan.side,directSide:study.directSide,
    issuedScale:scale,features:vector(f,baselineReturn(basePlan),scale),
    regime:f.regime
   });
  }
 }
 return{
  pending:queue.slice(-1000),completed:records.slice(-1200),
  lastRegistered:signature||prior.lastRegistered||null,
  study,settled:records.length
 };
}

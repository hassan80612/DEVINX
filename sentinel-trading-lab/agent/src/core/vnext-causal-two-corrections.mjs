/**
 * Shadow-only causal combination of two corrections belonging to the SAME
 * selected 13.4.67 motor, asset and future-entry expiration.
 *
 * A prospective ridge stack is trained on corrections that were ACTUALLY
 * available at prior issue times and whose observed entry and expiry are now
 * known. The coefficients are estimated BEFORE the new expiry, never by
 * comparing the eventual winner of the current prediction. No hard
 * CALL/PUT gate, cross-engine vote, artificial wait or DB read.
 */
import {advanceAdaptiveSelectedEngineStudy} from './vnext-adaptive-self-correction.mjs';
import {progressDirectPairedStudy} from './vnext-direct-paired-ridge-research.mjs';
import {entryRegimeFeatures} from './vnext-residual-reversal-research.mjs';
const bound=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const logBase=p=>{
 if(finite(p?.expectedLogReturn))return p.expectedLogReturn;
 const x=Number(p?.projectedEntryPrice),y=Number(p?.projectedExitPrice);
 return x>0&&y>0?Math.log(y/x):null;
};
const side=x=>x>0?'CALL':x<0?'PUT':null;
function quotes(history,now){
 const map=new Map();
 for(const q of Array.isArray(history)?history:[]){
  const ts=Number(q?.ts),price=Number(q?.price);
  if(finite(ts)&&ts<=now&&ts>0&&finite(price)&&price>0)
   map.set(ts,Math.log(price));
 }
 return [...map].sort((a,b)=>a[0]-b[0]).map(([ts,lp])=>({ts,lp}));
}
function after(rows,t,now){
 let lo=0,hi=rows.length-1,idx=-1;
 while(lo<=hi){const m=(lo+hi)>>1;if(rows[m].ts>=t){idx=m;hi=m-1}else lo=m+1}
 const r=idx>=0?rows[idx]:null;
 return r&&r.ts<=now&&r.ts-t<=1100?r:null;
}
const features=(f)=>[
 bound(f?.turning??0,0,1),bound(f?.eff??0,0,1),
 bound(Math.log(Math.max(.1,f?.volatilityRatio||1)),-2.5,2.5),
 bound((f?.failedUp||0)-(f?.failedDown||0),-3,3)
];
function weighting(f0,f1){
 const scales=[.3,.35,.8,1.5];
 let distance=0;
 for(let i=0;i<scales.length;i++){
  const d=(f0[i]-f1[i])/scales[i];distance+=d*d;
 }
 return 1/(1+distance/4);
}
function independent(rows){
 const ordered=rows.slice().sort((a,b)=>b.entryAt-a.entryAt);
 const selected=[];let previous=Infinity;
 for(const e of ordered){
  if(e.exitAt>previous)continue;
  selected.push(e);previous=e.entryAt;
  if(selected.length>=170)break;
 }
 return selected;
}
export function causalTwoCorrectionForecast({
 basePlan,residualCandidate,directCandidate,
 completed=[],quoteHistory=[],now=Date.now()
}={}){
 const baseline=logBase(basePlan),fallback={
  baselineSide:basePlan?.side||null,
  combinedSide:basePlan?.side||null,baselineLogReturn:baseline,
  combinedLogReturn:baseline,rawWeight:0,directWeight:0,
  independentExamples:0,method:'causal-two-residual-ridge',
  researchOnly:true,originalUntouched:true,actionable:false,
  calibrated:false,reason:'not-enough-matured-forecasts'
 };
 if(!basePlan?.side||!finite(baseline))return fallback;
 const context=entryRegimeFeatures(quoteHistory,now,basePlan.delaySeconds);
 if(!context)return {...fallback,reason:'no-current-structure'};
 const selected=independent((Array.isArray(completed)?completed:[])
  .filter(e=>e.engineId===basePlan.engineId&&
   e.asset===basePlan.asset&&e.delaySeconds===basePlan.delaySeconds&&
   e.exitAt<=now&&finite(e.actualLogReturn)&&
   finite(e.rawLogReturn)&&finite(e.directLogReturn)&&
   finite(e.baseLogReturn)&&finite(e.scale)&&e.scale>0&&
   Array.isArray(e.structure)&&e.structure.length===4));
 if(selected.length<12)return {...fallback,independentExamples:selected.length};
 const data=features(context),row=selected.slice(0,170);
 let a=0,b=0,c=0,u=0,v=0;
 for(let index=0;index<row.length;index++){
  const r=row[index],s=Math.max(1e-9,r.scale);
  const x=bound((r.rawLogReturn-r.baseLogReturn)/s,-4,4);
  const z=bound((r.directLogReturn-r.baseLogReturn)/s,-4,4);
  const target=bound((r.actualLogReturn-r.baseLogReturn)/s,-5,5);
  const weight=Math.exp(-index/95)*weighting(data,r.structure);
  a+=weight*x*x;b+=weight*x*z;c+=weight*z*z;
  u+=weight*x*target;v+=weight*z*target;
 }
 const ridge=7,det=(a+ridge)*(c+ridge)-b*b;
 let w1=det>1e-14?((c+ridge)*u-b*v)/det:0;
 let w2=det>1e-14?((a+ridge)*v-b*u)/det:0;
 // Bounded estimators prevent exploding prices, NOT a signal veto. Signs
 // are free: negative learned weight means past correction was harmful.
 w1=bound(w1,-.6,1.4);w2=bound(w2,-.6,1.4);
 const size=Math.abs(w1)+Math.abs(w2);
 if(size>1.5){w1*=1.5/size;w2*=1.5/size}
 const raw=Number.isFinite(residualCandidate?.correctedLogReturn)?
  residualCandidate.correctedLogReturn:baseline;
 const direct=Number.isFinite(directCandidate?.directLogReturn)?
  directCandidate.directLogReturn:baseline;
 const corrected=baseline+w1*(raw-baseline)+w2*(direct-baseline);
 return {...fallback,combinedSide:side(corrected),
  combinedLogReturn:corrected,rawWeight:w1,directWeight:w2,
  independentExamples:selected.length,structure:data,
  reason:'learned-from-prior-settled-paired-forecast-errors'};
}
export function progressCausalTwoCorrectionStudy({
 previous=null,basePlan=null,quoteHistory=[],now=Date.now()
}={}){
 const prior=previous||{};
 const residual=advanceAdaptiveSelectedEngineStudy({
  previous:prior.residual||null,basePlan,quoteHistory,now});
 const direct=progressDirectPairedStudy({
  previous:prior.direct||null,basePlan,quoteHistory,now});
 const oldRecords=Array.isArray(prior.completed)?[...prior.completed]:[];
 const history=quotes(quoteHistory,now),pending=[];
 for(const item of prior.pending||[]){
  if(now<item.exitAt){pending.push(item);continue}
  const e=after(history,item.entryAt,now),x=after(history,item.exitAt,now);
  if(e&&x)oldRecords.push({...item,actualLogReturn:x.lp-e.lp});
  else if(now-item.exitAt<=16000)pending.push(item);
 }
 const combined=causalTwoCorrectionForecast({
  basePlan,residualCandidate:residual.candidate,
  directCandidate:direct.study,completed:oldRecords,
  quoteHistory,now});
 const base=logBase(basePlan);
 const signature=basePlan?.side&&finite(base)&&
  Number(basePlan.entryAt)>now&&
  Number(basePlan.exitAt)>Number(basePlan.entryAt)?
  [basePlan.engineId,basePlan.asset,basePlan.delaySeconds,
   basePlan.issuedAt].join('|'):null;
 if(signature&&signature!==prior.lastRegistered){
  const f=entryRegimeFeatures(quoteHistory,now,basePlan.delaySeconds);
  if(f){
   pending.push({
    engineId:basePlan.engineId,asset:basePlan.asset,
    delaySeconds:basePlan.delaySeconds,holdingSeconds:basePlan.holdingSeconds,
    issuedAt:basePlan.issuedAt,entryAt:basePlan.entryAt,exitAt:basePlan.exitAt,
    baseLogReturn:base,
    rawLogReturn:Number.isFinite(residual.candidate?.correctedLogReturn)?
     residual.candidate.correctedLogReturn:base,
    directLogReturn:Number.isFinite(direct.study?.directLogReturn)?
     direct.study.directLogReturn:base,
    combinedLogReturn:combined.combinedLogReturn,
    scale:Math.max(1e-9,f.sigma*Math.sqrt(basePlan.holdingSeconds||basePlan.delaySeconds)),
    structure:features(f),
    baselineSide:basePlan.side,
    rawSide:residual.candidate?.shadowSide||basePlan.side,
    directSide:direct.study?.directSide||basePlan.side,
    combinedSide:combined.combinedSide
   });
  }
 }
 return{
  residual,direct,combined,completed:oldRecords.slice(-1200),
  pending:pending.slice(-1200),
  lastRegistered:signature||prior.lastRegistered||null
 };
}

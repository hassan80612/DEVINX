/**
 * Research: fuse 13.4.67 with its SAME-engine, SAME-horizon residual
 * correction using only forecast errors whose ENTRY and EXIT were already
 * observed. Neither a separate strategy nor an after-the-fact "winner" pick.
 *
 * Adaptive coefficient solves locally weighted ridge regression:
 *      min_a SUM w*(realizedError - a*pastCorrection)^2 + ridge*a^2
 * with a in [0,1]. The recorded a is frozen when issued.
 * Exposes raw 67, ungated residual 67, and adaptive 67 in SHADOW only.
 */
import {advanceSelectedEngineResidualStudy,entryRegimeFeatures}
 from './vnext-residual-reversal-research.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rawLog=(plan)=>{
 if(plan?.expectedLogReturn!==undefined&&Number.isFinite(Number(plan.expectedLogReturn)))
  return Number(plan.expectedLogReturn);
 const e=Number(plan?.projectedEntryPrice),x=Number(plan?.projectedExitPrice);
 return e>0&&x>0?Math.log(x/e):null;
};
const distance=(a,b)=>{
 // Features are already volatility normalized. These dimensions are the
 // selected horizon's shape, failed-break detail and risk-regime volatility.
 const weights=[1.1,1,1,.6,.8,.7,1.2,1.1,1.1,1,2.2,1.5];
 const scales=[2.7,2.7,2.7,2.7,.3,.32,.26,.65,.65,2.7,1.1,2.5];
 let sum=0,w=0;
 for(let i=0;i<weights.length;i++){
  const n=(a[i]-b[i])/scales[i];
  sum+=weights[i]*n*n;w+=weights[i];
 }
 return Math.sqrt(sum/w);
};
export function combineSelectedEngineAdaptive({
 basePlan,study,quoteHistory=[],now=Date.now()
}={}){
 const log=rawLog(basePlan);
 const fallback={side:basePlan?.side||null,baselineSide:basePlan?.side||null,
  originalLogReturn:log,correctedLogReturn:log,
  blendWeight:0,observations:0,method:'same-engine-forward-residual-ridge',
  actionable:false,calibrated:false};
 if(!basePlan?.side||log===null)return fallback;
 const features=entryRegimeFeatures(quoteHistory,now,basePlan.delaySeconds);
 const candidate=study?.candidate;
 if(!features||!candidate||!(Number.isFinite(candidate.correction)))
  return fallback;
 const rows=(study?.examples||[]).filter(e=>
  e.engineId===basePlan.engineId&&e.asset===basePlan.asset&&
  e.delaySeconds===basePlan.delaySeconds&&e.exitAt<=now&&
  Array.isArray(e.features)&&e.features.length===features.features.length&&
  Number.isFinite(e.residual)&&Number.isFinite(e.rawCorrection)&&
  Math.abs(e.rawCorrection)>1e-14);
 const nearest=rows.map(e=>({row:e,d:distance(features.features,e.features)}))
  .sort((a,b)=>a.d-b.d).slice(0,Math.min(22,rows.length));
 const scale=features.sigma*Math.sqrt(
  Number(basePlan.holdingSeconds||basePlan.delaySeconds||30));
 let top=0,bot=0,scoreTotal=0,winOriginal=0,winRaw=0;
 for(const {row,d} of nearest){
  const days=Math.max(0,(now-row.exitAt)/86400000);
  const w=Math.exp(-days/3)/(.35+d)**2;
  top+=w*row.rawCorrection*row.residual;
  bot+=w*row.rawCorrection**2;
  scoreTotal+=w;
  const trueSide=row.actualLogReturn>0?'CALL':row.actualLogReturn<0?'PUT':null;
  if(trueSide&&row.baselineSide===trueSide)winOriginal+=w;
  if(trueSide&&row.shadowSide===trueSide)winRaw+=w;
 }
 // The ridge prior points to *preserving the original 67* when there is no
 // demonstrated stable residual correction. No 70%-gate, wait or strategy
 // switch. The coefficient changes smoothly between 0 and 1.
 const ridge=4*Math.max(1e-12,scale)**2;
 const weight=bot>0?clamp(top/(bot+ridge),0,1):0;
 const proposed=log+weight*candidate.correction;
 return {...fallback,
  side:proposed>0?'CALL':proposed<0?'PUT':null,
  correctedLogReturn:proposed,blendWeight:weight,
  rawSide:candidate.shadowSide,rawCorrection:candidate.correction,
  observations:nearest.length,regime:features.regime,
  volatilityRatio:features.volatilityRatio,
  jumpIntensity:features.jumpIntensity,
  priorWeightedWins:{original:winOriginal,raw:winRaw,weight:scoreTotal}};
}
export function advanceAdaptiveSelectedEngineStudy({
 previous=null,basePlan=null,quoteHistory=[],now=Date.now()
}={}){
 const history=advanceSelectedEngineResidualStudy({
  previous,basePlan,quoteHistory,now
 });
 const adaptive=combineSelectedEngineAdaptive({
  basePlan,study:history,quoteHistory,now
 });
 // Store the adaptive decision at the instant of issue, never substitute
 // the eventual outcome or revise after the fact.
 const pending=history.pending.map(e=>{
  if(basePlan&&e.engineId===basePlan.engineId&&
     e.issuedAt===basePlan.issuedAt&&e.delaySeconds===basePlan.delaySeconds&&
     e.asset===basePlan.asset)
   return {...e,adaptiveSide:adaptive.side,
    adaptiveWeight:adaptive.blendWeight,
    adaptiveCorrection:Number(adaptive.correctedLogReturn)-rawLog(basePlan)};
  return e;
 });
 return {...history,pending,adaptive};
}

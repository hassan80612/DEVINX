/**
 * Same-engine, all-horizon adaptive residual research (NOT LIVE TRADING).
 *
 * Preserves the approved 13.4.67 forecast. Only evaluates two estimates
 * belonging to the SAME selected engine and lead/holding horizon:
 *   base67 = projected future expiry - projected future entry
 *   corrected67 = base67 + historically learned residual
 *
 * This learns a continuous interpolation coefficient from past *settled*
 * observations where BOTH entry and expiry were actually quoted. It is not
 * an ensemble, regime veto, delayed action or rule choosing the past winner.
 * A candidate's performance is NEVER known at its issue timestamp.
 */
import {entryRegimeFeatures} from './vnext-residual-reversal-research.mjs';
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const baseReturn=plan=>{
 const p=Number(plan?.projectedEntryPrice),q=Number(plan?.projectedExitPrice);
 return p>0&&q>0?Math.log(q/p):null;
};
const distance=(a,b)=>{
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||a.length!==10)return Infinity;
 const scale=[2.5,2.5,2.5,2.5,.25,.25,.2,.55,.55,2.5];
 let d=0;
 for(let i=0;i<scale.length;i++){
  const dx=(a[i]-b[i])/scale[i];
  d+=dx*dx;
 }
 return Math.sqrt(d/scale.length);
};
export function adaptSameEngineFutureEntry({
 basePlan=null,study=null,quoteHistory=[],now=Date.now()
}={}){
 const b=baseReturn(basePlan);
 const unchanged={baselineSide:basePlan?.side||null,
  adaptiveSide:basePlan?.side||null,adaptiveLogReturn:b,
  contribution:0,samples:0,independentSamples:0,reason:'baseline-only',
  actionable:false,calibrated:false};
 if(b===null||!['CALL','PUT'].includes(basePlan?.side))return unchanged;
 const current=entryRegimeFeatures(quoteHistory,now);
 if(!current)return{...unchanged,reason:'insufficient-regime-history'};
 const h=Number(basePlan.delaySeconds);
 const candidates=(Array.isArray(study?.examples)?study.examples:[])
  .filter(x=>x.engineId===basePlan.engineId&&x.asset===basePlan.asset&&
   Number(x.delaySeconds)===h&&Number(x.exitAt)<=now&&
   Number.isFinite(x.actualLogReturn)&&Number.isFinite(x.expectedLogReturn)&&
   Number.isFinite(x.candidateLogReturn)&&Array.isArray(x.features)&&
   Number(x.scale)>0)
  .map(x=>({...x,d:distance(x.features,current.features)}))
  .filter(x=>Number.isFinite(x.d))
  .sort((a,b)=>a.d-b.d).slice(0,32);
 if(!candidates.length)return{...unchanged,regime:current.regime,
  reason:'no-observed-comparisons'};
 // Nearby analogues may share overlapping future windows; cap their
 // effective influence by age windows. This does not invent success rates.
 const weights=[],selected=[];
 for(const x of candidates){
  const age=Math.max(0,now-Number(x.exitAt));
  const w=Math.exp(-age/Math.max(900000,24*h*1000))/
   (.6+x.d)**2;
  // Cut nearly identical overlapping maturities' statistical influence.
  const sameWindow=selected.some(y=>Math.abs(y.exitAt-x.exitAt)<h*1000);
  const adjusted=w*(sameWindow?.25:1);
  if(!sameWindow)selected.push(x);
  weights.push(adjusted);
 }
 let covariance=0,variance=0,completed=0;
 for(let i=0;i<candidates.length;i++){
  const e=candidates[i],w=weights[i];
  const sigma=Math.max(1e-10,e.scale);
  const delta=clamp((e.candidateLogReturn-e.expectedLogReturn)/sigma,-3,3);
  const error=clamp((e.actualLogReturn-e.expectedLogReturn)/sigma,-8,8);
  covariance+=w*delta*error;
  variance+=w*delta*delta;
  completed+=w;
 }
 // Ridge shrinkage: a smoothly learned contribution, NOT a fixed filter
 // preventing a trade or requiring a quote to wait. In a regime where past
 // corrections caused harm, the coefficient automatically falls to 0.
 const optimal=variance>0?clamp(covariance/(variance*1.35),0,1):0;
 const reliability=selected.length/(selected.length+6);
 const alpha=optimal*reliability;
 const proposal=Number(study?.candidate?.correctedLogReturn);
 if(!Number.isFinite(proposal))return{...unchanged,regime:current.regime,
  samples:candidates.length,reason:'no-residual-proposal'};
 const logReturn=b+alpha*(proposal-b);
 const adaptiveSide=logReturn>0?'CALL':logReturn<0?'PUT':null;
 return{baselineSide:basePlan.side,adaptiveSide,adaptiveLogReturn:logReturn,
  contribution:alpha,samples:candidates.length,
  independentSamples:selected.length,regime:current.regime,
  candidateSide:study?.candidate?.shadowSide||basePlan.side,
  reason:'online-past-errors-ridge-shrinkage',actionable:false,calibrated:false};
}

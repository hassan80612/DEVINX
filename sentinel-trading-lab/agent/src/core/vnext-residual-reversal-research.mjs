/**
 * 13.4.67 RESEARCH ONLY - selected-engine forecast-error correction.
 *
 * The 67's projected entry and expiry remain untouched. Corrections are
 * learned from the motor's OWN past fixed, settled scheduled entries, using
 * *observed* P(t+H) and P(t+2H). No other motor, strategy swapping, fixed
 * delay, order gate, Supabase write or future quote contamination.
 *
 * This module does not override the production CALL/PUT. A chronological
 * shadow experiment must prove it on held-out real quotes before promotion.
 */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const clean=(rows,now)=>[...new Map((Array.isArray(rows)?rows:[])
  .filter(q=>Number.isFinite(Number(q?.ts))&&Number.isFinite(Number(q?.price))&&
    Number(q.price)>0&&Number(q.ts)<=now&&Number(q.ts)>=0)
  .map(q=>[Number(q.ts),Math.log(Number(q.price))]))]
  .sort((a,b)=>a[0]-b[0]).map(([ts,lp])=>({ts,lp}));
const before=(rows,target)=>{
 let lo=0,hi=rows.length-1,index=-1;
 while(lo<=hi){const m=(lo+hi)>>1;if(rows[m].ts<=target){index=m;lo=m+1}else hi=m-1}
 return index<0?null:rows[index];
};
const after=(rows,target)=>{
 let lo=0,hi=rows.length-1,index=-1;
 while(lo<=hi){const m=(lo+hi)>>1;if(rows[m].ts>=target){index=m;hi=m-1}else lo=m+1}
 return index<0?null:rows[index];
};
export function entryRegimeFeatures(quoteHistory,asOf){
 const t=Number(asOf);if(!(t>0))return null;
 const rows=clean(quoteHistory,t),last=rows.at(-1);
 if(rows.length<45||!last||last.ts<t-2500)return null;
 const lookup=(sec)=>{const r=before(rows,last.ts-sec*1000);
  return r&&last.ts-sec*1000-r.ts<=2500?r:null};
 const at=[5,12,30,70].map(lookup);
 if(at.some(x=>!x))return null;
 const history=rows.filter(r=>r.ts>=last.ts-70000);
 if(history.length<35)return null;
 let realized=0,elapsed=0,path=0;
 for(let i=1;i<history.length;i++){
  const dt=(history[i].ts-history[i-1].ts)/1000;
  if(!(dt>0&&dt<=5))continue;
  const d=history[i].lp-history[i-1].lp;
  realized+=d*d;elapsed+=dt;path+=Math.abs(d);
 }
 if(!(elapsed>0)||!(path>0))return null;
 const sigma=Math.max(1e-9,Math.sqrt(realized/elapsed));
 const returns=at.map((p,i)=>clamp((last.lp-p.lp)/(sigma*Math.sqrt([5,12,30,70][i])),-6,6));
 const eff=clamp(Math.abs(last.lp-history[0].lp)/path,0,1);
 const hi=Math.max(...history.map(x=>x.lp)),lo=Math.min(...history.map(x=>x.lp));
 const position=hi>lo?clamp((last.lp-lo)/(hi-lo),0,1):.5;
 // Count 4-second directional turns, not every high-frequency quote.
 let turns=0,sign=0,prior=null,sections=0;
 for(let atTime=last.ts-68000;atTime<=last.ts;atTime+=4000){
  const point=before(rows,atTime);
  if(!point||atTime-point.ts>3000)continue;
  if(prior){const z=Math.sign(point.lp-prior.lp);
   if(sign&&z&&sign!==z)turns++;
   if(z)sign=z;sections++}
  prior=point;
 }
 const turning=clamp(turns/Math.max(1,sections-1),0,1);
 const priorRange=history.filter(x=>x.ts<=last.ts-15000);
 const finalPart=history.filter(x=>x.ts>last.ts-15000);
 const oldHigh=Math.max(...priorRange.map(x=>x.lp));
 const oldLow=Math.min(...priorRange.map(x=>x.lp));
 const recentHigh=Math.max(...finalPart.map(x=>x.lp));
 const recentLow=Math.min(...finalPart.map(x=>x.lp));
 const scale=Math.max(sigma*Math.sqrt(30),1e-9);
 // Continuous break/re-entry description. Returning back inside a former
 // range is not, by itself, proof that a larger reversal will happen.
 const failedUp=recentHigh>oldHigh&&last.lp<oldHigh?
  clamp((recentHigh-oldHigh)/scale,0,3):0;
 const failedDown=recentLow<oldLow&&last.lp>oldLow?
  clamp((oldLow-recentLow)/scale,0,3):0;
 const acceleration=clamp(returns[0]-returns[2],-6,6);
 const features=[...returns,eff,position,turning,failedUp,failedDown,acceleration];
 const probableRange=turning>.2&&eff<.45;
 const opposedShort=returns[0]*returns[2]<0&&Math.abs(acceleration)>.5;
 const regime=probableRange?'oscillation':
   failedUp>.2||failedDown>.2?'false-break':
   opposedShort&&turning<.2?'reversal':
   eff>.5?'trend':'mixed';
 return {features,sigma,regime,turning,eff,failedUp,failedDown,asOf:last.ts};
}
const baselineLogReturn=plan=>{
 const raw=Number(plan?.expectedLogReturn);
 if(plan?.expectedLogReturn!==undefined&&Number.isFinite(raw))return raw;
 const entry=Number(plan?.projectedEntryPrice),exit=Number(plan?.projectedExitPrice);
 return entry>0&&exit>0?Math.log(exit/entry):null;
};
const match=(x,y)=>{
 const weights=[1.4,1.3,1.2,.75,1.3,1.3,1.6,1.2,1.2,1.35];
 const scales=[2.5,2.5,2.5,2.5,.25,.25,.2,.55,.55,2.5];
 let sum=0,w=0;
 for(let i=0;i<weights.length;i++){
  const d=(x[i]-y[i])/scales[i];
  sum+=weights[i]*d*d;w+=weights[i];
 }
 return Math.sqrt(sum/w);
};
export function correctSelectedEngineFutureEntry({basePlan,examples=[],quoteHistory=[],now=Date.now()}={}){
 if(!basePlan?.side||baselineLogReturn(basePlan)===null)
  return {baselineSide:basePlan?.side||null,shadowSide:basePlan?.side||null,
   correction:0,observations:0,reason:'no-base-forecast'};
 const current=entryRegimeFeatures(quoteHistory,now);
 if(!current)return{baselineSide:basePlan.side,shadowSide:basePlan.side,
  correction:0,observations:0,reason:'no-structure'};
 const history=(Array.isArray(examples)?examples:[]).filter(e=>
  e.engineId===basePlan.engineId&&e.asset===basePlan.asset&&
  e.delaySeconds===basePlan.delaySeconds&&Number(e.exitAt)<=now&&
  Array.isArray(e.features)&&Number.isFinite(e.residual));
 if(!history.length)return{baselineSide:basePlan.side,shadowSide:basePlan.side,
  correction:0,observations:0,reason:'no-completed-samples',regime:current.regime};
 const nearest=history.map(e=>({e,d:match(current.features,e.features)}))
  .sort((a,b)=>a.d-b.d).slice(0,Math.min(14,history.length));
 let total=0,mean=0;
 for(const {e,d} of nearest){
  const ageDays=Math.max(0,(now-e.exitAt)/86400000);
  const w=Math.exp(-ageDays/3)/(.3+d)**2;
  mean+=w*e.residual;total+=w;
 }
 const observedResidual=total?mean/total:0;
 // Conservative statistical shrinkage and volatility-bounded numeric
 // correction are NOT decision gates. No forced wait, no minimum confidence
 // and no engine replacement. The historical residual can have either sign.
 const reliability=nearest.length/(nearest.length+8);
 const scale=Number(current.sigma)*Math.sqrt(basePlan.holdingSeconds||basePlan.delaySeconds||30);
 const correction=clamp(reliability*observedResidual,-2*scale,2*scale);
 const corrected=baselineLogReturn(basePlan)+correction;
 const shadowSide=corrected>0?'CALL':corrected<0?'PUT':null;
 return{baselineSide:basePlan.side,shadowSide,
  correction,correctedLogReturn:corrected,observations:nearest.length,
  regime:current.regime,turning:current.turning,failedUp:current.failedUp,
  failedDown:current.failedDown,reason:'matched-past-model-errors'};
}
export function advanceSelectedEngineResidualStudy({
 previous=null,basePlan=null,quoteHistory=[],now=Date.now()
}={}){
 const prior=previous||{},pending=prior.pending||[],finished=prior.examples||[];
 const rows=clean(quoteHistory,now),newPending=[],newFinished=[...finished];
 for(const rec of pending){
  if(now<rec.exitAt){newPending.push(rec);continue}
  const entry=after(rows,rec.entryAt),exit=after(rows,rec.exitAt);
  if(!entry||!exit||entry.ts-rec.entryAt>1100||exit.ts-rec.exitAt>1100){
   if(now-rec.exitAt<=16000)newPending.push(rec);
   continue;
  }
  const actual=exit.lp-entry.lp;
  newFinished.push({...rec,residual:actual-rec.expectedLogReturn,actualLogReturn:actual});
 }
 const plan=basePlan&&basePlan.side&&Number(basePlan.entryAt)>now&&
  Number(basePlan.exitAt)>Number(basePlan.entryAt)?basePlan:null;
 // Evaluate candidate only against prior COMPLETE outcomes; the new
 // prediction cannot be allowed to teach itself its future answer.
 const candidate=plan?correctSelectedEngineFutureEntry({
  basePlan:plan,examples:newFinished,quoteHistory,now}):null;
 const signature=plan?[plan.engineId,plan.asset,plan.delaySeconds,plan.issuedAt].join('|'):null;
 if(plan&&signature!==prior.lastRegistered){
  const features=entryRegimeFeatures(quoteHistory,now);
  if(features&&baselineLogReturn(plan)!==null)
   newPending.push({engineId:plan.engineId,asset:plan.asset,
    delaySeconds:plan.delaySeconds,issuedAt:plan.issuedAt,
    entryAt:plan.entryAt,exitAt:plan.exitAt,
    expectedLogReturn:baselineLogReturn(plan),
    baselineSide:plan.side,shadowSide:candidate?.shadowSide||plan.side,
    features:features.features,regime:features.regime});
 }
 return {
  pending:newPending.slice(-600),examples:newFinished.slice(-350),
  lastRegistered:signature||prior.lastRegistered||null,
  candidate,completed:newFinished.length
 };
}

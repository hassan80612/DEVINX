// Fast, bounded probability contribution to the original 13.9.66 CALL/PUT.
// The original analyst owns the entry; this estimate can only reject a weak
// direction when fresh quote evidence strongly disagrees. It never flips
// a CALL into PUT, starts a second countdown or waits for backtesting labels.
// Statistical estimate is uncalibrated; thresholds are conservative safeguards.
const SIDES=new Set(['CALL','PUT']);
export function combine66WithProbability(original,estimate,{durationMs}={}){
 if(!original||original.ready!==true||!SIDES.has(original.side)||
    ![30000,60000].includes(Number(durationMs))||
    !Number.isFinite(estimate?.pCall)||!Number.isFinite(estimate?.pPut)||
    Math.abs(estimate.pCall+estimate.pPut-1)>.005){
   return original;
 }
 const pSame=original.side==='CALL'?estimate.pCall:estimate.pPut;
 const pOpp=1-pSame;
 const strength=original.strength;
 // Never downgrade a verified range/level reversal solely because a
 // momentum-biased, uncalibrated estimator favors continuation.
 const protectedReversal=original.reason==='closed-range-extreme-reversal-confirmed'||
   /rejection|reversal|retest|structure-change|level/.test(String(original.reason||''));
 // No added wait: only at the moment 66 was *already* about to release
 // a lower-strength directional trade, and only on very strong disagreement.
 if(!protectedReversal&&Number.isFinite(strength)&&strength>=0&&
    strength<55&&pOpp>=.71){
  return {...original,ready:false,side:null,
   provisionalSide:original.side,probabilityConflict:true,
   reason:'probability-conflict-on-weak-66-signal'};
 }
 return {...original,probabilityAgreement:pSame,probabilityConflict:false};
}

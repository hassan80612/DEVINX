// Original 13.9.66 is authoritative until genuinely comparable live broker
// quote outcomes show a consistent opposite-side advantage for weak signals.
// This callback never waits, calls a broker or schedules an operation.
const SIDES=new Set(['CALL','PUT']);
export function combine66WithProbability(original,estimate,{durationMs,proof=null,enforceFinalExpiryVote=false}={}){
 // Candidate 13.9.90: the forecast-at-expiry participates in ADMISSION.
 // A near 50/50 uncalibrated score is never a reason to enter now. No
 // waiting timer, broker request or changed expiration is introduced.
 const actionable=original?.ready===true&&SIDES.has(original.side)&&
   [30000,60000,120000,300000].includes(Number(durationMs));
 const reject=(reason,extra={})=>({...original,ready:false,side:null,reason,
  entryVoteRejected:true,probabilityWeight:.60,structureWeight:.40,...extra});
 if(enforceFinalExpiryVote&&actionable&&(!Number.isFinite(estimate?.pCall)||
     !Number.isFinite(estimate?.pPut)||Math.abs(estimate.pCall+estimate.pPut-1)>.005))
   return reject('expiry-probability-not-ready');
 if(!original||original.ready!==true||!SIDES.has(original.side)||
    ![30000,60000,120000,300000].includes(Number(durationMs))||
    !Number.isFinite(estimate?.pCall)||!Number.isFinite(estimate?.pPut)||
    Math.abs(estimate.pCall+estimate.pPut-1)>.005)return original;
 const pSame=original.side==='CALL'?estimate.pCall:estimate.pPut;
 const pOpp=1-pSame;
 const strength=original.strength;
 const weak=strength!=null&&Number.isFinite(Number(strength))&&
   Number(strength)>=0&&Number(strength)<62;
 const protectedReversal=/rejection|reversal|retest|structure-change|level/.test(String(original.reason||''));
 // 60/40 compares the probability model's selected-expiry directional
 // estimate with a conservative bounded structural *score*. Scores are
 // NOT calibrated WIN percentages. Only previously verified expiry
 // outcomes can authorize a departure from the original structural side.
 const structuralSame=.5+Math.min(100,Math.max(0,Number(strength)||0))*.0025;
 const combinedSame=.60*pSame+.40*structuralSame;
 const combinedOpp=1-combinedSame;
 const weights={probabilityWeight:.60,structureWeight:.40,
  blendedDirectionalSameScore:combinedSame,blendedDirectionalOppositeScore:combinedOpp,
  calibratedWinProbability:false};
 // Only the CURRENT asset/provider/expiry/strategy's independent,
 // non-overlapping expiry samples may authorize inversion. A probability
 // percentage by itself never has that power. A slightly broader WEAK
 // structural score can participate only after identical-expiry outcomes
 // have already validated the opposite direction, with no new waiting.
 if(weak&&!protectedReversal&&pOpp>=.58&&combinedOpp>.50&&proof?.approved===true&&
    Number(proof.n)>=(Number(durationMs)>=300000?50:Number(durationMs)>=120000?30:16)&&
    Number(proof.observedOppositeRate)>=.78){
  return {...original,side:original.side==='CALL'?'PUT':'CALL',
   reason:'locally-verified-opposite-direction',probabilityOverride:true,
   probabilityAgreement:pOpp,originalSide:original.side,
   originalStrength:Number(strength),probabilityEvidenceSamples:proof.n,...weights};
 }
 // In the candidate, admission requires BOTH the 60/40 vote AND
 // a directional expiry estimate stronger than its payout-aware preliminary
 // threshold. A conflict becomes WAIT; it is never forced into an unverified
 // opposite trade. This deliberately favors fewer, more defensible entries.
 if(enforceFinalExpiryVote){
   const minimum=Number.isFinite(Number(estimate.threshold))?
     Math.max(.59,Math.min(.70,Number(estimate.threshold))):.61;
   if(estimate.ready!==true||estimate.side!==original.side||pSame<minimum||
      combinedSame<.56){
     return reject('expiry-probability-not-convincing',{
       ...weights,probabilityAgreement:pSame,probabilityConflict:pOpp,
       probabilityThreshold:minimum,protectedReversal
     });
   }
 }
 // Only veto a strong observed counter-trend pullback; do not guess the
 // opposite trade or weaken level/retest reversals already recognized.
 if(Number(durationMs)<=60000&&!protectedReversal&&estimate.fastReversalAgainst30s===true&&
    estimate.trendSide===original.side&&estimate.fastSide!==original.side&&
    estimate.ready===true&&pOpp>=.64){
  return {...original,ready:false,side:null,reason:'rapid-countertrend-retraction-risk',
    probabilityOverride:false,probabilityAgreement:pSame,probabilityConflict:pOpp,...weights};
 }
 return {...original,probabilityAgreement:pSame,probabilityOverride:false,...weights};
}

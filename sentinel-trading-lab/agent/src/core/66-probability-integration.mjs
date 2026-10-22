// Original 13.9.66 is authoritative until genuinely comparable live broker
// quote outcomes show a consistent opposite-side advantage for weak signals.
// This callback never waits, calls a broker or schedules an operation.
const SIDES=new Set(['CALL','PUT']);
export function combine66WithProbability(original,estimate,{durationMs,proof=null,enforceFinalExpiryVote=false}={}){
 // Candidate 13.9.90: all available evidence contributes to ADMISSION.
 // Never require the auxiliary estimate to be calibrated or even available:
 // proven price structure and confirmed turns can still signal immediately.
 // No timer, broker request, or extra analysis loop is introduced.
const reject=(reason,extra={})=>({...original,ready:false,side:null,reason,
  entryVoteRejected:true,probabilityWeight:.60,structureWeight:.40,...extra});
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
 // A verified structure still owns a strong setup. The combined vote only
 // rejects marginal *unprotected* continuation setups where both sources
 // together show a near-tie / materially contrary expiry trajectory.
 // No calibration flag, probability.ready, payout or future sample is
 // necessary to release a confirmed structural reversal.
 if(enforceFinalExpiryVote&&!protectedReversal){
   const solidStructure=Number.isFinite(Number(strength))&&Number(strength)>=75;
   const narrowConflict=pSame<.56&&combinedSame<.59;
   const netOpposite=combinedOpp>=.53;
   if(!solidStructure&&(narrowConflict||netOpposite))
     return reject('combined-structure-expiry-conflict',{
       ...weights,probabilityAgreement:pSame,probabilityConflict:pOpp
     });
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

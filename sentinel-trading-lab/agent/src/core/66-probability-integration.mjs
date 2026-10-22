// Original 13.9.66 is authoritative until genuinely comparable live broker
// quote outcomes show a consistent opposite-side advantage for weak signals.
// This callback never waits, calls a broker or schedules an operation.
const SIDES=new Set(['CALL','PUT']);
export function combine66WithProbability(original,estimate,{durationMs,proof=null}={}){
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
 // Only the CURRENT asset/provider/expiry/strategy's independent,
 // non-overlapping expiry samples may authorize inversion. A probability
 // percentage by itself never has that power. A slightly broader WEAK
 // structural score can participate only after identical-expiry outcomes
 // have already validated the opposite direction, with no new waiting.
 if(weak&&!protectedReversal&&pOpp>=.58&&proof?.approved===true&&
    Number(proof.n)>=(Number(durationMs)>=300000?50:Number(durationMs)>=120000?30:16)&&
    Number(proof.observedOppositeRate)>=.78){
  return {...original,side:original.side==='CALL'?'PUT':'CALL',
   reason:'locally-verified-opposite-direction',probabilityOverride:true,
   probabilityAgreement:pOpp,originalSide:original.side,
   originalStrength:Number(strength),probabilityEvidenceSamples:proof.n};
 }
 // Only veto a strong observed counter-trend pullback; do not guess the
 // opposite trade or weaken level/retest reversals already recognized.
 if(Number(durationMs)<=60000&&!protectedReversal&&estimate.fastReversalAgainst30s===true&&
    estimate.trendSide===original.side&&estimate.fastSide!==original.side&&
    estimate.ready===true&&pOpp>=.64){
  return {...original,ready:false,side:null,reason:'rapid-countertrend-retraction-risk',
    probabilityOverride:false,probabilityAgreement:pSame,probabilityConflict:pOpp};
 }
 return {...original,probabilityAgreement:pSame,probabilityOverride:false};
}

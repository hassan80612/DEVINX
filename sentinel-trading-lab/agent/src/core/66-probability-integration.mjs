// Original 13.9.66 is authoritative until genuinely comparable live broker
// quote outcomes show a profitable opposite-side advantage for weak signals.
// This callback never waits, calls a broker or schedules an operation.
const SIDES=new Set(['CALL','PUT']);
export function combine66WithProbability(original,estimate,{durationMs,proof=null}={}){
 if(!original||original.ready!==true||!SIDES.has(original.side)||
    ![30000,60000].includes(Number(durationMs))||
    !Number.isFinite(estimate?.pCall)||!Number.isFinite(estimate?.pPut)||
    Math.abs(estimate.pCall+estimate.pPut-1)>.005)return original;
 const pSame=original.side==='CALL'?estimate.pCall:estimate.pPut;
 const pOpp=1-pSame;
 const strength=original.strength;
 const weak=strength!=null&&Number.isFinite(Number(strength))&&
   Number(strength)>=0&&Number(strength)<55;
 const protectedReversal=/rejection|reversal|retest|structure-change|level/.test(String(original.reason||''));
 // Only the CURRENT asset/provider/expiry/strategy's independent,
 // non-overlapping expiry samples may authorize inversion. A probability
 // percentage by itself never has that power.
 if(weak&&!protectedReversal&&pOpp>=.60&&proof?.approved===true&&
    Number(proof.n)>=12&&Number(proof.observedOppositeRate)>=.78){
  return {...original,side:original.side==='CALL'?'PUT':'CALL',
   reason:'locally-verified-opposite-direction',probabilityOverride:true,
   probabilityAgreement:pOpp,originalSide:original.side,
   originalStrength:Number(strength),probabilityEvidenceSamples:proof.n};
 }
 return {...original,probabilityAgreement:pSame,probabilityOverride:false};
}

// Research-only qualification of standalone micro-reactions at historical levels.
// Confirmed sequence changes/retests and all other existing routes are preserved.
export function qualifyRejectionExpiry({candidate,original,decision,durationMs=30000,mode='expiry-agreement'}={}){
 if(!['expiry-agreement','sequence-only'].includes(mode))throw Error('Unknown research mode');
 if(Number(durationMs)!==30000||!candidate?.ready||
  !['historical-level-rejection','multiscale-candle-rejection'].includes(candidate.reason))return candidate;
 const agreed=mode==='expiry-agreement'&&original?.ready===true&&original.side===candidate.side&&
  (!decision?.ready||decision.side===candidate.side);
 if(agreed)return candidate;
 return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:'research-level-reaction-without-expiry-agreement',
  rejectionExpiryEvidence:{mode,originalSide:original?.side??null,originalReady:original?.ready===true,
   decisionSide:decision?.side??null,decisionReady:decision?.ready===true,reactionSide:candidate.side,
   reactionReason:candidate.reason}};
}

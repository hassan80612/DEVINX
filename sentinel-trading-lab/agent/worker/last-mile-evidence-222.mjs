// Sentinel 222: causal last-mile consistency guard.
// Only a negative confirmation attached to the SAME fired market tick is a veto.
// No quote polling, sleep, risk/balance/expiry setter, browser interaction or side flip.
const supported=new Set([30000,60000,300000]);
export function reviewLastMileEvidence({signal,evidence,mode='automatic'}={}){
 const allowed=(reason='unchanged')=>({allowed:true,reason});
 if(mode!=='automatic'||signal?.independent===true)return allowed('manual-or-independent');
 const duration=Number(signal?.durationMs);
 if(!supported.has(duration))return allowed('unsupported-duration-preserved');
 if(!evidence||evidence.source!=='now-structural-v1'||
  Number(evidence.signalAt)!==Number(signal?.at)||
  evidence.finalSide!==signal?.side)return allowed('missing-or-different-tick-evidence');
 const proof=evidence.levelExpiryProof;
 const reaction=String(evidence.levelReaction||'').toLowerCase();
 const reason=String(evidence.finalReason||'').toLowerCase();
 const reversal=/rejection|reversal|structure-change|failed-breakout|level-turn/.test(reaction+' '+reason);
 if(reversal&&proof?.confirmed===false&&
    Number(proof.durationMs)===duration){
  return {allowed:false,reason:'same-tick-horizon-reaction-contradicted',durationMs:duration};
 }
 return allowed('same-tick-structural-evidence-preserved');
}

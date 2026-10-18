// RESEARCH ONLY: a hypothesis, not an established accuracy improvement.
export const conflictReasons=new Set(['historical-level-versus-expiry-conflict','historical-level-reactions-conflict']);
export function terminalConflictPolicy({historical,final,durationMs}){
 if(durationMs!==30000||historical?.ready!==false||!conflictReasons.has(historical.reason)||!final?.ready)return final;
 return {...final,ready:false,side:null,reason:'research-unresolved-final-conflict'};
}

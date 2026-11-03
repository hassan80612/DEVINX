// Sentinel 241 one-release experimental opposite-direction A/B.
// Invert only after normal admission, before UI, journal, bot and entry window.
const opposite=side=>side==='CALL'?'PUT':side==='PUT'?'CALL':null;
export function invertApprovedDirection241(candidate){
 const side=opposite(candidate?.side);
 if(candidate?.ready!==true||!side||candidate.experimentalDirectionInversion===true)return candidate;
 return {...candidate,side,originalDecisionSide:candidate.side,
  experimentalDirectionInversion:true,
  inversionSourceReason:String(candidate.reason||''),
  reason:'experimental-direction-inverted',
  marketPhase:'experimental-inversion',
  marketPhaseLabel:'TESTE INVERSO · '+side,
  marketTrendSide:side};
}

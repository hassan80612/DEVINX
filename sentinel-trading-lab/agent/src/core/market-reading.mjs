// Read-only market interpretation, never order permission or a new veto.
const side=s=>s==='CALL'||s==='PUT'?s:null;
const opposite=s=>s==='CALL'?'PUT':s==='PUT'?'CALL':null;
export function marketReading({phase,label,trendSide,candidate={},observation={},quoteAt,now=quoteAt}={}){
 const age=Number(now)-Number(quoteAt);
 if(!(Number(quoteAt)>0&&age>=0&&age<=2500))return 'COTAÇÃO ATRASADA';
 let text=label||'ANALISANDO',direction=side(trendSide);
 if(candidate.ready===true){
  const reversal=new Set(['closed-range-extreme-reversal-confirmed','confirmed-level-structure-reversal',
   'confirmed-fast-level-reversal','failed-breakout-structure-change','historical-level-rejection','multiscale-candle-rejection']);
  text=reversal.has(candidate.reason)?'REVERSÃO CONFIRMADA':'CONTINUIDADE';direction=side(candidate.side);
 }else if(candidate.entryTiming?.kind==='entry-price-already-extended'){
  text='CONTINUIDADE ESTICADA';direction=side(candidate.provisionalSide);
 }else if(phase==='reversal-testing'||phase==='reversal-forming'){
  text=phase==='reversal-testing'?'REVERSÃO EM TESTE':'REVERSÃO EM FORMAÇÃO';
  direction=side(candidate.provisionalSide)||opposite(direction);
 }else if(phase==='reversal-confirmed'){
  // A blocked candidate is still a market observation, never CALL/PUT AGORA.
  text='REVERSÃO EM ANÁLISE';direction=side(candidate.provisionalSide)||side(observation.side)||direction;
 }else if(phase==='insufficient'||!phase){
  const reason=String(candidate.reason||observation.reason||'');
  text=/variation|noise|lateral|choppy/.test(reason)?'LATERAL':'ANALISANDO ESTRUTURA';
 }
 return text+(direction?' · '+direction:'');
}

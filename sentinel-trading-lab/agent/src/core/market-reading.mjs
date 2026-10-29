// Read-only market interpretation, never order permission or a new veto.
const side=s=>s==='CALL'||s==='PUT'?s:null;
const opposite=s=>s==='CALL'?'PUT':s==='PUT'?'CALL':null;
export function marketReading({phase,label,trendSide,candidate={},observation={},quoteAt,now=quoteAt}={}){
 // Freshness belongs to the technical line, never to order permission.
 let text=label||'ANALISANDO',direction=side(trendSide);
 if(candidate.ready===true){
  const reversal=new Set(['closed-range-extreme-reversal-confirmed','confirmed-level-structure-reversal',
   'confirmed-fast-level-reversal','failed-breakout-structure-change','historical-level-rejection','multiscale-candle-rejection']);
  text=reversal.has(candidate.reason)?'REVERSÃO CONFIRMADA':'CONTINUIDADE';direction=side(candidate.side);
 }else if(candidate.entryTiming?.kind==='entry-price-already-extended'){
  text=/reversal|rejection|structure-change/.test(String(candidate.entryTiming?.setup||''))?
   'REVERSÃO JÁ ESTICADA':'CONTINUIDADE ESTICADA';direction=side(candidate.provisionalSide);
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

export function marketDataStatus({quoteAt=0,evaluatedAt=0,now=Date.now(),durationMs=60000}={}){
 const quote=Number(quoteAt),evaluated=Number(evaluatedAt),age=now-quote,analysisAge=now-evaluated;
 const limit=Number(durationMs)===30000?1450:Number(durationMs)===60000?1950:2500;
 if(!(quote>0&&age>=0))return 'SEM COTAÇÃO VÁLIDA · ÚLTIMA LEITURA';
 if(age>limit)return 'COTAÇÃO ATRASADA · ÚLTIMA LEITURA';
 if(!(evaluated>0&&analysisAge>=0&&analysisAge<=3500))return 'LEITURA EM ATUALIZAÇÃO';
 return '';
}

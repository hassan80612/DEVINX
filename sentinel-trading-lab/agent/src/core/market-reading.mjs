// Read-only market interpretation, never order permission or a new veto.
const side=s=>s==='CALL'||s==='PUT'?s:null;
const opposite=s=>s==='CALL'?'PUT':s==='PUT'?'CALL':null;
export function marketReading({phase,label,trendSide,candidate={},observation={},quoteAt,now=quoteAt,indicatorEvidence=null,historicalCandlesVerified=null}={}){
 // A user entry-family preference changes emission, not the market reading.
 if(candidate.reason==='entry-family-not-selected'&&observation.ready===true)
  return marketReading({phase,label,trendSide,candidate:observation,quoteAt,now,indicatorEvidence,historicalCandlesVerified});
 // Freshness belongs to the technical line, never to order permission.
 let text=label||'ANALISANDO',direction=side(trendSide);
 if(candidate.ready===true){
  const reversal=new Set(['closed-range-extreme-reversal-confirmed','confirmed-level-structure-reversal',
   'confirmed-fast-level-reversal','failed-breakout-structure-change','historical-level-rejection','multiscale-candle-rejection']);
  text=reversal.has(candidate.reason)?'REVERSÃO CONFIRMADA':'CONTINUIDADE';direction=side(candidate.side);
 }else if(candidate.entryRisk?.kind==='same-reaction-after-better-missed-price'){
  text='REVERSÃO JÁ AVANÇOU';direction=side(candidate.provisionalSide);
 }else if(candidate.entryRisk?.kind==='range-turn-inside-persistent-directional-leg'){
  text='REVERSÃO AINDA SEM QUEBRA';direction=side(candidate.provisionalSide);
 }else if(candidate.entryRisk?.kind==='continuation-retesting-uncleared-opposing-wall'){
  direction=side(candidate.provisionalSide);
  text=direction==='CALL'?'CONTINUIDADE TESTANDO RESISTÊNCIA':'CONTINUIDADE TESTANDO SUPORTE';
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
  // In 227 one sparse/missing quote inside a 12s/20s trend window
  // could leave the previous phase 'insufficient' and show the SAME
  // "ANALISANDO ESTRUTURA" forever. This is a DIAGNOSTIC readout
  // only: never use cached indicators to authorize CALL or PUT.
  if(/stale-live-quote|live-quote-unverified|waiting-fresh-quote/.test(reason))
   text='AGUARDANDO COTAÇÃO ATUAL';
  else if(/variation|noise|lateral|choppy|neutral-closed/.test(reason))
   text='MERCADO LATERAL';
  else if(/current-price-retracing|current-impulse-against/.test(reason))
   text='RETRAÇÃO EM ANDAMENTO';
  else if(/closed-movement-below-noise|recent-movement-not-ready/.test(reason))
   text='MOVIMENTO SEM CONFIRMAÇÃO';
  else if(historicalCandlesVerified===false)
   text='HISTÓRICO NÃO VALIDADO';
  else if(indicatorEvidence?.ready===true&&side(indicatorEvidence.trendSide)){
   const disagreement=side(indicatorEvidence.divergenceSide)&&
     indicatorEvidence.divergenceSide!==indicatorEvidence.trendSide;
   text=disagreement?'POSSÍVEL REVERSÃO EM ESTUDO':
     indicatorEvidence.adx>=25?'TENDÊNCIA DE FUNDO FORTE':'TENDÊNCIA DE FUNDO';
   direction=disagreement?indicatorEvidence.divergenceSide:indicatorEvidence.trendSide;
  }else if(indicatorEvidence?.ready===true&&side(indicatorEvidence.rsiTrend)){
   text='MOMENTUM EM OBSERVAÇÃO';
   direction=indicatorEvidence.rsiTrend;
  }else if(/completed-structure-not-ready/.test(reason))
   text='COLETANDO MICROESTRUTURA';
  else
   text='OBSERVANDO PREÇO ATUAL';
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

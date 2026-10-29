// Explain the actual final admission reason. Presentation only; no gate or side
// is created here, and the active operation retains its own clock and label.
export function entrySetupLabel(reason){
 const reversals=new Set(['confirmed-level-structure-reversal','confirmed-fast-level-reversal',
  'failed-breakout-structure-change','historical-level-rejection',
  'closed-range-extreme-reversal-confirmed','multiscale-candle-rejection']);
 if(reversals.has(reason))return 'REVERSÃO CONFIRMADA NA ENTRADA';
 if(/continuation|breakout|trend|impulse|followthrough|forecast|analogue/.test(String(reason||'')))
  return 'CONTINUIDADE CONFIRMADA NA ENTRADA';
 return 'ACOMPANHANDO OPERAÇÃO';
}
export function entryObservationStatus({candidate={},window={},durationMs}={}){
 const reason=String(candidate.reason||''),windowReason=String(window?.reason||'');
 const status=(waitLabel,waitDetail)=>({waitLabel,waitDetail});
 if(windowReason==='reassessing-after-expiry')
  return status('REAVALIANDO APÓS VENCIMENTO','Aguardando uma nova oportunidade válida.');
 if(candidate.ready===true){
  if(/previous-expiry|after-expiry/.test(windowReason))
   return status('AGUARDANDO VENCIMENTO','A operação anterior ainda está em acompanhamento.');
  return status('PREÇO CONFIRMADO','Acompanhe a janela e o momento de entrada.');
 }
 if(/previous-expiry|after-expiry/.test(windowReason))
  return status('REAVALIANDO APÓS VENCIMENTO','Aguardando uma nova oportunidade válida.');
 if(reason==='candidato-de-impulso-expirado')
  return status('BUSCANDO NOVA OPORTUNIDADE','A confirmação não ocorreu no prazo desse candidato.');
 if(/impulso-estendido.*preco-observado/.test(reason))
  return status('AGUARDANDO COTAÇÃO ATUAL','O reteste precisa de preços atuais e contínuos.');
 if(/impulso-estendido/.test(reason))
  return status('AGUARDANDO RETESTE E ROMPIMENTO','O movimento já avançou; falta confirmar um novo ponto de entrada.');
 if(/continuation-wall-pressure/.test(reason))
  return status('AGUARDANDO SUPERAÇÃO DO NÍVEL','A continuidade ainda encontra suporte ou resistência contrária.');
 if(/verified-wall-exhaustion/.test(reason))
  return status('AGUARDANDO REAÇÃO NO NÍVEL','Há rejeição no nível; uma reversão exige confirmação própria.');
 if(/five-minute-reversal|precision-extreme/.test(reason))
  return status('AGUARDANDO EXTREMO + REVERSÃO','Para 5m, o extremo e a reversão precisam estar confirmados.');
 if(/range-expiry-exceeds-observed-swing/.test(reason))
  return status('OSCILAÇÃO CURTA PARA O PRAZO','O movimento observado ainda não sustenta a duração escolhida.');
 if(/range-awaiting-third/.test(reason))
  return status('AGUARDANDO 3ª VIRADA','A sequência lateral ainda não confirmou seus extremos.');
 if(/range-extreme-awaiting|irregular-range-awaiting|precision-reversal|countertrend-pivot/.test(reason))
  return status('AGUARDANDO REVERSÃO CONFIRMADA','Falta uma reação de preço que confirme a mudança de direção.');
 if(/live-evidence-conflict|level-role-conflict|impulse-against-structure/.test(reason))
  return status('PREÇO E ESTRUTURA EM CONFLITO','A direção proposta ainda diverge da evidência atual.');
 if(/retracing|rapid-countertrend/.test(reason))
  return status('RETRAÇÃO EM ANDAMENTO','Aguardando retomada ou reversão confirmada.');
 if(/Continuidade perdendo força/.test(reason))
  return status('AGUARDANDO RETOMADA OU REVERSÃO','Aguardando retomada ou reversão confirmada.');
 if(/reversão.*sem confirmação|Reversão rápida ainda rasa/.test(reason))
  return status('AGUARDANDO REVERSÃO CONFIRMADA','Falta uma reação de preço que confirme a mudança de direção.');
 if(/quote|cotacao/.test(reason))
  return status('AGUARDANDO COTAÇÃO ATUAL','Falta uma cotação recente e verificada para decidir.');
 if(/below-noise|unverified-floor-impulse/.test(reason))
  return status('MOVIMENTO SEM CONFIRMAÇÃO','O deslocamento ainda não confirmou força e estrutura suficientes.');
 if(/choppy|lateral|mixed|neutral-closed/.test(reason))
  return status('MERCADO LATERAL OU INDEFINIDO','Aguardando uma direção com confirmação de preço.');
 if(/underperforming/.test(reason))
  return status('CONTEXTO SEM VALIDAÇÃO','O histórico verificado deste contexto não aprovou a entrada.');
 return status(Number(durationMs)===300000?'AGUARDANDO EXTREMO + REVERSÃO':'AGUARDANDO ESTRUTURA',
  Number(durationMs)===300000?'Para 5m, o extremo e a reversão precisam estar confirmados.':'Ainda falta confirmação para uma entrada de continuidade ou reversão.');
}

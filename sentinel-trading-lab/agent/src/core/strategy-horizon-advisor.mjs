/**
 * Experimental strategy-context advisor. Classification is based only on
 * completed price data available asOf. It never rewrites the owner's forecast,
 * sends orders, promises win rates, or selects a broker chart interval.
 */
import {SCENARIO_ENGINES,selectedScenarioEngine} from './scenario-engine-catalog.mjs';
import {marketRegimeEvidence} from './market-regime-evidence.mjs';
export const STRATEGY_FIT_NOTES=Object.freeze({
 automatic:{label:'Leitura geral',note:'Compara comportamento recente e projeção futura; referência para outros métodos.',short:[5,900],long:'Confrontar trajetória e validade do histórico'},
 price_action:{label:'Impulsos e rejeições',note:'Útil para acompanhar estruturas de preço, rejeições e perda de impulso.',short:[5,300],long:'Confirmar estrutura antes de assumir reversão'},
 support_resistance:{label:'Níveis históricos',note:'Observa aproximações, rejeições e rompimentos de zonas previamente negociadas.',short:[15,900],long:'Requer níveis já testados'},
 trend:{label:'Continuação',note:'Especializada em tendências persistentes; evitar assumir que todo topo gera retorno.',short:[30,900],long:'Confirmar força e desaceleração'},
 mean_reversion:{label:'Retorno à média',note:'Especializada em lateralização e retração estatística; cuidado com tendências fortes.',short:[30,900],long:'Não forçar reversão durante rompimento'},
 breakout:{label:'Rompimentos',note:'Procura expansão de faixa e falsos rompimentos; sensível a oscilações irregulares.',short:[5,300],long:'Distinguir rompimento de rejeição'},
 trendline_breakout:{label:'Quebra estrutural',note:'Trabalha com pivôs confirmados e quebras de linhas de tendência.',short:[30,900],long:'Confirmar pivôs já formados'},
 fibonacci_retest:{label:'Retestes',note:'Especializada em retrações de movimentos anteriores, não na última vela isolada.',short:[30,900],long:'Identificar swing concluído'},
 smart_confluence:{label:'Confirmação técnica',note:'Reúne indicadores internos da própria estratégia, sem somar votos de outras.',short:[15,900],long:'Verificar evidências independentes'}
});
const phaseScores={
 'established-trend':{trend:5,price_action:3,trendline_breakout:3,automatic:2,smart_confluence:2,breakout:2,mean_reversion:-3,fibonacci_retest:-1,support_resistance:0},
 'confirmed-local-return':{mean_reversion:4,fibonacci_retest:4,price_action:3,support_resistance:3,smart_confluence:2,automatic:1,trend:-2,breakout:-1,trendline_breakout:0},
 'range-or-chop':{mean_reversion:4,support_resistance:3,smart_confluence:2,fibonacci_retest:2,automatic:1,price_action:1,trend:-3,breakout:-2,trendline_breakout:-2},
 'mixed':{smart_confluence:2,automatic:2,price_action:1,support_resistance:1,fibonacci_retest:1,mean_reversion:0,trend:0,breakout:0,trendline_breakout:0},
 'volatility-transition':{automatic:0,price_action:0,support_resistance:0,trend:0,mean_reversion:0,breakout:0,trendline_breakout:0,fibonacci_retest:0,smart_confluence:0}
};
const phaseLabel={
 'established-trend':'Tendência persistente',
 'confirmed-local-return':'Retorno local observado',
 'range-or-chop':'Lateralização ou ruído',
 mixed:'Mercado misto',
 'volatility-transition':'Volatilidade em transição',
 'insufficient-history':'Histórico insuficiente'
};
const fitness=(id,phase,h)=>{
 const note=STRATEGY_FIT_NOTES[id],base=phaseScores[phase]?.[id]??0;
 // These rules are engineering hypotheses, never measured win statistics.
 const [lo,hi]=note.short;
 const penalty=h<lo?-2:h>hi?-2:0;
 const lengthBias=h>=120&&(id==='trend'||id==='mean_reversion'||id==='support_resistance'||id==='fibonacci_retest')?1:0;
 const shortBias=h<=30&&(id==='price_action'||id==='breakout')?1:0;
 return base+penalty+lengthBias+shortBias;
};
export function strategyHorizonAdvisor({settings={},quoteHistory=[],asOf=Date.now(),horizonSeconds=null}={}){
 const userEngine=selectedScenarioEngine(settings).id;
 const h=Number(horizonSeconds??Number(settings.orderDurationMs)/1000);
 const mode=settings.strategyAdvisorMode==='automatic_advisory'?'automatic_advisory':'manual';
 if(!(h>0)||h>3600||!Number.isFinite(h))return {status:'invalid-horizon',recommended:null,actionable:false};
 const regime=marketRegimeEvidence({quoteHistory,asOf});
 const ranked=SCENARIO_ENGINES.map(engine=>{
  const meta=STRATEGY_FIT_NOTES[engine.id];
  const fit=regime.ready?fitness(engine.id,regime.phase,h):null;
  const status=!regime.ready?'sem histórico':
   regime.volatilityShock?'aguardar estabilidade':
   fit>=3?'boa compatibilidade teórica':fit<=-1?'cautela neste cenário':'avaliar contexto';
  return {engineId:engine.id,name:engine.name,
   label:meta.label,description:meta.note,warning:meta.long,
   fit,interpretation:status,recommendedTimeWindowSeconds:meta.short};
 });
 // Avoid quietly switching strategies in volatile, stale, or ambiguous data.
 const eligible=regime.ready&&!regime.volatilityShock&&Number(asOf)>=0&&
  quoteHistory?.length>0&&Number(asOf)-Number(quoteHistory.at(-1)?.ts)<3000;
 const eligibleRows=ranked.filter(x=>x.fit>=3).sort((a,b)=>b.fit-a.fit);
 const top=eligible&&eligibleRows.length&&
    (eligibleRows.length===1||eligibleRows[0].fit>=eligibleRows[1].fit+1)?
     eligibleRows[0]:null;
 const recommended=top?{engineId:top.engineId,name:top.name,
   rationale:'Compatibilidade estrutural teórica, não assertividade medida'}:null;
 const chosen=ranked.find(x=>x.engineId===userEngine);
 return {status:regime.ready?'experimental-advice':'insufficient-market-context',
  mode,selectedEngine:userEngine,requestedHoldingSeconds:h,
  // A short operation needs tick analysis; it does NOT imply one candle of
  // the same duration or that the broker should switch its chart period.
  chartContext:h<=30?'Micromovimentos 1–5s + estrutura 30–90s':
   h<=120?'Micromovimentos 1–10s + estrutura 1–5min':
   h<=300?'Micromovimentos 1–15s + estrutura 3–15min':
   'Micromovimentos 10–30s + estrutura histórica mais longa',
  marketPhase:regime.phase,marketPhaseLabel:phaseLabel[regime.phase]||phaseLabel.mixed,
  volatilityShift:regime.volatilityShock===true,
  manualSelectionPreserved:true,selectedInterpretation:chosen?.interpretation||'sem leitura',
  selectedDescription:chosen?.description||null,
  suggestedEngineId:mode==='automatic_advisory'?recommended?.engineId||null:null,
  recommended,strategies:ranked,
  strategySwitched:false,calibrated:false,actionable:false,
  advisoryOnly:'Compatibilidade estrutural, não previsão certa nem taxa de acerto.'};
}

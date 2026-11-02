// Visual-only market suitability readout. It NEVER gates, pauses, resumes,
// invokes or times the real trading executor, and does not predict a win.
const directional=v=>['CALL','PUT'].includes(String(v||'').toUpperCase())?String(v).toUpperCase():null;
const hardConflict=/contradiction|conflict|wall|late-|stretched|no-room|unverified|choppy-sideways|lateral-or-mixed|countertrend|overextended|opposing|blocked|structure-not-confirmed|expired/i;
export function marketConditionEvidence(d={},now=Date.now()){
 const duration=Number(d.durationMs),runtime=String(d.state||'').toLowerCase();
 const obs=d.vnext?.nowObservation||{},q=d.quality||{},metrics=d.metrics||{};
 const age=Number(d.liveAgeMs),evalAge=Number(d.analysisAgeMs);
 if(runtime!=='running'||d.analysisStale===true||d.analysisTransient===true||
    !Number.isFinite(age)||age>=3500||!Number.isFinite(evalAge)||evalAge>=3500)
   return {state:'sync',label:'SEM LEITURA',reason:'Análise ou cotação indisponível',at:now};
 const r=String(obs.reason||''),risk=obs.entryRisk||{};
 if(risk.blocked===true||hardConflict.test(r)){
   return {state:'bad',label:'DESFAVORÁVEL',reason:'Risco estrutural ou entrada rejeitada',at:now};
 }
 const observationSide=obs.ready===true?directional(obs.side):null;
 const signalSide=directional(d.finalConfluence?.side);
 const consensusSide=directional(d.generalConsensus?.rapid?.side);
 const buy=Number(metrics.buyScore),sell=Number(metrics.sellScore);
 const metricsSide=Number.isFinite(buy)&&Number.isFinite(sell)&&
   Math.max(buy,sell)>=68&&Math.abs(buy-sell)>=12?(buy>sell?'CALL':'PUT'):null;
 const votes=[observationSide,signalSide,consensusSide,metricsSide].filter(Boolean);
 const agreed=votes.filter(s=>s===votes[0]).length;
 const opposed=votes.some(s=>s!==votes[0]);
 const marketPhase=String(obs.marketPhase||'').toLowerCase();
 if(observationSide&&q.entryReady===true&&!opposed&&[30000,60000,300000].includes(duration))
   return {state:'good',label:'FAVORÁVEL',reason:'Sinal atual aprovado pelo analista',at:now};
 if(votes.length>=3&&agreed>=3&&!opposed&&
    !/range|lateral|mixed|neutral|choppy/.test(marketPhase)&&
    [30000,60000,300000].includes(duration))
   return {state:'good',label:'FAVORÁVEL',reason:'Leituras atuais alinhadas para este prazo; não é ordem',at:now};
 return {state:'watch',label:'ATENÇÃO',reason:opposed?'Leituras divergentes':'Aguardando confirmação do gráfico',at:now};
}
// Sentinel 226: visual-only hysteresis. A 1-second quote must not
// flip the card. Good needs 8s of sustained evidence, bad 7s, and ordinary
// caution 5s. Actual risk instantly downgrades "good" to "watch", and feed
// loss immediately shows "no reading". None of this affects trading.
export function smoothMarketCondition(previous,observed,{at=Date.now(),context=''}={}){
 const tick=Number(at)||Date.now(),obs={...observed,at:tick};
 if(!previous||previous.context!==context){
  return {context,state:obs.state==='good'?'watch':obs.state,
    pending:obs.state==='good'?'good':null,pendingAt:tick,count:obs.state==='good'?1:0,
    since:tick,reason:obs.state==='good'?'Verificando estabilidade do gráfico':obs.reason};
 }
 if(obs.state==='sync')
   return {...previous,state:'sync',pending:null,pendingAt:tick,count:0,since:tick,reason:obs.reason,context};
 if(obs.state===previous.state)
   return {...previous,pending:null,count:0,context};
 // Never label a vetoed market as favorable; do not immediately bounce
 // all the way back to good on the very next quote.
 if(previous.state==='good'&&obs.state==='bad')
   return {...previous,state:'watch',pending:'bad',pendingAt:tick,
     count:1,since:tick,reason:'Risco atual detectado; aguardando cenário estável',context};
 const count=previous.pending===obs.state?Number(previous.count||0)+1:1;
 const pendingAt=previous.pending===obs.state?Number(previous.pendingAt||tick):tick;
 const requiredMs=obs.state==='good'?8000:obs.state==='bad'?7000:5000;
 if(count>=4&&tick-pendingAt>=requiredMs)
   return {...previous,state:obs.state,pending:null,pendingAt:tick,count:0,since:tick,reason:obs.reason,context};
 return {...previous,pending:obs.state,pendingAt,count,context};
}
export const marketConditionLabel=(state,lang='pt')=>{
 const k=String(state||'sync'),en=lang==='en';
 return en?({good:'FAVORABLE',watch:'CAUTION',bad:'UNFAVORABLE',sync:'NO READING'}[k]||'NO READING'):
 ({good:'FAVORÁVEL',watch:'ATENÇÃO',bad:'DESFAVORÁVEL',sync:'SEM LEITURA'}[k]||'SEM LEITURA');
};

import {scenarioViewFromRuntime} from '../../agent/worker/scenario-view.mjs';

const num=(value:any)=>value!=null&&Number.isFinite(Number(value))?Number(value):null;
export function liveCardModel(s:any,now:number,averageThreshold=60){
  const live=s?.liveBroker||{},a=s?.lastResult?.analysis||{},op=a.operationalSignal||{};
  const asset=String(live.validatedSymbol||live.symbol||s?.settings?.asset||live.uiSymbol||'—');
  const analysisAsset=String(s?.lastResult?.asset||a.asset||'');
  const matches=analysisAsset.toUpperCase()===asset.toUpperCase();
  const quoteAt=Math.max(Number(s?.feed?.quoteTs||0),Number(live.lastQuoteAt||0),Number(live.lastCandleAt||0));
  const evaluationAt=Number(s?.lastEvalMs||0);
  const online=s?.runtimeKind==='remote-agent'?s?.remote?.online===true:!!s;
  const running=s?.state==='running'&&!s?.killSwitch&&!s?.masterFrozen;
  // Relay and polling add delay. Report it explicitly and suppress old signals.
  const fresh=online&&running&&matches&&live.assetValidated===true&&(live.analysisFeedValidated===true||(live.analysisFeedValidated==null&&live.feedValidated!==false))&&quoteAt>0&&now-quoteAt<=8000&&now-quoteAt>=-2500&&evaluationAt>0&&now-evaluationAt<=10000;
  const horizon=Number(s?.settings?.forecastHorizonSeconds||s?.settings?.orderDurationMs/1000||60);
  const forecast=a.entryPlanner?.horizons?.[String(horizon)];
  const view:any=scenarioViewFromRuntime({operational:op,asset,horizonSeconds:horizon,durationMs:Number(s?.settings?.orderDurationMs||60000),forecast,now} as any);
  const sub=op.subanalyst||{},alert=fresh&&sub.mode==='reversal-alert'&&sub.active===true?sub.alert:null;
  const consensus=a.generalConsensus||{};
  const market=num(consensus.rapid?.callPct),strategies=num(consensus.strategies?.callPct),combined=num(consensus.displayCallPct??consensus.callScore);
  const hasTotals=fresh&&market!==null&&strategies!==null&&combined!==null;
  const average=hasTotals?Math.round((market!+strategies!+combined!)/3):null;
  const threshold=Math.max(50,Math.min(95,averageThreshold));
  const averageSide=average===null?'AGUARDAR':average>=threshold&&average>50?'CALL':100-average>=threshold&&average<50?'PUT':'AGUARDAR';
  const unavailable=!online?'PC OFFLINE':!running?s?.state==='paused'?'ANÁLISE PAUSADA':'ANÁLISE PARADA':!matches?'SINCRONIZANDO ATIVO':'AGUARDANDO DADOS ATUAIS';
  const state=fresh?view.state:unavailable;
  const side=fresh&&view.contextMatches?view.side:null;
  const terminalStates=['INVALIDADO','JANELA ENCERRADA','JANELA PERDIDA','OPORTUNIDADE CANCELADA','OPORTUNIDADE CONSUMIDA','OPORTUNIDADE PERDIDA'];
  // UI-only classification: never present an expired/invalidated direction as an active setup.
  const scenarioInactive=fresh&&(view.closed===true||terminalStates.includes(String(view.state||'')));
  const tone=!fresh?'neutral':scenarioInactive?'closed':view.risk?'review':side==='CALL'?'call':side==='PUT'?'put':'neutral';
  const quoteAge=quoteAt>0?Math.max(0,Math.floor((now-quoteAt)/1000)):null;
  const analysisAge=evaluationAt>0?Math.max(0,Math.floor((now-evaluationAt)/1000)):null;
  const setupCreatedAt=Number(op.scenario?.createdAt||op.createdAt||0);
  const reversalCheckedAt=Number(sub.checkedAt||0);
  return{asset,online,running,fresh,quoteAt,evaluationAt,quoteAge,analysisAge,state,side,tone,scenarioInactive,
    scenarioLabel:side?(scenarioInactive?'CENÁRIO ANTERIOR '+side:'CENÁRIO '+side):'CENÁRIO',
    signalCreatedAt:setupCreatedAt>0?setupCreatedAt:null,reversalCheckedAt:reversalCheckedAt>0?reversalCheckedAt:null,
    remaining:fresh&&!scenarioInactive?view.remainingSeconds:null,confidence:fresh&&side&&!scenarioInactive?view.confidence:null,
    subStatus:!fresh?unavailable:sub.mode!=='reversal-alert'?'ATUALIZE O AGENT':sub.status==='SEM LEITURA'?'AGUARDANDO COTAÇÕES':alert?'POSSÍVEL REVERSÃO '+alert.side:'OBSERVANDO REVERSÃO',
    alert,market:hasTotals?market:null,strategies:hasTotals?strategies:null,combined:hasTotals?combined:null,average,averageSide};
}

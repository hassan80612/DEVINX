import {scenarioViewFromRuntime} from '../../agent/worker/scenario-view.mjs';

const num=(value:any)=>value!=null&&Number.isFinite(Number(value))?Number(value):null;
export function liveCardModel(s:any,now:number,averageThreshold=60){
  const live=s?.liveBroker||{},a=s?.lastResult?.analysis||{},op=a.operationalSignal||{};
  const asset=String(live.validatedSymbol||live.symbol||s?.settings?.asset||live.uiSymbol||'—');
  const analysisAsset=String(s?.lastResult?.asset||a.asset||'');
  const matches=analysisAsset.toUpperCase()===asset.toUpperCase();
  // Only the actual quote timestamp counts. A historical candle is not a new price.
  const quoteAt=Number(live.lastQuoteAt||s?.feed?.quoteTs||0);
  const evaluationAt=Number(s?.lastEvalMs||0);
  const online=s?.runtimeKind==='remote-agent'?s?.remote?.online===true:!!s;
  const running=s?.state==='running'&&!s?.killSwitch&&!s?.masterFrozen;
  // Relay and polling add delay. Report it explicitly and suppress old signals.
  const matchingMarket=online&&running&&matches&&live.assetValidated===true;
  const feedValidated=live.analysisFeedValidated===true||(live.analysisFeedValidated==null&&live.feedValidated!==false);
  // An 8s-old quote must NEVER be labelled real-time or authorize an entry
  // for a 30s expiration. Keep history visible, but separate it from actionable
  // freshness. This is presentation parity with the existing Agent 2.5s gate.
  const quoteFresh=quoteAt>0&&now-quoteAt<=2500&&now-quoteAt>=-2500;
  const fresh=matchingMarket&&feedValidated&&quoteFresh&&evaluationAt>0&&now-evaluationAt<=10000;
  const horizon=s?.settings?.engine?Number(s?.settings?.orderDurationMs||60000)/1000:Number(s?.settings?.forecastHorizonSeconds||s?.settings?.orderDurationMs/1000||60);
  const forecast=a.entryPlanner?.horizons?.[String(horizon)];
  const view:any=scenarioViewFromRuntime({operational:op,asset,horizonSeconds:horizon,durationMs:Number(s?.settings?.orderDurationMs||60000),forecast,now} as any);
  const sub=op.subanalyst||{},alert=fresh&&sub.mode==='reversal-alert'&&sub.active===true?sub.alert:null;
  const consensus=a.generalConsensus||{};
  const market=num(consensus.rapid?.callPct),strategies=num(consensus.strategies?.callPct),combined=num(consensus.displayCallPct??consensus.callScore);
  // A temporarily delayed but asset-matched snapshot can retain its last
  // percentages as HISTORY, not as a current CALL/PUT recommendation.
  const hasTotals=matchingMarket&&quoteAt>0&&now-quoteAt>=-2500&&now-quoteAt<=30000&&evaluationAt>0&&now-evaluationAt<=30000&&market!==null&&strategies!==null&&combined!==null;
  const totalsStale=hasTotals&&!fresh;
  const average=hasTotals?Math.round((market!+strategies!+combined!)/3):null;
  const threshold=Math.max(50,Math.min(95,averageThreshold));
  const averageSide=!fresh||average===null?'AGUARDAR':average>=threshold&&average>50?'CALL':100-average>=threshold&&average<50?'PUT':'AGUARDAR';
  const unavailable=!online?'PC OFFLINE':!running?s?.state==='paused'?'ANÁLISE PAUSADA':'ANÁLISE PARADA':!matches?'SINCRONIZANDO ATIVO':'AGUARDANDO DADOS ATUAIS';
  const state=fresh?view.state:unavailable;
  const side=fresh&&view.contextMatches?view.side:null;
  // DISPLAY ONLY: a brief missing quote does not erase an unexpired,
  // asset-matched main scenario. Never reuse this state for entry permission.
  // Entry remains gated by fresh (2.5s) and runtimeView.canEnter.
  const scenario=op.scenario||null;
  const vnext=a?.vnext||null;
  const vnextReceipt=matchingMarket&&vnext?.engineId===s?.settings?.engine&&vnext?.receipt?.asset?.toUpperCase()===asset.toUpperCase()&&Number(vnext?.receipt?.expirySeconds)===horizon?vnext.receipt:null;
  const vnextProjection=vnextReceipt&&vnext?.projection?.kind!=='invalid'?
    vnext.projection:null;
  const scenarioDeadline=Number(scenario?.deadline||0);
  const scenarioOrigin=Number(scenario?.createdAt||0);
  const scenarioContextOk=matchingMarket&&feedValidated&&
    Number(op.forecastHorizonSeconds)===horizon&&
    Number(op.durationMs)===Number(s?.settings?.orderDurationMs||60000)&&
    ['CALL','PUT'].includes(String(scenario?.side||''))&&
    scenarioOrigin>0&&scenarioOrigin<=now+2500&&scenarioDeadline>now&&
    scenario?.closed!==true&&!['INVALIDADO','JANELA ENCERRADA'].includes(String(scenario?.status||''))&&
    // The scenario's OWN deadline controls visibility, not the quote age.
    // Even a long outage leaves a clearly marked non-actionable prior view;
    // the trade gate above still requires <=2.5s quotes.
    quoteAt>0&&now-quoteAt>=-2500&&
    evaluationAt>=scenarioOrigin-2500;
  // A forecast before confirmation is information, not a scenario/entry.
  // Preserve a real scenario first, even if a new raw projection disagrees.
  const preliminary=op.scenarioProjection||null;
  const preliminaryMatches=matchingMarket&&feedValidated&&
    Number(op.forecastHorizonSeconds)===horizon&&
    Number(op.durationMs)===Number(s?.settings?.orderDurationMs||60000)&&
    ['CALL','PUT'].includes(String(preliminary?.side||''))&&
    Number(preliminary?.horizonSeconds)===horizon&&
    Number(preliminary?.asOf)>0&&Number(preliminary.asOf)<=now+2500&&
    evaluationAt>=Number(preliminary.asOf)-2500;
  const displayScenarioPreliminary=!scenarioContextOk&&!scenario&&preliminaryMatches;
  const displayScenarioSide=side||(scenarioContextOk?String(scenario.side):
    displayScenarioPreliminary?String(preliminary.side):
    fresh&&vnextReceipt?String(vnextReceipt.side):null);
  const displayScenarioStale=!fresh&&!!displayScenarioSide;
  const displayScenarioRemaining=!displayScenarioPreliminary&&displayScenarioSide&&scenarioDeadline>now?
    Math.max(0,Math.ceil((scenarioDeadline-now)/1000)):null;
  const displayScenarioState=displayScenarioPreliminary?
    (displayScenarioStale?'PROJEÇÃO · COTAÇÃO ATRASADA':'PROJEÇÃO EM ANÁLISE'):
    displayScenarioStale?'AGUARDANDO COTAÇÃO':state;
  const terminalStates=['INVALIDADO','JANELA ENCERRADA','JANELA PERDIDA','OPORTUNIDADE CANCELADA','OPORTUNIDADE CONSUMIDA','OPORTUNIDADE PERDIDA'];
  // UI-only classification: never present an expired/invalidated direction as an active setup.
  const scenarioInactive=fresh&&(view.closed===true||terminalStates.includes(String(view.state||'')));
  // Visual priority: a *currently actionable* independent entry wins over
  // the older main scenario colour. No change to actual signal permissions.
  const entrySide=fresh&&view.canEnter===true&&op.entryAnalyst?.independent===true?view.entrySide:null;
  const tone=!fresh?'neutral':entrySide==='CALL'?'call':entrySide==='PUT'?'put':scenarioInactive?'closed':view.risk?'review':side==='CALL'?'call':side==='PUT'?'put':'neutral';
  const scenarioTone=!fresh||scenarioInactive?'neutral':view.risk?'review':side==='CALL'?'call':side==='PUT'?'put':'neutral';
  const quoteAge=quoteAt>0?Math.max(0,Math.floor((now-quoteAt)/1000)):null;
  const analysisAge=evaluationAt>0?Math.max(0,Math.floor((now-evaluationAt)/1000)):null;
  const entryRemaining=entrySide&&Number.isFinite(Number(view.entryRemainingSeconds))?Math.max(0,Number(view.entryRemainingSeconds)):null;
  // The entry opportunity and the longer scenario have separate lifecycles.
  // A consumed/missed entry is NOT a closed forecast. This classification
  // changes presentation only: the engine still owns every signal.
  const entryStatus=String(op?.entryAnalyst?.signal?.state||op.state||'').toUpperCase();
  const entryReason=String(op?.entryAnalyst?.signal?.reason||op.reason||'');
  const endedEntryStates=['OPORTUNIDADE PERDIDA','OPORTUNIDADE CONSUMIDA','OPORTUNIDADE CANCELADA','AGUARDAR PONTO'];
  const opportunityEnded=fresh&&!entrySide&&(
    endedEntryStates.includes(entryStatus)||
    /esta oportunidade terminou|oportunidade de entrada encerrada|oportunidade encerrada|ponto de entrada ultrapassado/i.test(entryReason)
  );
  // Capture ONLY the exact quote recorded by the engine at a confirmed
  // signal. The display must never substitute a trigger or a later market
  // quote for that historical price.
  const signal=op.entryAnalyst?.signal||{};
  const recordedAt=Number(signal.entryAt||0),recordedPrice=num(signal.entryPrice);
  const recordedSide=String(signal.side||'').toUpperCase();
  const lastSignal=matches&&recordedAt>0&&recordedAt<=now+2500&&
    recordedPrice!==null&&recordedPrice>0&&['CALL','PUT'].includes(recordedSide)?
    {asset,side:recordedSide,price:recordedPrice,at:recordedAt}:null;
  const setupCreatedAt=Number(op.scenario?.createdAt||op.createdAt||0);
  const reversalCheckedAt=Number(sub.checkedAt||0);
  return{asset,online,running,fresh,quoteFresh,totalsStale,quoteAt,evaluationAt,quoteAge,analysisAge,state,side,tone,scenarioTone,scenarioInactive,
    selectedEngine:s?.settings?.engine||null,vnextReceipt,vnextProjection,vnextStatus:vnext?.computedStatus||null,vnextVerified:vnext?.outcomesVerified||0,
    displayScenarioSide,displayScenarioStale,displayScenarioRemaining,displayScenarioState,displayScenarioPreliminary,
    scenarioLabel:side?(scenarioInactive?'CENÁRIO ANTERIOR '+side:'CENÁRIO '+side):'CENÁRIO',
    entrySide,entryRemaining,opportunityEnded,lastSignal,signalCreatedAt:setupCreatedAt>0?setupCreatedAt:null,reversalCheckedAt:reversalCheckedAt>0?reversalCheckedAt:null,
    remaining:fresh&&!scenarioInactive?view.remainingSeconds:null,confidence:fresh&&side&&!scenarioInactive?view.confidence:null,
    subStatus:!fresh?unavailable:sub.mode!=='reversal-alert'?'ATUALIZE O AGENT':sub.status==='SEM LEITURA'?'AGUARDANDO COTAÇÕES':alert?(alert.testing?'REVERSÃO EM TESTE ':'REVERSÃO CONFIRMADA ')+alert.side:'OBSERVANDO REVERSÃO',
    reversalTone:alert?.side==='CALL'?'call':alert?.side==='PUT'?'put':'neutral',reversalTesting:alert?.testing===true,
    alert,market:hasTotals?market:null,strategies:hasTotals?strategies:null,combined:hasTotals?combined:null,average,averageSide};
}

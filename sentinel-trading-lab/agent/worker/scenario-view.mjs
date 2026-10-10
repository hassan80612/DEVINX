// Presentation follows the operational engine; it never creates or extends a setup.
export function scenarioViewFromRuntime({operational={},asset,horizonSeconds,durationMs,forecast,displayThreshold=50,minPoints=55,now=Date.now()}={}){
  if(operational?.subanalyst?.mode==='reversal-alert'&&operational?.entryAnalyst?.independent!==true){
    const scenario=operational.scenario,contextMatches=String(operational.asset||'').toUpperCase()===String(asset||'').toUpperCase()&&Number(operational.forecastHorizonSeconds)===Number(horizonSeconds)&&Number(operational.durationMs)===Number(durationMs);
    const side=contextMatches&&['CALL','PUT'].includes(scenario?.side)?scenario.side:null;
    const closed=!!side&&(scenario.closed===true||Number(scenario.deadline)<=now),hasSetup=!!side&&!closed;
    const liveSide=String(forecast?.rawBias||forecast?.bias||'NEUTRO');
    const forecastMatches=contextMatches&&String(forecast?.asset||'').toUpperCase()===String(asset||'').toUpperCase()&&Number(forecast?.horizonSeconds)===Number(horizonSeconds);
    const analysisSide=forecastMatches&&forecast.outlookReady===true&&forecast.directionReady===true&&['CALL','PUT'].includes(liveSide)?liveSide:null;
    return{contextMatches,side,displaySide:side,analysisSide,oppositeAnalysis:!!analysisSide&&analysisSide!==side,risk:scenario?.status==='REAVALIANDO',entrySide:null,
      state:!side?'AGUARDAR':scenario.status==='INVALIDADO'?'INVALIDADO':closed?'JANELA ENCERRADA':scenario.status==='REAVALIANDO'?'REAVALIANDO':'JANELA ABERTA',
      closed,hasSetup,canEnter:false,entryWindowOpen:false,entryDeadline:null,entryState:'SEM ENTRADA',
      deadline:hasSetup?Number(scenario.deadline):null,remainingSeconds:hasSetup?Math.max(0,Math.ceil((Number(scenario.deadline)-now)/1000)):null,
      signalHorizonSeconds:Number(horizonSeconds),confidence:Number(scenario?.confidence||0)};
  }
  // A qualified entry does not create a main forecast when the latter is absent.
  if(operational?.entryAnalyst?.independent===true&&!operational.scenario){
    const op=operational,entrySide=['CALL','PUT'].includes(op.side)?op.side:null;
    const contextMatches=String(op.asset||'').toUpperCase()===String(asset||'').toUpperCase()&&Number(op.forecastHorizonSeconds)===Number(horizonSeconds)&&Number(op.durationMs)===Number(durationMs);
    const entryEnd=Number(op.activeUntil||0),setupEnd=Number(op.entryWindowEndAt||op.targetAt||0);
    const canEnter=contextMatches&&op.entryAnalyst.qualification?.allowed===true&&op.state==='ENTRADA'&&op.ready===true&&op.actionable===true&&entryEnd>now&&setupEnd>now;
    return {entrySide,signalHorizonSeconds:Number(op.entryDecisionHorizonSeconds||durationMs/1000),analysisSide:null,displaySide:null,oppositeAnalysis:false,contextMatches,side:null,state:'AGUARDAR',closed:false,hasSetup:false,canEnter,deadline:null,remainingSeconds:null,confidence:0,entryState:op.state||'AGUARDAR',entryWindowOpen:canEnter,entryRemainingSeconds:canEnter?Math.ceil((entryEnd-now)/1000):null,entryDeadline:contextMatches&&entryEnd>0?entryEnd:null};
  }
  const op=operational||{},entrySide=['CALL','PUT'].includes(op.side)?op.side:null,side=['CALL','PUT'].includes(op.scenario?.side)?op.scenario.side:entrySide;
  const contextMatches=!!side&&String(op.asset||'').toUpperCase()===String(asset||'').toUpperCase()&&Number(op.forecastHorizonSeconds)===Number(horizonSeconds)&&Number(op.durationMs)===Number(durationMs);
  let state=contextMatches?String(op.state||'AGUARDAR'):'AGUARDAR';
  const terminal=['INVALIDADO','JANELA PERDIDA','JANELA ENCERRADA','OPORTUNIDADE PERDIDA','OPORTUNIDADE CANCELADA','OPORTUNIDADE CONSUMIDA'];
  const setupEnd=Number(op.entryWindowEndAt||op.targetAt||0),entryEnd=Number(op.activeUntil||0);
  const deadline=Number(op.scenario?.deadline||setupEnd);
  if(state==='ENTRADA'&&entryEnd>0&&now>=entryEnd)state=op.scenario?'OPORTUNIDADE CONSUMIDA':'ACOMPANHANDO';
  if(contextMatches&&!terminal.includes(state)&&deadline>0&&now>=deadline&&!(op.entryAnalyst?.independent===true&&op.scenario))state=op.entryAt||entryEnd?'JANELA ENCERRADA':'JANELA PERDIDA';
  const closed=terminal.includes(state),hasSetup=contextMatches&&!closed&&Number(op.createdAt)>0&&deadline>now;
  const signalHorizonSeconds=Number(op.entryDecisionHorizonSeconds||horizonSeconds);
  const forecastMatches=!!forecast&&String(forecast.asset||'').toUpperCase()===String(asset||'').toUpperCase()&&Number(forecast.horizonSeconds||signalHorizonSeconds)===signalHorizonSeconds;
  const forecastSide=String(forecast?.rawBias??forecast?.bias??forecast?.displayBias??'NEUTRO').toUpperCase();
  const forecastLead=forecastSide==='CALL'?Number(forecast?.callProbability??50):forecastSide==='PUT'?Number(forecast?.putProbability??50):0;
  const analysisSide=forecast===undefined?(contextMatches?(['CALL','PUT'].includes(op.futureSide)?op.futureSide:side):null):forecastMatches&&forecast.outlookReady===true&&forecastLead>=Number(displayThreshold)&&Number(forecast.confidence??forecast.modelConfidence??0)>=Number(minPoints)&&['CALL','PUT'].includes(forecastSide)?forecastSide:null;
  const oppositeAnalysis=contextMatches&&!!analysisSide&&analysisSide!==side;
  const executionMatches=op.entryAnalyst?.independent===true?op.entryAnalyst.qualification?.allowed===true:(!forecast&&signalHorizonSeconds===Number(horizonSeconds))||(forecastMatches&&forecast.outlookReady===true&&forecastSide===entrySide);
  const displaySide=closed||hasSetup?side:analysisSide;
  const canEnter=executionMatches&&hasSetup&&state==='ENTRADA'&&op.ready===true&&op.actionable===true&&entryEnd>now;
  if(op.entryAnalyst?.independent===true&&op.scenario){
    const scenario=op.scenario,scenarioDeadline=Number(scenario.deadline||0);
    const scenarioClosed=scenario.closed===true||scenarioDeadline<=now;
    const scenarioState=scenario.status==='INVALIDADO'?'INVALIDADO':scenarioDeadline<=now?'JANELA ENCERRADA':scenarioClosed?String(scenario.status||'INVALIDADO'):'JANELA ABERTA';
    const hasEntry=contextMatches&&Number(op.createdAt)>0&&setupEnd>now;
    const independentCanEnter=executionMatches&&hasEntry&&state==='ENTRADA'&&op.ready===true&&op.actionable===true&&entryEnd>now;
    const scenarioHasSetup=contextMatches&&!scenarioClosed&&Number(scenario.createdAt)>0;
    return{entrySide,signalHorizonSeconds,analysisSide,displaySide:side,oppositeAnalysis,
      entryState:state,entryWindowOpen:independentCanEnter,
      entryRemainingSeconds:independentCanEnter?Math.max(0,Math.ceil((entryEnd-now)/1000)):null,
      contextMatches,side:contextMatches?side:null,state:independentCanEnter&&!scenarioClosed?'ENTRADA':scenarioState,
      closed:scenarioClosed,hasSetup:scenarioHasSetup,canEnter:independentCanEnter,
      deadline:scenarioHasSetup?scenarioDeadline:null,remainingSeconds:scenarioHasSetup?Math.max(0,Math.ceil((scenarioDeadline-now)/1000)):null,
      entryDeadline:contextMatches&&entryEnd>0?entryEnd:null,confidence:Number(scenario.confidence||0)};
  }
  return{entrySide,signalHorizonSeconds,analysisSide,displaySide,oppositeAnalysis,entryWindowOpen:canEnter,entryRemainingSeconds:canEnter?Math.max(0,Math.ceil((entryEnd-now)/1000)):null,contextMatches,side:contextMatches?side:null,state,closed,hasSetup,canEnter,deadline:hasSetup?deadline:null,remainingSeconds:hasSetup?Math.max(0,Math.ceil((deadline-now)/1000)):null,entryDeadline:contextMatches&&entryEnd>0?entryEnd:null,confidence:Number(op.technicalConfidence??op.strength??0)};
}


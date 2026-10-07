// Presentation follows the operational engine; it never creates or extends a setup.
export function scenarioViewFromRuntime({operational={},asset,horizonSeconds,durationMs,forecast,displayThreshold=50,minPoints=55,now=Date.now()}={}){
  const op=operational||{},side=['CALL','PUT'].includes(op.side)?op.side:null;
  const contextMatches=!!side&&String(op.asset||'').toUpperCase()===String(asset||'').toUpperCase()&&Number(op.forecastHorizonSeconds)===Number(horizonSeconds)&&Number(op.durationMs)===Number(durationMs);
  let state=contextMatches?String(op.state||'AGUARDAR'):'AGUARDAR';
  const terminal=['INVALIDADO','JANELA PERDIDA','JANELA ENCERRADA'];
  const setupEnd=Number(op.entryWindowEndAt||op.targetAt||0),entryEnd=Number(op.activeUntil||0);
  const deadline=setupEnd;
  if(state==='ENTRADA'&&entryEnd>0&&now>=entryEnd)state='ACOMPANHANDO';
  if(contextMatches&&!terminal.includes(state)&&deadline>0&&now>=deadline)state=op.entryAt||entryEnd?'JANELA ENCERRADA':'JANELA PERDIDA';
  const closed=terminal.includes(state),hasSetup=contextMatches&&!closed&&Number(op.createdAt)>0&&deadline>now;
  const signalHorizonSeconds=Number(op.entryDecisionHorizonSeconds||horizonSeconds);
  const forecastMatches=forecast&&String(forecast.asset||'').toUpperCase()===String(asset||'').toUpperCase()&&Number(forecast.horizonSeconds||signalHorizonSeconds)===signalHorizonSeconds;
  const forecastSide=String(forecast?.rawBias??forecast?.bias??forecast?.displayBias??'NEUTRO').toUpperCase();
  const forecastLead=forecastSide==='CALL'?Number(forecast?.callProbability??50):forecastSide==='PUT'?Number(forecast?.putProbability??50):0;
  const analysisSide=forecast===undefined?(contextMatches?(['CALL','PUT'].includes(op.futureSide)?op.futureSide:side):null):forecastMatches&&forecast.outlookReady===true&&forecastLead>=Number(displayThreshold)&&Number(forecast.confidence??forecast.modelConfidence??0)>=Number(minPoints)&&['CALL','PUT'].includes(forecastSide)?forecastSide:null;
  const oppositeAnalysis=contextMatches&&!!analysisSide&&analysisSide!==side;
  const executionMatches=(!forecast&&signalHorizonSeconds===Number(horizonSeconds))||(forecastMatches&&forecast.outlookReady===true&&forecastSide===side);
  const displaySide=closed?side:hasSetup?(op.oppositeOpportunity?.side===analysisSide?analysisSide:side):analysisSide;
  const canEnter=executionMatches&&hasSetup&&state==='ENTRADA'&&op.ready===true&&op.actionable===true&&entryEnd>now;
  return{signalHorizonSeconds,analysisSide,displaySide,oppositeAnalysis,entryWindowOpen:canEnter,entryRemainingSeconds:canEnter?Math.max(0,Math.ceil((entryEnd-now)/1000)):null,contextMatches,side:contextMatches?side:null,state,closed,hasSetup,canEnter,deadline:hasSetup?deadline:null,remainingSeconds:hasSetup?Math.max(0,Math.ceil((deadline-now)/1000)):null,entryDeadline:contextMatches&&entryEnd>0?entryEnd:null,confidence:Number(op.technicalConfidence??op.strength??0)};
}

// Presentation follows the operational engine; it never creates or extends a setup.
export function scenarioViewFromRuntime({operational={},asset,horizonSeconds,durationMs,now=Date.now()}={}){
  const op=operational||{},side=['CALL','PUT'].includes(op.side)?op.side:null;
  const contextMatches=!!side&&String(op.asset||'').toUpperCase()===String(asset||'').toUpperCase()&&Number(op.forecastHorizonSeconds)===Number(horizonSeconds)&&Number(op.durationMs)===Number(durationMs);
  let state=contextMatches?String(op.state||'AGUARDAR'):'AGUARDAR';
  const terminal=['INVALIDADO','JANELA PERDIDA','JANELA ENCERRADA'];
  const setupEnd=Number(op.entryWindowEndAt||op.targetAt||0),entryEnd=Number(op.activeUntil||0);
  const deadline=setupEnd;
  if(state==='ENTRADA'&&entryEnd>0&&now>=entryEnd)state='ACOMPANHANDO';
  if(contextMatches&&!terminal.includes(state)&&deadline>0&&now>=deadline)state=op.entryAt||entryEnd?'JANELA ENCERRADA':'JANELA PERDIDA';
  const closed=terminal.includes(state),hasSetup=contextMatches&&!closed&&Number(op.createdAt)>0&&deadline>now;
  const canEnter=hasSetup&&state==='ENTRADA'&&op.ready===true&&op.actionable===true&&entryEnd>now;
  return{contextMatches,side:contextMatches?side:null,state,closed,hasSetup,canEnter,deadline:hasSetup?deadline:null,remainingSeconds:hasSetup?Math.max(0,Math.ceil((deadline-now)/1000)):null,entryDeadline:contextMatches&&entryEnd>0?entryEnd:null,confidence:Number(op.technicalConfidence??op.strength??0)};
}

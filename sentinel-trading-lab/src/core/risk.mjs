export function evaluateRisk(ctx){
  const reasons=[];
  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  if(ctx.killSwitch)reasons.push('kill switch ativo');
  if(ctx.botFrozen)reasons.push('bot congelado pelo master');
  if(!ctx.brokerConnected)reasons.push('corretora desconectada');
  if(!ctx.engineHealthy)reasons.push('engine sem heartbeat');
  if(ctx.executionError)reasons.push('execução bloqueada após erro');
  if(n(ctx.feedLatencyMs)>n(ctx.maxFeedLatencyMs,1200))reasons.push('latência do feed acima do limite');
  if(ctx.feedStale)reasons.push('feed desatualizado');
  if(ctx.signalSide==='WAIT')reasons.push('sem sinal aprovado');
  if(n(ctx.confidence)<n(ctx.minConfidence,68))reasons.push('confiança insuficiente');
  if(n(ctx.tradesToday)>=n(ctx.maxTradesPerDay,20))reasons.push('limite diário de operações');
  if(n(ctx.tradesLastHour)>=n(ctx.maxTradesPerHour,6))reasons.push('limite de operações por hora');
  if(n(ctx.consecutiveLosses)>=n(ctx.maxConsecutiveLosses,3))reasons.push('limite de perdas consecutivas');
  if(Math.abs(Math.min(0,n(ctx.dailyPnl)))>=Math.abs(n(ctx.maxDailyLoss,100)))reasons.push('perda diária máxima atingida');
  if(n(ctx.dailyProfitTarget)>0&&n(ctx.dailyPnl)>=n(ctx.dailyProfitTarget))reasons.push('meta diária atingida');
  if(n(ctx.drawdownPct)>=n(ctx.maxDrawdownPct,10))reasons.push('drawdown máximo atingido');
  if(ctx.cooldownUntil&&new Date(ctx.cooldownUntil).getTime()>n(ctx.now,Date.now()))reasons.push('cooldown ativo');
  return{allowed:reasons.length===0,reasons};
}

export function evaluateExecutionGate(ctx){
  const base=evaluateRisk(ctx);
  const reasons=[...base.reasons];
  if(ctx.mode==='real'&&!ctx.humanConfirmed)reasons.push('modo real exige confirmação humana');
  if(ctx.mode==='real'&&!ctx.realAdapterValidated)reasons.push('adapter real não validado');
  return{allowed:reasons.length===0,reasons};
}

export function positionSize({mode='fixed',fixed=10,pct=1,balance=1000,maxStake=50}){
  const raw=mode==='percent'?balance*(pct/100):fixed;
  return Math.max(0,Math.min(raw,maxStake,balance));
}

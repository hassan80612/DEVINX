import {analyzeMarket} from './strategy.mjs';
import {evaluateRisk,evaluateExecutionGate,positionSize} from './risk.mjs';
import {scheduleGate} from './scheduler.mjs';

export async function engineCycle({feed,broker,settings,state,balanceOverride=null,signalGate=null,now=Date.now()}){
  const cycleStarted=Date.now();
  const gate=scheduleGate(settings.schedule,new Date(now));
  if(!gate.allowed)return{action:'WAIT',reasons:[gate.reason],latency:{decisionMs:Date.now()-cycleStarted}};
  const snap=feed.snapshot();
  const forecastSeconds=Math.max(30,Number(settings.forecastHorizonSeconds||Math.round(Number(settings.orderDurationMs||60000)/1000)));
  const configuredFreshness=Math.max(500,Number(settings.risk.maxFeedLatencyMs||2500));
  const effectiveFreshnessMs=forecastSeconds<=30?Math.min(configuredFreshness,1500):forecastSeconds<=60?Math.min(configuredFreshness,2000):configuredFreshness;
  let analysis=analyzeMarket({
    candles:snap.candles,quoteHistory:snap.quoteHistory||[],strategy:settings.strategy,minConfidence:settings.risk.minConfidence,
    durationMs:settings.orderDurationMs,forecastHorizonSeconds:forecastSeconds,freshnessMs:effectiveFreshnessMs,quoteTs:snap.quoteTs,now
  });
  if(signalGate){
    const gated=await signalGate({analysis,snap,settings,now});
    if(gated?.analysis)analysis=gated.analysis;
    if(gated?.allowed===false)return{action:'WAIT',analysis,reasons:[...(gated.reasons||[]),'sinal bloqueado até validação estatística suficiente'],latency:{feedMs:Math.max(0,now-Number(snap.quoteTs||now)),decisionMs:Date.now()-cycleStarted}}
  }
  const feedLatencyMs=Math.max(0,now-Number(snap.quoteTs||now));
  const risk=evaluateRisk({...state,now,mode:settings.mode,signalSide:analysis.side,confidence:analysis.confidence,
    minConfidence:settings.risk.minConfidence,maxFeedLatencyMs:effectiveFreshnessMs,
    feedLatencyMs:Math.max(Number(state.feedLatencyMs||0),feedLatencyMs),feedStale:feedLatencyMs>effectiveFreshnessMs,
    dailyProfitTarget:settings.risk.dailyProfitTarget});
  const decisionMs=Date.now()-cycleStarted;
  if(decisionMs>Number(settings.risk.maxDecisionLatencyMs||250))return{action:'WAIT',analysis,reasons:['latência de decisão acima do limite'],latency:{feedMs:feedLatencyMs,decisionMs}};
  if(!risk.allowed)return{action:'WAIT',analysis,reasons:risk.reasons,latency:{feedMs:feedLatencyMs,decisionMs}};
  const amount=positionSize({mode:settings.risk.stakeMode,fixed:settings.risk.fixedStake,pct:settings.risk.stakePct,
    balance:balanceOverride==null?await broker.getBalance():Number(balanceOverride),maxStake:settings.risk.maxStake});
  const proposal={
    proposalId:`${now}:${settings.asset}:${analysis.side}`,
    side:analysis.side,amount,asset:settings.asset,referencePrice:snap.price,confidence:analysis.confidence,
    createdAt:new Date(now).toISOString(),expiresAt:new Date(now+Math.max(15_000,Number(settings.orderProposalTtlMs||60_000))).toISOString()
  };
  if(settings.mode==='real')return{action:'PREPARE_REAL',analysis,amount,proposal,reasons:['aguardando confirmação humana'],latency:{feedMs:feedLatencyMs,decisionMs}};
  if(settings.demoAutopilot!==true)return{action:'DEMO_READY',analysis,amount,proposal,reasons:['piloto DEMO desarmado'],latency:{feedMs:feedLatencyMs,decisionMs}};
  const started=Date.now();
  const order=await broker.placeOrder(proposal);
  return{action:'DEMO_ORDER',analysis,amount,order,proposal,latency:{feedMs:feedLatencyMs,decisionMs,executionMs:Date.now()-started}};
}

export async function executePreparedOrder({proposal,broker,settings,state,now=Date.now(),humanConfirmed=false,realAdapterValidated=false}){
  if(settings?.mode==='real')return{action:'BLOCKED',reasons:['execução REAL permanece manual na corretora']};
  if(!proposal)throw new Error('proposal_missing');
  if(new Date(proposal.expiresAt).getTime()<=now)throw new Error('proposal_expired');
  const gate=evaluateExecutionGate({...state,now,mode:settings.mode,humanConfirmed,realAdapterValidated,
    signalSide:proposal.side,confidence:proposal.confidence,minConfidence:settings.risk.minConfidence,
    maxFeedLatencyMs:settings.risk.maxFeedLatencyMs,dailyProfitTarget:settings.risk.dailyProfitTarget});
  if(!gate.allowed)return{action:'BLOCKED',reasons:gate.reasons};
  const started=Date.now();
  const order=await broker.placeOrder({...proposal,humanConfirmed:true});
  return{action:settings.mode==='real'?'REAL_ORDER':'DEMO_ORDER',order,executionMs:Date.now()-started};
}

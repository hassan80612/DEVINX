import {analyzeMarket} from './strategy.mjs';
import {evaluateRisk,evaluateExecutionGate,positionSize} from './risk.mjs';
import {scheduleGate} from './scheduler.mjs';

export async function engineCycle({feed,broker,settings,state,balanceOverride=null,signalGate=null,now=Date.now()}){
  const cycleStarted=Date.now();
  const gate=scheduleGate(settings.schedule,new Date(now));
  if(!gate.allowed)return{action:'WAIT',reasons:[gate.reason],latency:{decisionMs:Date.now()-cycleStarted}};
  const snap=feed.snapshot();
  let analysis=analyzeMarket({
    candles:snap.candles,quoteHistory:snap.quoteHistory||[],strategy:settings.strategy,minConfidence:settings.risk.minConfidence,
    durationMs:settings.orderDurationMs,freshnessMs:settings.risk.maxFeedLatencyMs,quoteTs:snap.quoteTs,now
  });
  if(signalGate){
    const gated=await signalGate({analysis,snap,settings,now});
    if(gated?.analysis)analysis=gated.analysis;
    if(gated?.allowed===false)return{action:'WAIT',analysis,reasons:[...(gated.reasons||[]),'sinal bloqueado até validação estatística suficiente'],latency:{feedMs:Math.max(0,now-Number(snap.quoteTs||now)),decisionMs:Date.now()-cycleStarted}}
  }
  const feedLatencyMs=Math.max(0,now-Number(snap.quoteTs||now));
  const risk=evaluateRisk({...state,now,mode:settings.mode,signalSide:analysis.side,confidence:analysis.confidence,
    minConfidence:settings.risk.minConfidence,maxFeedLatencyMs:settings.risk.maxFeedLatencyMs,
    feedLatencyMs:Math.max(Number(state.feedLatencyMs||0),feedLatencyMs),feedStale:feedLatencyMs>settings.risk.maxFeedLatencyMs,
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
  const autoTrade=settings.autoTrade===true||settings.demoAutopilot===true;
  if(!autoTrade)return{action:'AUTO_READY',analysis,amount,proposal,reasons:['piloto automático desarmado'],latency:{feedMs:feedLatencyMs,decisionMs}};
  const started=Date.now();
  const order=await broker.placeOrder(proposal);
  return{action:'AUTO_ORDER',analysis,amount,order,proposal,latency:{feedMs:feedLatencyMs,decisionMs,executionMs:Date.now()-started}};
}

export async function executePreparedOrder({proposal,broker,settings,state,now=Date.now(),humanConfirmed=false,realAdapterValidated=false}){
  if(!proposal)throw new Error('proposal_missing');
  if(new Date(proposal.expiresAt).getTime()<=now)throw new Error('proposal_expired');
  const autoTrade=settings?.autoTrade===true||settings?.demoAutopilot===true;
  const gate=evaluateExecutionGate({...state,now,mode:settings.mode,humanConfirmed:autoTrade||humanConfirmed,realAdapterValidated:autoTrade||realAdapterValidated,
    signalSide:proposal.side,confidence:proposal.confidence,minConfidence:settings.risk.minConfidence,
    maxFeedLatencyMs:settings.risk.maxFeedLatencyMs,dailyProfitTarget:settings.risk.dailyProfitTarget});
  if(!gate.allowed)return{action:'BLOCKED',reasons:gate.reasons};
  const started=Date.now();
  const order=await broker.placeOrder({...proposal,humanConfirmed:true});
  return{action:'AUTO_ORDER',order,executionMs:Date.now()-started};
}

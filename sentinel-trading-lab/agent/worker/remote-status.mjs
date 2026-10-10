import {analystSnapshot} from './live-bridge.mjs';
// Payload sent to Supabase for the remote dashboard. The trading engine retains
// complete candle/history data locally; only the remote snapshot is bounded.
const MAX_ANALYSES = 6;
const MAX_CANDLES = 40;
const MAX_QUOTES = 40;
const MAX_ASSETS = 80;

function compactMarket(market) {
  if (!market || typeof market !== 'object' || Array.isArray(market)) return market;
  const result = { ...market };
  if (Array.isArray(result.candles)) result.candles = result.candles.slice(-MAX_CANDLES);
  if (Array.isArray(result.quoteHistory)) result.quoteHistory = result.quoteHistory.slice(-MAX_QUOTES);
  if (Array.isArray(result.assets)) result.assets = result.assets.slice(0, MAX_ASSETS);
  // Forecast history remains in the Windows Agent: the site does not render these
  // 480 candles. Avoid sending it twice (liveBroker and brokers[provider].marketData).
  delete result.predictionCandles;
  delete result.executionUi;
  delete result.executionReady;
  return result;
}

function compactAnalyses(items) {
  if (!Array.isArray(items)) return items;
  return items.slice(0, MAX_ANALYSES).map((entry, index) => {
    if (!entry || typeof entry !== 'object' || index === 0) return entry;
    return {
      ts: entry.ts,
      side: entry.side,
      confidence: entry.confidence,
      reasons: Array.isArray(entry.reasons) ? entry.reasons.slice(0, 1) : []
    };
  });
}

const HORIZON_VIEW_KEYS = ['asset','horizonSeconds','rawBias','bias','displayBias','outlookReady','directionReady','confidence','modelConfidence','callProbability','putProbability'];
function compactAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return analysis;
  const out = {...analysis};
  // Only UI-used forecast fields are published. No strategy input or decision is modified.
  delete out.predictionMetrics;
  delete out.strategyCards;
  if (out.entryPlanner?.horizons && typeof out.entryPlanner.horizons === 'object') {
    const horizons = Object.fromEntries(Object.entries(out.entryPlanner.horizons).map(([seconds,forecast]) => {
      if (!forecast || typeof forecast !== 'object') return [seconds,forecast];
      return [seconds,Object.fromEntries(HORIZON_VIEW_KEYS.filter(k => Object.hasOwn(forecast,k)).map(k => [k,forecast[k]]))];
    }));
    out.entryPlanner = {...out.entryPlanner,horizons};
  }
  return out;
}

export function compactRemoteState(state) {
  if (!state || typeof state !== 'object') return {};
  const result = { ...state };
  result.recentAnalyses = compactAnalyses(state.recentAnalyses);
  if (state.lastResult?.analysis) result.lastResult = {...state.lastResult,analysis:compactAnalysis(state.lastResult.analysis)};
  result.liveBroker = compactMarket(state.liveBroker);
  if (state.brokers && typeof state.brokers === 'object') {
    result.brokers = Object.fromEntries(
      Object.entries(state.brokers).map(([name, broker]) => [
        name, broker && typeof broker === 'object'
          ? { ...broker, marketData: compactMarket(broker.marketData) }
          : broker
      ])
    );
  }
  // Detailed research remains in the worker's local journal. The remote
  // dashboard displays counters, not the full context training dataset.
  if (state.entryResearch && typeof state.entryResearch === 'object') {
    const { byContext, ...summary } = state.entryResearch;
    result.entryResearch = summary;
  }
  if (Array.isArray(state.recentTrades)) result.recentTrades = state.recentTrades.slice(-20);
  if (Array.isArray(state.incidents)) result.incidents = state.incidents.slice(-12);
  return result;
}

// Dashboard-only transport. Keep the broker and engine untouched; trim ONLY
// the heartbeat representation so one working Agent does not continuously
// upload giant chart buffers or research journals to Supabase/Postgres.
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const MARKET_KEYS=['provider','mode','symbol','validatedSymbol','uiSymbol','activeId','quote','lastQuoteAt','lastCandleAt','assetValidated','analysisFeedValidated','feedValidated','marketStatus','candleAgeMs','balance','balanceSource','protocol','lastCandleRequest','lastCandleResponse','suggestedSymbol','lastPassiveFrameAt'];
const BROKER_KEYS=['connected','validated','hasSession','accountMode','lastError','checklist','sessionOpen','provider'];
const METRICS_KEYS=['last','fast','slow','ema50','ema200','rsi','stoch','atr','momentum','buyScore','sellScore','macd','structure','bb','sr','fib','sourceCandles'];
export function dashboardTransportState(state){
  const st=compactRemoteState(state);
  const slim=analystSnapshot(st,st.liveBroker||{});
  const analysis=st.lastResult?.analysis||{};
  const market=pick(st.liveBroker,MARKET_KEYS);
  // Only simple counters and quote metadata, never duplicate arrays/book/history.
  if(Array.isArray(st.liveBroker?.candles)){market.candlesCount=st.liveBroker.candles.length;market.candles=st.liveBroker.candles.slice(-1).map(c=>pick(c,['from','open','close','high','low']));}
  const brokers=Object.fromEntries(Object.entries(st.brokers||{}).map(([name,broker])=>{
    const b=broker&&typeof broker==='object'?broker:{};
    const md=b.marketData||{};
    const marketData=pick(md,MARKET_KEYS);
    if(Array.isArray(md.candles)){marketData.candlesCount=md.candles.length;marketData.candles=md.candles.slice(-1).map(c=>pick(c,['from','close']));}
    // Preserve the count without passing the asset catalog.
    if(Array.isArray(md.assets)){marketData.assetsCount=md.assets.length;marketData.assets=md.assets.slice(0,2).filter(x=>typeof x==='string').map(x=>x.slice(0,70));}
    return[name,{...pick(b,BROKER_KEYS),marketData}];
  }));
  const lastResult={
    ...pick(st.lastResult,['asset','action','reasons','latency','plan']),
    analysis:{
      ...pick(analysis,['side','confidence','reasons']),
      ...slim.lastResult.analysis,
      metrics:pick(analysis.metrics,METRICS_KEYS),
    }
  };
  return{
    ...pick(st,['agentVersion','liveTopic','liveSignatureKey','agentAccess','remoteRelay','browserDriver','loginStates','state','mode','balance','balanceSource','feed','analysisSource','executionMode','lastEvalMs','nextEvalMs','research','entryResearch','drawdownPct','consecutiveLosses','pending','wins','losses','winRate','settings','pnl','trades','activeProvider','startBlockedReason','killSwitch','masterFrozen','scheduler','autopilot','lastHeartbeat']),
    liveBroker:market,brokers,lastResult,
    recentAnalyses:Array.isArray(st.recentAnalyses)?st.recentAnalyses.slice(0,6).map(x=>({ts:x?.ts,side:x?.side,confidence:x?.confidence,reasons:Array.isArray(x?.reasons)?x.reasons.slice(0,1):[]})):[],
    recentTrades:Array.isArray(st.recentTrades)?st.recentTrades.slice(-5):[],
    incidents:Array.isArray(st.incidents)?st.incidents.slice(-5):[],
  };
}

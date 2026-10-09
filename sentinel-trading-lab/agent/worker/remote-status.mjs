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

export function compactRemoteState(state) {
  if (!state || typeof state !== 'object') return {};
  const result = { ...state };
  result.recentAnalyses = compactAnalyses(state.recentAnalyses);
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

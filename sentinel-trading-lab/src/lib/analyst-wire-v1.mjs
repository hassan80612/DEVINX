// Version 1 signs JSON.stringify(analystSnapshot / fitAnalystFrame). Realtime
// decodes that JSON and re-encodes maps in a different key order. Restore the
// v1 producer's field order before HMAC verification; NEVER omit a received
// field or change its value. This supports installed Agents without weakening
// authentication or requiring a change to their analysis/overlay.
const fields = {
  '': 'v at seq agentVersion state killSwitch masterFrozen lastEvalMs settings liveBroker feed lastResult',
  settings: 'forecastMode engine orderDurationMs',
  liveBroker: 'symbol validatedSymbol assetValidated analysisFeedValidated lastQuoteAt quote',
  feed: 'price quoteTs',
  lastResult: 'asset analysis',
  'lastResult.analysis': 'operationalSignal vnext generalConsensus entryPlanner',
  operationalSignal: 'asset forecastHorizonSeconds durationMs side state ready actionable activeUntil entryWindowEndAt targetAt createdAt technicalConfidence strength futureSide entryDecisionHorizonSeconds scenario subanalyst entryAnalyst scenarioProjection',
  scenario: 'side status closed createdAt deadline confidence',
  subanalyst: 'mode active status checkedAt alert',
  alert: 'side trigger invalidation target testing',
  entryAnalyst: 'independent qualification',
  qualification: 'allowed',
  scenarioProjection: 'side status confirmed actionable horizonSeconds asOf issuedAt targetAt projectedPrice expectedLow expectedHigh engineId',
  vnext: 'engineId expirySeconds computedStatus forecastFoundation historicalComparisons outcomesVerified receipt ea ow fq er targetAnchor projection hf hm targetProjection lastSettled cards',
  receipt: 'engineId asset side referencePrice quoteReceivedAt issuedAt expirySeconds targetAt projectedPrice expectedLow expectedHigh',
  targetAnchor: 'engineId asset side issuedAt expirySeconds targetAt referencePrice projectedPrice',
  projection: 'side callPct putPct',
  targetProjection: 'side callPct putPct',
  lastSettled: 'engineId asset side targetAt referencePrice projectedPrice settledPrice correct expirySeconds',
  'cards.*': 'id side callPct putPct',
  generalConsensus: 'rapid strategies displayCallPct',
  rapid: 'callPct activeCount',
  strategies: 'callPct activeCount',
  entryPlanner: 'horizons',
  'horizons.*': 'asset horizonSeconds rawBias bias displayBias outlookReady directionReady confidence modelConfidence callProbability putProbability',
};
const compactFields='engineId expirySeconds receipt targetAnchor ea ow er fq projection hf hm cards targetProjection';

export function analystWireV1(frame){
  const analysis=frame?.lastResult?.analysis;
  const compact=analysis&& !Object.hasOwn(analysis,'generalConsensus');
  function order(value,path=''){
    if(value===null||typeof value!=='object')return value;
    if(Array.isArray(value))return value.map(item=>order(item,path+'.*'));
    const key=path.split('.').at(-1);
    const rule=/\.horizons\.\d+$/.test(path)?fields['horizons.*']:
      (path==='lastResult.analysis.vnext'&&compact)?compactFields:
      fields[path]||fields[path.split('.').slice(-2).join('.')]||fields[key]||'';
    const names=rule.split(' ').filter(Boolean);
    // Keep unknown fields in the signed material. They cannot be added by a
    // relay/attacker and then silently ignored by the verifier.
    const extras=Object.keys(value).filter(k=>!names.includes(k)).sort();
    const result=Object.create(null);
    for(const name of [...names,...extras]){
      if(path===''&&name==='sig')continue;
      if(Object.hasOwn(value,name))result[name]=order(value[name],path?path+'.'+name:name);
    }
    return result;
  }
  return JSON.stringify(order(frame));
}

// Balanced admission policy for live entries.
// 30s and 1m use the existing shared structural decision directly.
// 5m requires a confirmed reversal at an observed range or level extreme.
const SIDE=new Set(['CALL','PUT']);
const REVERSAL_REASONS=new Set([
  'closed-range-extreme-reversal-confirmed',
  'confirmed-level-structure-reversal',
  'confirmed-fast-level-reversal',
  'failed-breakout-structure-change',
  'multiscale-candle-rejection',
  'historical-level-rejection',
  'observed-multi-interval-trend-correction'
]);
const isReversalReason=reason=>{
  const value=String(reason||'');
  return REVERSAL_REASONS.has(value)||(
    /reversal|rejection|structure-change|failed-breakout|range-extreme/.test(value)&&
    !/continuation|followthrough|retest-versus/.test(value)
  );
};
function reversalEvidence(candidate){
  const structure=candidate?.priceStructure||{};
  return candidate?.reversalEvidence||structure.confirmedReversal||
    structure.observedSequence?.structureChange||
    (structure.candleRoute?.event?.kind&&structure.candleRoute.event)||null;
}
function hasExtreme(candidate,evidence){
  const side=candidate?.side;
  if(candidate?.extreme===true||candidate?.priceStructure?.rangeExtreme===true||
    evidence?.level?.extreme===true)return true;
  const raw=candidate?.position??candidate?.rangePosition??
    candidate?.priceStructure?.rangePosition??candidate?.priceStructure?.range?.position;
  if(raw===null||raw===undefined||raw===''||!Number.isFinite(Number(raw)))return false;
  const position=Number(raw);
  return (side==='CALL'&&position<=.27)||(side==='PUT'&&position>=.73);
}
export function precisionEntryGate({candidate=null,quoteAt,now=Date.now(),durationMs}={}){
  const duration=Number(durationMs);
  if(duration!==300_000)return {enabled:false,ready:true,side:candidate?.side||null,
    reason:'short-horizon-shared-structure',checks:{}};
  const side=SIDE.has(candidate?.side)?candidate.side:null;
  const age=Number(now)-Number(quoteAt);
  const evidence=reversalEvidence(candidate);
  const reversal=isReversalReason(candidate?.reason)||isReversalReason(evidence?.kind);
  const confirmed=candidate?.fiveMinuteReversalConfirmed===true&&reversal;
  const freshQuote=Number.isFinite(age)&&age>=0&&age<=2500;
  const extreme=!!side&&hasExtreme(candidate,evidence);
  const checks={
    candidate:candidate?.ready===true&&!!side,
    freshQuote,
    confirmedReversal:confirmed,
    rangeOrLevelExtreme:extreme
  };
  const ready=Object.values(checks).every(Boolean);
  const reason=ready?'five-minute-extreme-reversal-admitted':
    !checks.candidate?'precision-no-confirmed-side':
    !checks.freshQuote?'precision-stale-quote':
    !checks.confirmedReversal?'five-minute-reversal-only-awaiting-proof':
    'five-minute-extreme-required';
  return {enabled:true,ready,side:ready?side:null,reason,
    observedAt:Number(quoteAt)||null,quoteAgeMs:Number.isFinite(age)?age:null,
    maxQuoteAgeMs:2500,evidenceKind:evidence?.kind||candidate?.reason||null,
    checks,extremeRequired:true};
}
export const PRECISION_ENTRY_HORIZONS=Object.freeze([30_000,60_000,300_000]);

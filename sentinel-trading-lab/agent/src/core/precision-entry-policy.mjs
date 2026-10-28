// Balanced admission policy for live entries.
// 30s and 1m use the existing shared structural decision directly.
// 5m requires a current reversal at a verified range or level extreme.
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
function levelExtreme(candidate,evidence,side){
  const structure=candidate?.priceStructure||{};
  const events=[structure.reaction,structure.candleRoute?.event,
    structure.observedSequence?.structureChange,evidence];
  return events.some(event=>{
    if(!event||event.side!==side)return false;
    const kind=String(event.kind||candidate?.reason||'');
    if(!/rejection|reversal|failed-breakout|range-extreme|structure-change/.test(kind))return false;
    const level=event.zone??event.level;
    const pivots=Number(level?.confirmedPivots??level?.pivots??0);
    const rejects=Number(level?.independentRejections??level?.independentTests??0);
    return pivots>0||rejects>=2;
  });
}
function hasExtreme(candidate,evidence,side=candidate?.side){
  if(!SIDE.has(side))return false;
  if(candidate?.extreme===true||candidate?.rangeExtreme===true||
    candidate?.priceStructure?.rangeExtreme===true||evidence?.level?.extreme===true)return true;
  const raw=candidate?.position??candidate?.rangePosition??
    candidate?.priceStructure?.rangePosition??candidate?.priceStructure?.range?.position;
  if(raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw))){
    const position=Number(raw);
    if((side==='CALL'&&position<=.27)||(side==='PUT'&&position>=.73))return true;
  }
  return levelExtreme(candidate,evidence,side);
}
const points=checks=>(Number(checks.candidate)*25)+
  (Number(checks.freshQuote)*20)+(Number(checks.confirmedReversal)*35)+
  (Number(checks.rangeOrLevelExtreme)*20);
export function precisionEntryGate({candidate=null,original=null,quoteAt,now=Date.now(),durationMs}={}){
  const duration=Number(durationMs);
  if(duration!==300_000)return {enabled:false,ready:true,side:candidate?.side||null,
    score:100,reason:'short-horizon-shared-structure',checks:{}};
  const side=SIDE.has(candidate?.side)?candidate.side:null;
  const age=Number(now)-Number(quoteAt);
  const evidence=reversalEvidence(candidate)||reversalEvidence(original);
  const reversal=isReversalReason(candidate?.reason)||isReversalReason(original?.reason)||
    isReversalReason(evidence?.kind);
  const confirmed=candidate?.fiveMinuteReversalConfirmed===true&&reversal;
  const freshQuote=Number.isFinite(age)&&age>=0&&age<=2500;
  const extreme=!!side&&hasExtreme(candidate,evidence,side);
  const checks={
    candidate:candidate?.ready===true&&!!side,
    freshQuote,
    confirmedReversal:confirmed,
    rangeOrLevelExtreme:extreme
  };
  // The displayed score is diagnostic only. Admission is decided by the
  // named structural checks above, never by a numeric 100-point threshold.
  const progressSide=SIDE.has(candidate?.side)?candidate.side:SIDE.has(original?.side)?original.side:null;
  const progressCandidate={...(original||{}),...(candidate||{}),side:progressSide,
    priceStructure:candidate?.priceStructure||original?.priceStructure};
  const progressEvidence=reversalEvidence(progressCandidate)||evidence;
  const progressAt=Number(progressEvidence?.confirmedAt??progressEvidence?.observedAt??
    progressCandidate?.observedAt??quoteAt);
  const progressConfirmed=SIDE.has(progressSide)&&
    (candidate?.fiveMinuteReversalConfirmed===true||
     (isReversalReason(progressCandidate?.reason)&&
      (candidate?.ready===true||original?.ready===true)&&
      progressAt>0&&progressAt<=Number(quoteAt)&&Number(quoteAt)-progressAt<=2500));
  const progress={
    candidate:SIDE.has(progressSide)&&(candidate?.ready===true||original?.ready===true),
    freshQuote,
    confirmedReversal:progressConfirmed,
    rangeOrLevelExtreme:hasExtreme(progressCandidate,progressEvidence,progressSide)
  };
  const score=points(progress);
  const ready=checks.candidate&&checks.freshQuote&&checks.confirmedReversal&&checks.rangeOrLevelExtreme;
  const reason=ready?'five-minute-extreme-reversal-admitted':
    !checks.candidate?'precision-no-confirmed-side':
    !checks.freshQuote?'precision-stale-quote':
    !checks.confirmedReversal?'five-minute-reversal-only-awaiting-proof':
    'five-minute-extreme-required';
  return {enabled:true,ready,side:ready?side:null,score,
    reason,observedAt:Number(quoteAt)||null,quoteAgeMs:Number.isFinite(age)?age:null,
    maxQuoteAgeMs:2500,evidenceKind:evidence?.kind||candidate?.reason||null,
    checks,extremeRequired:true};
}
export const PRECISION_ENTRY_HORIZONS=Object.freeze([30_000,60_000,300_000]);

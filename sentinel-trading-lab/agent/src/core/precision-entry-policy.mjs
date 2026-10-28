// Strict admission policy for Sentinel v47 precision mode.
//
// This is an admission score, not a promised market win rate. A 100/100 score
// means that the current quote has all of the evidence required to allow an
// entry; otherwise the runtime stays in WAIT and does not click the broker.
const TARGET_HORIZONS=new Set([30_000,60_000,300_000]);
const SIDE=new Set(['CALL','PUT']);
const opposite=side=>side==='CALL'?'PUT':side==='PUT'?'CALL':null;
const finite=v=>Number.isFinite(Number(v));
const count=v=>finite(v)?Math.max(0,Number(v)):0;
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
const selectedProbability=(estimate,side)=>side==='CALL'?Number(estimate?.pCall):Number(estimate?.pPut);

function reversalEvidence(candidate){
  const structure=candidate?.priceStructure||{};
  return candidate?.reversalEvidence||structure.confirmedReversal||
    structure.observedSequence?.structureChange||
    (structure.candleRoute?.event?.kind&&structure.candleRoute.event)||null;
}

function levelIsStrong(evidence,structure){
  const level=evidence?.level||structure?.reaction?.zone||structure?.candleRoute?.event?.level||null;
  const pivots=Math.max(count(level?.confirmedPivots),count(level?.pivots));
  const rejections=Math.max(count(level?.independentRejections),count(level?.independentTests),count(level?.windows));
  const quotes=Math.max(count(evidence?.quoteConfirmations),count(evidence?.confirmations));
  const proof=structure?.reactionProof;
  return evidence?.kind==='confirmed-fast-level-reversal'&&quotes>=2||
    (pivots>=2&&rejections>=2)||
    (proof?.confirmed===true&&Array.isArray(proof.moves)&&proof.moves.length>=2);
}

function hasExtreme(candidate,evidence){
  const side=candidate?.side;
  const position=Number(candidate?.position??candidate?.rangePosition);
  if(candidate?.extreme===true||evidence?.level?.extreme===true)return true;
  if(finite(position)&&((side==='CALL'&&position<=.27)||(side==='PUT'&&position>=.73)))return true;
  return false;
}

export function precisionEntryGate({candidate=null,original=null,preliminary=null,quoteAt,now=Date.now(),durationMs}={}){
  const duration=Number(durationMs);
  const enabled=TARGET_HORIZONS.has(duration);
  if(!enabled)return {enabled:false,ready:true,score:100,requiredScore:100,side:candidate?.side||null,reason:'precision-profile-out-of-scope',checks:{}};
  const side=SIDE.has(candidate?.side)?candidate.side:null;
  const age=Number(now)-Number(quoteAt);
  const maxAge=duration<=30_000?1450:duration<=60_000?1950:2500;
  const evidence=reversalEvidence(candidate);
  const reversalReason=isReversalReason(candidate?.reason)||isReversalReason(evidence?.kind);
  const extremeRequired=duration===300_000;
  // The 5m horizon is the only one that requires a range/level extreme.
  // Short horizons use a confirmed local turn and strong independent
  // evidence, because forcing them to the edge of a wide range would remove
  // valid 30s/1m reversals rather than improve their quality.
  const extreme=!extremeRequired||!!side&&hasExtreme(candidate,evidence);
  const strong=!!side&&(
    levelIsStrong(evidence,candidate?.priceStructure||{})||
    (candidate?.reason==='closed-range-extreme-reversal-confirmed'&&
      Number(candidate?.observedSwingSeconds)>=20&&extreme)||
    candidate?.priceStructure?.reactionProof?.confirmed===true
  );
  const oppositeTrend=!!side&&preliminary?.trendSide===opposite(side);
  const fastReversal=!!side&&preliminary?.fastSide===side&&preliminary?.fastReversalAgainst30s===true;
  const originalOpposite=!!side&&SIDE.has(original?.side)&&original.side===opposite(side);
  const probability=selectedProbability(preliminary,side);
  const probabilityStrong=Number.isFinite(probability)&&probability>=.62&&
    (!preliminary?.side||preliminary.side===side);
  const oppositeForecast=oppositeTrend&&fastReversal&&(originalOpposite||preliminary?.side===side||probabilityStrong);
  const checks={
    candidate:!!(candidate?.ready===true&&side),
    freshQuote:Number.isFinite(age)&&age>=0&&age<=maxAge,
    reversal:reversalReason,
    extreme,
    strong,
    oppositeForecast,
    probability:probabilityStrong
  };
  const weights={candidate:10,freshQuote:10,reversal:20,extreme:20,strong:20,oppositeForecast:10,probability:10};
  const score=Object.entries(weights).reduce((total,[key,weight])=>total+(checks[key]?weight:0),0);
  const ready=Object.values(checks).every(Boolean);
  const reason=ready?'precision-reversal-admitted-v47':
    !checks.candidate?'precision-no-confirmed-side':
    !checks.freshQuote?'precision-stale-quote':
    !checks.reversal?'precision-reversal-required':
    !checks.extreme?'precision-extreme-required':
    !checks.strong?'precision-strong-indices-required':
    !checks.oppositeForecast?'precision-opposite-forecast-required':'precision-directional-score-below-100';
  return {enabled:true,ready,score,requiredScore:100,side:ready?side:null,reason,
    observedAt:Number(quoteAt)||null,quoteAgeMs:Number.isFinite(age)?age:null,maxQuoteAgeMs:maxAge,
    probability:Number.isFinite(probability)?probability:null,evidenceKind:evidence?.kind||candidate?.reason||null,
    checks,extremeRequired};
}

export const PRECISION_ENTRY_HORIZONS=Object.freeze([...TARGET_HORIZONS]);

// The selected "Entrada daqui a" controls an OPPORTUNITY WINDOW, while
// holdingSeconds determines the ACTUAL price-outcome horizon after entry.
// No UI clock, current candle or selected strategy can create a forecast.
// Never issues broker orders. Candidate scores are NOT win probabilities.
export function entryOffsets(windowSeconds){
 const h=Number(windowSeconds);
 if(!Number.isInteger(h)||h<5||h>3600)return [];
 return [...new Set([1,Math.min(h,Math.max(2,Math.ceil(h*.08))),
   Math.max(2,Math.round(h*.24)),Math.max(2,Math.round(h*.48)),
   Math.max(2,Math.round(h*.72)),Math.max(2,Math.round(h*.96))])]
   .filter(x=>x<=h).sort((a,b)=>a-b);
}
export function planEntryWindow({windowSeconds=30,holdingSeconds=windowSeconds,
 now=Date.now(),engineId='automatic',asset='UNKNOWN',forecastMode='continuous',
 // The currently running fixed opportunity, when supplied, is the true
 // deadline. Do not plan an entry in a new floating now+H interval.
 realWindowEndsAt=null,confirmationQuoteGapMs=0,lateEntryRisk=0,
 evaluateLead=()=>null}={}){
 const deadline=Number(realWindowEndsAt);
 const headroom=Math.max(0,Number(confirmationQuoteGapMs)||0);
 const remainingMs=deadline>now?deadline-now-headroom:realWindowEndsAt==null?windowSeconds*1000:0;
 const eligibleSeconds=Math.min(windowSeconds,Math.floor(remainingMs/1000));
 const offsets=eligibleSeconds>=2?entryOffsets(Math.max(5,eligibleSeconds)).filter(seconds=>seconds<=eligibleSeconds):[];
 const base={engineId,asset,delaySeconds:windowSeconds,holdingSeconds,
  issuedAt:now,entryAt:null,exitAt:null,entryOffsetSeconds:null,
  windowStartedAt:now,windowEndsAt:deadline>now?deadline:now+windowSeconds*1000,
  projectedEntryPrice:null,projectedExitPrice:null,side:null,
  forecastOwner:forecastMode==='selective'?'selective-historical-outcomes-v2':
    'continuous-selected-engine-window-v1',
  status:'scanning-entry-window',actionable:false,calibrated:false};
 if(!offsets.length)return {...base,status:'invalid-window'};
 const valid=[];
 for(const seconds of offsets){
  const c=evaluateLead(seconds);
  const p1=Number(c?.projectedEntryPrice),p2=Number(c?.projectedExitPrice);
  const side=c?.side;
  if(!['CALL','PUT'].includes(side)||!(p1>0&&p2>0)||
   (p2>p1?'CALL':p2<p1?'PUT':null)!==side)continue;
  const raw=Number(c.selectionStrength);
  if(!Number.isFinite(raw)||raw<=0)continue;
  // Only qualified, mutually consistent interval forecasts enter this pool.
  // There is no artificial minimum number of candles or time spent scanning.
  // In an evidenced mature streak, prefer comparably strong entries sooner.
 // This is a preference, NOT a ban on late entries or strong trends.
 const timingPenalty=.018+.14*Math.max(0,Math.min(1,Number(lateEntryRisk)||0));
 const score=raw-timingPenalty*seconds/windowSeconds;
  valid.push({...c,score,seconds});
 }
 if(!valid.length)return base;
 const strongest=valid.reduce((a,b)=>b.score>a.score?b:a);
 // A strong market can already offer a comparably qualified moment near NOW.
 // Do not discard that moment just to wait tens of seconds for a negligible
 // projected score improvement. Never fabricate a side or weaken the
 // coherentInterval qualification supplied by the selected forecast engine.
 const tolerance=Math.min(.10,Math.max(.015,Math.abs(strongest.score)*.035));
 const best=valid.find(c=>c.side===strongest.side&&c.score>=strongest.score-tolerance)||strongest;
 return {...base,status:'forecast',side:best.side,
  entryOffsetSeconds:best.seconds,
  entryAt:now+best.seconds*1000,
  exitAt:now+(best.seconds+holdingSeconds)*1000,
  projectedEntryPrice:best.projectedEntryPrice,
  projectedExitPrice:best.projectedExitPrice,
  selectionStrength:best.selectionStrength,
  ...(best.historicalExamples==null?{}:{historicalExamples:best.historicalExamples}),
  ...(best.similarExamples==null?{}:{similarExamples:best.similarExamples}),
  ...(best.validationExamples==null?{}:{validationExamples:best.validationExamples})
 };
}

// The selected "Entrada daqui a" controls an OPPORTUNITY WINDOW, while
// holdingSeconds determines the ACTUAL price-outcome horizon after entry.
// No UI clock, current candle or selected strategy can create a forecast.
// Never issues broker orders. Candidate scores are NOT win probabilities.
export function entryOffsets(windowSeconds){
 const h=Number(windowSeconds);
 if(!Number.isInteger(h)||h<5||h>3600)return [];
 return [...new Set([Math.min(h,Math.max(2,Math.ceil(h*.08))),
   Math.max(2,Math.round(h*.24)),Math.max(2,Math.round(h*.48)),
   Math.max(2,Math.round(h*.72)),Math.max(2,Math.round(h*.96))])]
   .filter(x=>x<=h).sort((a,b)=>a-b);
}
export function planEntryWindow({windowSeconds=30,holdingSeconds=windowSeconds,
 now=Date.now(),engineId='automatic',asset='UNKNOWN',forecastMode='continuous',
 evaluateLead=()=>null}={}){
 const offsets=entryOffsets(windowSeconds);
 const base={engineId,asset,delaySeconds:windowSeconds,holdingSeconds,
  issuedAt:now,entryAt:null,exitAt:null,entryOffsetSeconds:null,
  windowStartedAt:now,windowEndsAt:now+windowSeconds*1000,
  projectedEntryPrice:null,projectedExitPrice:null,side:null,
  forecastOwner:forecastMode==='selective'?'selective-historical-outcomes-v2':
    'continuous-selected-engine-window-v1',
  status:'scanning-entry-window',actionable:false,calibrated:false};
 if(!offsets.length)return {...base,status:'invalid-window'};
 let best=null;
 for(const seconds of offsets){
  const c=evaluateLead(seconds);
  const p1=Number(c?.projectedEntryPrice),p2=Number(c?.projectedExitPrice);
  const side=c?.side;
  if(!['CALL','PUT'].includes(side)||!(p1>0&&p2>0)||
   (p2>p1?'CALL':p2<p1?'PUT':null)!==side)continue;
  const raw=Number(c.selectionStrength);
  if(!Number.isFinite(raw)||raw<=0)continue;
  // Score comes from OWN past observations or OWN selected motor projected
  // excursion, with a very small tie preference for earlier valid entry.
  // No fixed seconds, forced direction, or redefinition of holding time.
  const score=raw-.018*seconds/windowSeconds;
  if(!best||score>best.score){
   best={...c,score,seconds};
  }
 }
 if(!best)return base;
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

// One market opportunity => one immutable CALL/PUT, one 30s/60s/... window
// and at most ONE verified entry. Quote evaluation may cancel; it must never
// rewrite an active window, change direction or re-arm after cancellation.
// Independent of forecast formula and display/remote transport.
const isSide=x=>x==='CALL'||x==='PUT';
export function opportunityContext(settings={}){
 return [String(settings.asset||'').toUpperCase(),
  String(settings.forecastMode||'continuous'),
  String(settings.engine||'automatic'),Number(settings.orderDurationMs||0)].join('|');
}
export function evolveOpportunity({
 previous=null,candidate=null,settings={},now=Date.now(),
 quoteAt=null,confirmation=null
}={}){
 const key=opportunityContext(settings),H=Number(settings.orderDurationMs)/1000;
 const fresh=Number(quoteAt)>0&&Number(quoteAt)<=now&&now-Number(quoteAt)<=2500;
 const old=previous?.context===key?previous:null;
 // Fixed windows run even without a CALL/PUT candidate. The clock is
 // independent from the prediction: scanning, open, cancelled and fired
 // occupy the SAME original H-second interval.
 if(!(H>=5&&H<=3600))return null;
 const validCandidate=()=>fresh&&isSide(candidate?.side)&&
   Number(candidate.issuedAt)<=now&&Number(candidate.entryAt)>now&&
   Number(candidate.exitAt)===Number(candidate.entryAt)+H*1000&&
   Number(candidate.projectedEntryPrice)>0&&Number(candidate.projectedExitPrice)>0&&
   (candidate.projectedExitPrice>candidate.projectedEntryPrice?'CALL':
     candidate.projectedExitPrice<candidate.projectedEntryPrice?'PUT':null)===candidate.side;
 if(old&&now<old.windowEndsAt){
  if(old.phase==='scanning'){
   // Candidate must fit INSIDE the already-open fixed window; do not
   // extend the window to the candidate's newly calculated deadline.
   if(validCandidate()&&Number(candidate.entryAt)<=old.windowEndsAt)
    return {...candidate,context:key,phase:'open',reason:'awaiting-selected-entry',
     openedAt:old.windowStartedAt,windowStartedAt:old.windowStartedAt,
     windowEndsAt:old.windowEndsAt,entryReadyNow:false,entryTriggeredAt:null};
   return {...old,entryReadyNow:false};
  }
  if(old.phase!=='open')return {...old,entryReadyNow:false};
  if(!fresh)return {...old,phase:'cancelled',reason:'feed-stale',
   cancelledAt:now,side:null,entryReadyNow:false};
  if(now<old.entryAt){
   if((isSide(candidate?.side)&&candidate.side!==old.side)||
      (isSide(confirmation?.side)&&confirmation.side!==old.side))
    return {...old,phase:'cancelled',reason:'reversal-before-entry',
     cancelledAt:now,side:null,entryReadyNow:false};
   return {...old,entryReadyNow:false};
  }
  // No timer-only authorization. Require a NEW quote at the scheduled
  // moment and a dedicated prediction of the NEXT holding interval.
  if(now>old.entryAt+1500)return {...old,phase:'cancelled',
    cancelledAt:now,reason:'entry-missed',side:null,entryReadyNow:false};
  const verified=confirmation?.side===old.side&&
    Number(quoteAt)>=old.entryAt-1000&&
    Number(confirmation?.projectedEntryPrice)>0&&
    Number(confirmation?.projectedExitPrice)>0&&
    (confirmation.projectedExitPrice>confirmation.projectedEntryPrice?
      'CALL':confirmation.projectedExitPrice<confirmation.projectedEntryPrice?
      'PUT':null)===old.side;
  if(!verified)return {...old,phase:'cancelled',cancelledAt:now,
    reason:'entry-not-confirmed',side:null,entryReadyNow:false};
  return {...old,phase:'fired',entryReadyNow:true,entryTriggeredAt:now,
    reason:'confirmed',confirmedEntryPrice:Number(confirmation.projectedEntryPrice)};
 }
 // Advance the fixed H-second cycle once, never restart on each tick.
 const started=old?.windowEndsAt?
   old.windowEndsAt+Math.floor(Math.max(0,now-old.windowEndsAt)/(H*1000))*H*1000:
   now;
 const end=started+H*1000;
 if(validCandidate()&&Number(candidate.entryAt)<=end)
  return {...candidate,context:key,phase:'open',reason:'awaiting-selected-entry',
   openedAt:started,windowStartedAt:started,windowEndsAt:end,
   entryReadyNow:false,entryTriggeredAt:null};
 return {context:key,phase:'scanning',reason:fresh?'scanning':'waiting-fresh-quote',
  engineId:String(settings.engine||'automatic'),
  asset:String(settings.asset||'UNKNOWN').toUpperCase(),
  forecastMode:String(settings.forecastMode||'continuous'),delaySeconds:H,
  holdingSeconds:H,issuedAt:started,windowStartedAt:started,windowEndsAt:end,
  entryAt:null,exitAt:null,side:null,entryReadyNow:false,entryTriggeredAt:null};
}

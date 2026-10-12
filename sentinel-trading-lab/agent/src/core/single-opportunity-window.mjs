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
 // The window ends at ORIGINAL signal issuance + selected duration,
 // irrespective of the computed entry offset or a later quote.
 if(old&&now<old.windowEndsAt){
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
 // Don't open a window without a fresh observation and an internally
 // coherent, measurable conditional future price path.
 if(!fresh||!isSide(candidate?.side)||!(H>=5&&H<=3600)||
   Number(candidate.issuedAt)>now||Number(candidate.entryAt)<=now||
   Number(candidate.entryAt)>now+H*1000||
   Number(candidate.exitAt)!==Number(candidate.entryAt)+H*1000||
   Number(candidate.projectedEntryPrice)<=0||Number(candidate.projectedExitPrice)<=0||
   (candidate.projectedExitPrice>candidate.projectedEntryPrice?'CALL':
    candidate.projectedExitPrice<candidate.projectedEntryPrice?'PUT':null)!==candidate.side)
  return null;
 return {...candidate,context:key,phase:'open',reason:'awaiting-selected-entry',
  openedAt:now,windowStartedAt:now,windowEndsAt:now+H*1000,
  entryReadyNow:false,entryTriggeredAt:null};
}

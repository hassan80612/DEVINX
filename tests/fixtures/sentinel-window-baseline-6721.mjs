// Exact Sentinel 67.21 source snapshot for offline comparison only.
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
   // A directional opportunity can be admitted once in this window.
   // A new candidate can NEVER extend the already running countdown.
   if(validCandidate()&&Number(candidate.entryAt)<=old.windowEndsAt)
    return {...candidate,context:key,phase:'open',reason:'awaiting-entry',
     openedAt:old.windowStartedAt,windowStartedAt:old.windowStartedAt,
     windowEndsAt:old.windowEndsAt,entryReadyNow:false,entryTriggeredAt:null};
   return {...old,entryReadyNow:false};
  }
  // No second CALL NOW, PUT NOW, or opposite-direction replacement, even
  // if the continuous market analysis keeps changing underneath.
  if(old.phase!=='open')return {...old,entryReadyNow:false};
  // Wait for a GENUINE fresh quote AT/AFTER the chosen moment. A failed
  // confirmation does not restart, flip, or end the countdown.
  if(!fresh||now<old.entryAt||Number(quoteAt)<old.entryAt)
   return {...old,entryReadyNow:false};
  const verified=confirmation?.side===old.side&&
    Number(confirmation?.projectedEntryPrice)>0&&
    Number(confirmation?.projectedExitPrice)>0&&
    (confirmation.projectedExitPrice>confirmation.projectedEntryPrice?
      'CALL':confirmation.projectedExitPrice<confirmation.projectedEntryPrice?
      'PUT':null)===old.side;
  if(!verified)return {...old,entryReadyNow:false,reason:'looking-for-entry'};
  return {...old,phase:'fired',entryReadyNow:true,entryTriggeredAt:now,
    plannedEntryAt:old.entryAt,entryAt:now,exitAt:now+H*1000,
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

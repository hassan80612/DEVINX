// Source-observed BUY window, not the clock-face's countdown, forecast
// holding period or nominal 30-second assumption. This is a permission
// check ONLY in the user's explicitly selected broker-synchronised mode.
// Never assumes a close-of-purchase timestamp from expiry alone.
export function observedBuyWindow({settings={},snap={},now=Date.now()}={}){
 if(settings.clockMode!=='broker')return {checked:false,reason:'clock-independent'};
 const timing=snap?.brokerTiming;
 const stamp=Number(timing?.capturedAt),cutoff=Number(timing?.purchaseWindow?.closesAt);
 const requested=String(settings.asset||'').trim().toUpperCase();
 const seen=String(timing?.symbol||'').trim().toUpperCase();
 if(requested&&seen&&requested!==seen)return {checked:false,reason:'asset-mismatch'};
 if(timing?.source!=='broker-visible-readonly'||!(stamp>0)||
  now<stamp||now-stamp>4500||!(cutoff>0))
  return {checked:false,reason:'purchase-not-observed'};
 // No buffer or fictional 30-second restriction. Only a named deadline
 // that the broker UI actually exposed for this selected instrument.
 if(cutoff-stamp>360000||stamp-cutoff>3000)
  return {checked:false,reason:'invalid-purchase-deadline'};
 return {checked:true,closesAt:cutoff,
  open:now<cutoff,reason:now<cutoff?'purchase-open':'purchase-closed'};
}
export function brokerAllowsEntry({buyWindow,entryAt}={}){
 if(buyWindow?.checked!==true)return true;
 return Number.isFinite(Number(entryAt))&&Number(entryAt)<Number(buyWindow.closesAt);
}

// Read-only admission for the explicitly selected synchronized 30s clock.
// Local deadlines are translated from verified broker time, never re-dated
// from a stale quote, a purchase countdown or a visually rounded clock.
import {brokerClockView} from '../../worker/broker-clock-view.mjs';
// Signal at the broker's :27 second: 3 seconds of manual click lead before
// :30, target fixed expiry at next :00. There is NO extra polling or timer.
// The 1s tolerance is maximum processing latency, never a programmed wait.
export const BROKER_ENTRY_TOLERANCE_MS=1000;
export function brokerEntryBoundary({clockMode='current',durationMs=30000,timing=null,
 now=Date.now(),quoteAt=null,asset='',provider='',lastBoundary=null}={}){
 const enabled=clockMode==='broker'&&Number(durationMs)===30000;
 if(!enabled)return {enabled:false,allowed:true,reason:'clock-alignment-not-selected'};
 const no=reason=>({enabled:true,allowed:false,reason});
 const clock=brokerClockView({timing,now});
 if(clock.verified!==true||clock.source!=='broker-protocol-timesync'||
   !Number.isFinite(clock.wallTimeMs)||clock.wallTimeMs<=0)
  return no('waiting-verified-broker-clock');
 const minuteMs=60000,signalAtSecondMs=27000,leadToExpiryMs=33000;
 // The signal is released at :27 to allow a manual click near :30.
 // Both UI and runtime use the same authenticated broker timeSync clock.
 const brokerBoundaryAt=Math.floor(clock.wallTimeMs/minuteMs)*minuteMs+signalAtSecondMs;
 const elapsed=clock.wallTimeMs-brokerBoundaryAt,localBoundaryAt=now-elapsed;
 const context=[String(provider),String(asset).toUpperCase(),minuteMs,signalAtSecondMs].join('|');
 if(lastBoundary?.context===context&&brokerBoundaryAt<=lastBoundary.brokerBoundaryAt)
  return no('broker-boundary-already-signalled');
 if(elapsed<0||elapsed>=BROKER_ENTRY_TOLERANCE_MS)return no('waiting-next-broker-boundary');
 const quote=Number(quoteAt);
 if(!(quote>=localBoundaryAt&&quote<=now&&now-quote<BROKER_ENTRY_TOLERANCE_MS))
  return no('waiting-new-quote-at-broker-boundary');
 const expiry=timing?.selectedExpiration,observedAt=Number(timing?.capturedAt);
 const expiryFresh=observedAt>0&&now>=observedAt&&now-observedAt<=4500;
 if(expiryFresh&&expiry?.kind==='fixed-clock'&&Number(expiry.confidence)>=.7&&
   Number(expiry.expiresAt)>0){
  if(Number(expiry.expiresAt)<=now)return no('broker-selected-expiry-passed');
  if(Math.abs(Number(expiry.expiresAt)-(localBoundaryAt+leadToExpiryMs))>1000)
   return no('broker-selected-expiry-not-next-30s-boundary');
 }
 return {enabled:true,allowed:true,reason:'verified-broker-boundary',context,brokerBoundaryAt,
  localBoundaryAt,brokerEntryAt:clock.wallTimeMs,brokerWallExpiryAt:brokerBoundaryAt+leadToExpiryMs,
  exitAt:localBoundaryAt+leadToExpiryMs,entryValidUntil:localBoundaryAt+BROKER_ENTRY_TOLERANCE_MS};
}

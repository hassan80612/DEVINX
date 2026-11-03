// Last trusted selected operation expiry must survive a broker page refresh.
// A broker's spontaneous default 30s is never a newer user selection.
// This function only selects the Agent ANALYST expiry; the existing native
// keeper separately checks/repairs the real broker picker while idle.
const valid=ms=>[30000,60000,300000].includes(Number(ms));
export function lastTrustedExpiryForResume({nativeDurationMs=null,nativeSelectedAt=0,
 nativeExplicit30=false,currentDurationMs=null,changedDuringRecovery=false}={}){
 const nativeMs=Number(nativeDurationMs),at=Number(nativeSelectedAt),
  current=Number(currentDurationMs);
 if(changedDuringRecovery||!valid(nativeMs)||!(at>0)||!Number.isFinite(at)||
  at>Date.now()+10000)return null;
 // An inherited 30s has a timestamp in older Agent files even when the
 // broker merely reverted to default. Only a PROVEN explicit 30s choice
 // may replace the last saved 1m/5m analyst setting.
 // The Analyst selector is authoritative. Even an old native explicit30
 // marker can survive a broker reset/reconnect; it must never downgrade 1m/5m.
 // A new 30s preference is selected in Sentinel's own duration control.
 if(nativeMs===30000&&current>30000)return null;
 // A genuine manual 30s has its own timestamp and remains valid.
 if(!valid(current)||nativeMs!==current)return nativeMs;
 return null;
}

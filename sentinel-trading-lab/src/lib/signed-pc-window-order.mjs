// Compare authenticated source frames using the PC's immutable opportunity
// identifier rather than the age of a cloud-poll evaluation alone.
// This is a display-only ordering filter. No signal is produced here.
export function pcWindowInfo(status){
 const v=status?.lastResult?.analysis?.vnext;
 const w=v?.ow??v?.opportunityWindow;
 const entry=v?.ea??v?.futureEntryAnchor;
 const start=Number(Array.isArray(w)?w[1]:w?.windowStartedAt)||0;
 const phase=String((Array.isArray(w)?w[0]:w?.phase)||'');
 const triggeredAt=Number(Array.isArray(entry)?entry[10]:entry?.entryTriggeredAt)||0;
 const engine=String(status?.settings?.engine||'');
 const duration=Number(status?.settings?.orderDurationMs)||0;
 const asset=String(status?.liveBroker?.validatedSymbol||status?.liveBroker?.symbol||status?.lastResult?.asset||'').toUpperCase();
 return {start,phase,triggeredAt,engine,duration,asset};
}
const phaseRank=p=>p==='scanning'?1:p==='open'?2:(p==='cancelled'||p==='fired')?3:0;
export function acceptSignedPcFrame(previous,incoming){
 if(!previous)return true;
 const old=pcWindowInfo(previous),next=pcWindowInfo(incoming);
 const sameContext=old.engine===next.engine&&old.duration===next.duration&&old.asset===next.asset;
 const prevEval=Number(previous.lastEvalMs||0),nextEval=Number(incoming.lastEvalMs||0);
 // A fresh authenticated PC opportunity is authoritative even when the
 // initial cloud snapshot has a newer ordinary quote but NO window yet.
 if(next.start>0&&old.start===0)return true;
 if(sameContext&&next.start>0&&old.start>0){
  if(next.start<old.start)return false;
  if(next.start===old.start){
   // A later quote cannot visually turn a confirmed trade back to ANALISANDO.
   if(phaseRank(next.phase)<phaseRank(old.phase))return false;
   if(old.triggeredAt>0&&next.triggeredAt<old.triggeredAt)return false;
   const advanced=phaseRank(next.phase)>phaseRank(old.phase)||
     next.triggeredAt>old.triggeredAt;
   if(nextEval<prevEval&&!advanced)return false;
   return true;
  }
  // Only the Agent is allowed to provide a newer window start.
  return true;
 }
 return nextEval>=prevEval;
}
export function keepSignedViewOverCloud(previous,cloud,{now=Date.now()}={}){
 if(!previous||!cloud)return false;
 const sameStream=!!previous.liveTopic&&previous.liveTopic===cloud.liveTopic;
 const recent=previous.liveTransport==='push'&&Number(previous.liveStreamAt)>0&&
  now-Number(previous.liveStreamAt)>=0&&now-Number(previous.liveStreamAt)<6000;
 if(!sameStream||!recent||cloud.remote?.online===false)return false;
 // During a live signed stream the cloud response is fallback/control data,
 // not an independent authority that may rewrite the current trade window.
 return true;
}

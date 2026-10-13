// The signed PC status is the display authority for the currently open
// opportunity. A temporarily incomplete quote/status packet must not erase it.
//
// This module never creates or extends a PC window or trading authorization.
// Only the Windows Agent may supply a NEW start/end or confirm CALL/PUT.
export function pcWindowInfo(status){
 const v=status?.lastResult?.analysis?.vnext||{};
 const w=v.ow??v.opportunityWindow;
 const e=v.ea??v.futureEntryAnchor;
 const start=Number(Array.isArray(w)?w[1]:w?.windowStartedAt)||0;
 const end=Number(Array.isArray(w)?w[2]:w?.windowEndsAt)||0;
 const phase=String((Array.isArray(w)?w[0]:w?.phase)||'');
 const triggeredAt=Number(Array.isArray(e)?e[10]:e?.entryTriggeredAt)||0;
 const engine=String(status?.settings?.engine||'');
 const duration=Number(status?.settings?.orderDurationMs)||0;
 const asset=String(status?.liveBroker?.validatedSymbol||status?.liveBroker?.symbol||
   status?.lastResult?.asset||'').toUpperCase();
 return {start,end,phase,triggeredAt,engine,duration,asset};
}
const rank=phase=>phase==='scanning'?1:phase==='open'?2:
  (phase==='cancelled'||phase==='fired')?3:0;
function sameContext(previous,incoming){
 const a=pcWindowInfo(previous),b=pcWindowInfo(incoming);
 return !!a.asset&&a.asset===b.asset&&a.engine===b.engine&&
   a.duration>0&&a.duration===b.duration;
}
function latestWindowMissingOrRegressed(previous,incoming){
 if(!sameContext(previous,incoming)||incoming?.state!=='running')return false;
 const a=pcWindowInfo(previous),b=pcWindowInfo(incoming);
 if(!(a.start>0&&a.end>a.start))return false;
 return b.start===0||b.start<a.start||
   (b.start===a.start&&(rank(b.phase)<rank(a.phase)||
    (a.triggeredAt>0&&b.triggeredAt<a.triggeredAt)));
}
function withExistingWindow(previous,incoming){
 if(!latestWindowMissingOrRegressed(previous,incoming))return incoming;
 const oldV=previous.lastResult?.analysis?.vnext;
 const inV=incoming.lastResult?.analysis?.vnext;
 if(!oldV)return incoming;
 // Keep the exact PC-produced window and entry; no local rollover and
 // no entry authorization. All incoming live market quotes still update.
 const oldW=oldV.ow??oldV.opportunityWindow;
 const oldE=oldV.ea??oldV.futureEntryAnchor;
 const v={...(inV||{})};
 if(oldW!=null){
  if(Array.isArray(oldW)){v.ow=oldW;delete v.opportunityWindow;}
  else {v.opportunityWindow=oldW;delete v.ow;}
 }
 if(oldE!=null){
  if(Array.isArray(oldE)){v.ea=oldE;delete v.futureEntryAnchor;}
  else {v.futureEntryAnchor=oldE;delete v.ea;}
 }
 // The old PC engine and asset have already been validated by sameContext.
 v.engineId=oldV.engineId||v.engineId;
 v.expirySeconds=oldV.expirySeconds||v.expirySeconds;
 return {...incoming,lastResult:{
   ...(incoming.lastResult||{}),
   analysis:{...(incoming.lastResult?.analysis||{}),vnext:v}
 }};
}
export function reconcileSignedPcOpportunity(previous,frame){
 return !previous?frame:withExistingWindow(previous,frame);
}
export function reconcileCloudPcOpportunity(previous,cloud){
 if(!previous||!cloud)return cloud;
 if(!previous.liveTopic||previous.liveTopic!==cloud.liveTopic||
    cloud.remote?.online===false||cloud.state!=='running')return cloud;
 const restored=withExistingWindow(previous,cloud);
 // Preserve clock calibration and the socket status across an unrelated
 // cloud request. Otherwise the phone jumps to its own Date.now() for
 // several seconds and the countdown can flash blank on every poll.
 return {...restored,
   pcClockOffsetMs:previous.pcClockOffsetMs??cloud.pcClockOffsetMs,
   pcClockRttMs:previous.pcClockRttMs??cloud.pcClockRttMs,
   liveStreamAt:previous.liveStreamAt??cloud.liveStreamAt,
   liveTransport:previous.liveTransport??cloud.liveTransport,
   liveQuoteAgeAtFrame:previous.liveQuoteAgeAtFrame??cloud.liveQuoteAgeAtFrame
 };
}
export function acceptSignedPcFrame(previous,incoming){
 if(!previous)return true;
 const a=pcWindowInfo(previous),b=pcWindowInfo(incoming);
 const prevEval=Number(previous.lastEvalMs||0),nextEval=Number(incoming.lastEvalMs||0);
 // A first authenticated opportunity takes priority over a cloud snapshot
 // which may have a newer ordinary quote but no opportunity at all.
 if(b.start>0&&a.start===0)return true;
 if(sameContext(previous,incoming)&&b.start>0&&a.start>0){
  if(b.start<a.start)return false;
  if(b.start>a.start)return true;
  if(rank(b.phase)<rank(a.phase))return false;
  if(a.triggeredAt>0&&b.triggeredAt<a.triggeredAt)return false;
  const advanced=rank(b.phase)>rank(a.phase)||b.triggeredAt>a.triggeredAt;
  if(nextEval<prevEval&&!advanced)return false;
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
 // Keep a recent verified PC event as the card authority. An actual
 // newer window will arrive through the signed channel.
 return true;
}

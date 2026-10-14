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
// The Agent sends a complete snapshot when it fits within the signed
// channel budget, but sends a smaller (yet authenticated) snapshot when busy.
// Missing optional display fields in that compact frame are NOT instructions
// to clear the UI. Keep only already-received fields from the SAME PC window,
// asset, engine and expiry; never derive a window, signal or new CALL/PUT.
export function reconcileSignedAnalystDisplay(previous,incoming){
 const frame=reconcileSignedPcOpportunity(previous,incoming);
 if(!previous||!sameContext(previous,frame))return frame;
 const oldV=previous?.lastResult?.analysis?.vnext;
 const nextV=frame?.lastResult?.analysis?.vnext;
 if(!oldV||!nextV||oldV.engineId!==nextV.engineId||
    Number(oldV.expirySeconds)!==Number(nextV.expirySeconds))return frame;
 const oldW=pcWindowInfo(previous),newW=pcWindowInfo(frame);
 if(!(oldW.start>0&&oldW.start===newW.start&&oldW.end===newW.end))return frame;
 // Normal frames carry computedStatus; this field disappears only when
 // the Agent trims a large signed packet to its essential data.
 const reduced=!Object.prototype.hasOwnProperty.call(nextV,'computedStatus');
 if(!reduced)return frame;
 const stable={...nextV};
 for(const key of ['cards','hf','hm','er']){
   if((!Array.isArray(stable[key])||stable[key].length===0)&&
      Array.isArray(oldV[key])&&oldV[key].length>0)stable[key]=oldV[key];
 }
 // A missing projection is a size reduction; explicit null still clears it.
 for(const key of ['projection','targetProjection']){
   if(stable[key]===undefined&&oldV[key]!==undefined)stable[key]=oldV[key];
 }
 return {...frame,lastResult:{...frame.lastResult,analysis:{
   ...(frame.lastResult?.analysis||{}),vnext:stable
 }}};
}

export function reconcileCloudPcOpportunity(previous,cloud){
 if(!previous||!cloud)return cloud;
 if(!previous.liveTopic||previous.liveTopic!==cloud.liveTopic||
    cloud.remote?.online===false||cloud.state!=='running')return cloud;
 const restored=withExistingWindow(previous,cloud);
 // Cloud full-status polls may lag a verified PC Broadcast. The last
 // authenticated, newer PC analysis owns the displayed opportunity until
 // the server has an ACTUALLY newer evaluation (not until an arbitrary
 // 6-second timeout). An expired opportunity still expires by its PC time.
 const signed=previous.liveTransport==='push';
 const samePC=signed&&sameContext(previous,cloud);
 const previousEvaluation=Number(previous.lastEvalMs||0);
 const cloudEvaluation=Number(cloud.lastEvalMs||0);
 const keepSignedAnalysis=samePC&&previousEvaluation>0&&
   cloudEvaluation<=previousEvaluation;
 const pcBroker=previous.liveBroker||{},cloudBroker=cloud.liveBroker||{};
 const pcQuoteAt=Number(pcBroker.lastQuoteAt||0);
 const cloudQuoteAt=Number(cloudBroker.lastQuoteAt||0);
 // A newer broker price is allowed through independently; it never
 // resurrects a signalled CALL/PUT from a previous interval.
 return {...restored,
   ...(keepSignedAnalysis?{
     lastEvalMs:previousEvaluation,
     lastResult:previous.lastResult,
     liveBroker:cloudQuoteAt>pcQuoteAt?{...pcBroker,...cloudBroker}:pcBroker,
     feed:cloudQuoteAt>pcQuoteAt?cloud.feed:previous.feed
   }:{}),
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
// A rejected signed window may still carry a genuinely newer broker quote.
// Keep the Agent-confirmed direction/entry untouched, but do not freeze the
// phone price while a cloud evaluation temporarily leads the signed socket.
export function keepNewerVerifiedQuote(previous,incoming,{now=Date.now()}={}){
 if(!previous||!incoming||!sameContext(previous,incoming))return previous;
 const a=previous.liveBroker||{},b=incoming.liveBroker||{};
 const oldAt=Number(a.lastQuoteAt||0),newAt=Number(b.lastQuoteAt||0);
 const sentAt=Number(incoming.at||0);
 if(b.assetValidated!==true||b.analysisFeedValidated!==true||
   String(a.symbol||'').toUpperCase()!==String(b.symbol||'').toUpperCase()||
   !Number.isFinite(newAt)||newAt<=oldAt||!Number.isFinite(sentAt)||
   newAt>sentAt+2500||sentAt-newAt>30000||
   !Number.isFinite(Number(b.quote))||Number(b.quote)<=0)return previous;
 return {...previous,liveBroker:{...a,...b},feed:incoming.feed||previous.feed,
   liveQuoteAgeAtFrame:Math.max(0,sentAt-newAt),
   liveStreamAt:now,liveTransport:'push'};
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

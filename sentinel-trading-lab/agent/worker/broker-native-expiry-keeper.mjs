// Browser-side native broker expiry preference. This function is intentionally
// SELF-CONTAINED so Playwright can install it without evaluating extra source.
// It never changes the selected candle period or the Sentinel analyst duration.
export function nativeExpiryPermissionForExecutor(state,at=Date.now()){
 // An already ACCEPTED order must not prevent restoring the picker for the
 // next operation. A permanently pending broker RESULT is not an active
 // physical click. Never operate the picker while clicks are being dispatched
 // or while an attempted click is still unidentified/uncertain.
 const open=state?.unresolvedDetail||{};
 const unidentified=Number(open.waitingId||0)>0||Number(open.uncertainAttempts||0)>0;
 const awaitingAck=!!state?.pending&&Number(state.pending.confirmedClicks||0)===0;
 return {at,provider:state?.provider||null,allowed:!!state&&!state.arming&&!state.executing&&
  !unidentified&&!awaitingAck};
}
// Called from the Node driver when the Sentinel selector changes. It writes a
// preference only; the keeper still requires its normal permission lease before
// it can repair a visible native control after a broker refresh.
export function updateBrokerNativeExpiryPreference({provider,preferredMs}={}){
 try{
  if(!['iq_option','exnova'].includes(provider))return false;
  const ms=Number(preferredMs),accepted=new Set([5,10,15,30,60,120,180,300,600,900]);
  if(!accepted.has(ms/1000))return false;
  const keeper=window.__sentinelNativeExpiryKeeperV3;
  if(keeper?.provider===provider&&typeof keeper.setPreferred==='function')return keeper.setPreferred(ms);
  localStorage.setItem('sentinel-broker-native-expiration-preference-v3:'+provider,String(ms));
  return true;
 }catch{return false}
}
// Runs on the existing broker page immediately before an actual direction
// click. Unknown native controls never gate startup or imply a duration.
export function inspectNativeExpiryBeforeClick(){
 if(typeof window==='undefined')return {blocked:false};
 // Idle maintenance owns repair; the entry path only reads and then revokes its lease.
 const keeper=window.__sentinelNativeExpiryKeeperV3;
 if(keeper?.revision!==8)return {blocked:false};
 // Revoke the idle permission immediately before the physical entry. The
 // check is read-only and never opens or changes the broker expiry control.
 window.__sentinelNativeExpiryPermissionV3={provider:keeper.provider,at:Date.now(),allowed:false};
 const previous=keeper.snapshot();
 if(previous.restoring||previous.repairing)return {blocked:true,reason:'expiry-repair-in-progress',
  preferredMs:previous.preferredMs,currentMs:previous.currentMs,revision:keeper.revision,observedAt:previous.observedAt};
 keeper.poll();
 const s=keeper.snapshot();
 const mismatch=!!(s.preferredMs&&s.currentMs&&s.preferredMs!==s.currentMs);
 return {blocked:mismatch,reason:mismatch?'expiry-not-synchronized':null,
  preferredMs:s.preferredMs,currentMs:s.currentMs,revision:keeper.revision,observedAt:s.observedAt};
}
export function installBrokerNativeExpiryKeeper({provider,requestedMs=null}={}){
 try{
  if(!['iq_option','exnova'].includes(provider))return;
  const h=String(location.hostname||'').toLowerCase();
  if(!((provider==='iq_option'&&/(^|\.)iqoption\.com$/.test(h))||
    (provider==='exnova'&&/(^|\.)exnova\.com$/.test(h))))return;
  if(window.__sentinelNativeExpiryKeeperV3?.revision===8){
   const current=Number(window.__sentinelNativeExpiryKeeperV3.snapshot?.().preferredMs);
   if(!(current>0)&&Number.isFinite(Number(requestedMs)))
    window.__sentinelNativeExpiryKeeperV3.setPreferred?.(Number(requestedMs));
   return;
  }
  try{window.__sentinelNativeExpiryKeeperV3?.dispose?.()}catch{}
  // Older documents may still have a v1 timer. Revoke its write permission;
  // v2 uses its own lease and preference so the old listener cannot fight it.
  window.__sentinelNativeExpiryPermission={allowed:false,at:0};
  window.__sentinelNativeExpiryPermissionV2={allowed:false,at:0};
  const oldKey='sentinel-broker-native-expiration-preference-v1:'+provider;
  const v2Key='sentinel-broker-native-expiration-preference-v2:'+provider;
  const key='sentinel-broker-native-expiration-preference-v3:'+provider;
  const ACCEPT=new Set([5,10,15,30,60,120,180,300,600,900]);
  const parse=text=>{
   const raw=String(text||'').replace(/\u00a0/g,' ').trim();
   const found=[...raw.matchAll(/(^|[^\d])(\d{1,3})\s*(segundos?|seg|seconds?|secs?|sec|s|minutos?|minutes?|mins?|min|m)\b/gi)];
   if(found.length!==1){
    // Some Exnova skins print the SELECTED expiry as 00:01:00 or 01:00.
    // Only parse a complete field, never a free-running clock or body text.
    const clock=raw.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
    if(!clock)return null;
    const sec=Number(clock[1]||0)*3600+Number(clock[2])*60+Number(clock[3]);
    return ACCEPT.has(sec)?sec*1000:null;
   }
   const n=Number(found[0][2]),unit=found[0][3].toLowerCase();
   const seconds=/^(m|min)/.test(unit)?n*60:n;
   return ACCEPT.has(seconds)?seconds*1000:null;
  };
  const visible=el=>{
   if(!el?.isConnected||el.closest?.('#sentinel-trading-overlay-host'))return false;
   const rect=el.getBoundingClientRect?.();
   return !!rect&&rect.width>=15&&rect.height>=10&&rect.bottom>0&&rect.right>0&&rect.top<innerHeight;
  };
  const nativeLabel=el=>String(el.getAttribute?.('aria-label')||'')+' '+
   String(el.getAttribute?.('title')||'')+' '+String(el.className||'');
  const labelRe=/expira|expir|vencim|expiry|dura(?:ç|c)ão|duraci[oó]n|duration|option[- ]time|order[- ]time/i;
  const chartRe=/chart|candle|vela|gr[aá]fico|timeframe|per[ií]odo da vela|countdown|count.down|remaining|restante/i;
  const CONTROL_SELECTORS=[
   '[data-testid*="expir" i]','[data-test*="expir" i]',
   '[class*="expiration" i]','[class*="expiry" i]',
   '[class*="duration" i]','[data-testid*="duration" i]',
   '[class*="option-time" i]','[data-test*="duration" i]',
   '[aria-label*="expir" i]','[title*="expir" i]'
  ].join(',');
  let cached=null,observedMs=null,preferredMs=null,manualOpenedAt=0,
   openingValue=null,chosenValue=null,mismatchSince=0,lastRepairAt=0,repairing=false,
   verificationPending=false,lastUserActivityAt=0,lastProbeAt=0,stableCount=0,manualControl=null,chosenTarget=null,observedAt=0;
  try{
   const v=Number(localStorage.getItem(key)??localStorage.getItem(v2Key)??localStorage.getItem(oldKey));
   if(ACCEPT.has(v/1000)){preferredMs=v;localStorage.setItem(key,String(v));}
   const requested=Number(requestedMs);
   // A saved broker choice is authoritative across page reloads. Runtime input is only a fallback.
   if(!preferredMs&&ACCEPT.has(requested/1000)){preferredMs=requested;localStorage.setItem(key,String(requested));}
  }catch{}
  const readDuration=el=>{
   const selected=el.matches?.('select')?el.selectedOptions:null;
   if(selected?.length===1)return parse(selected[0].textContent||selected[0].label);
   // Input value and visible label are alternative sources, not two choices.
   return parse(el.value)||parse(el.innerText||el.textContent||'');
  };
  function discover(){
   if(cached&&visible(cached)){
    const found=readDuration(cached);
    if(found)return {el:cached,value:found};
   }
   const candidates=[];
   for(const el of document.querySelectorAll(CONTROL_SELECTORS)){
    if(!visible(el))continue;
    const text=String(el.innerText||el.textContent||el.value||'').trim();
    if(text.length>85)continue;
    const v=readDuration(el);
    if(!v)continue;
    const r=el.getBoundingClientRect(),label=nativeLabel(el);
    // Never confuse the candle/chart period or a running expiry countdown
    // with the selected native ORDER expiry.
    if(chartRe.test(label)||chartRe.test(String(el.getAttribute?.('data-testid')||'')))continue;
    const labelStrong=labelRe.test(label)||labelRe.test(text);
    if(!labelStrong)continue;
    const score=(labelRe.test(text)?8:0)+(labelRe.test(label)?5:0)+
     (r.x>innerWidth*.5?2:0)+(r.y<innerHeight*.85?1:0)-
     (text.length>48?2:0);
    candidates.push({el,value:v,score});
   }
   candidates.sort((a,b)=>b.score-a.score);
   if(!candidates.length)return null;
   // A tie between disjoint native controls is ambiguous: never guess.
   const top=candidates[0],other=candidates.find(z=>
    z!==top&&z.score===top.score&&!top.el.contains(z.el)&&!z.el.contains(top.el));
   if(other)return null;
   cached=top.el;
   return top;
  }
  const isManualPickerTarget=target=>{
   if(!target?.closest||target.closest('#sentinel-trading-overlay-host'))return false;
   const control=discover();
   return !!control&&(control.el===target||control.el.contains(target)||
    target.contains?.(control.el));
  };
  const inExpiryMenu=(element,control)=>{
   if(!element||element.closest?.('#sentinel-trading-overlay-host'))return false;
   if(control===element||control?.contains?.(element))return true;
   // Prefer the native control's explicit popup relationship. A generic
   // option/button with matching text elsewhere is not an expiry control.
   for(const attribute of ['aria-controls','aria-owns']){
    const ids=String(control?.getAttribute?.(attribute)||'').split(/\s+/).filter(Boolean);
    for(const id of ids){
     const popup=document.getElementById?.(id);
     if(popup&&(popup===element||popup.contains?.(element)))return true;
    }
   }
   // Brokers also use expiry-named portal menus without ARIA ownership.
   // If neither identity exists, leave the UI alone; never guess a chart item.
   return !!element.closest?.(CONTROL_SELECTORS);
  };
  // Opening the picker proves no duration choice. Record an exact trusted
  // option click, then require the native control to confirm that value.
  const pickedOption=target=>{
   // Opening a native popup can make the control wrapper contain several
   // duration labels. Keep its verified opener identity during that choice.
   const control=manualControl?{el:manualControl}:discover();
   if(!control||!inExpiryMenu(target,control.el))return null;
   for(let el=target,depth=0;el&&depth<3;el=el.parentElement,depth++){
    const raw=String(el.innerText||el.textContent||'').trim();
    if(raw.length>25)continue;
    const value=parse(raw);
    if(value&&(el.matches?.('[role="option"],[role="menuitem"],li,[class*="option" i],[class*="duration" i],[class*="item" i]')||
      el.closest?.('[role="option"],[role="menuitem"],[class*="option" i],[class*="duration" i],[class*="item" i]')))return value;
   }
   return null;
  };
  const onPointerDown=ev=>{
   if(repairing||!ev.isTrusted)return;
   const target=ev.target;
   const value=manualOpenedAt&&Date.now()-manualOpenedAt<12000?pickedOption(target):null;
   if(value){chosenValue=value;chosenTarget=target;lastUserActivityAt=Date.now();return;}
   if(isManualPickerTarget(target)){
    manualOpenedAt=Date.now();openingValue=discover()?.value??null;
    manualControl=discover()?.el??null;chosenTarget=null;
    chosenValue=null;lastUserActivityAt=manualOpenedAt;
   }
  };
  const onClick=ev=>{
   if(repairing||!ev.isTrusted)return;
   if(chosenTarget&&(chosenTarget===ev.target||chosenTarget.contains?.(ev.target)))return;
   // Options can be INSIDE the picker. Check the actual choice before the
   // opener, otherwise a real selection is mistaken for opening the menu.
   const value=manualOpenedAt&&Date.now()-manualOpenedAt<12000?pickedOption(ev.target):null;
   if(value){chosenValue=value;lastUserActivityAt=Date.now();}
   else if(isManualPickerTarget(ev.target)){
    manualOpenedAt=Date.now();openingValue=discover()?.value??null;
    manualControl=discover()?.el??null;chosenTarget=null;
    chosenValue=null;lastUserActivityAt=manualOpenedAt;
   }
  };
  const onChange=ev=>{
   if(repairing||!ev.isTrusted||!ev.target?.matches?.('select'))return;
   const control=discover();
   if(!control||!inExpiryMenu(ev.target,control.el))return;
   const selected=ev.target.selectedOptions;
   const value=selected?.length===1?parse(selected[0].textContent||selected[0].label):null;
   if(value){manualOpenedAt=Date.now();chosenValue=value;lastUserActivityAt=manualOpenedAt;}
  };
  document.addEventListener('pointerdown',onPointerDown,true);
  document.addEventListener('click',onClick,true);
  document.addEventListener('change',onChange,true);
  const permission=()=>window.__sentinelNativeExpiryPermissionV3?.allowed===true&&
   window.__sentinelNativeExpiryPermissionV3?.provider===provider&&
   Date.now()-Number(window.__sentinelNativeExpiryPermissionV3?.at||0)<3500;
  const save=v=>{preferredMs=v;try{localStorage.setItem(key,String(v))}catch{}};
  const notify=(value)=>{window.__sentinelNativeExpiryStatusV3={
   preferredMs,currentMs:value,changedAt:Date.now(),lastRepairAt,restoring:repairing
  }};
  function restore(control){
   if(repairing||!permission()||!control||!preferredMs||lastUserActivityAt>Date.now()-12000)return;
   repairing=true;lastRepairAt=Date.now();
   // Genuine HTML select widgets can be restored without opening a menu.
   // Never assign the broker's trade order, chart period, or analyst duration.
   const nativeSelect=control.el.matches?.('select')?control.el:control.el.querySelector?.('select');
   if(nativeSelect){
    const matches=[...nativeSelect.options].filter(o=>parse(o.textContent||o.label)===preferredMs);
    if(matches.length===1){
     nativeSelect.value=matches[0].value;
     nativeSelect.dispatchEvent(new Event('input',{bubbles:true}));
     nativeSelect.dispatchEvent(new Event('change',{bubbles:true}));
     setTimeout(()=>{const actual=discover()?.value;if(actual===preferredMs)mismatchSince=0;repairing=false;notify(actual??null)},480);
    }else repairing=false;
    return;
   }
   const opener=control.el.matches?.('button,[role="button"],input')?control.el:
    control.el.querySelector?.('button,[role="button"],input')||control.el;
   try{opener.click()}catch{repairing=false;return}
   // Only exact native duration menu matches are eligible. Absolute-clock
   // times, forecast dropdowns, and chart timeframe options are excluded.
   const choose=()=>{
    try{
     if(!permission()){
      // Close only a menu still owned and visibly opened by this restore.
      const open=[...document.querySelectorAll('[role="option"],[role="menuitem"],[class*="option" i]')]
       .some(el=>visible(el)&&inExpiryMenu(el,control.el));
      if(open)try{opener.click()}catch{}
      repairing=false;return;
     }
     const elements=[...document.querySelectorAll(
      '[role="option"],[role="menuitem"],[class*="option" i],'+
      '[class*="expiration" i],[class*="duration" i],[class*="item" i],li,button'
     )].filter(el=>visible(el)&&inExpiryMenu(el,control.el));
     const options=elements.filter(el=>{
      const raw=String(el.innerText||el.textContent||'').trim();
      if(raw.length>28||!raw)return false;
      return parse(raw)===preferredMs;
     }).filter(el=>el!==opener&&!el.contains(opener))
      // Drop composite ancestors when the real clickable leaf is present.
      .filter(el=>!elements.some(other=>other!==el&&el.contains?.(other)&&
        parse(String(other.innerText||other.textContent||'').trim())===preferredMs));
     // Unique selection only; clicking a guessed item risks a wrong expiry.
     if(options.length!==1){repairing=false;try{opener.click()}catch{};return}
     const target=options[0];
     target.click();
     setTimeout(()=>{
      const actual=discover()?.value;
      if(actual===preferredMs){mismatchSince=0;stableCount=0}
      repairing=false;verificationPending=false;notify(actual??null);
     },480);
    }catch{repairing=false;verificationPending=false}
   };
   setTimeout(choose,200);
  }
  function poll({urgent=false}={}){
   try{
    if(document.visibilityState==='hidden'||repairing)return;
    const c=discover();
    if(!c){observedMs=null;stableCount=0;observedAt=Date.now();notify(null);return;}
    const current=c.value,now=Date.now();
    observedAt=now;
    if(observedMs===current)stableCount++;
    else{observedMs=current;stableCount=1;}
    if(manualOpenedAt&&now-manualOpenedAt<12000){
     // Some native skins render choices in unlabelled portals. A trusted
     // opener followed by a stable changed NON-default control value is
     // independent confirmation of the user's selection. Never adopt a
     // 30s rollback this way, nor infer a preference without manual activity.
     const confirmedManualChange=chosenValue==null&&openingValue!=null&&
      current!==openingValue&&current!==30000&&stableCount>=2&&
      manualControl===c.el;
     if((chosenValue!=null&&current===chosenValue)||confirmedManualChange){
      save(current);manualOpenedAt=0;openingValue=null;chosenValue=null;chosenTarget=null;manualControl=null;mismatchSince=0;
     }
     notify(current);return;
    }
    if(manualOpenedAt){manualOpenedAt=0;openingValue=null;chosenValue=null;chosenTarget=null;manualControl=null;}
    if(!preferredMs){
     // Bootstrap only a stable non-default selected duration. A fresh
     // default 30s is never silently treated as the user's last preference.
     if(current!==30000&&stableCount>=2)save(current);
     notify(current);return;
    }
    if(current===preferredMs){mismatchSince=0;notify(current);return}
    if(!mismatchSince)mismatchSince=now;
    const defaultRollback=current===30000&&preferredMs!==30000&&stableCount>=2;
    if((!urgent&&(now-mismatchSince<(defaultRollback?1000:4000)||now-lastRepairAt<10000))||!permission()){
     notify(current);return
    }
    restore(c);
   }catch{}
  }
  const onParentPermission=event=>{
   try{
    if(window.parent===window||event.source!==window.parent||
      event.data?.type!=='sentinel-native-expiry-permission-v1')return;
    const host=new URL(event.origin).hostname;
    if(!((provider==='iq_option'&&/(^|\.)iqoption\.com$/.test(host))||
      (provider==='exnova'&&/(^|\.)exnova\.com$/.test(host))))return;
    const next=event.data.permission,old=window.__sentinelNativeExpiryPermissionV3;
    if(next?.provider!==provider||!Number.isFinite(next.at)||
      typeof next.allowed!=='boolean'||Date.now()-next.at<0||Date.now()-next.at>=3500||
      old&&Number(old.at)>next.at)return;
    window.__sentinelNativeExpiryPermissionV3={provider,at:next.at,allowed:next.allowed};
    for(let i=0;i<(window.frames?.length||0);i++)try{
     window.frames[i].postMessage({type:'sentinel-native-expiry-permission-v1',permission:window.__sentinelNativeExpiryPermissionV3},'*');
    }catch{}
    if(next.allowed&&(old?.allowed!==true||preferredMs&&observedMs&&preferredMs!==observedMs))poll();
   }catch{}
  };
  window.addEventListener?.('message',onParentPermission);
  const setPreferred=value=>{
   const ms=Number(value);
   if(!ACCEPT.has(ms/1000))return false;
   save(ms);mismatchSince=0;manualOpenedAt=0;openingValue=null;chosenValue=null;chosenTarget=null;manualControl=null;
   notify(observedMs);poll({urgent:true});return true;
  };
  window.__sentinelNativeExpiryKeeperV3={revision:8,provider,poll,setPreferred,snapshot:()=>({
   preferredMs,currentMs:observedMs,observedAt,mismatchSince,lastRepairAt,repairing
  })};
  poll();
  const timer=setInterval(poll,2500);
  window.__sentinelNativeExpiryKeeperV3.dispose=()=>{
   try{clearInterval(timer)}catch{}
   window.removeEventListener?.('message',onParentPermission);
   document.removeEventListener('pointerdown',onPointerDown,true);
   document.removeEventListener('click',onClick,true);
   document.removeEventListener('change',onChange,true);
  };
  try{timer.unref?.()}catch{}
 }catch{}
}

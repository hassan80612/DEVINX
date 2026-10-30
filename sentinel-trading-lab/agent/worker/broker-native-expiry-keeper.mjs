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
export function updateBrokerNativeExpiryPreference({provider,preferredMs,explicit=false}={}){
 try{
  if(!['iq_option','exnova'].includes(provider))return false;
  const ms=Number(preferredMs),accepted=new Set([5,10,15,30,60,120,180,300,600,900]);
  if(!accepted.has(ms/1000))return false;
  const keeper=window.__sentinelNativeExpiryKeeperV3;
  if(keeper?.provider===provider&&typeof keeper.setPreferred==='function')return keeper.setPreferred(ms,{explicit});
  const key='sentinel-broker-native-expiration-preference-v3:'+provider;
  if(ms===30000&&!explicit&&Number(localStorage.getItem(key))>30000)return true;
  localStorage.setItem(key,String(ms));
  if(explicit)localStorage.setItem('sentinel-broker-native-explicit-default-v4:'+provider,ms===30000?'30000':'');
  return true;
 }catch{return false}
}
// Runs on the existing broker page immediately before an actual direction
// click. Unknown native controls never gate startup or imply a duration.
export function inspectNativeExpiryBeforeClick({requiredDurationMs=null}={}){
 if(typeof window==='undefined')return {blocked:false};
 // Idle maintenance owns repair; the entry path only reads and then revokes its lease.
 const keeper=window.__sentinelNativeExpiryKeeperV3;
 if(![8,9,10,11,12,13,14,15,16].includes(keeper?.revision))return {blocked:false};
 // Revoke the idle permission immediately before the physical entry. The
 // check is read-only and never opens or changes the broker expiry control.
 window.__sentinelNativeExpiryPermissionV3={provider:keeper.provider,at:Date.now(),allowed:false};
 const previous=keeper.snapshot();
 if(previous.restoring||previous.repairing)return {blocked:true,reason:'expiry-repair-in-progress',
  preferredMs:previous.preferredMs,currentMs:previous.currentMs,revision:keeper.revision,observedAt:previous.observedAt};
 keeper.poll();
 const s=keeper.snapshot();
 const required=Number(requiredDurationMs);
 // An unreadable picker is unknown, not a proven mismatch. In particular,
 // the first accepted order may supply the broker's own timing information.
 // Never require that post-click observation in order to permit the first click.
 const mismatch=!!(s.currentMs&&((s.preferredMs&&s.preferredMs!==s.currentMs)||
  required>0&&required!==s.currentMs));
 return {blocked:mismatch,reason:mismatch?'expiry-not-synchronized':null,
  preferredMs:s.preferredMs,currentMs:s.currentMs,requiredDurationMs:required>0?required:null,
  revision:keeper.revision,observedAt:s.observedAt};
}
// Execution telemetry is independent of picker recognition. Read the cached
// snapshot only: no DOM discovery, poll, repair, wait or trade veto.
export function observeNativeExpiryForClick({provider,requiredDurationMs=null}={}){
 try{
  window.__sentinelNativeExpiryPermissionV3={provider,at:Date.now(),allowed:false};
  const keeper=window.__sentinelNativeExpiryKeeperV3;
  let s=keeper?.snapshot?.()||window.__sentinelNativeExpiryStatusV3||{};
  const reports=Object.values(window.__sentinelNativeExpiryReportsV1||{}).filter(r=>r.provider===provider&&r.at<=Date.now()&&Date.now()-r.at<=5000&&Number(r.currentMs)>0);
  const mapped=reports.filter(r=>r.mappingStatus==='mapped'),known=mapped.length?mapped:reports;
  const values=[...new Set(known.map(r=>Number(r.currentMs)))];
  if(values.length===1){const r=known.sort((a,b)=>b.at-a.at)[0];s={...s,currentMs:values[0],observedAt:r.at,discoveryReason:r.discoveryReason,mapping:{status:r.mappingStatus}};}
  else if(values.length>1)s={...s,currentMs:null,discoveryReason:'ambiguous-frame-values'};

  const actual=Number(s.currentMs)>0?Number(s.currentMs):null;
  const required=Number(requiredDurationMs)>0?Number(requiredDurationMs):null;
  return {blocked:false,preferredMs:Number(s.preferredMs)>0?Number(s.preferredMs):null,
   currentMs:actual,requiredDurationMs:required,revision:keeper?.revision??null,
   observedAt:s.observedAt??null,discoveryReason:s.discoveryReason??null,mappingStatus:s.mapping?.status??null,detectedMismatch:!!(actual&&required&&actual!==required),
   restorationInProgress:!!(s.repairing||s.restoring)};
 }catch{return {blocked:false,currentMs:null,requiredDurationMs:Number(requiredDurationMs)||null}}
}
export function installBrokerNativeExpiryKeeper({provider,requestedMs=null,requestedAt=0,allowEmbedded=false}={}){
 try{
  if(!['iq_option','exnova'].includes(provider))return;
  const h=String(location.hostname||'').toLowerCase();
  if(!((provider==='iq_option'&&/(^|\.)iqoption\.com$/.test(h))||
    (provider==='exnova'&&/(^|\.)exnova\.com$/.test(h)))&&!(allowEmbedded&&window.top!==window))return;
  if(window.__sentinelNativeExpiryKeeperV3?.revision===17){
   const keeper=window.__sentinelNativeExpiryKeeperV3;
   const current=Number(keeper.snapshot?.().preferredMs);
   const chosen=Number(requestedMs),at=Number(requestedAt)||0;
   const nativeKey='sentinel-broker-native-expiration-preference-v3:'+provider;
   const storedAt=Number(localStorage.getItem(nativeKey+':selectedAt')||0);
   // A running keeper must not discard a newer Agent preference just
   // because it had already read an older 30s page-local preference.
   if([30000,60000,300000].includes(chosen)&&
     (!(current>0)||at>storedAt||
       (at===0&&storedAt===0&&current===30000&&chosen>30000)))
    keeper.setPreferred?.(chosen,{selectedAt:at});
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
  const defaultChoiceKey='sentinel-broker-native-explicit-default-v4:'+provider;
  const ACCEPT=new Set([5,10,15,30,60,120,180,300,600,900]);
  const parse=text=>{
   const raw=String(text||'').replace(/\u00a0/g,' ').trim();
   const found=[...raw.matchAll(/(^|[^\d])(\d{1,3})\s*(segundos?|seg|seconds?|secs?|sec|s|minutos?|minutes?|mins?|min|m)\b/gi)];
   if(found.length!==1){
    // Some Exnova skins print the SELECTED expiry as 00:01:00 or 01:00.
    // Only parse a complete field, never a free-running clock or body text.
    const field=raw.replace(/^(?:tempo(?: de (?:expira(?:ç|c)ão|opera(?:ç|c)ão))?|expira(?:ç|c)ão|expiration(?: time)?|expiry|duration|duraci[oó]n)\s*[:：]?\s*/i,'');
    const clock=field.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
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
  const nativeLabel=el=>['aria-label','title','data-testid','data-test','name','id'].map(k=>
   String(el.getAttribute?.(k)||'')).join(' ')+' '+String(el.className||'')+' '+
   String(el.getAttribute?.('aria-labelledby')||'').split(/\s+/).filter(Boolean)
    .map(id=>document.getElementById?.(id)?.textContent||'').join(' ');
  const labelRe=/expira|expir|vencim|expiry|dura(?:ç|c)ão|duraci[oó]n|duration|option[- ]time|order[- ]time|\btempo(?=\s|[:：]|\d|$)/i;
  const chartRe=/chart|candle|vela|gr[aá]fico|timeframe|per[ií]odo da vela|countdown|count.down|remaining|restante/i;
  const CONTROL_SELECTORS=[
   '[data-testid*="expir" i]','[data-test*="expir" i]',
   '[class*="expiration" i]','[class*="expiry" i]',
   '[class*="duration" i]','[data-testid*="duration" i]',
   '[class*="option-time" i]','[data-test*="duration" i]',
   '[aria-label*="expir" i]','[title*="expir" i]',
   '[aria-labelledby]','[name*="expir" i]',
   '[aria-label*="duration" i]','[title*="duration" i]',
   '[class*="time-control" i]','[class*="deal-time" i]'
  ].join(',');
  // Generic fields may be discovered through their nearby visible label,
  // but they never establish ownership of an unrelated popup menu.
  const DISCOVERY_SELECTORS=CONTROL_SELECTORS+',button,[role="button"],[role="combobox"],input,select,[class*="time" i]';
  let cached=null,observedMs=null,preferredMs=null,manualOpenedAt=0,
   openingValue=null,chosenValue=null,mismatchSince=0,lastRepairAt=0,repairing=false,
   verificationPending=false,lastUserActivityAt=0,lastProbeAt=0,stableCount=0,manualControl=null,chosenTarget=null,observedAt=0,
   permissionRequest=null,lastPermissionRequestAt=0,disposed=false,explicitDefault=false;
  try{
   explicitDefault=Number(localStorage.getItem(defaultChoiceKey))===30000;
   const v=Number(localStorage.getItem(key)??localStorage.getItem(v2Key)??localStorage.getItem(oldKey));
   if(ACCEPT.has(v/1000)){preferredMs=v;localStorage.setItem(key,String(v));}
   const requested=Number(requestedMs);
   // A saved broker choice is authoritative across page reloads. Runtime input is only a fallback.
   if(!preferredMs&&ACCEPT.has(requested/1000)){preferredMs=requested;localStorage.setItem(key,String(requested));}
  }catch{}
  const readOwn=el=>{
   const selected=el.matches?.('select')?el.selectedOptions:null;
   if(selected?.length===1)return parse(selected[0].textContent||selected[0].label);
   // Input value and visible label are alternative sources, not two choices.
   return parse(el.getAttribute?.('aria-valuetext'))||parse(el.value)||
    parse(el.getAttribute?.('data-value'))||parse(el.innerText||el.textContent||'');
  };
  const readDuration=el=>{
   const own=readOwn(el);if(own)return own;
   // Some skins put the label and selected clock in separate descendants.
   // Accept a single duration only; an open multi-option menu is ambiguous.
   const values=[...new Set([...(el.querySelectorAll?.('input,select,[aria-valuetext],[data-value],button,span')||[])]
    .filter(x=>visible(x)&&!chartRe.test(nativeLabel(x))).map(readOwn).filter(Boolean))];
   return values.length===1?values[0]:null;
  };
  const mappedFieldKey='sentinel-broker-native-expiration-field-v1:'+provider;
  let mappingNoticeTimer=null,mappedSelector='',mappingArmed=false,mappingCaptured=false,mappingReason='not-mapped',discoveryReason='field-not-found',discoverySource=null;
  try{mappedSelector=String(localStorage.getItem(mappedFieldKey)||'')}catch{}
  const unsafeField=el=>{
   if(!el||el.closest?.('#sentinel-trading-overlay-host,[data-sentinel-expiry-mapping-notice]'))return true;
   for(let p=el,depth=0;p&&depth<4;p=p.parentElement,depth++){const r=p.getBoundingClientRect?.();if(depth&&r&&(r.width>450||r.height>180))break;if(chartRe.test(nativeLabel(p)))return true;}
   return /^(?:call|put|buy|sell|comprar|vender|acima|abaixo)$/i.test(String(el.innerText||el.textContent||'').trim());
  };
  const mappingNotice=text=>{
   try{
    let box=document.querySelector('[data-sentinel-expiry-mapping-notice]');
    if(!box){box=document.createElement('div');box.setAttribute('data-sentinel-expiry-mapping-notice','1');box.setAttribute('role','status');
     box.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:360px;padding:13px 16px;border:1px solid #7dd3fc;border-radius:10px;background:#102735;color:#e6f6ff;font:600 13px/1.5 system-ui;box-shadow:0 4px 24px #0006;pointer-events:none';document.body.appendChild(box);}
    box.textContent=text;
    if(mappingNoticeTimer)clearTimeout(mappingNoticeTimer);mappingNoticeTimer=setTimeout(()=>{if(!mappingArmed)box.remove()},12000);
   }catch{}
  };
  const fieldPath=el=>{
   const escape=v=>typeof CSS!=='undefined'&&CSS.escape?CSS.escape(v):String(v).replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c);
   const segments=[];
   for(let node=el,depth=0;node&&depth<12;node=node.parentElement,depth++){
    const id=node.getAttribute?.('id');
    if(id&&document.querySelectorAll('#'+escape(id)).length===1){segments.unshift('#'+escape(id));return segments.join(' > ');}
    const tag=String(node.tagName||'').toLowerCase();if(!/^[a-z][a-z0-9-]*$/.test(tag))return '';
    const siblings=[...(node.parentElement?.children||[])].filter(x=>x.tagName===node.tagName);
    segments.unshift(tag+':nth-of-type('+(siblings.indexOf(node)+1)+')');
    const selector=segments.join(' > ');
    if(document.querySelectorAll(selector).length===1)return selector;
   }
   return '';
  };
  const captureMappedField=target=>{
   if(unsafeField(target))return false;
   let field=target?.closest?.('button,[role="button"],input,select,[role="combobox"]')||target;
   for(let depth=0;field&&depth<4;field=field.parentElement,depth++){
    if(unsafeField(field)||!visible(field))continue;
    const value=readDuration(field),rect=field.getBoundingClientRect();
    if(!value||String(field.innerText||field.textContent||'').length>85||rect.width>450||rect.height>180)continue;
    const label=nativeLabel(field)+' '+String(field.parentElement?.innerText||field.parentElement?.textContent||'');
    if(rect.x<innerWidth*.5&&!labelRe.test(label))continue;
    const selector=fieldPath(field);if(!selector||selector.length>1500)continue;
    mappedSelector=selector;cached=field;mappingReason='mapped';mappingCaptured=true;
    try{localStorage.setItem(mappedFieldKey,selector)}catch{}
    mappingNotice('Expiração mapeada. Leitura: '+(value/1000)+'s · preferência salva: '+(preferredMs?preferredMs/1000+'s':'a definir')+'. O Agent vai conferir este campo após atualizar a página.');
    return true;
   }
   return false;
  };
  const mappedField=()=>{
   if(!mappedSelector)return null;
   try{
    const found=[...document.querySelectorAll(mappedSelector)].filter(visible);
    if(found.length!==1||unsafeField(found[0])){mappingReason='mapped-field-not-found';return null;}
    const value=readDuration(found[0]);if(!value){mappingReason='mapped-value-unreadable';return null;}
    mappingReason='mapped';return {el:found[0],value,score:100,source:'mapped'};
   }catch{mappingReason='mapped-path-invalid';return null;}
  };
  function discover(){
   const mapped=mappedField();if(mapped){discoveryReason='identified';discoverySource='mapped';return mapped;}
   if(cached&&visible(cached)){
    const found=readDuration(cached);
    if(found){discoveryReason='identified';discoverySource='cached';return {el:cached,value:found};}
   }
   const candidates=[];
   for(const el of document.querySelectorAll(DISCOVERY_SELECTORS)){
    if(!visible(el))continue;
    const text=String(el.innerText||el.textContent||el.value||'').trim();
    if(text.length>85)continue;
    const v=readDuration(el);
    if(!v)continue;
    const r=el.getBoundingClientRect();
    let label=nativeLabel(el);
    for(let parent=el.parentElement,depth=0;parent&&depth<2&&!['BODY','HTML'].includes(String(parent.tagName))&&!labelRe.test(label);parent=parent.parentElement,depth++){
     const nearby=String(parent.innerText||parent.textContent||'').trim();
     if(nearby.length<=85&&labelRe.test(nearby))label+=' '+nearby;
    }
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
   // Some broker skins render plain divs rather than inputs/buttons. Start
   // from an exact native duration label and inspect its small local field.
   // Never infer duration from the chart, countdown, body or saved preference.
   if(!candidates.length)for(const label of document.querySelectorAll('label,[class*="label" i],[class*="caption" i],[class*="title" i]')){
    if(!visible(label)||unsafeField(label))continue;
    const text=String(label.innerText||label.textContent||'').trim();
    if(!/^(?:tempo(?: de (?:expira(?:ç|c)ão|opera(?:ç|c)ão))?|expira(?:ç|c)ão|expiration(?: time)?|expiry|duration|duraci[oó]n)[:：]?$/i.test(text))continue;
    for(let el=label.parentElement,depth=0;el&&depth<4;el=el.parentElement,depth++){
     const r=el.getBoundingClientRect?.();if(!r||r.width>450||r.height>180)break;
     if(unsafeField(el)||!visible(el))continue;
     const value=readDuration(el);if(value){candidates.push({el,value,score:10});break;}
    }
   }
   candidates.sort((a,b)=>b.score-a.score);
   if(!candidates.length){discoveryReason='field-not-found';discoverySource=null;return null;}
   // A tie between disjoint native controls is ambiguous: never guess.
   const top=candidates[0],other=candidates.find(z=>
    z!==top&&z.score===top.score&&!top.el.contains(z.el)&&!z.el.contains(top.el));
   if(other){discoveryReason='ambiguous-fields';return null;}
   cached=top.el;discoveryReason='identified';discoverySource='semantic';
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
   if(!control)return null;
   const inside=inExpiryMenu(target,control.el);
   const portal=target?.closest?.('[role="option"],[role="menuitem"],li,[class*="option" i],[class*="item" i]');
   if(!inside&&(!manualOpenedAt||Date.now()-manualOpenedAt>=12000||!portal||
    !visible(portal)||Math.abs(portal.getBoundingClientRect().x-control.el.getBoundingClientRect().x)>450||
    Math.abs(portal.getBoundingClientRect().y-control.el.getBoundingClientRect().y)>450||chartRe.test(nativeLabel(portal)+' '+nativeLabel(portal.parentElement))))return null;
   const opener=control.el.matches?.('button,[role="button"],input,select')?control.el:
    control.el.querySelector?.('button,[role="button"],input,select');
   const explicitOption=target.matches?.('[role="option"],[role="menuitem"],li,[class*="option" i],[class*="item" i]')||
    target.closest?.('[role="option"],[role="menuitem"],li,[class*="option" i],[class*="item" i]');
   if(opener&&(target===opener||opener.contains?.(target)&&!explicitOption))return null;
   for(let el=target,depth=0;el&&depth<3;el=el.parentElement,depth++){
    const raw=String(el.innerText||el.textContent||'').trim();
    if(raw.length>25)continue;
    const value=parse(raw);
    if(value&&(el.matches?.('[role="option"],[role="menuitem"],li,[class*="option" i],[class*="duration" i],[class*="item" i]')||
      el.closest?.('[role="option"],[role="menuitem"],[class*="option" i],[class*="duration" i],[class*="item" i]')))return value;
   }
   return null;
  };
  const verifySoon=()=>{
   // Native click handlers update the selected field AFTER capture listeners.
   // Verify promptly instead of leaving the choice unsaved until the 2.5s poll.
   for(const delay of [0,120,500])setTimeout(()=>{if(!disposed)poll()},delay);
  };
  const persistBeforeLeave=()=>{
   if(disposed||repairing||!manualOpenedAt)return;
   const actual=discover()?.value;
   const confirmed=chosenValue!=null&&actual===chosenValue;
   // A native picker can replace its element when the person selects 1m/5m.
   // Save only a changed NON-default value after the trusted opener.
   const changed=chosenValue==null&&openingValue!=null&&
    actual!==30000&&actual!==openingValue;
   if(confirmed||changed)save(actual,'manual');
  };
  const onPointerDown=ev=>{
   if(mappingArmed&&ev.isTrusted===true&&!ev.target?.closest?.('#sentinel-trading-overlay-host')){
    ev.preventDefault?.();ev.stopImmediatePropagation?.();
    if(!mappingCaptured&&!captureMappedField(ev.target))mappingNotice('Clique no valor da expiração da corretora. O gráfico e os botões CALL/PUT não são campos de expiração. Pressione Esc para cancelar.');
    return;
   }

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
   if(mappingArmed&&ev.isTrusted===true&&!ev.target?.closest?.('#sentinel-trading-overlay-host')){
    ev.preventDefault?.();ev.stopImmediatePropagation?.();
    if(!mappingCaptured&&!captureMappedField(ev.target))mappingNotice('Clique no valor da expiração da corretora. O gráfico e os botões CALL/PUT não são campos de expiração. Pressione Esc para cancelar.');
    if(mappingCaptured){mappingArmed=false;mappingCaptured=false;mappingFinishedId=mappingSessionId;poll({urgent:true});}
    return;
   }

   if(repairing||!ev.isTrusted)return;
   if(chosenTarget&&(chosenTarget===ev.target||chosenTarget.contains?.(ev.target))){verifySoon();return;}
   // Options can be INSIDE the picker. Check the actual choice before the
   // opener, otherwise a real selection is mistaken for opening the menu.
   const value=manualOpenedAt&&Date.now()-manualOpenedAt<12000?pickedOption(ev.target):null;
   if(value){chosenValue=value;lastUserActivityAt=Date.now();verifySoon();}
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
   if(value){manualOpenedAt=Date.now();chosenValue=value;lastUserActivityAt=manualOpenedAt;verifySoon();}
  };
  document.addEventListener('pointerdown',onPointerDown,true);
  document.addEventListener('click',onClick,true);
  document.addEventListener('change',onChange,true);
  window.addEventListener?.('pagehide',persistBeforeLeave);
  window.addEventListener?.('beforeunload',persistBeforeLeave);
  const permission=()=>window.__sentinelNativeExpiryPermissionV3?.allowed===true&&
   window.__sentinelNativeExpiryPermissionV3?.provider===provider&&
   Date.now()-Number(window.__sentinelNativeExpiryPermissionV3?.at||0)>=0&&
   Date.now()-Number(window.__sentinelNativeExpiryPermissionV3?.at||0)<3500;
  // A reloaded document loses its old JS permission receipt. Renew from the
  // live Node executor, without waiting for a card repaint or reading broker
  // data. A failed/missing bridge grants no write permission.
  const requestPermission=()=>{
   if(permissionRequest||typeof window.__sentinelRequestNativeExpiryPermission!=='function'||
    Date.now()-lastPermissionRequestAt<1000)return;
   const requestedAt=Date.now();lastPermissionRequestAt=requestedAt;
   permissionRequest=Promise.resolve().then(()=>window.__sentinelRequestNativeExpiryPermission())
    .then(next=>{
     const current=window.__sentinelNativeExpiryPermissionV3,now=Date.now();
     if(next?.provider!==provider||typeof next.allowed!=='boolean'||
      !Number.isFinite(next.at)||next.at<requestedAt||now-next.at<0||now-next.at>=3500||
      current&&Number(current.at)>=next.at)return;
     window.__sentinelNativeExpiryPermissionV3={provider,at:next.at,allowed:next.allowed};
     if(next.allowed)poll();
    }).catch(()=>{}).finally(()=>{permissionRequest=null});
  };
  const expiryDocumentId=String(Date.now())+'-'+String(Math.random()).slice(2);
  let mappingSessionId=0,mappingFinishedId=0;
  const reportSources=new WeakMap();
  const rememberReport=report=>{
   const reports=window.__sentinelNativeExpiryReportsV1||{};
   for(const [id,value] of Object.entries(reports))if(Date.now()-Number(value.at)>10000)delete reports[id];
   reports[report.id]=report;window.__sentinelNativeExpiryReportsV1=reports;
  };
  const forwardReport=(report,except=null,up=true)=>{
   if(up&&window.parent&&window.parent!==window&&window.parent!==except)try{window.parent.postMessage({type:'sentinel-native-expiry-status-v1',report,senderId:expiryDocumentId},'*')}catch{}
   for(let i=0;i<(window.frames?.length||0);i++)try{if(window.frames[i]!==except)window.frames[i].postMessage({type:'sentinel-native-expiry-status-v1',report,senderId:expiryDocumentId},'*')}catch{}
  };
  const onExpiryReport=event=>{
   try{
    if(event.data?.type!=='sentinel-native-expiry-status-v1')return;
    const fromParent=window.parent&&window.parent!==window&&event.source===window.parent;
    let fromChild=false;for(let i=0;i<(window.frames?.length||0);i++)if(event.source===window.frames[i])fromChild=true;
    if(!fromParent&&!fromChild)return;
    const r=event.data.report;if(!r||r.provider!==provider||typeof r.id!=='string'||r.id.length>80||!(r.at<=Date.now()&&Date.now()-r.at<10000)||r.currentMs!=null&&!ACCEPT.has(Number(r.currentMs)/1000))return;
    if(fromChild&&typeof event.data.senderId==='string'){
     let source=reportSources.get(event.source);
     if(source&&source.documentId!==event.data.senderId){for(const id of source.ids)delete (window.__sentinelNativeExpiryReportsV1||{})[id];source=null;}
     if(!source){source={documentId:event.data.senderId,ids:new Set()};reportSources.set(event.source,source);}
     source.ids.add(r.id);
    }
    rememberReport(r);forwardReport(r,event.source,!fromParent);
    if(mappingArmed&&mappingSessionId&&r.mappingFinishedId===mappingSessionId){
     mappingArmed=false;mappingCaptured=false;
     mappingNotice(r.mappingStatus==='mapped'?'Expiração mapeada no campo da corretora. Use Conferir leitura para verificar.':'Mapeamento cancelado.');
    }
   }catch{}
  };
  const save=(v,source=null,selectedAt=0)=>{
   preferredMs=v;
   explicitDefault=v===30000&&(source==='manual'||source==='analyst'||source==='agent'||explicitDefault);
   try{
    localStorage.setItem(key,String(v));
    localStorage.setItem(defaultChoiceKey,explicitDefault?'30000':'');
    if(source==='manual'||source==='analyst'||source==='agent'){
     const at=source==='agent'?Number(selectedAt)||0:Date.now();
     if(at>0)localStorage.setItem(key+':selectedAt',String(at));
     localStorage.setItem(key+':source',source);
    }
   }catch{}
   if(source==='manual'&&typeof window.__sentinelRememberNativeExpiryChoice==='function')try{Promise.resolve(window.__sentinelRememberNativeExpiryChoice(v)).catch(()=>{})}catch{}
  };
  const notify=(value)=>{window.__sentinelNativeExpiryStatusV3={
   preferredMs,currentMs:value,changedAt:Date.now(),lastRepairAt,restoring:repairing
  };
   const report={id:expiryDocumentId,provider,at:Date.now(),currentMs:value,preferredMs,
    discoveryReason,discoverySource,mappingStatus:mappingReason,mappingFinishedId};
   rememberReport(report);forwardReport(report);
  };
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
   const optionSelector='[role="option"],[role="menuitem"],li,[class*="option" i],[class*="item" i]';
   const visibleBefore=new Set([...document.querySelectorAll(optionSelector)].filter(visible));
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
     )].filter(el=>visible(el)&&(inExpiryMenu(el,control.el)||
       el.matches?.(optionSelector)&&!visibleBefore.has(el)&&
       Math.abs(el.getBoundingClientRect().x-control.el.getBoundingClientRect().x)<=450&&
       Math.abs(el.getBoundingClientRect().y-control.el.getBoundingClientRect().y)<=450&&
       !chartRe.test(nativeLabel(el)+' '+nativeLabel(el.parentElement))));
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
    if(repairing)return;
    if(document.visibilityState==='hidden'&&!mappedSelector&&!cached){discoveryReason='hidden-document';return;}
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
      current!==openingValue&&current!==30000&&stableCount>=2;
     if((chosenValue!=null&&current===chosenValue)||confirmedManualChange){
      save(current,'manual');manualOpenedAt=0;openingValue=null;chosenValue=null;chosenTarget=null;manualControl=null;mismatchSince=0;
     }
     notify(current);return;
    }
    if(manualOpenedAt){manualOpenedAt=0;openingValue=null;chosenValue=null;chosenTarget=null;manualControl=null;}
    // An inherited/default 30s receipt is not an explicit request to undo
    // an already selected non-default field. Preserve the visible choice.
    if(preferredMs===30000&&!explicitDefault&&current!==30000&&stableCount>=2)save(current);
    if(!preferredMs){
     // Bootstrap only a stable non-default selected duration. A fresh
     // default 30s is never silently treated as the user's last preference.
     if(current!==30000&&stableCount>=2)save(current);
     notify(current);return;
    }
    if(current===preferredMs){mismatchSince=0;notify(current);return}
    if(!mismatchSince)mismatchSince=now;
    if(!permission())requestPermission();
    const defaultRollback=current===30000&&preferredMs!==30000&&(stableCount>=2||discoverySource==='mapped');
    // A broker page refresh commonly resets its picker to 30s. Once two
    // observations confirm that rollback, restore the saved user choice even
    // if an unrelated earlier repair is still inside its normal cooldown.
    if((!urgent&&(now-mismatchSince<(discoverySource==='mapped'&&defaultRollback?0:defaultRollback?1000:4000)||
      (!defaultRollback&&now-lastRepairAt<10000)))||!permission()){
     notify(current);return
    }
    restore(c);
   }catch{}
  }
  const onParentPermission=event=>{
   if(event.data?.type==='sentinel-native-expiry-status-v1'){onExpiryReport(event);return;}
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
  const setPreferred=(value,{explicit=false,selectedAt=0}={})=>{
   const ms=Number(value),at=Number(selectedAt)||0;
   if(!ACCEPT.has(ms/1000))return false;
   const localAt=Number(localStorage.getItem(key+':selectedAt')||0);
   // Only the timestamped, newer choice from the Agent may reconcile
   // an existing document. Never roll back a newer trusted manual click.
   if(!explicit&&at>0&&localAt>at)return true;
   // Unauthenticated default 30s must never replace the selected 1m/5m.
   if(ms===30000&&!explicit&&preferredMs>30000&&!explicitDefault&&!(at>localAt))return true;
   save(ms,explicit?'analyst':at>0?'agent':null,at);
   mismatchSince=0;manualOpenedAt=0;openingValue=null;chosenValue=null;chosenTarget=null;manualControl=null;
   notify(observedMs);poll({urgent:true});return true;
  };
  window.__sentinelNativeExpiryKeeperV3={revision:17,provider,poll,setPreferred,
   cancelFieldMapping:()=>{mappingArmed=false;mappingCaptured=false;mappingFinishedId=mappingSessionId;try{document.querySelector('[data-sentinel-expiry-mapping-notice]')?.remove()}catch{};notify(observedMs);},
   showFieldMappingStatus:()=>mappingNotice(observedMs?'Expiração lida: '+observedMs/1000+'s · preferência: '+preferredMs/1000+'s.':'Expiração não reconhecida. Use Mapear expiração.'),
   armFieldMapping:(id=Date.now())=>{mappingSessionId=id;mappingFinishedId=0;mappingArmed=true;mappingCaptured=false;mappingNotice('Mapear expiração: clique no prazo da CORRETORA. Nenhuma ordem será enviada por esse clique. Esc cancela.');return true;},
   clearFieldMapping:()=>{mappedSelector='';cached=null;mappingArmed=false;mappingReason='not-mapped';try{localStorage.setItem(mappedFieldKey,'')}catch{};poll();},snapshot:()=>({
   preferredMs,currentMs:observedMs,observedAt,mismatchSince,lastRepairAt,repairing,
   discoveryReason,discoverySource,mapping:{armed:mappingArmed,status:mappingReason,saved:!!mappedSelector}
  })};
  const onMappingKey=ev=>{if(mappingArmed&&ev.key==='Escape'){mappingArmed=false;mappingCaptured=false;mappingFinishedId=mappingSessionId;mappingNotice('Mapeamento cancelado.');notify(observedMs);}};
  document.addEventListener('keydown',onMappingKey,true);
  const onWake=()=>{if(!disposed&&document.visibilityState!=='hidden')poll()};
  window.addEventListener?.('pageshow',onWake);
  document.addEventListener('visibilitychange',onWake);
  // When the page bootstrap inherited an older 30s value, restore the
  // Agent's more recent selected state before the first regular poll.
  const agentAt=Number(requestedAt)||0,storedAt=Number(localStorage.getItem(key+':selectedAt')||0);
  if(ACCEPT.has(Number(requestedMs)/1000)&&
    (agentAt>storedAt||(!agentAt&&!storedAt&&preferredMs===30000&&Number(requestedMs)>30000)))
   setPreferred(Number(requestedMs),{selectedAt:agentAt});
  poll();
  const timer=setInterval(poll,2500);
  window.__sentinelNativeExpiryKeeperV3.dispose=()=>{
   disposed=true;
   window.removeEventListener?.('pageshow',onWake);
   document.removeEventListener('visibilitychange',onWake);
   try{clearInterval(timer)}catch{}
   window.removeEventListener?.('message',onParentPermission);
   window.removeEventListener?.('pagehide',persistBeforeLeave);
   window.removeEventListener?.('beforeunload',persistBeforeLeave);
   document.removeEventListener('pointerdown',onPointerDown,true);
   document.removeEventListener('keydown',onMappingKey,true);
   try{document.querySelector('[data-sentinel-expiry-mapping-notice]')?.remove()}catch{}
   document.removeEventListener('click',onClick,true);
   document.removeEventListener('change',onChange,true);
  };
  try{timer.unref?.()}catch{}
 }catch{}
}

// Explicit user action only; discovery and repair still run independently of CALL/PUT execution.
export function nativeExpiryMappingCommand({mode='status',id=Date.now()}={}){
 const keeper=window.__sentinelNativeExpiryKeeperV3;
 if(!keeper)return {ok:false,message:'Campo de expiração indisponível neste frame.'};
 if(mode==='arm')keeper.armFieldMapping?.(id);
 if(mode==='reset')keeper.clearFieldMapping?.();
 if(mode==='cancel')keeper.cancelFieldMapping?.();
 if(mode==='status')keeper.showFieldMappingStatus?.();
 const state=keeper.snapshot?.()||{};
 return {ok:true,...state,message:mode==='arm'?'No PC, clique no prazo da corretora. Esc cancela.':
  state.currentMs?'Expiração lida: '+state.currentMs/1000+'s · preferência: '+state.preferredMs/1000+'s':
  'Expiração ainda não reconhecida. Use Mapear expiração.'};
}

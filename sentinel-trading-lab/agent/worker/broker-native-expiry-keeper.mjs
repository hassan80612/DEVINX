// Browser-side native broker expiry preference. This function is intentionally
// SELF-CONTAINED so Playwright can install it without evaluating extra source.
// It never changes the selected candle period or the Sentinel analyst duration.
export function installBrokerNativeExpiryKeeper({provider}={}){
 try{
  if(!['iq_option','exnova'].includes(provider))return;
  const h=String(location.hostname||'').toLowerCase();
  if(!((provider==='iq_option'&&/(^|\.)iqoption\.com$/.test(h))||
    (provider==='exnova'&&/(^|\.)exnova\.com$/.test(h))))return;
  if(window.__sentinelNativeExpiryKeeper?.revision===2)return;
  // Older documents may still have a v1 timer. Revoke its write permission;
  // v2 uses its own lease and preference so the old listener cannot fight it.
  window.__sentinelNativeExpiryPermission={allowed:false,at:0};
  const oldKey='sentinel-broker-native-expiration-preference-v1:'+provider;
  const key='sentinel-broker-native-expiration-preference-v2:'+provider;
  const ACCEPT=new Set([5,10,15,30,60,120,180,300,600,900]);
  const parse=text=>{
   const raw=String(text||'').replace(/\u00a0/g,' ').trim();
   const found=[...raw.matchAll(/(^|[^\d])(\d{1,3})\s*(segundos?|seg|seconds?|secs?|sec|s|minutos?|minutes?|mins?|min|m)\b/gi)];
   if(found.length!==1)return null;
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
  const labelRe=/expira|expir|vencim|expiry/i;
  const CONTROL_SELECTORS=[
   '[data-testid*="expir" i]','[data-test*="expir" i]',
   '[class*="expiration" i]','[class*="expiry" i]',
   '[aria-label*="expir" i]','[title*="expir" i]'
  ].join(',');
  let cached=null,observedMs=null,preferredMs=null,manualOpenedAt=0,
   openingValue=null,chosenValue=null,mismatchSince=0,lastRepairAt=0,repairing=false,
   verificationPending=false,lastUserActivityAt=0,lastProbeAt=0,stableCount=0;
  try{
   const v=Number(localStorage.getItem(key)??localStorage.getItem(oldKey));
   if(ACCEPT.has(v/1000)){preferredMs=v;localStorage.setItem(key,String(v));}
  }catch{}
  function discover(){
   if(cached&&visible(cached)){
    const found=parse((cached.innerText||cached.textContent||'')+' '+(cached.value||''));
    if(found)return {el:cached,value:found};
   }
   const candidates=[];
   for(const el of document.querySelectorAll(CONTROL_SELECTORS)){
    if(!visible(el))continue;
    const text=String(el.innerText||el.textContent||el.value||'').trim();
    if(text.length>85)continue;
    const v=parse(text+' '+String(el.value||''));
    if(!v)continue;
    const r=el.getBoundingClientRect(),label=nativeLabel(el);
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
   const control=discover();
   if(!control||!inExpiryMenu(target,control.el))return null;
   for(let el=target,depth=0;el&&depth<3;el=el.parentElement,depth++){
    const raw=String(el.innerText||el.textContent||'').trim();
    if(raw.length>25)continue;
    const value=parse(raw);
    if(value&&(el.matches?.('[role="option"],[role="menuitem"],li,[class*="option" i]')||
      el.closest?.('[role="option"],[role="menuitem"],[class*="option" i]')))return value;
   }
   return null;
  };
  document.addEventListener('pointerdown',ev=>{
   if(repairing||!ev.isTrusted)return;
   const target=ev.target;
   if(isManualPickerTarget(target)){
    manualOpenedAt=Date.now();openingValue=discover()?.value??null;
    chosenValue=null;lastUserActivityAt=manualOpenedAt;
   }
  },true);
  document.addEventListener('click',ev=>{
   if(repairing||!ev.isTrusted)return;
   // Options can be INSIDE the picker. Check the actual choice before the
   // opener, otherwise a real selection is mistaken for opening the menu.
   const value=manualOpenedAt&&Date.now()-manualOpenedAt<12000?pickedOption(ev.target):null;
   if(value){chosenValue=value;lastUserActivityAt=Date.now();}
   else if(isManualPickerTarget(ev.target)){
    manualOpenedAt=Date.now();openingValue=discover()?.value??null;
    chosenValue=null;lastUserActivityAt=manualOpenedAt;
   }
  },true);
  document.addEventListener('change',ev=>{
   if(repairing||!ev.isTrusted||!ev.target?.matches?.('select'))return;
   const control=discover();
   if(!control||!inExpiryMenu(ev.target,control.el))return;
   const selected=ev.target.selectedOptions;
   const value=selected?.length===1?parse(selected[0].textContent||selected[0].label):null;
   if(value){manualOpenedAt=Date.now();chosenValue=value;lastUserActivityAt=manualOpenedAt;}
  },true);
  const permission=()=>window.__sentinelNativeExpiryPermissionV2?.allowed===true&&
   Date.now()-Number(window.__sentinelNativeExpiryPermissionV2?.at||0)<3500;
  const save=v=>{preferredMs=v;try{localStorage.setItem(key,String(v))}catch{}};
  const notify=(value)=>{window.__sentinelNativeExpiryStatus={
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
     if(!permission()){repairing=false;return}
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
  function poll(){
   try{
    if(document.visibilityState==='hidden'||repairing)return;
    const c=discover();if(!c)return;
    const current=c.value,now=Date.now();
    if(observedMs===current)stableCount++;
    else{observedMs=current;stableCount=1;}
    if(manualOpenedAt&&now-manualOpenedAt<12000){
     if(chosenValue!=null&&current===chosenValue){
      save(current);manualOpenedAt=0;openingValue=null;chosenValue=null;mismatchSince=0;
     }
     notify(current);return;
    }
    if(manualOpenedAt){manualOpenedAt=0;openingValue=null;chosenValue=null;}
    if(!preferredMs){
     // Bootstrap only a stable non-default selected duration. A fresh
     // default 30s is never silently treated as the user's last preference.
     if(current!==30000&&stableCount>=2)save(current);
     notify(current);return;
    }
    if(current===preferredMs){mismatchSince=0;notify(current);return}
    if(!mismatchSince)mismatchSince=now;
    if(now-mismatchSince<4000||now-lastRepairAt<10000||!permission()){
     notify(current);return
    }
    restore(c);
   }catch{}
  }
  window.__sentinelNativeExpiryKeeper={revision:2,poll,snapshot:()=>({
   preferredMs,currentMs:observedMs,mismatchSince,lastRepairAt,repairing
  })};
  poll();
  const timer=setInterval(poll,2500);
  try{timer.unref?.()}catch{}
 }catch{}
}

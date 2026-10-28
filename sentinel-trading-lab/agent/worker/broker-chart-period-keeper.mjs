// Persist only the broker's explicitly labelled chart timeframe. This is a
// separate control from order expiry and never touches market subscriptions.
export function installBrokerChartPeriodKeeper({provider}={}){
 try{
  if(!['iq_option','exnova'].includes(provider))return;
  const host=String(location.hostname||'').toLowerCase();
  if(!((provider==='iq_option'&&/(^|\.)iqoption\.com$/.test(host))||
    (provider==='exnova'&&/(^|\.)exnova\.com$/.test(host))))return;
  if(window.__sentinelBrokerChartPeriodKeeperV1?.revision===1)return;
  try{window.__sentinelBrokerChartPeriodKeeperV1?.dispose?.()}catch{}
  const ACCEPT=new Set([5,10,15,30,60,120,180,300,600,900,1800,3600]);
  const key='sentinel-broker-chart-period-preference-v1:'+provider;
  const SELECTORS=[
   '[class*="chart-duration" i]','[class*="chart-timeframe" i]',
   '[class*="chart-period" i]','[data-testid*="chart-timeframe" i]',
   '[data-testid*="chart-period" i]','[data-test*="timeframe" i]',
   '[aria-label*="chart timeframe" i]','[title*="chart timeframe" i]'
  ].join(',');
  const chartMarker=/chart|timeframe|time[- ]?frame|candle[- ]?(period|time)|grafico|gr[aá]fico/i;
  const unrelated=/expir|order|trade|option|countdown|remaining|restante/i;
  const parse=value=>{
   const raw=String(value||'').replace(/\u00a0/g,' ').trim().toLowerCase();
   const m=raw.match(/^(\d{1,2})\s*(s|sec|secs|second|seconds|seg|segundo|segundos|min|mins|minute|minutes|m|minuto|minutos)$/i);
   if(m){const n=Number(m[1]),seconds=/^(m|min)/i.test(m[2])?n*60:n;return ACCEPT.has(seconds)?seconds:null;}
   const clock=raw.match(/^(\d{1,2}):(\d{2})$/);
   if(clock){const seconds=Number(clock[1])*60+Number(clock[2]);return ACCEPT.has(seconds)?seconds:null;}
   return null;
  };
  const visible=el=>{
   if(!el?.isConnected||el.closest?.('#sentinel-trading-overlay-host'))return false;
   const r=el.getBoundingClientRect?.();
   return !!r&&r.width>=12&&r.height>=8&&r.bottom>0&&r.right>0&&r.top<innerHeight;
  };
  const labelOf=el=>[
   el?.getAttribute?.('aria-label'),el?.getAttribute?.('title'),
   el?.getAttribute?.('data-testid'),el?.getAttribute?.('data-test'),
   el?.getAttribute?.('name'),el?.className
  ].map(x=>String(x||'')).join(' ');
  const read=el=>{
   const selected=el?.matches?.('select')?el.selectedOptions:null;
   if(selected?.length===1){const v=parse(selected[0].textContent||selected[0].label);if(v)return v;}
   for(const v of [el?.getAttribute?.('aria-valuetext'),el?.value,
    el?.getAttribute?.('data-value'),el?.innerText,el?.textContent]){
    const result=parse(v);if(result)return result;
   }
   return null;
  };
  let cached=null,observedSeconds=null,preferredSeconds=null,stableCount=0,
   manualOpenedAt=0,openingSeconds=null,manualControl=null,chosenSeconds=null,
   chosenTarget=null,lastUserActivityAt=0,lastRepairAt=0,repairing=false,
   observedAt=0,lastAttemptAt=0;
  try{
   const v=Number(localStorage.getItem(key));
   if(ACCEPT.has(v)){preferredSeconds=v;}
  }catch{}
  function discover(){
   if(cached&&visible(cached)){
    const value=read(cached);if(value)return{el:cached,value};
   }
  const all=[...document.querySelectorAll(SELECTORS)].filter(el=>{
    if(!visible(el))return false;
    const label=labelOf(el);
    return chartMarker.test(label)&&!unrelated.test(label)&&read(el)!=null;
   }).map(el=>({el,value:read(el),score:
    (String(el.getAttribute?.('data-testid')||'').toLowerCase().includes('chart')?4:0)+
    (String(el.getAttribute?.('aria-label')||'').toLowerCase().includes('chart')?3:0)+
    (String(el.className||'').toLowerCase().includes('chart')?2:0)}));
  // If a wrapper and its actual clickable child both match, keep the leaf.
  const candidates=all.filter(x=>!all.some(other=>other!==x&&
   x.el.contains?.(other.el)&&x.value===other.value));
   candidates.sort((a,b)=>b.score-a.score);
   if(!candidates.length)return null;
   const top=candidates[0],ambiguous=candidates.some((x,i)=>i>0&&x.score===top.score&&
    !top.el.contains?.(x.el)&&!x.el.contains?.(top.el));
   if(ambiguous)return null;
   cached=top.el;return top;
  }
  const belongsToControl=(target,control)=>!!target&&!!control&&
   (target===control||control.contains?.(target)||target.contains?.(control));
  const inChartMenu=(el,control)=>{
   if(!el||el.closest?.('#sentinel-trading-overlay-host'))return false;
   if(belongsToControl(el,control))return true;
   for(const attr of ['aria-controls','aria-owns']){
    for(const id of String(control?.getAttribute?.(attr)||'').split(/\s+/).filter(Boolean)){
     const popup=document.getElementById?.(id);
     if(popup&&(popup===el||popup.contains?.(el)))return true;
    }
   }
   const root=control?.closest?.('[data-testid*="chart" i],[data-test*="chart" i],'+
    '[class*="chart-container" i],[class*="chart-toolbar" i]');
   if(root&&root.contains?.(el))return true;
   const menu=el.closest?.('[role="menu"],[role="listbox"],[class*="menu" i],[class*="dropdown" i]');
   const menuLabel=labelOf(menu);
   return !!menu&&chartMarker.test(menuLabel)&&!unrelated.test(menuLabel);
  };
  const pickedOption=target=>{
   const control=manualControl||discover()?.el;
   if(!control||!inChartMenu(target,control))return null;
   for(let el=target,depth=0;el&&depth<4;el=el.parentElement,depth++){
    const value=parse(el.innerText||el.textContent||'');
    if(value&&(el.matches?.('[role="option"],[role="menuitem"],li,'+
      '[class*="timeframe" i],[class*="period" i]')||
      el.closest?.('[role="option"],[role="menuitem"],[class*="timeframe" i],[class*="period" i]')))
      return value;
   }
   return null;
  };
  const save=value=>{
   if(!ACCEPT.has(Number(value)))return;
   preferredSeconds=Number(value);try{localStorage.setItem(key,String(preferredSeconds))}catch{}
  };
  // Chart interval is independent of order expiry and remains recoverable
  // while the executor temporarily revokes permission around order clicks.
  const notify=()=>{window.__sentinelBrokerChartPeriodStatusV1={
   provider,preferredSeconds,currentSeconds:observedSeconds,observedAt,lastRepairAt,
   repairing,revision:1
  }};
  function restore(control){
   const now=Date.now();
   if(repairing||!control||!preferredSeconds||
     lastUserActivityAt>now-12000||now-lastAttemptAt<5000)return;
   repairing=true;lastAttemptAt=now;lastRepairAt=now;
   const select=control.el.matches?.('select')?control.el:control.el.querySelector?.('select');
   if(select){
    const options=[...select.options].filter(o=>parse(o.textContent||o.label)===preferredSeconds);
    if(options.length===1){
     select.value=options[0].value;
     select.dispatchEvent(new Event('input',{bubbles:true}));
     select.dispatchEvent(new Event('change',{bubbles:true}));
     setTimeout(()=>{const actual=discover()?.value;if(actual===preferredSeconds)lastAttemptAt=0;
      repairing=false;notify();},450);
    }else repairing=false;
    return;
   }
   const opener=control.el.matches?.('button,[role="button"],input')?control.el:
    control.el.querySelector?.('button,[role="button"],input')||control.el;
   try{opener.click()}catch{repairing=false;return}
   setTimeout(()=>{
    try{
     const elements=[...document.querySelectorAll('[role="option"],[role="menuitem"],'+
      '[class*="timeframe" i],[class*="period" i],li,button')]
      .filter(el=>visible(el)&&inChartMenu(el,control.el));
     const options=elements.filter(el=>parse(el.innerText||el.textContent||'')===preferredSeconds&&
      el!==opener&&!el.contains?.(opener))
      .filter(el=>!elements.some(other=>other!==el&&el.contains?.(other)&&
       parse(other.innerText||other.textContent||'')===preferredSeconds));
     if(options.length!==1){try{opener.click()}catch{};repairing=false;notify();return;}
     options[0].click();
     setTimeout(()=>{const actual=discover()?.value;if(actual===preferredSeconds)lastAttemptAt=0;
      repairing=false;notify();},450);
    }catch{repairing=false;notify();}
   },200);
  }
  function poll(){
   try{
    if(document.visibilityState==='hidden'||repairing)return;
    const control=discover(),now=Date.now();observedAt=now;
    if(!control){observedSeconds=null;stableCount=0;notify();return;}
    if(observedSeconds===control.value)stableCount++;
    else{observedSeconds=control.value;stableCount=1;}
    if(manualOpenedAt&&now-manualOpenedAt<12000){
     const confirmed=chosenSeconds!=null&&control.value===chosenSeconds;
     const changedManually=chosenSeconds==null&&openingSeconds!=null&&
      control.value!==openingSeconds&&stableCount>=2&&manualControl===control.el;
     if(confirmed||changedManually){save(control.value);manualOpenedAt=0;openingSeconds=null;
      manualControl=null;chosenSeconds=null;chosenTarget=null;}
     notify();return;
    }
    if(manualOpenedAt){manualOpenedAt=0;openingSeconds=null;manualControl=null;
     chosenSeconds=null;chosenTarget=null;}
    if(!preferredSeconds){if(stableCount>=2)save(control.value);notify();return;}
    if(control.value===preferredSeconds){lastAttemptAt=0;notify();return;}
    // This broker's documented refresh reset is 30s. Leave any other
    // unobserved change alone so an external user choice is never undone.
    if(control.value===30&&preferredSeconds!==30&&stableCount>=2)restore(control);
    notify();
   }catch{}
  }
  const onPointerDown=ev=>{
   if(repairing||!ev.isTrusted)return;
   const target=ev.target,option=manualOpenedAt?pickedOption(target):null;
   if(option){chosenSeconds=option;chosenTarget=target;lastUserActivityAt=Date.now();return;}
   const control=discover();if(!control||!belongsToControl(target,control.el))return;
   manualOpenedAt=Date.now();openingSeconds=control.value;manualControl=control.el;
   chosenSeconds=null;chosenTarget=null;lastUserActivityAt=manualOpenedAt;
  };
  const onClick=ev=>{
   if(repairing||!ev.isTrusted)return;
   if(chosenTarget&&(chosenTarget===ev.target||chosenTarget.contains?.(ev.target)))return;
   const option=manualOpenedAt?pickedOption(ev.target):null;
   if(option){chosenSeconds=option;chosenTarget=ev.target;lastUserActivityAt=Date.now();return;}
   const control=discover();if(!control||!belongsToControl(ev.target,control.el))return;
   manualOpenedAt=Date.now();openingSeconds=control.value;manualControl=control.el;
   chosenSeconds=null;chosenTarget=null;lastUserActivityAt=manualOpenedAt;
  };
  const onChange=ev=>{
   if(repairing||!ev.isTrusted||!ev.target?.matches?.('select'))return;
   const control=discover();if(!control||!inChartMenu(ev.target,control.el))return;
   const options=ev.target.selectedOptions;
   const value=options?.length===1?parse(options[0].textContent||options[0].label):null;
   if(value){save(value);lastUserActivityAt=Date.now();}
  };
  const onWake=()=>{if(document.visibilityState!=='hidden')poll();};
  document.addEventListener('pointerdown',onPointerDown,true);
  document.addEventListener('click',onClick,true);
  document.addEventListener('change',onChange,true);
  document.addEventListener('visibilitychange',onWake);
  window.addEventListener?.('pageshow',onWake);
  window.addEventListener?.('focus',onWake);
  window.__sentinelBrokerChartPeriodKeeperV1={revision:1,provider,poll,
   snapshot:()=>({preferredSeconds,currentSeconds:observedSeconds,observedAt,lastRepairAt,repairing}),
   dispose:()=>{
    try{clearInterval(timer)}catch{}
    document.removeEventListener('pointerdown',onPointerDown,true);
    document.removeEventListener('click',onClick,true);
    document.removeEventListener('change',onChange,true);
    document.removeEventListener('visibilitychange',onWake);
    window.removeEventListener?.('pageshow',onWake);
    window.removeEventListener?.('focus',onWake);
   }};
  poll();
  const timer=setInterval(poll,2500);
  try{timer.unref?.()}catch{}
 }catch{}
}

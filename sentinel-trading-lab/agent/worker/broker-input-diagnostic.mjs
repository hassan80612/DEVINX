// Explicit, short-lived input diagnosis. Never collect values, key names,
// text, account details, cookies, page URLs, DOM HTML or screen images.
const EVENT_NAMES=['pointerdown','focusin','focusout','keydown','keyup','beforeinput','input','prevented'];
const bounded=(value,max=6000)=>Math.max(0,Math.min(max,Math.floor(Number(value)||0)));
export function normalizeInputDiagnostic(value){
 if(!value||value.format!=='sentinel-input-diagnostic-v1')return null;
 const flags=(o,keys)=>Object.fromEntries(keys.map(k=>[k,o?.[k]===true]));
 const describe=e=>({tag:['INPUT','TEXTAREA','CANVAS','BODY','HTML','DIV','BUTTON','SELECT'].includes(e?.tag)?e.tag:'OTHER',type:['text','number','password','hidden','search','tel','email'].includes(e?.type)?e.type:'other',...flags(e,['qt','flutter','clipboard','keyboard','focused','readonly','disabled','hidden','overlay']),width:bounded(e?.width,50000),height:bounded(e?.height,50000),tabIndex:Number.isFinite(Number(e?.tabIndex))?Math.max(-1,Math.min(100,Math.trunc(Number(e.tabIndex)))):-1});
 return{format:'sentinel-input-diagnostic-v1',active:value.active===true,documentFocused:value.documentFocused===true,shadowRoots:bounded(value.shadowRoots,30),canvasCount:bounded(value.canvasCount,100),fieldCount:bounded(value.fieldCount,100),fields:Array.isArray(value.fields)?value.fields.slice(0,4).map(describe):[],focus:describe(value.focus),events:Object.fromEntries(EVENT_NAMES.map(k=>[k,bounded(value.events?.[k],1000)])),lastEvent:EVENT_NAMES.includes(value.lastEvent)?value.lastEvent:null,lastTarget:describe(value.lastTarget)};
}
// Serialized into the broker frame. Passive listeners only; one expiry timer.
export function brokerInputProbe({action='start'}={}){
 window.__sentinelInputProbe?.stop?.();if(action==='stop')return{stopped:true};
 const deadline=Date.now()+30000,events={pointerdown:0,focusin:0,focusout:0,keydown:0,keyup:0,beforeinput:0,input:0,prevented:0};let lastEvent=null,lastTarget=null,lastSent=0,active=true;
 const role=e=>{const s=[e?.id,e?.getAttribute?.('class'),e?.getRootNode?.()?.host?.id,e?.getRootNode?.()?.host?.getAttribute?.('class')].filter(Boolean).join(' ');return{qt:/\bqt[-_]|qwasm/i.test(s),flutter:/flutter|flt-/i.test(s),clipboard:/clipboard|paste|copy/i.test(s),keyboard:/keyboard|inputcontext|input-context/i.test(s)};};
 const overlay=e=>{for(let p=e;p;p=p.parentElement||p.getRootNode?.()?.host)if(p.id==='sentinel-trading-overlay-host')return true;return false;};
 const describe=e=>{let b;try{b=e?.getBoundingClientRect?.()}catch{}return{tag:e?.tagName||'OTHER',type:e?.type||'other',...role(e),focused:e===deepFocus(),readonly:e?.readOnly===true,disabled:e?.disabled===true,hidden:!b||b.width===0||b.height===0||getComputedStyle(e).display==='none'||getComputedStyle(e).visibility==='hidden',overlay:overlay(e),width:Math.round(b?.width||0),height:Math.round(b?.height||0),tabIndex:Number(e?.tabIndex??-1)};};
 const deepFocus=()=>{let e=document.activeElement;for(let i=0;e?.shadowRoot?.activeElement&&i<12;i++)e=e.shadowRoot.activeElement;return e;};
 const snapshot=()=>{
  const roots=[document],seen=new Set(roots);let nodes=0;
  for(let i=0;i<roots.length&&nodes<6000;i++){const walk=document.createTreeWalker(roots[i],NodeFilter.SHOW_ELEMENT);let e;while((e=walk.nextNode())&&nodes++<6000)if(e.shadowRoot&&!overlay(e)&&!seen.has(e.shadowRoot)){seen.add(e.shadowRoot);roots.push(e.shadowRoot);}}
  const all=s=>[...new Set(roots.flatMap(r=>[...r.querySelectorAll(s)]))].filter(e=>!overlay(e)),fields=all('input,textarea,[contenteditable="true"]');
  return{format:'sentinel-input-diagnostic-v1',active,documentFocused:document.hasFocus(),shadowRoots:roots.length-1,canvasCount:all('canvas').length,fieldCount:fields.length,fields:fields.slice(0,4).map(describe),focus:describe(deepFocus()),events:{...events},lastEvent,lastTarget};
 };
 const publish=force=>{if(!force&&Date.now()-lastSent<500)return;lastSent=Date.now();const diagnostic=snapshot();Promise.resolve(window.__sentinelOverlayAction?.({action:'executor-input-diagnostic',diagnostic})).catch(()=>{});};
 const listener=event=>{
  if(event.composedPath().some(e=>e?.id==='sentinel-trading-overlay-host'))return;
  // Count events, never inspect event.key, event.code, event.data or field.value.
  events[event.type]=Math.min(1000,events[event.type]+1);lastEvent=event.type;lastTarget=describe(event.composedPath()[0]||event.target);
  queueMicrotask(()=>{if(!active)return;if(event.defaultPrevented)events.prevented=Math.min(1000,events.prevented+1);publish(false);});
 };
 const stop=()=>{if(!active)return;active=false;for(const name of Object.keys(events))if(name!=='prevented')document.removeEventListener(name,listener,true);clearTimeout(timer);window.__sentinelInputProbeActive=false;publish(true);};
 const timer=setTimeout(stop,Math.max(0,deadline-Date.now()));window.__sentinelInputProbe={stop};window.__sentinelInputProbeActive=true;
 for(const name of Object.keys(events))if(name!=='prevented')document.addEventListener(name,listener,{capture:true,passive:true});publish(true);return{ready:true,durationMs:30000};
}

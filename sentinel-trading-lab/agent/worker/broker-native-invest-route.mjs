// Explicit one-time Exnova/IQ Invest route mapping: Invest -> × -> ÷.
// Does not alter the operator, intercept normal typing, place orders, or poll.
export function armNativeInvestRoute(){
 window.__sentinelNativeRouteCleanup?.();
 const state={stage:0,steps:[],lastAt:Date.now(),swallowClick:false};
 window.__sentinelNativeRoute=state;
 const sane=el=>{
  if(!el?.tagName||!el?.getBoundingClientRect||el.closest?.('#sentinel-trading-overlay-host'))return false;
  const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
  return r.width>=12&&r.height>=10&&cs.display!=='none'&&cs.visibility!=='hidden';
 };
 const quoted=v=>JSON.stringify(String(v));
 const unique=sel=>{try{return document.querySelectorAll(sel).length===1}catch{return false}};
 const pathFor=el=>{
  for(const [attr,v] of [['id',el.id],['data-testid',el.getAttribute?.('data-testid')],
   ['data-test',el.getAttribute?.('data-test')],['aria-label',el.getAttribute?.('aria-label')]]){
   if(!v||String(v).length>120)continue;
   const s='['+attr+'='+quoted(v)+']';
   if(unique(s))return s;
  }
  const parts=[];let node=el;
  for(let i=0;node?.nodeType===1&&i<20;node=node.parentElement,i++){
   const tag=String(node.tagName).toLowerCase();
   if(!/^[a-z][a-z0-9-]*$/.test(tag))break;
   let n=1,count=1;
   for(let s=node.previousElementSibling;s;s=s.previousElementSibling)if(s.tagName===node.tagName)n++;
   for(let s=node.nextElementSibling;s;s=s.nextElementSibling)if(s.tagName===node.tagName)count++;
   parts.unshift(tag+(count>1?':nth-of-type('+n+')':''));
   const q=parts.join(' > ');
   if(q.length>250)break;
   if(unique(q))return q;
  }
  return null;
 };
 const targetOf=ev=>{
  const route=(ev.composedPath?.()||[]).filter(sane);
  if(!route.length)return null;
  const isButton=el=>/^(BUTTON|INPUT)$/.test(el.tagName)||el.getAttribute?.('role')==='button';
  let candidate=route.find(isButton)||route[0];
  if(state.stage===0){
   // First control must be Invest, not an arbitrary action button.
   const invest=route.find(el=>{const t=[el.getAttribute?.('aria-label'),el.getAttribute?.('title'),
     el.getAttribute?.('data-test'),el.getAttribute?.('data-testid'),el.textContent]
     .filter(v=>typeof v==='string').join(' ');
     const r=el.getBoundingClientRect();
     return /\binvest(?:imento|ment)?\b/i.test(t)&&r.width<=270&&r.height<=125;
   });
   if(invest)candidate=invest;
   else if(!/\binvest(?:imento|ment)?\b/i.test([candidate.getAttribute?.('aria-label'),
     candidate.getAttribute?.('title'),candidate.getAttribute?.('placeholder')].join(' ')))return null;
  }
  const rect=candidate.getBoundingClientRect();
  if(!Number.isFinite(ev.clientX)||!Number.isFinite(ev.clientY)||
   ev.clientX<rect.left-3||ev.clientX>rect.right+3||
   ev.clientY<rect.top-3||ev.clientY>rect.bottom+3)return null;
  const selector=pathFor(candidate);
  if(!selector)return null;
  return{selector,x:Math.max(.02,Math.min(.98,(ev.clientX-rect.left)/rect.width)),
   y:Math.max(.02,Math.min(.98,(ev.clientY-rect.top)/rect.height)),
   width:rect.width,height:rect.height,
   label:String(candidate.getAttribute?.('aria-label')||candidate.getAttribute?.('title')||
    candidate.textContent||'').trim().slice(0,80)};
 };
 const absorb=ev=>{
  if(!state.swallowClick)return;
  state.swallowClick=false;ev.preventDefault();ev.stopImmediatePropagation();
  if(state.stage===3){window.__sentinelNativeRouteCleanup?.();window.__sentinelNativeRouteCleanup=null;}
 };
 const pointer=ev=>{
  if(state.stage>=3||Date.now()-state.lastAt>120000)return;
  const target=targetOf(ev);if(!target)return;
  // The first click opens the native Invest keyboard normally.
  // The next two clicks are recorded but never delivered to the broker.
  const step=state.stage===0?'open':state.stage===1?'multiply':'divide';
  state.steps.push({...target,step});
  state.stage++;state.lastAt=Date.now();
  if(step!=='open'){
   state.swallowClick=true;ev.preventDefault();ev.stopImmediatePropagation();
  }
  // The final click must still be intercepted BEFORE removing listeners.
 };
 const cleanup=()=>{
  document.removeEventListener('pointerdown',pointer,true);
  document.removeEventListener('click',absorb,true);
 };
 document.addEventListener('pointerdown',pointer,true);
 document.addEventListener('click',absorb,true);
 window.__sentinelNativeRouteCleanup=cleanup;
 return{ok:true,message:'Clique no Invest, depois no × e depois no ÷ da própria corretora. Os dois últimos cliques serão apenas mapeados.'};
}
export function readNativeInvestRoute(){
 const state=window.__sentinelNativeRoute;
 if(!state||state.stage!==3||Date.now()-state.lastAt>120000||
   state.steps?.length!==3)return{complete:false,step:state?.stage??0};
 const steps=state.steps;
 // The native popup can close when the user returns to Sentinel to save.
 // CSS targets are validated again when explicitly tested, not at save time.
 for(const entry of steps){
  if(typeof entry.selector!=='string'||entry.selector.length>260||
    !['open','multiply','divide'].includes(entry.step)||
    !(entry.x>=0&&entry.x<=1&&entry.y>=0&&entry.y<=1))
    return{complete:false,step:state.stage};
 }
 return{complete:true,step:3,steps};
}
export function clearNativeInvestRoute(){
 window.__sentinelNativeRouteCleanup?.();
 window.__sentinelNativeRouteCleanup=null;
 window.__sentinelNativeRoute=null;
 return true;
}
export function inspectNativeInvestTarget({entry}={}){
 if(!entry?.selector||!['open','multiply','divide'].includes(entry.step))return{valid:false};
 let matches;try{matches=[...document.querySelectorAll(entry.selector)]}catch{return{valid:false}};
 if(matches.length!==1)return{valid:false};
 const el=matches[0],r=el.getBoundingClientRect(),cs=getComputedStyle(el);
 if(el.disabled||el.getAttribute?.('aria-disabled')==='true'||r.width<12||r.height<10||
  cs.display==='none'||cs.visibility==='hidden')return{valid:false};
 const px=Number(entry.x),py=Number(entry.y);
 if(!Number.isFinite(px)||!Number.isFinite(py)||px<0||px>1||py<0||py>1)return{valid:false};
 // Reject unexpectedly reflowed controls, including a popup that moved too far.
 if(entry.width>0&&(r.width/entry.width>2||r.width/entry.width<.5)||
    entry.height>0&&(r.height/entry.height>2||r.height/entry.height<.5))return{valid:false};
 return{valid:true,position:{x:Math.max(2,Math.min(r.width-2,r.width*px)),
   y:Math.max(2,Math.min(r.height-2,r.height*py))}};
}
export function readNativeInvestAmount({entry}={}){
 if(!entry?.selector)return null;
 let list;try{list=[...document.querySelectorAll(entry.selector)]}catch{return null}
 if(list.length!==1)return null;
 const el=list[0],values=[];
 const parse=raw=>{
  let t=String(raw??'').replace(/[\s\u00a0]/g,'').replace(/^(R\$|US\$|\$|€|£)/,'');
  if(!/^\d[\d.,]*$/.test(t))return null;
  const comma=t.lastIndexOf(','),dot=t.lastIndexOf('.');
  if(comma>=0&&dot>=0)t=comma>dot?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,'');
  else if(comma>=0)t=t.replace(',','.');
  const n=Number(t);return Number.isFinite(n)&&n>0&&n<=1e6?n:null;
 };
 const elements=[el,...el.querySelectorAll('input,[role="spinbutton"],[contenteditable="true"],strong,span,b')];
 for(const node of elements.slice(0,25)){
  const raw=String(node.value??node.getAttribute?.('aria-valuenow')??node.textContent??'').trim();
  const direct=parse(raw);
  if(direct!=null)values.push(direct);
  const currency=raw.match(/(?:R\$|US\$|\$|€|£)\s*(\d[\d.,]*)/);
  if(currency){const v=parse(currency[1]);if(v!=null)values.push(v);}
 }
 const distinct=[...new Set(values.map(n=>Math.round(n*100)/100))];
 return distinct.length===1?distinct[0]:null;
}

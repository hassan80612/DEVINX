// Native broker Invest popup calibration. Runs ONLY in explicit user-initiated
// calibration; no page-wide polling, keyboard injection, or order placement.
export function armNativeInvestControl({kind}={}){
 if(!['invest','multiply','divide'].includes(kind))throw Error('native_control_kind_invalid');
 window.__sentinelNativeInvestCleanup?.();
 window.__sentinelNativeInvestChoice=null;
 const label=el=>[el?.getAttribute?.('aria-label'),el?.getAttribute?.('title'),
   el?.getAttribute?.('data-testid'),el?.getAttribute?.('data-test'),
   el?.textContent].filter(Boolean).join(' ').trim();
 const matches=(el,k)=>{
   const name=label(el);
   return k==='invest'?/\b(invest|investimento|investment)\b/i.test(name):
    k==='divide'?/^(?:÷|\/|dividir|divide)$/i.test(name)||/\b(dividir|divide)\b/i.test(name):
    /^(?:\*|×|✕|multiplicar|multiply)$/i.test(name)||/\b(multiplicar|multiply)\b/i.test(name);
 };
 const escape=s=>JSON.stringify(String(s));
 const selectorFor=el=>{
   for(const [key,value] of [['id',el.id],['data-testid',el.getAttribute('data-testid')],
     ['data-test',el.getAttribute('data-test')],['aria-label',el.getAttribute('aria-label')],
     ['name',el.getAttribute('name')]]){
     if(!value||String(value).length>120)continue;
     const candidate='['+key+'='+escape(value)+']';
     try{if(document.querySelectorAll(candidate).length===1)return candidate}catch{}
   }
   const parts=[];let node=el;
   for(let n=0;node?.nodeType===1&&n<16;node=node.parentElement,n++){
     const tag=String(node.tagName).toLowerCase();
     if(!/^[a-z][a-z0-9-]*$/.test(tag))break;
     let index=1,occurrences=1;
     for(let v=node.previousElementSibling;v;v=v.previousElementSibling)if(v.tagName===node.tagName)index++;
     for(let v=node.nextElementSibling;v;v=v.nextElementSibling)if(v.tagName===node.tagName)occurrences++;
     parts.unshift(tag+(index>1||occurrences>1?':nth-of-type('+index+')':''));
     const css=parts.join(' > ');
     if(css.length>210)break;
     try{if(document.querySelectorAll(css).length===1)return css}catch{}
   }
   return null;
 };
 const handler=event=>{
   const path=event.composedPath?.()||[];
   let target=null;
   for(const el of path){
     if(!el?.getBoundingClientRect||el.closest?.('#sentinel-trading-overlay-host'))continue;
     if(!matches(el,kind))continue;
     const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
     if(rect.width<14||rect.height<12||style.display==='none'||style.visibility==='hidden')continue;
     target=el;break;
   }
   if(!target)return;
   const selector=selectorFor(target);
   if(!selector)return;
   // Calibration click must NOT accidentally multiply an Invest amount.
   event.preventDefault();event.stopImmediatePropagation();
   window.__sentinelNativeInvestChoice={kind,selector,label:label(target).slice(0,90),at:Date.now()};
   document.removeEventListener('click',handler,true);
   window.__sentinelNativeInvestCleanup=null;
 };
 document.addEventListener('click',handler,true);
 window.__sentinelNativeInvestCleanup=()=>document.removeEventListener('click',handler,true);
 return{ok:true};
}
export function readNativeInvestMapping({kind}={}){
 const pick=window.__sentinelNativeInvestChoice;
 if(!pick||pick.kind!==kind||Date.now()-pick.at>120000)return null;
 // The native popup may close when the user returns to Sentinel to save.
 // The selected path was unique/visible when captured; validate it again at use.
 return{selector:pick.selector,label:pick.label,kind};
}
export function clearNativeInvestMapping(){
 window.__sentinelNativeInvestCleanup?.();
 window.__sentinelNativeInvestCleanup=null;
 return true;
}
// Validate the currently mapped action, even if the DOM changed since saving.
export function inspectNativeInvestControl({selector,kind}={}){
 if(!['invest','multiply','divide'].includes(kind)||typeof selector!=='string')return{valid:false};
 let nodes;try{nodes=[...document.querySelectorAll(selector)]}catch{return{valid:false}}
 if(nodes.length!==1)return{valid:false};
 const el=nodes[0],style=getComputedStyle(el),rect=el.getBoundingClientRect();
 if(rect.width<14||rect.height<12||style.display==='none'||style.visibility==='hidden'||
    el.disabled||el.getAttribute('aria-disabled')==='true')return{valid:false};
 const text=[el.getAttribute('aria-label'),el.getAttribute('title'),el.textContent].filter(Boolean).join(' ').trim();
 if(kind==='invest'&&!/\b(invest|investimento|investment)\b/i.test(text))return{valid:false};
 if(kind==='multiply'&&!(/(?:^|\s)(?:\*|×|✕)(?:\s|$)/.test(text)||
    /\b(multiplicar|multiply)\b/i.test(text)))return{valid:false};
 if(kind==='divide'&&!(/(?:^|\s)(?:÷|\/)(?:\s|$)/.test(text)||
    /\b(dividir|divide)\b/i.test(text)))return{valid:false};
 return{valid:true};
}
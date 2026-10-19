// Inspect only explicit visible calculator controls. No screen-coordinate guesses.
export function brokerKeypadBridge({action='find',marker}){
 const roots=[document],seen=new Set(roots);let visited=0;
 for(let i=0;i<roots.length&&visited<6000;i++){const walk=document.createTreeWalker(roots[i],NodeFilter.SHOW_ELEMENT);let e;while((e=walk.nextNode())&&visited++<6000)if(e.shadowRoot&&!seen.has(e.shadowRoot)){seen.add(e.shadowRoot);roots.push(e.shadowRoot);}}
 const outside=e=>{for(let p=e;p;p=p.parentElement||p.getRootNode()?.host)if(p.id==='sentinel-trading-overlay-host')return false;return true;};
 const visible=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return b.width>0&&b.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&outside(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true';};
 const query=s=>[...new Set(roots.flatMap(r=>[...r.querySelectorAll(s)]))].filter(visible);
 const text=e=>String(e.textContent||'').trim();
 const label=e=>[e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-testid'),e.getAttribute('data-test'),e.getAttribute('data-key'),e.getAttribute('data-digit'),e.getAttribute('class'),e.querySelector('svg')?.getAttribute('class'),e.querySelector('svg')?.getAttribute('data-icon'),text(e)].filter(Boolean).join(' ');
 const controls=query('button,[role="button"],[data-key],[data-digit],[class*="key" i],[class*="calculator" i]');
 const key=e=>{const t=e.getAttribute('data-key')??e.getAttribute('data-digit')??text(e);if(/^[0-9]$/.test(t))return t;if(/^[.,]$/.test(t))return'.';if(/^(?:⌫|←|backspace|delete|apagar|borrar)$/i.test(t)||/backspace|delete-last|apagar|borrar/i.test(label(e)))return'backspace';if(/^(?:AC|C|clear|limpar)$/i.test(t)||/clear-all|limpar/i.test(label(e)))return'clear';return null;};
 const deepest=items=>items.filter(e=>!items.some(q=>q!==e&&e.contains(q)));
 const candidates=[];
 for(const seven of controls.filter(e=>key(e)==='7'))for(let p=seven.parentElement,depth=0;p&&depth<5&&p!==document.body&&p!==document.documentElement;p=p.parentElement,depth++){
  const keys=controls.filter(e=>p.contains(e)),byKey={};for(const k of ['0','1','2','3','4','5','6','7','8','9','.','backspace','clear']){const all=deepest(keys.filter(e=>key(e)===k));if(all.length===1)byKey[k]=all[0];}
  if('0123456789'.split('').every(k=>byKey[k])&&(byKey.backspace||byKey.clear)){candidates.push({root:p,keys:byKey});break;}
 }
 const unique=candidates.filter((x,i)=>candidates.findIndex(y=>y.root===x.root)===i);
 if(action==='opener'){
  // Icons must expose a calculator label/class/test ID, never a guessed location.
  const all=deepest(query('button,[role="button"],[title],[aria-label],[data-testid],[data-test],[class*="calculator" i]').filter(e=>/calculator|calculadora|calculatrice|calculadora/i.test(label(e))&&text(e).length<50));
  if(all.length!==1)return{error:'Ícone da calculadora não acessível de forma única neste painel.'};
  const e=all[0].closest('button,[role="button"]')||all[0];e.setAttribute('data-sentinel-calculator-open',marker);return{selector:'[data-sentinel-calculator-open="'+marker+'"]'};
 }
 if(unique.length!==1)return{code:unique.length?'ambiguous-keypad':'keypad-unavailable',error:'Calculadora sem teclas acessíveis identificadas. O valor não foi alterado.'};
 unique[0].root.setAttribute('data-sentinel-calculator-root','1');
 const result={keys:{}};for(const [k,e] of Object.entries(unique[0].keys)){const tag=marker+'-'+(k==='.'?'decimal':k);e.setAttribute('data-sentinel-calculator-key',tag);result.keys[k]='[data-sentinel-calculator-key="'+tag+'"]';}return result;
}
export class BrokerKeypad{
 constructor(driver){this.driver=driver;this.serial=Promise.resolve();}
 async keys(provider,frame){
  const marker='keypad-'+Math.random().toString(36).slice(2);let found=await frame.evaluate(brokerKeypadBridge,{marker});
  if(found.code==='keypad-unavailable'){
   const opener=await frame.evaluate(brokerKeypadBridge,{action:'opener',marker});if(opener.error)throw Error(opener.error);
   await frame.locator(opener.selector).click({timeout:500,noWaitAfter:true});
   for(let i=0;i<8;i++){found=await frame.evaluate(brokerKeypadBridge,{marker});if(found.code!=='keypad-unavailable')break;await new Promise(r=>setTimeout(r,25));}
  }
  if(found.error)throw Error(found.error);return found.keys;
 }
 async write(provider,frame,amount){
  const value=String(amount);if(!/^\d{1,7}(?:\.\d{1,6})?$/.test(value))throw Error('Valor inválido para a calculadora.');
  const keys=await this.keys(provider,frame),click=async k=>{if(!keys[k])throw Error('Tecla da calculadora não identificada: '+k);await frame.locator(keys[k]).click({timeout:500,noWaitAfter:true});};
  if(value.includes('.')&&!keys['.'])throw Error('Separador decimal da calculadora não identificado.');
  if(keys.clear)await click('clear');else for(let i=0;i<16;i++)await click('backspace');
  for(const k of value)await click(k);
 }
}
// Physical typing is forwarded only after a click on a verified broker amount
// control. Other fields, hotkeys and the Sentinel panel remain untouched.
export function installBrokerKeypadTyping(){
 if(window.__sentinelKeypadTyping)return;window.__sentinelKeypadTyping=true;let selected=false,replace=false;
 const inOverlay=e=>e.composedPath().some(n=>n?.id==='sentinel-trading-overlay-host');
 document.addEventListener('pointerdown',e=>{if(inOverlay(e)){selected=false;return;}const amount=e.composedPath().some(n=>n?.getAttribute?.('data-sentinel-keypad-amount')==='1'),keypad=e.composedPath().some(n=>n?.hasAttribute?.('data-sentinel-calculator-root')||n?.hasAttribute?.('data-sentinel-calculator-open'));selected=amount||selected&&keypad;if(!keypad)replace=false;},true);
 document.addEventListener('focusin',e=>{const p=e.composedPath();if(p.some(n=>n?.matches?.('input,textarea,select,[contenteditable="true"]'))&&!p.some(n=>n?.getAttribute?.('data-sentinel-keypad-amount')==='1'||n?.hasAttribute?.('data-sentinel-calculator-root')))selected=false;},true);
 document.addEventListener('keydown',e=>{
  if(window.__sentinelKeypadBotBusy||!selected||inOverlay(e)||e.altKey||e.metaKey&&!/^[aA]$/.test(e.key)||e.ctrlKey&&!/^[aA]$/.test(e.key))return;
  if((e.ctrlKey||e.metaKey)&&/^[aA]$/.test(e.key)){e.preventDefault();replace=true;return;}
  const key=/^[0-9]$/.test(e.key)?e.key:/^[.,]$/.test(e.key)?'.':e.key==='Backspace'?'backspace':['Enter','Escape','Tab'].includes(e.key)?'close':null;if(!key)return;
  e.preventDefault();e.stopPropagation();const clearFirst=replace;replace=false;
  Promise.resolve(window.__sentinelOverlayAction?.({action:'executor-keypad-key',key,clearFirst})).catch(error=>{window.__sentinelKeypadTypingError=String(error?.message||error);});if(key==='close')selected=false;
 },true);
}
// WASM/canvas panels can leave focus on the analyst or document body after a
// click. Restore only that canvas's native keyboard target; never replace a
// focused real/hidden editor and never manufacture keyboard events.
export function installCanvasKeyboardFocus(){
 if(window.__sentinelCanvasKeyboardFocus)return;window.__sentinelCanvasKeyboardFocus=true;
 document.addEventListener('pointerdown',event=>{
  const path=event.composedPath();if(path.some(n=>n?.id==='sentinel-trading-overlay-host'))return;
  const canvas=path.find(n=>n?.tagName==='CANVAS');if(!canvas)return;
  requestAnimationFrame(()=>{
   let active=document.activeElement;for(let i=0;active?.shadowRoot?.activeElement&&i<12;i++)active=active.shadowRoot.activeElement;
   if(active&&(['INPUT','TEXTAREA','SELECT'].includes(active.tagName)||active.isContentEditable))return;
   if(active&&active!==document.body&&active!==document.documentElement&&active!==canvas&&active.id!=='sentinel-trading-overlay-host')return;
   if(!canvas.hasAttribute('tabindex'))canvas.setAttribute('tabindex','0');
   canvas.focus({preventScroll:true});
  });
 },true);
}

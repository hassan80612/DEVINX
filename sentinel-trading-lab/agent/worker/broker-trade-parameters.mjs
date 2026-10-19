// Page helpers only inspect explicit controls, excluding the analyst overlay.
// No broker protocol writes, coordinate guesses, balance scans or OCR.
export function brokerParameterBridge({kind,marker,point,action='find',expectedMs,mappedUnit=null}){
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('#sentinel-trading-overlay-host');};
 const fieldSelector='input:not([type="hidden"]):not([type="password"]),textarea,[contenteditable="true"],select,[role="combobox"]';
 const roots=[document],rootSet=new Set(roots);let focused=document.activeElement;
 for(let depth=0;focused?.shadowRoot&&depth<12;depth++){const root=focused.shadowRoot;if(!rootSet.has(root)){rootSet.add(root);roots.push(root);}if(!root.activeElement)break;focused=root.activeElement;}
 // Browser-native editors can live inside a component's open shadow root.
 // This bounded walk runs only when preparing/checking a selected entry.
 let visited=0;
 for(let i=0;i<roots.length&&visited<6000;i++){
  const walk=document.createTreeWalker(roots[i],NodeFilter.SHOW_ELEMENT);let e;
  while((e=walk.nextNode())&&visited++<6000){if(e.id==='sentinel-trading-overlay-host')continue;if(e.shadowRoot&&!rootSet.has(e.shadowRoot)){rootSet.add(e.shadowRoot);roots.push(e.shadowRoot);}}
 }
 const query=selector=>[...new Set(roots.flatMap(root=>[...root.querySelectorAll(selector)]))].filter(e=>{for(let n=e;n;){if(n.id==='sentinel-trading-overlay-host')return false;n=n.parentElement||n.getRootNode()?.host;}return true;});
 const editable=e=>['INPUT','TEXTAREA'].includes(e?.tagName)||e?.isContentEditable;
 if(action==='focused')return{focused:editable(focused)&&focused.getAttribute('data-sentinel-trade-'+kind)===marker};
 const label=e=>{
  const parts=[e.name,e.id,e.className,e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.getAttribute('data-testid'),e.getAttribute('data-test'),e.labels?.[0]?.textContent,e.closest('label')?.textContent];
  // Quadcode often labels the wrapper rather than its editable input.
  // Only read a small field container containing this single editor.
  for(let p=e.parentElement,depth=0;p&&depth<3;p=p.parentElement,depth++){
   if(p===document.body||p===document.documentElement||p.querySelectorAll(fieldSelector).length!==1)break;
   parts.push(p.className,p.getAttribute('data-test'),p.getAttribute('data-testid'),p.getAttribute('aria-label'),String(p.textContent||'').slice(0,150));
  }
  return parts.filter(Boolean).join(' ');
 };
 const money=text=>{let v=String(text??'').trim().replace(/^(?:R\$|US\$|USD|BRL|EUR|[$€£])\s*/i,'').replace(/\s/g,'');if(!/^[+]?\d[\d.,]*$/.test(v))return null;const c=v.lastIndexOf(','),d=v.lastIndexOf('.');if(c>=0&&d>=0)v=c>d?v.replace(/\./g,'').replace(',','.'):v.replace(/,/g,'');else if(c>=0)v=v.replace(',','.');const n=Number(v);return Number.isFinite(n)?n:null;};
 const duration=text=>{
  const t=String(text).trim().toLowerCase().replace(',','.');
  const m=t.match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec(?:onds?)?|seg(?:undos?)?|m|min(?:utes?|utos?)?)$/);
  return m?Number(m[1])*(m[2]==='ms'?1:/^m/.test(m[2])?60000:1000):null;
 };
 const unitOf=e=>e.getAttribute('data-duration-unit')||(/seconds|segundos|\(s\)/i.test(label(e))?'s':/minutes|minutos|\(min\)/i.test(label(e))?'min':null)||(kind==='duration'&&['s','min'].includes(mappedUnit)?mappedUnit:null);
 const value=e=>kind==='amount'?money(e.value??e.textContent):e.tagName==='SELECT'?duration(e.selectedOptions[0]?.textContent)??Number(e.selectedOptions[0]?.getAttribute('data-duration-ms')):duration((e.value??e.textContent)+' '+(unitOf(e)||''))??duration(e.value??e.textContent);
 if(action==='option'){
  const all=query('[role="option"], [role="menuitem"],button').filter(e=>visible(e)&&duration(e.textContent)===expectedMs);
  if(all.length!==1)return{error:'Expiração não disponível de forma única no painel da corretora.'};
  all[0].setAttribute('data-sentinel-duration-option',marker);return{selector:'[data-sentinel-duration-option="'+marker+'"]'};
 }
 let fields=query(fieldSelector).filter(e=>(visible(e)||(point&&e===focused&&editable(e)))&&!e.disabled&&!e.readOnly);
 if(point){
  // A canvas text editor must expose an actual focused editable input. Without
  // one we cannot verify its value and do not send a trade.
  fields=fields.filter(e=>{const r=e.getBoundingClientRect();return(e===focused&&editable(e))||(point.x>=r.left&&point.x<=r.right&&point.y>=r.top&&point.y<=r.bottom);});
 }else fields=fields.filter(e=>(kind==='amount'?/amount|invest(?:ment|imento)?|stake|valor|importe|montant|quantia/i:/duration|expir|tempo|dura[çc][aã]o/i).test(label(e)));
 if(fields.length!==1)return{code:fields.length?'ambiguous-editor':'editor-not-ready',error:kind==='amount'?'Campo de valor não identificado. Use Mapear controles.':'Campo de expiração não identificado. Use Mapear controles.'};
 const e=fields[0];e.setAttribute('data-sentinel-trade-'+kind,marker);
 const selector='[data-sentinel-trade-'+kind+'="'+marker+'"]';
 if(action==='read')return{value:value(e)};
 if(e.tagName==='SELECT'){
  const options=[...e.options].filter(o=>!o.disabled&&duration(o.textContent)===expectedMs);
  if(kind==='duration'&&options.length!==1)return{error:'A corretora não oferece esta expiração neste painel.'};
  return{selector,value:value(e),type:'select',optionValue:options[0]?.value};
 }
 if(!editable(e))return{selector,value:value(e),type:'popup'};
 const unit=unitOf(e);
 if(kind==='duration'&&!unit&&duration(e.value??e.textContent)==null)return{error:'Unidade da expiração não identificada. Não foi enviada entrada.'};
 return{selector,value:value(e),type:'input',keyboard:!!point&&e===focused,text:kind==='amount'?null:unit==='ms'?String(expectedMs):unit==='s'?String(expectedMs/1000):unit==='min'?String(expectedMs/60000):(expectedMs/1000+' s'),unit};
}

export class BrokerTradeParameters{
 constructor(driver){this.driver=driver;}
 async apply(provider,controls,expected){
  const frame=controls.frame,page=this.driver.sessions.get(provider)?.page;
  const desired={amount:expected.amount,duration:expected.durationMs};
  for(const kind of ['amount','duration']){
   const point=controls.positions?.[kind];
   let viewportPoint;
   if(point){
    const box=await frame.locator(controls.canvasSelector).boundingBox();
    if(!box)throw Error('Painel da corretora indisponível.');
    viewportPoint={x:box.x+point.x,y:box.y+point.y};
    await page.mouse.click(viewportPoint.x,viewportPoint.y);
   }
   const marker='sentinel-'+kind+'-'+Math.random().toString(36).slice(2),args={kind,marker,point:viewportPoint,expectedMs:expected.durationMs,mappedUnit:controls.durationUnit};
   const inspect=async(action='find')=>{
    let field;
    for(let attempt=0;attempt<10;attempt++){
     field=await frame.evaluate(brokerParameterBridge,{...args,action});
     if(!point||field.code!=='editor-not-ready')break;
     await new Promise(resolve=>setTimeout(resolve,30));
    }
    return field;
   };
   let field=await inspect();
   if(field.error)throw Error(field.error);
   const locator=frame.locator(field.selector);
   if(Number.isFinite(field.value)&&Math.abs(field.value-desired[kind])<0.000001){if(point&&field.type==='input')await page.keyboard.press('Tab');continue;}
   if(field.type==='select')await locator.selectOption(field.optionValue,{timeout:500});
   else if(field.type==='input'){
    const text=kind==='amount'?String(desired[kind]):field.text;
    if(field.keyboard){
     const focus=await frame.evaluate(brokerParameterBridge,{...args,action:'focused'});
     if(!focus.focused)throw Error('Editor da corretora perdeu o foco antes de digitar o valor.');
     await page.keyboard.press('ControlOrMeta+A');
     await page.keyboard.type(text,{delay:0});
     await page.keyboard.press('Tab');
    }else{await locator.fill(text,{timeout:500});await locator.press('Tab',{timeout:500});}
   }else{
    if(!point)await locator.click({timeout:500,noWaitAfter:true});
    const option=await frame.evaluate(brokerParameterBridge,{...args,action:'option'});
    if(option.error)throw Error(option.error);
    await frame.locator(option.selector).click({timeout:500,noWaitAfter:true});
   }
   // Values must survive blur/re-render, not merely be typed into an editor.
   if(point)await page.mouse.click(viewportPoint.x,viewportPoint.y);
   let actual=await inspect('read');
   if(point&&field.type==='input')await page.keyboard.press('Tab');
   if(actual.error||!Number.isFinite(actual.value)||Math.abs(actual.value-desired[kind])>0.000001)throw Error(kind==='amount'?'Valor da entrada não confirmado no painel da corretora.':'Expiração não confirmada no painel da corretora.');
  }
  return{amount:expected.amount,durationMs:expected.durationMs};
 }
}

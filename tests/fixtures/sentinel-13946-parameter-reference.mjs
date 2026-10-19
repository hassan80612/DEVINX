// Page helpers only inspect explicit controls, excluding the analyst overlay.
// No broker protocol writes, coordinate guesses, balance scans or OCR.
export function brokerParameterBridge({kind,marker,point,action='find',expectedMs}){
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!e.closest('#sentinel-trading-overlay-host');};
 const label=e=>[e.name,e.id,e.getAttribute('aria-label'),e.getAttribute('data-testid'),e.getAttribute('data-test'),e.labels?.[0]?.textContent,e.closest('label')?.textContent].filter(Boolean).join(' ');
 const duration=text=>{
  const t=String(text).trim().toLowerCase().replace(',','.');
  const m=t.match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec(?:onds?)?|seg(?:undos?)?|m|min(?:utes?|utos?)?)$/);
  return m?Number(m[1])*(m[2]==='ms'?1:/^m/.test(m[2])?60000:1000):null;
 };
 const unitOf=e=>e.getAttribute('data-duration-unit')||(/seconds|segundos|\(s\)/i.test(label(e))?'s':/minutes|minutos|\(min\)/i.test(label(e))?'min':null);
 const value=e=>kind==='amount'?Number(String(e.value).replace(',','.')):e.tagName==='SELECT'?duration(e.selectedOptions[0]?.textContent)??Number(e.selectedOptions[0]?.getAttribute('data-duration-ms')):duration((e.value??e.textContent)+' '+(unitOf(e)||''))??duration(e.value??e.textContent);
 if(action==='option'){
  const all=[...document.querySelectorAll('[role="option"], [role="menuitem"],button')].filter(e=>visible(e)&&duration(e.textContent)===expectedMs);
  if(all.length!==1)return{error:'Expiração não disponível de forma única no painel da corretora.'};
  all[0].setAttribute('data-sentinel-duration-option',marker);return{selector:'[data-sentinel-duration-option="'+marker+'"]'};
 }
 let fields=[...document.querySelectorAll('input:not([type="hidden"]),select,[role="combobox"]')].filter(e=>visible(e)&&!e.disabled&&!e.readOnly);
 if(point){
  // A canvas text editor must expose an actual focused editable input. Without
  // one we cannot verify its value and do not send a trade.
  const focused=document.activeElement;
  fields=fields.filter(e=>{const r=e.getBoundingClientRect();return(e===focused&&e.tagName==='INPUT')||(point.x>=r.left&&point.x<=r.right&&point.y>=r.top&&point.y<=r.bottom);});
 }else fields=fields.filter(e=>(kind==='amount'?/amount|invest(?:ment)?|stake|valor|importe|montant/i:/duration|expir|tempo|dura[çc][aã]o/i).test(label(e)));
 if(fields.length!==1)return{error:kind==='amount'?'Campo de valor não identificado. Use Mapear controles.':'Campo de expiração não identificado. Use Mapear controles.'};
 const e=fields[0];e.setAttribute('data-sentinel-trade-'+kind,marker);
 const selector='[data-sentinel-trade-'+kind+'="'+marker+'"]';
 if(action==='read')return{value:value(e)};
 if(e.tagName==='SELECT'){
  const options=[...e.options].filter(o=>!o.disabled&&duration(o.textContent)===expectedMs);
  if(kind==='duration'&&options.length!==1)return{error:'A corretora não oferece esta expiração neste painel.'};
  return{selector,value:value(e),type:'select',optionValue:options[0]?.value};
 }
 if(e.tagName!=='INPUT')return{selector,value:value(e),type:'popup'};
 const unit=unitOf(e);
 if(kind==='duration'&&!unit&&duration(e.value)==null)return{error:'Unidade da expiração não identificada. Não foi enviada entrada.'};
 return{selector,value:value(e),type:'input',text:kind==='amount'?null:unit==='ms'?String(expectedMs):unit==='s'?String(expectedMs/1000):unit==='min'?String(expectedMs/60000):(expectedMs/1000+' s'),unit};
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
   const marker='sentinel-'+kind+'-'+Math.random().toString(36).slice(2),args={kind,marker,point:viewportPoint,expectedMs:expected.durationMs};
   let field=await frame.evaluate(brokerParameterBridge,args);
   if(field.error)throw Error(field.error);
   const locator=frame.locator(field.selector);
   if(Math.abs(field.value-desired[kind])<0.000001){if(point&&field.type==='input')await locator.press('Tab',{timeout:500});continue;}
   if(field.type==='select')await locator.selectOption(field.optionValue,{timeout:500});
   else if(field.type==='input'){
    await locator.fill(kind==='amount'?String(desired[kind]):field.text,{timeout:500});
    await locator.press('Tab',{timeout:500});
   }else{
    if(!point)await locator.click({timeout:500,noWaitAfter:true});
    const option=await frame.evaluate(brokerParameterBridge,{...args,action:'option'});
    if(option.error)throw Error(option.error);
    await frame.locator(option.selector).click({timeout:500,noWaitAfter:true});
   }
   // Values must survive blur/re-render, not merely be typed into an editor.
   if(point)await page.mouse.click(viewportPoint.x,viewportPoint.y);
   let actual=await frame.evaluate(brokerParameterBridge,{...args,action:'read'});
   if(point&&field.type==='input')await frame.locator(field.selector).press('Tab',{timeout:500});
   if(actual.error||!Number.isFinite(actual.value)||Math.abs(actual.value-desired[kind])>0.000001)throw Error(kind==='amount'?'Valor da entrada não confirmado no painel da corretora.':'Expiração não confirmada no painel da corretora.');
  }
  return{amount:expected.amount,durationMs:expected.durationMs};
 }
}

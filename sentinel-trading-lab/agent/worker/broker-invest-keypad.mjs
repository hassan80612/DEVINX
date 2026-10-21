// Unique native Invest field locator. This never clicks or sends an order.
export function findBrokerInvestInput({marker,mappedSelector=null}={}){
 const parse=raw=>{
  let s=String(raw??'').trim().replace(/[\s\u00a0]/g,'').replace(/^(R\$|US\$|\$|€|£)/,'');
  if(!s||!/^[0-9][0-9.,]*$/.test(s))return null;
  const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
  if(comma>=0&&dot>=0)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(comma>=0)s=s.replace(',','.');
  const amount=Number(s);
  return Number.isFinite(amount)&&amount>0&&amount<=1000000?amount:null;
 };
 const elements=mappedSelector?[...document.querySelectorAll(mappedSelector)]:[...document.querySelectorAll('input:not([type="hidden"]):not([type="password"]),[role="spinbutton"][contenteditable="true"]')];
 const candidates=elements.filter(el=>{
  if(el.disabled||el.readOnly||el.getAttribute('aria-readonly')==='true'||el.closest('[inert],[aria-hidden="true"],#sentinel-trading-overlay-host'))return false;
  const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
  if(rect.width<20||rect.height<10||style.display==='none'||style.visibility==='hidden')return false;
  const tag=[el.id,el.name,el.getAttribute('data-test'),el.getAttribute('data-testid'),el.getAttribute('aria-label'),el.getAttribute('placeholder'),el.closest('label')?.textContent,el.parentElement?.getAttribute('data-test'),el.parentElement?.getAttribute('data-testid')].filter(Boolean).join(' ').toLowerCase();
  return (mappedSelector||/\b(amount|investment|investimento|invest|stake|trade.?size|valor|importe|montant|quantia|sum.?value|deal.?amount)\b/i.test(tag))&&
   !/(balance|saldo|payout|profit|lucro|bonus|retorno|withdraw|deposit|multiplier|martingale)/i.test(tag);
 });
 if(candidates.length!==1||!marker)return{count:candidates.length};
 const el=candidates[0],value=parse(el.value??el.textContent);
 if(value==null)return{count:1,value:null};
 el.setAttribute('data-sentinel-invest-editor',String(marker));
 return{count:1,value,marker:String(marker),selector:'[data-sentinel-invest-editor="'+String(marker)+'"]'};
}
export function readSelectedInvestInput({marker}={}){
 if(!marker)return null;
 const el=[...document.querySelectorAll('[data-sentinel-invest-editor]')].filter(x=>x.getAttribute('data-sentinel-invest-editor')===marker);
 if(el.length!==1)return null;
 let s=String(el[0].value??el[0].textContent??'').trim().replace(/[\s\u00a0]/g,'').replace(/^(R\$|US\$|\$|€|£)/,'');
 if(!s||!/^[0-9][0-9.,]*$/.test(s))return null;
 const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
 if(comma>=0&&dot>=0)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(comma>=0)s=s.replace(',','.');
 const n=Number(s);
 return Number.isFinite(n)&&n>0&&n<=1000000?n:null;
}

function stableInvestSelector(el){
 const quote=v=>JSON.stringify(String(v));
 for(const [key,value] of [
  ['id',el.id],['data-testid',el.getAttribute('data-testid')],
  ['data-test',el.getAttribute('data-test')],['name',el.name],
  ['aria-label',el.getAttribute('aria-label')]
 ]){
  if(!value||String(value).length>120)continue;
  const selector='['+key+'='+quote(value)+']';
  try{if(document.querySelectorAll(selector).length===1)return selector}catch{}
 }
 return null;
}
// The listener is armed by an explicit click on "Mapear Invest".
// No default keyboard changes, no propagation blocking, no polling.
export function stageInvestMapping(){
 window.__sentinelInvestMapCleanup?.();
 window.__sentinelInvestSelection=null;
 const capture=event=>{
  const el=event.target?.closest?.('input:not([type="hidden"]):not([type="password"]),[role="spinbutton"][contenteditable="true"]');
  if(!el||el.disabled||el.readOnly||el.closest('[aria-hidden="true"],[inert],#sentinel-trading-overlay-host'))return;
  if(el.getAttribute('aria-readonly')==='true')return;
  const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
  if(rect.width<20||rect.height<10||style.display==='none'||style.visibility==='hidden')return;
  const selector=stableInvestSelector(el);
  if(!selector)return;
  window.__sentinelInvestSelection={selector,at:Date.now()};
  document.removeEventListener('click',capture,true);
  window.__sentinelInvestMapCleanup=null;
 };
 document.addEventListener('click',capture,true);
 window.__sentinelInvestMapCleanup=()=>document.removeEventListener('click',capture,true);
 return{ok:true};
}
export function collectedInvestMapping(){
 const selected=window.__sentinelInvestSelection;
 if(!selected||!selected.selector||Date.now()-selected.at>120000)return null;
 const info=findBrokerInvestInput({marker:'verify-mapped',mappedSelector:selected.selector});
 return info?.count===1&&info?.selector?{selector:selected.selector,value:info.value}:null;
}

export function stopInvestMapping(){
 if(typeof window.__sentinelInvestMapCleanup==='function')window.__sentinelInvestMapCleanup();
 window.__sentinelInvestMapCleanup=null;
 return true;
}

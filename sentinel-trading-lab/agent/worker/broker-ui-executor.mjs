import {randomUUID} from 'node:crypto';
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const clean=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const errorBefore=message=>Object.assign(new Error(message),{beforeClick:true});
export function isExecutionFrame(frame){return /option|position-changed|order-changed|buyv3/i.test(String(frame?.name||'')+' '+String(frame?.msg?.name||''));}
export function settlementFromFrame(provider,frame,known){
 const name=String(frame?.msg?.name||frame?.name||'').toLowerCase();
 const m=frame?.msg?.body??frame?.msg??frame?.body;
 if(!m||typeof m!=='object')return null;
 const ids=[m.id,m.option_id,m.position_id,m.external_id].filter(x=>x!=null).map(String);
 if(!ids.includes(String(known.orderId)))return null;
 const account=m.user_balance_id??m.balance_id;
 if(account!=null&&String(account)!==String(known.accountId))return null;
 const stake=m.amount??m.invest;
 if(stake!=null&&(!finite(stake)||Math.abs(Number(stake)-known.amount)>0.000001))return null;
 let gross=null;
 // Both fields are gross returns in these specific option settlement frames.
 // Never infer a settlement from quotes, debit events, or a generic 'profit'.
 if(name==='option-closed'&&finite(m.profit_amount))gross=Number(m.profit_amount);
 if(name==='position-changed'&&m.status==='closed'&&finite(m.close_profit)&&finite(m.invest))gross=Number(m.close_profit);
 if(gross===null||gross<0)return null;
 return{provider,accountId:known.accountId,orderId:known.orderId,netPnl:gross-known.amount};
}

// Executed inside the broker page only at activation / selected entry.
// This scans controls, not chart/candles/body text. No timer is installed.
export function inspectTradeControls({marker}){
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[aria-hidden="true"]');};
 const text=e=>[e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-test'),e.getAttribute('data-testid'),e.name,e.id,e.textContent].filter(Boolean).join(' ').trim();
 const buttons=[...document.querySelectorAll('button,[role="button"],input[type="button"]')].filter(visible);
 const accountLabels=[...buttons,...document.querySelectorAll('[aria-selected="true"],[aria-current="true"],[data-testid*="current-account"],[data-test*="current-account"]')].filter(visible).map(e=>text(e)).filter(t=>t.length<160);
 const accountModes=new Set();
 for(const t of accountLabels){if(/conta de pr[áa]tica|conta demo|practice account|demo account|cuenta (?:de )?(?:pr[áa]ctica|demo)|compte d[ée]mo/i.test(t))accountModes.add('demo');if(/conta real|real account|live account|cuenta real|compte r[ée]el/i.test(t))accountModes.add('real');}
 const accountMode=accountModes.size===1?[...accountModes][0]:null;
 const choose=(direction)=>buttons.filter(e=>{
  const t=text(e).toLowerCase(),words=direction==='CALL'?'call|higher|acima|arriba|subir|up':'put|lower|abaixo|abajo|bajar|down';
  return new RegExp('(?:^|[\\s_-])(?:'+words+')(?:$|[\\s_-])','i').test(t)&&!/(?:payout|layout|setup|input|group|dropdown)/i.test(t)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true';
 });
 const call=choose('CALL'),put=choose('PUT');
 if(call.length!==1||put.length!==1){
  const next=buttons.filter(e=>/^(?:nova opera[çc][ãa]o|new (?:option|trade|operation)|nueva operaci[oó]n)$/i.test(String(e.textContent||'').trim()));
  if(next.length===1){next[0].setAttribute('data-sentinel-execution-next',marker);return{accountMode,nextSelector:'[data-sentinel-execution-next="'+marker+'"]'};}
  return{accountMode,error:'Botões CALL/PUT da corretora não identificados de forma única.'};
 }
 let root=call[0].parentElement;
 for(let i=0;i<9&&root&&!root.contains(put[0]);i++)root=root.parentElement;
 if(!root)return{accountMode,error:'Painel de negociação não identificado.'};
 const controls=[...root.querySelectorAll('input,select,[role="spinbutton"],[data-test],[data-testid]')].filter(visible);
 const description=e=>{
  const labels=e.labels?[...e.labels].map(l=>l.textContent).join(' '):'';
  return [e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-test'),e.getAttribute('data-testid'),e.getAttribute('placeholder'),e.name,e.id,labels].filter(Boolean).join(' ').toLowerCase();
 };
 const amounts=controls.filter(e=>e.matches('input,[role="spinbutton"]')&&/(?:amount|investment|investimento|valor|montante)/.test(description(e))&&!e.disabled);
 if(amounts.length!==1)return{accountMode,error:'Campo de valor da corretora não identificado de forma única.'};
 const durationFields=controls.filter(e=>/(?:duration|dura[çc][ãa]o|expir|holding[-_ ]?time|tempo)/.test(description(e)));
 const durations=[];
 for(const e of durationFields){
  const raw=String(e.matches('select')?e.selectedOptions?.[0]?.textContent:e.value||e.textContent||'').trim().toLowerCase();
  let ms=null,m=raw.match(/^(\d+(?:[.,]\d+)?)\s*(s|sec|secs|seg|segundos?|seconds?|m|min|mins|minutos?|minutes?)$/);
  if(m)ms=Number(m[1].replace(',','.'))*(/^s/.test(m[2])?1000:60000);
  // Plain seconds only when the field explicitly identifies its unit. A
  // clock such as 14:30 is NOT silently interpreted as a duration.
  if(ms===null&&/^\d+$/.test(raw)&&/(?:seconds|segundos|duration-seconds)/.test(description(e)))ms=Number(raw)*1000;
  if(ms>0)durations.push(ms);
 }
 const unique=[...new Set(durations)];
 if(unique.length!==1)return{accountMode,error:'Selecione na corretora uma duração explícita igual à do analista (ex.: 30 s).'};
 call[0].setAttribute('data-sentinel-execution-call',marker);put[0].setAttribute('data-sentinel-execution-put',marker);amounts[0].setAttribute('data-sentinel-execution-amount',marker);
 return{accountMode,callSelector:'[data-sentinel-execution-call="'+marker+'"]',putSelector:'[data-sentinel-execution-put="'+marker+'"]',amountSelector:'[data-sentinel-execution-amount="'+marker+'"]',durationMs:unique[0]};
}

export class BrokerUiExecutor{
 constructor(driver,{onSent=()=>{},onAccepted=()=>{},onRejected=()=>{},onSettlement=()=>{},onUnexpectedOrder=()=>{}}={}){
  this.driver=driver;this.onSent=onSent;this.onAccepted=onAccepted;this.onRejected=onRejected;this.onSettlement=onSettlement;this.onUnexpectedOrder=onUnexpectedOrder;this.attempt=null;this.orders=new Map();this.awaiting=new Map();
 }
 async controls(provider){
  const page=this.driver.sessions.get(provider)?.page;
  if(!page||page.isClosed?.())throw errorBefore('Janela da corretora não está conectada.');
  let found=null,frame=null;const modes=new Set();
  for(const f of page.frames()){
   let v;try{v=await f.evaluate(inspectTradeControls,{marker:randomUUID()});}catch{continue;}
   if(v?.accountMode)modes.add(v.accountMode);
   if(v?.callSelector||v?.nextSelector){if(found)throw errorBefore('Mais de um painel de negociação aberto.');found=v;frame=f;}
  }
  if(!found)throw errorBefore('CALL/PUT, valor ou duração não identificados. Confira o painel da corretora.');
  if(found.nextSelector){await frame.locator(found.nextSelector).click({timeout:700});found=await frame.evaluate(inspectTradeControls,{marker:randomUUID()});}
  if(found?.error||!found?.callSelector)throw errorBefore(found?.error||'Aguardando painel da nova operação.');
  return{frame,...found,accountMode:modes.size===1?[...modes][0]:null};
 }
 checkContext(provider,expected){
  const s=this.driver.state(provider);
  if(s.mode!==expected.mode||String(s.balanceId)!==String(expected.accountId)||clean(s.symbol)!==clean(expected.asset)||Number(s.activeId)!==Number(expected.activeId)||s.screenCandidateSymbol)throw errorBefore('Conta ou ativo mudou na corretora.');
  if(s.visibleAccountMode&&s.visibleAccountMode!==expected.mode)throw errorBefore('Conta visível diverge da conta confirmada.');
 }
 async prepare(provider,expected){this.checkContext(provider,expected);const controls=await this.controls(provider);if(controls.accountMode!==expected.mode)throw errorBefore('Conta DEMO/REAL visível não confirmada no painel da corretora.');if(controls.durationMs!==expected.durationMs)throw errorBefore('Duração da corretora diferente da duração do analista.');return{ready:true};}
 async execute(provider,order){
  if(this.attempt)throw errorBefore('Já existe uma entrada aguardando confirmação.');
  this.checkContext(provider,order);
  const c=await this.controls(provider);
  if(c.accountMode!==order.mode)throw errorBefore('Conta DEMO/REAL visível diverge da conta programada.');
  if(c.durationMs!==order.durationMs)throw errorBefore('Duração da corretora diferente da duração do analista.');
  const input=c.frame.locator(c.amountSelector);await input.fill(String(order.amount),{timeout:500});
  const entered=String(await input.inputValue({timeout:300})).replace(/\s/g,'').replace(',','.');
  if(!finite(entered)||Math.abs(Number(entered)-order.amount)>0.000001)throw errorBefore('O valor não foi aceito pela corretora.');
  this.checkContext(provider,order);if(!order.isValid())throw errorBefore('Sinal expirou ou bot foi parado antes da entrada.');
  let resolve,reject;const confirmation=new Promise((yes,no)=>{resolve=yes;reject=no;});
  // Attach a rejection handler immediately, before awaiting the browser click.
  confirmation.catch(()=>{});
  const attempt={provider,order,resolve,reject,requestId:null,at:Date.now()};this.attempt=attempt;
  const timer=setTimeout(()=>reject(new Error('Corretora não confirmou a entrada · bot parado, sem repetir clique.')),4500);
  try{
   order.clicked=true;
   await c.frame.locator(order.side==='CALL'?c.callSelector:c.putSelector).click({timeout:500,noWaitAfter:true});
   return await confirmation;
  }finally{clearTimeout(timer);if(this.attempt===attempt)this.attempt=null;}
 }
 observe(provider,frame,direction){
  if(!isExecutionFrame(frame))return;
  const name=String(frame?.msg?.name||frame?.name||'').toLowerCase();
  const body=frame?.msg?.body??frame?.msg??frame?.body;
  const rid=frame?.request_id==null?null:String(frame.request_id);
  const a=direction==='page-out'?this.attempt:this.awaiting.get(provider+'|'+rid);
  if(direction==='page-out'){
   if(!/(?:open-option|place-digital-option|buyv3)$/.test(name))return;
   if(!a||a.provider!==provider){this.onUnexpectedOrder();return;}
   if(a.requestId===rid)return;
   const account=body?.user_balance_id??body?.balance_id;
   const value=body?.price??body?.amount;
   const directionSide=({call:'CALL',put:'PUT',buy:'CALL',sell:'PUT'})[String(body?.direction||body?.action||'').toLowerCase()];
   const active=body?.active_id??body?.active;
   if(!rid||String(account)!==String(a.order.accountId)||!finite(value)||Math.abs(Number(value)-a.order.amount)>0.000001||
    (directionSide&&directionSide!==a.order.side)||(active!=null&&Number(active)!==Number(a.order.activeId))){a.reject(Error('Comando da corretora divergiu da entrada programada.'));return;}
   a.requestId=rid;this.awaiting.set(provider+'|'+rid,a);this.onSent(rid);return;
  }
  if(direction!=='page-in')return;
  if(a&&provider===a.provider&&rid&&rid===a.requestId){
   const id=body&&typeof body==='object'?(body.id??body.option_id??body.position_id):finite(body)?body:null;
   const failed=body?.isSuccessful===false||body?.success===false||body?.error||name==='error';
   if(failed){this.awaiting.delete(provider+'|'+rid);this.onRejected({provider,requestId:rid});a.reject(Object.assign(Error('Ordem rejeitada pela corretora.'),{brokerRejected:true}));return;}
   if(id!=null&&String(id)!=='0'&&String(id)!=='-1'){
    const result={accepted:true,requestId:rid,orderId:String(id)};
    const expires=body?.expiration_time??body?.expired;
    if(finite(expires))result.exitAt=Number(expires)<1e12?Number(expires)*1000:Number(expires);
    this.orders.set(provider+'|'+id,{...a.order,orderId:String(id)});
    this.awaiting.delete(provider+'|'+rid);
    this.onAccepted({...result,provider});a.resolve(result);
   }
  }
  if(!/option-closed|position-changed/.test(name))return;
  for(const [key,known] of this.orders){
   if(known.provider!==provider)continue;
   const result=settlementFromFrame(provider,frame,known);
   if(result){this.orders.delete(key);this.onSettlement(result);break;}
  }
 }
}

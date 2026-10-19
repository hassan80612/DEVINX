import {installBrokerKeypadTyping,installCanvasKeyboardFocus} from './broker-keypad.mjs';
import {BrokerTradeParameters} from './broker-trade-parameters.mjs';
import {randomUUID} from 'node:crypto';
import {normalizeCanvasBinding,canvasControlBridge} from './canvas-executor-targets.mjs';
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const clean=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const errorBefore=message=>Object.assign(new Error(message),{beforeClick:true});
export function isExecutionFrame(frame){return /option|position-changed|order-changed|buyv3|^error$/i.test(String(frame?.msg?.name||frame?.name||''));}
export function settlementFromFrame(provider,frame,known){
 const name=String(frame?.msg?.name||frame?.name||'').toLowerCase();
 const m=frame?.msg?.body??frame?.msg??frame?.body;
 if(!m||typeof m!=='object')return null;
 const ids=[m.id,m.option_id,m.position_id,m.external_id].filter(x=>x!=null).map(String);
 if(!ids.includes(String(known.orderId)))return null;
 const account=m.user_balance_id??m.balance_id;
 if(account!=null&&known.accountId!=null&&String(account)!==String(known.accountId))return null;
 const stake=m.amount??m.invest;
 if(stake!=null&&(!finite(stake)||Math.abs(Number(stake)-known.amount)>0.000001))return null;
 let gross=null;
 // Both fields are gross returns in these specific option settlement frames.
 // Never infer a settlement from quotes, debit events, or a generic 'profit'.
 if(name==='option-closed'&&finite(m.profit_amount))gross=Number(m.profit_amount);
 if(name==='position-changed'&&m.status==='closed'&&finite(m.close_profit)&&finite(m.invest))gross=Number(m.close_profit);
 if(gross===null||gross<0)return null;
 const opening=m.open_price??m.open_quote,closing=m.close_price??m.close_quote;
 return{provider,accountId:known.accountId??account??null,orderId:known.orderId,netPnl:gross-known.amount,source:'broker',...(finite(opening)&&Number(opening)>0?{entryPrice:Number(opening)}:{}),...(finite(closing)&&Number(closing)>0?{exitPrice:Number(closing)}:{})};
}

// Executed inside the broker page only at activation / selected entry.
// Direction controls are resolved separately from verified stake/expiry editors.
export function inspectTradeControls({marker}){
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[aria-hidden="true"]');};
 const text=e=>[e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-test'),e.getAttribute('data-testid'),e.getAttribute('data-direction'),e.className,e.name,e.id,e.value,e.textContent].filter(Boolean).join(' ').trim();
 const buttons=[...document.querySelectorAll('button,[role="button"],input[type="button"],[onclick],[ng-click],[data-direction],.call-btn,.put-btn,.btn-call,.btn-put,.button-call,.button-put')].filter(e=>visible(e)&&!e.closest('#sentinel-trading-overlay-host')&&!/^tel:/i.test(e.getAttribute('href')||''));
 const choose=(direction)=>buttons.filter(e=>{
  const t=text(e).toLowerCase(),words=direction==='CALL'?'call|higher|acima|arriba|subir|up':'put|lower|abaixo|abajo|bajar|down';
  return new RegExp('(?:^|[\\s_-])(?:'+words+')(?:$|[\\s_-])','i').test(t)&&!/(?:payout|layout|setup|input|group|dropdown)/i.test(t)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true';
 });
 // Nested label/wrapper and button represent one action, not two buttons.
 const deepest=items=>items.filter(e=>!items.some(other=>other!==e&&e.contains(other)));
 const call=deepest(choose('CALL')),put=deepest(choose('PUT'));
 if(call.length!==1||put.length!==1){
  const canvas=[...document.querySelectorAll('canvas')].some(visible);
  return{error:canvas?'Painel gráfico sem botões HTML. Use Mapear CALL/PUT nesta corretora.':'CALL: '+call.length+' · PUT: '+put.length+'. Botões não identificados de forma única.'};
 }
 call[0].setAttribute('data-sentinel-execution-call',marker);put[0].setAttribute('data-sentinel-execution-put',marker);
 return{callSelector:'[data-sentinel-execution-call="'+marker+'"]',putSelector:'[data-sentinel-execution-put="'+marker+'"]'};
}

export class BrokerUiExecutor{
 constructor(driver,{onSent=()=>{},onAccepted=()=>{},onRejected=()=>{},onSettlement=()=>{},onUnexpectedOrder=()=>{}}={}){
  this.parameters=new BrokerTradeParameters(driver);this.driver=driver;this.onSent=onSent;this.onAccepted=onAccepted;this.onRejected=onRejected;this.onSettlement=onSettlement;this.onUnexpectedOrder=onUnexpectedOrder;this.attempt=null;this.orders=new Map();this.awaiting=new Map();this.canvasBindings={};this.outboundSeen=new Set();
 }
 restoreBindings(value){for(const provider of ['iq_option','exnova'])if(value?.[provider])try{this.canvasBindings[provider]=normalizeCanvasBinding(value[provider]);}catch{}return this.canvasBindings;}
 async beginCalibration(provider){
  const page=this.driver.sessions.get(provider)?.page;if(!page||page.isClosed?.())throw errorBefore('Janela da corretora não está conectada.');
  const binding=this.canvasBindings[provider];let parametersOnly=false;
  if(binding){const check=await page.evaluate(canvasControlBridge,{action:'resolve',binding,marker:randomUUID()});parametersOnly=!check?.error;}
  const result=await page.evaluate(canvasControlBridge,{action:'calibrate',binding:parametersOnly?binding:null,parametersOnly,label:provider==='iq_option'?'IQ Option':'Exnova'});if(result?.error)throw errorBefore(result.error);return result;
 }
 async saveBinding(provider,value){
  if(!['iq_option','exnova'].includes(provider))throw errorBefore('Corretora inválida.');
  const binding=normalizeCanvasBinding(value),page=this.driver.sessions.get(provider)?.page;
  if(!page||page.isClosed?.())throw errorBefore('Janela da corretora não está conectada.');
  const resolved=await page.evaluate(canvasControlBridge,{action:'resolve',binding,marker:randomUUID()});if(resolved?.error)throw errorBefore(resolved.error);
  this.canvasBindings[provider]=binding;return this.canvasBindings;
 }
 async controls(provider){
  const page=this.driver.sessions.get(provider)?.page;
  if(!page||page.isClosed?.())throw errorBefore('Janela da corretora não está conectada.');
  if(this.canvasBindings[provider]){
   const found=await page.evaluate(canvasControlBridge,{action:'resolve',binding:this.canvasBindings[provider],marker:randomUUID()});
   if(found?.error)throw errorBefore(found.error);return{frame:page,...found};
  }
  let found=null,frame=null,reason=null;
  for(const f of page.frames()){
   let v;try{v=await f.evaluate(inspectTradeControls,{marker:randomUUID()});}catch{continue;}
   if(v?.error)reason=v.error;
   if(v?.callSelector){if(found)throw errorBefore('Mais de um painel de negociação aberto.');found=v;frame=f;}
  }
  if(!found)throw errorBefore(reason||'Botões CALL/PUT não identificados. Abra o painel de negociação.');
  if(found?.error||!found?.callSelector)throw errorBefore(found?.error||'Aguardando painel da nova operação.');
  return{frame,...found};
 }
 checkContext(provider,expected){
  const s=this.driver.state(provider);
  if(clean(s.symbol)!==clean(expected.asset)||Number(s.activeId)!==Number(expected.activeId)||s.screenCandidateSymbol)throw errorBefore('Ativo mudou na corretora.');
 }
 async prepare(provider,expected){this.checkContext(provider,expected);const controls=await this.controls(provider);await controls.frame.evaluate(installCanvasKeyboardFocus);await controls.frame.evaluate(installBrokerKeypadTyping);await this.applyParameters(provider,controls,expected);return{ready:true};}
 async manualKey(provider,{key,clearFirst=false},isAllowed=()=>false){
  if(!/^(?:[0-9]|\.|backspace|close)$/.test(String(key))||typeof clearFirst!=='boolean')throw errorBefore('Tecla inválida.');
  const work=async()=>{
   if(!isAllowed())throw errorBefore('Pare o bot antes de editar o valor manualmente.');
   const controls=await this.controls(provider),frame=controls.frame,page=this.driver.sessions.get(provider)?.page;
   const amount=frame.locator('[data-sentinel-keypad-amount="1"]');if(await amount.count()!==1)throw errorBefore('Campo de valor não identificado para o teclado.');
   if(key==='close'){await amount.click({timeout:500,noWaitAfter:true});return;}
   const keys=await this.parameters.keypad.keys(provider,frame);
   const click=async k=>{if(!isAllowed())throw errorBefore('Edição manual cancelada.');if(!keys[k])throw errorBefore('Tecla indisponível na calculadora.');await frame.locator(keys[k]).click({timeout:500,noWaitAfter:true});};
   if(clearFirst){if(keys.clear)await click('clear');else for(let i=0;i<16;i++)await click('backspace');}
   await click(key);return{ok:true};
  };
  const job=this.parameters.keypad.serial.catch(()=>{}).then(work);this.parameters.keypad.serial=job;return job;
 }
 async applyParameters(provider,controls,expected){
  if(controls.canvasSelector)await controls.frame.evaluate(canvasControlBridge,{action:'passthrough-on'});
  try{return await this.parameters.apply(provider,controls,expected);}
  catch(e){throw errorBefore(e.message);}
  finally{if(controls.canvasSelector)await controls.frame.evaluate(canvasControlBridge,{action:'passthrough-off'}).catch(()=>{});}
 }
 async execute(provider,order){
  this.checkContext(provider,order);
  let c=await this.controls(provider);
  await this.applyParameters(provider,c,order);
  // A committed stake/expiry can replace the broker button nodes.
  c=await this.controls(provider);
  this.checkContext(provider,order);if(!order.isValid())throw errorBefore('Sinal expirou ou bot foi parado antes da entrada.');
  if(this.attempt)throw errorBefore('Outra ordem está aguardando confirmação.');
  let resolve,reject;const confirmation=new Promise((yes,no)=>{resolve=yes;reject=no;});
  // Attach the handler before clicking; outgoing/ack events can be synchronous.
  confirmation.catch(()=>{});const attempt={provider,order,resolve,reject,requestId:null};this.attempt=attempt;
  const timer=setTimeout(()=>reject(Error('Clique enviado sem confirmação da ordem · não será repetido.')),8000);
  try{
  const beforeClick=()=>{this.checkContext(provider,order);if(!order.isValid())throw errorBefore('Entrada cancelada antes do clique.');order.captureEntry?.();order.clicked=true;};
  if(c.canvasSelector){
   await c.frame.evaluate(canvasControlBridge,{action:'passthrough-on'});
   try{beforeClick();await c.frame.locator(c.canvasSelector).click({position:c.positions[order.side],timeout:500,noWaitAfter:true});}
   finally{await c.frame.evaluate(canvasControlBridge,{action:'passthrough-off'}).catch(()=>{});}
  }
  else{beforeClick();await c.frame.locator(order.side==='CALL'?c.callSelector:c.putSelector).click({timeout:500,noWaitAfter:true});}
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
   const outboundKey=provider+'|'+rid;if(this.outboundSeen.has(outboundKey))return;this.outboundSeen.add(outboundKey);if(this.outboundSeen.size>512)this.outboundSeen.delete(this.outboundSeen.values().next().value);
   if(!a||a.provider!==provider){this.onUnexpectedOrder();return;}
   if(a.requestId===rid)return;
   const account=body?.user_balance_id??body?.balance_id;
   const value=body?.price??body?.amount;
   const directionSide=({call:'CALL',put:'PUT',buy:'CALL',sell:'PUT'})[String(body?.direction||body?.action||'').toLowerCase()];
   const active=body?.active_id??body?.active;
   if(!rid||!finite(value)||Math.abs(Number(value)-a.order.amount)>0.000001||
    (directionSide&&directionSide!==a.order.side)||(active!=null&&Number(active)!==Number(a.order.activeId))||(account!=null&&a.order.accountId!=null&&String(account)!==String(a.order.accountId))){a.reject(Error('Comando da corretora divergiu da entrada programada.'));return;}
   if(account!=null)a.order.accountId=String(account);
   a.requestId=rid;this.awaiting.set(provider+'|'+rid,a);if(this.awaiting.size>200)this.awaiting.delete(this.awaiting.keys().next().value);this.onSent(rid);return;
  }
  if(direction!=='page-in')return;
  if(a&&provider===a.provider&&rid&&rid===a.requestId){
   const id=body&&typeof body==='object'?(body.id??body.option_id??body.position_id??body.order_id):finite(body)?body:null;
   const failed=body?.isSuccessful===false||body?.success===false||body?.error||name==='error';
   if(failed){this.awaiting.delete(provider+'|'+rid);this.onRejected({provider,requestId:rid});a.reject(Object.assign(Error('Ordem rejeitada pela corretora.'),{brokerRejected:true}));return;}
   if(id!=null&&['string','number'].includes(typeof id)&&String(id)!=='0'&&String(id)!=='-1'){
    const result={accepted:true,requestId:rid,orderId:String(id),accountId:a.order.accountId??null};
    const opening=body?.open_price??body?.open_quote;
    if(finite(opening)&&Number(opening)>0)result.entryPrice=Number(opening);
    const expires=body?.expiration_time??body?.expired;
    if(finite(expires))result.exitAt=Number(expires)<1e12?Number(expires)*1000:Number(expires);
    this.orders.set(provider+'|'+id,{...a.order,provider,orderId:String(id)});
    if(this.orders.size>200)this.orders.delete(this.orders.keys().next().value);
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

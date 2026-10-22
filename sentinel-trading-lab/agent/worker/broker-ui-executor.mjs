import {randomUUID} from 'node:crypto';
import {normalizeCanvasBinding,canvasControlBridge} from './canvas-executor-targets.mjs';
import {readBrokerTradeStake} from './broker-trade-stake.mjs';
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const clean=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const errorBefore=message=>Object.assign(new Error(message),{beforeClick:true});
// Recognize individually identified and grouped close events. A single frame
// can contain more than one Martingale order; each still needs its own ID.
const frameNames=frame=>[frame?.msg?.name,frame?.name,frame?.msg?.body?.name,frame?.body?.name]
  .filter(x=>typeof x==='string').map(x=>x.toLowerCase().replace(/_/g,'-'));
const closingKind=frame=>{
 const names=frameNames(frame);
 if(names.some(n=>n.endsWith('option-closed')))return'option';
 if(names.some(n=>n.endsWith('position-changed')||n.endsWith('positions-changed')||n.endsWith('position-closed')||n.endsWith('positions-closed')))return'position';
 return null;
};
export function isExecutionFrame(frame){
 return frameNames(frame).some(n=>/option|positions?-(?:changed|closed)|orders?-(?:changed|closed)|buyv3|^error$/.test(n));
}
export function settlementFromFrame(provider,frame,known){
 const kind=closingKind(frame),root=frame?.msg?.body??frame?.msg??frame?.body;
 if(!kind||!root||typeof root!=='object'||known?.orderId==null)return null;
 const baseAccount=root.user_balance_id??root.balance_id??root.account_id??null;
 const queue=[{value:root,depth:0}],seen=new Set();
 for(let i=0;i<queue.length&&i<100;i++){
  const {value,depth}=queue[i];
  if(!value||typeof value!=='object'||seen.has(value))continue;
  seen.add(value);
  if(Array.isArray(value)){
   if(depth<4)for(const child of value.slice(0,40))queue.push({value:child,depth:depth+1});
   continue;
  }
  const ids=[value.id,value.option_id,value.position_id,value.external_id,value.order_id,value.optionId,value.positionId,value.externalId,value.orderId]
    .filter(x=>x!=null).map(String);
  if(ids.includes(String(known.orderId))){
   const account=value.user_balance_id??value.balance_id??value.account_id??baseAccount;
   if(account!=null&&known.accountId!=null&&String(account)!==String(known.accountId))return null;
   const stake=value.amount??value.invest;
   if(stake!=null&&(!finite(stake)||Math.abs(Number(stake)-Number(known.amount))>0.000001))return null;
   let gross=null;
   // Only known gross-return fields on identified closed option events.
   if(kind==='option'&&finite(value.profit_amount))gross=Number(value.profit_amount);
   if(kind==='position'&&(['closed','expired','settled'].includes(String(value.status||'').toLowerCase())||frameNames(frame).some(n=>n.endsWith('position-closed')||n.endsWith('positions-closed'))) &&
      finite(value.close_profit)&&finite(value.invest))gross=Number(value.close_profit);
   if(gross!==null&&gross>=0){
    const opening=value.open_price??value.open_quote,closing=value.close_price??value.close_quote;
    return{provider,accountId:known.accountId??account??null,orderId:known.orderId,
      netPnl:gross-Number(known.amount),source:'broker',
      ...(finite(opening)&&Number(opening)>0?{entryPrice:Number(opening)}:{}),
      ...(finite(closing)&&Number(closing)>0?{exitPrice:Number(closing)}:{})};
   }
  }
  if(depth<4)for(const key of ['body','option','position','options','positions','data','result','items']){
   const v=value[key];if(v&&typeof v==='object')queue.push({value:v,depth:depth+1});
  }
 }
 return null;
}

// Executed inside the broker page only at activation / selected entry.
// Only locates the direction buttons. Stake and duration are set by the user
// on the broker; the bot's corresponding values are for local accounting.
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

// Recovery is deliberately specific to Digital's post-settlement "New operation"
// control. Never use the CALL/PUT selectors or chart expiry for recovery.
export function inspectDigitalNewOperation({marker}){
 const seen=[...document.querySelectorAll('button,[role="button"],input[type="button"],[onclick]')];
 const visible=e=>{
  if(e.disabled||e.getAttribute('aria-disabled')==='true'||e.closest('[inert],[aria-hidden="true"],#sentinel-trading-overlay-host'))return false;
  const style=getComputedStyle(e),rect=e.getBoundingClientRect();
  return rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden';
 };
 const match=e=>{
  const text=[e.getAttribute('aria-label'),e.getAttribute('title'),e.value,e.textContent].map(x=>String(x||'').trim().replace(/\s+/g,' '));
  return text.some(t=>/^(nova opera[cç][aã]o|new operation|new trade|nueva operaci[oó]n|nouvelle op[eé]ration|neue operation)$/i.test(t));
 };
 const matches=seen.filter(e=>visible(e)&&match(e));
 if(matches.length!==1)return{found:false};
 matches[0].setAttribute('data-sentinel-digital-reopen',marker);
 return{found:true,selector:'[data-sentinel-digital-reopen="'+marker+'"]'};
}
// Only an outgoing order packet positively identified as Digital permits this
// recovery. A Blitz/binary packet is never sufficient, even if it uses the
// same broker and price feed.
export function isDigitalOrderPacket(name,body){
 const mode=String(body?.instrument_type??body?.instrumentType??body?.option_type??body?.optionType??'').toLowerCase();
 if(/\bblitz\b|\bbinary\b/.test(mode))return false;
 return /place-digital-option$/i.test(String(name||''))||/^(digital|digital-option|digital_option)$/.test(mode);
}

export class BrokerUiExecutor{
 constructor(driver,{onSent=()=>{},onAccepted=()=>{},onRejected=()=>{},onSettlement=()=>{},onUnexpectedOrder=()=>{},isBotEnabled=()=>true,ackTimeoutMs=8000}={}){
  this.driver=driver;this.isBotEnabled=isBotEnabled;this.digitalRearm=new Map();this.digitalRearming=new Map();this.onSent=onSent;this.onAccepted=onAccepted;this.onRejected=onRejected;this.onSettlement=onSettlement;this.onUnexpectedOrder=onUnexpectedOrder;this.attempt=null;this.orders=new Map();this.awaiting=new Map();this.canvasBindings={};this.outboundSeen=new Set();this.clickQueue=Promise.resolve();this.unidentifiedClick=null;this.retiredAttempts=[];this.recentCloseFrames=[];this.confirmedDispatchDurations=new Map();this.cachedHtmlControls=new Map();this.ackTimeoutMs=Number.isFinite(ackTimeoutMs)&&ackTimeoutMs>0?ackTimeoutMs:8000;
 }
 retireUnidentifiedBatch(batch){
  // Only after the expiry+grace timeout: release the execution mutex.
  // Retain the old attempt for a bounded best-effort late broker request
  // correlation, without issuing a second click.
  const a=this.unidentifiedClick||this.attempt;
  if(a&&batch?.orders?.some(p=>p.id===a.order?.id)&&a.order.clicked){
   this.retiredAttempts.push({attempt:a,expiresAt:Date.now()+300000});
   this.retiredAttempts=this.retiredAttempts.slice(-16);
   if(this.attempt===a)this.attempt=null;
   this.unidentifiedClick=null;
  }
 }
 retiredAttempt(provider,body){
  this.retiredAttempts=this.retiredAttempts.filter(p=>p.expiresAt>Date.now());
  const value=body?.price??body?.amount,active=body?.active_id??body?.active;
  const side=({call:'CALL',put:'PUT',buy:'CALL',sell:'PUT'})[String(body?.direction||body?.action||'').toLowerCase()];
  const account=body?.user_balance_id??body?.balance_id;
  const options=this.retiredAttempts.filter(p=>p.attempt.provider===provider&&
   finite(value)&&Math.abs(Number(value)-Number(p.attempt.order.amount))<0.000001&&
   side===p.attempt.order.side&&
   (active==null||Number(active)===Number(p.attempt.order.activeId))&&
   (account==null||p.attempt.order.accountId==null||String(account)===String(p.attempt.order.accountId)));
  return options.length===1?options[0].attempt:null;
 }
 // Time actually observed between beginning broker-control lookup and
 // a matching native broker page-out request. Never fabricate throughput.
 dispatchKey(provider,activeId){return String(provider)+'|'+String(activeId);}
 batchFeasibility(provider,{count,activeId,entryAt,now,maxEntryAgeMs=1500,maxBatchAgeMs=maxEntryAgeMs}={}){
  if(!Number.isInteger(count)||count<1)return{safe:false,reason:'Quantidade inválida de cliques'};
  const initialAge=Number(now)-Number(entryAt);
  const firstWindow=Number(maxEntryAgeMs);
  if(!Number.isFinite(initialAge)||initialAge<0||!Number.isFinite(firstWindow)||firstWindow<=0||initialAge>firstWindow)
   return{safe:false,reason:'Sinal antigo: primeiro clique fora do prazo'};
  if(count===1)return{safe:true,reason:'Primeiro clique no prazo'};
  // The entry freshness deadline applies to CLICK ONE only. Applying it
  // to the entire batch wrongly rejects nine sequential clicks at 30s expiry.
  const remaining=Number(entryAt)+Number(maxBatchAgeMs)-Number(now);
  if(!(remaining>0))return{safe:false,reason:'Janela de cliques encerrada'};
  const samples=(this.confirmedDispatchDurations.get(this.dispatchKey(provider,activeId))||[])
   .filter(x=>Number.isFinite(x)&&x>0).slice(-12);
  // Broker UI measurements are gathered only after real confirmed orders;
  // no data is NOT proof that the broker cannot fit a 3- or 9-click batch.
  // Unknown 27-click throughput stays disabled until calibrated.
  if(!samples.length)return count<=9?
   {safe:true,observedSamples:0,reason:'Velocidade ainda não medida · cada clique será verificado durante o envio'}:
   {safe:false,observedSamples:0,reason:'Sequência acima de 9 cliques exige velocidade medida'};
  // Use the recent 75th percentile (with 25% margin), not one historical
  // slow spike as though it were the speed of EVERY future click.
  const sorted=[...samples].sort((a,b)=>a-b);
  const p75=sorted[Math.ceil(sorted.length*.75)-1];
  const lastStartDelay=(count-1)*Math.ceil(p75*1.25);
  return lastStartDelay<remaining?
   {safe:true,estimatedLastClickDelayMs:lastStartDelay,observedSamples:samples.length}:
   {safe:false,estimatedLastClickDelayMs:lastStartDelay,observedSamples:samples.length,
    reason:'Sequência de '+count+' cliques excede a janela com a velocidade medida'};
 }
 restoreBindings(value){for(const provider of ['iq_option','exnova'])if(value?.[provider])try{this.canvasBindings[provider]=normalizeCanvasBinding(value[provider]);}catch{}return this.canvasBindings;}
 async beginCalibration(provider){
  const page=this.driver.sessions.get(provider)?.page;if(!page||page.isClosed?.())throw errorBefore('Janela da corretora não está conectada.');
  const result=await page.evaluate(canvasControlBridge,{action:'calibrate',label:provider==='iq_option'?'IQ Option':'Exnova'});if(result?.error)throw errorBefore(result.error);return result;
 }
 async saveBinding(provider,value){
  if(!['iq_option','exnova'].includes(provider))throw errorBefore('Corretora inválida.');
  const binding=normalizeCanvasBinding(value),page=this.driver.sessions.get(provider)?.page;
  if(!page||page.isClosed?.())throw errorBefore('Janela da corretora não está conectada.');
  const resolved=await page.evaluate(canvasControlBridge,{action:'resolve',binding,marker:randomUUID()});if(resolved?.error)throw errorBefore(resolved.error);
  this.canvasBindings[provider]=binding;return this.canvasBindings;
 }
 // Expiry safety: a native Digital "New operation" click may reset the
 // broker's manual expiration. Sentinel must NEVER click this control.
 // The user may reopen Digital in the broker; no analyst or timer gate is added.
 async recoverDigitalAfterClose(_provider){return false;}
 digitalOrderClosed(provider,known){
  if(known?.digitalTrade!==true)return;
  this.digitalRearm.delete(provider);
  this.cachedHtmlControls.delete(provider);
 }
 async controls(provider){
  const page=this.driver.sessions.get(provider)?.page;
  if(!page||page.isClosed?.())throw errorBefore('Janela da corretora não está conectada.');
  if(this.canvasBindings[provider]){
   const found=await page.evaluate(canvasControlBridge,{action:'resolve',binding:this.canvasBindings[provider],marker:randomUUID()});
   if(found?.error)throw errorBefore(found.error);return{frame:page,...found};
  }
  // Reuse already identified, still-visible broker HTML controls during
  // a batch instead of rescanning all frames for every click.
  const state=this.driver.state(provider);
  const token=String(state?.activeId)+'|'+clean(state?.symbol);
  const cached=this.cachedHtmlControls.get(provider);
  if(cached&&cached.page===page&&cached.token===token&&Date.now()-cached.at<=1200){
   try{
    // Validate both cached controls in ONE browser evaluation instead of
    // six separate Playwright roundtrips on every physical click. Keep the
    // same uniqueness, visibility and disabled-state requirements.
    const usable=await cached.frame.evaluate(({callSelector,putSelector})=>{
     const valid=selector=>{
      const nodes=document.querySelectorAll(selector);
      if(nodes.length!==1)return false;
      const el=nodes[0],style=getComputedStyle(el),rect=el.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&
       rect.width>0&&rect.height>0&&
       !el.matches(':disabled,[aria-disabled="true"],[inert]')&&
       !el.closest('[inert]')&&
       !el.closest('fieldset:disabled');
     };
     return valid(callSelector)&&valid(putSelector);
    },{callSelector:cached.callSelector,putSelector:cached.putSelector});
    if(usable)return{frame:cached.frame,callSelector:cached.callSelector,putSelector:cached.putSelector};
   }catch{}
  }
  this.cachedHtmlControls.delete(provider);
  let found=null,frame=null,reason=null;
  for(const f of page.frames()){
   let v;try{v=await f.evaluate(inspectTradeControls,{marker:randomUUID()});}catch{continue;}
   if(v?.error)reason=v.error;
   if(v?.callSelector){if(found)throw errorBefore('Mais de um painel de negociação aberto.');found=v;frame=f;}
  }
  if(!found)throw errorBefore(reason||'Botões CALL/PUT não identificados. Abra o painel de negociação.');
  if(found?.error||!found?.callSelector)throw errorBefore(found?.error||'Aguardando painel da nova operação.');
  this.cachedHtmlControls.set(provider,{page,token,frame,
   callSelector:found.callSelector,putSelector:found.putSelector,at:Date.now()});
  return{frame,...found};
 }
 checkContext(provider,expected){
  const s=this.driver.state(provider);
  if(clean(s.symbol)!==clean(expected.asset)||Number(s.activeId)!==Number(expected.activeId)||s.screenCandidateSymbol)throw errorBefore('Ativo mudou na corretora.');
 }
 async prepare(provider,expected){this.checkContext(provider,expected);const c=await this.controls(provider);const amount=typeof c?.frame?.evaluate==='function'?await c.frame.evaluate(readBrokerTradeStake).catch(()=>null):null;return{ready:true,amount};}
 async execute(provider,order){
  let yes,no,sentYes,sentNo,timer,timeoutResolve;
  const confirmation=new Promise((resolve,reject)=>{yes=resolve;no=reject;});confirmation.catch(()=>{});
  const sent=new Promise((resolve,reject)=>{sentYes=resolve;sentNo=reject;});sent.catch(()=>{});
  // A missing broker acknowledgement does NOT establish that the click
  // failed. Return a PENDING state, never click a second time to compensate.
  const timedOut=new Promise(resolve=>{timeoutResolve=resolve;});
  const attempt={provider,order,requestId:null,resolve:yes,reject:error=>{sentNo(error);no(error);},sent:sentYes};
  const click=this.clickQueue.catch(()=>{}).then(async()=>{
   // A physically clicked but unidentified order can still appear in the
   // broker. Never overlap its unresolved request with another click.
   if(this.unidentifiedClick?.order?.clicked&&!this.unidentifiedClick.requestId)
    throw errorBefore('Aguardando identificação de clique anterior; nenhuma entrada repetida.');
   attempt.dispatchStartedAt=Date.now();
   this.checkContext(provider,order);const c=await this.controls(provider);
   this.checkContext(provider,order);if(!order.isValid())throw errorBefore('Sinal expirou ou bot foi parado antes da entrada.');
   // No stake DOM roundtrip on the critical click path. Actual stake changes
   // arrive in the same existing native order packet and update the ledger.
   this.attempt=attempt;
   timer=setTimeout(()=>{
    timeoutResolve({pending:true,accepted:false,requestId:attempt.requestId,localId:order.id,
      message:'Clique aguardando confirmação da corretora · sem repetir'});
   },this.ackTimeoutMs);
   const before=()=>{this.checkContext(provider,order);if(!order.isValid())throw errorBefore('Entrada cancelada antes do clique.');order.captureEntry?.();order.clicked=true;};
   // Restrict Playwright's own click wait to remaining valid signal time.
   const clickTimeout=()=>Number.isFinite(Number(order.entryDeadlineAt))?
     Math.max(1,Math.min(500,Math.floor(Number(order.entryDeadlineAt)-Date.now()))):500;
   try{
    if(c.canvasSelector){await c.frame.evaluate(canvasControlBridge,{action:'passthrough-on'});try{before();await c.frame.locator(c.canvasSelector).click({position:c.positions[order.side],timeout:clickTimeout(),noWaitAfter:true});}finally{await c.frame.evaluate(canvasControlBridge,{action:'passthrough-off'}).catch(()=>{});}}
    else{before();await c.frame.locator(order.side==='CALL'?c.callSelector:c.putSelector).click({timeout:clickTimeout(),noWaitAfter:true});}
    // Do not await a broker socket frame forever. Late page-out and
    // page-in frames still reconcile this very order asynchronously.
    const seenRequest=await Promise.race([sent,timedOut]);
    if(seenRequest?.pending===true&&!attempt.requestId&&order.clicked){
     if(order.detached){
      this.retiredAttempts.push({attempt,expiresAt:Date.now()+300000});
      this.retiredAttempts=this.retiredAttempts.slice(-16);
      if(this.attempt===attempt)this.attempt=null;
     }else this.unidentifiedClick=attempt;
    }
   }finally{
    // If no page-out has yet arrived, retain only this pending attempt
    // so a late page-out can still acquire its broker request ID.
    if(this.attempt===attempt&&(!order.clicked||attempt.requestId))this.attempt=null;
   }
  }).catch(error=>{attempt.reject(error);throw error;});
  this.clickQueue=click.catch(()=>{});
  try{
   await click;
   return await Promise.race([confirmation,timedOut]);
  }finally{clearTimeout(timer);}
 }
 observe(provider,frame,direction){
  if(!isExecutionFrame(frame))return;
  const name=String(frame?.msg?.name||frame?.name||'').toLowerCase();
  const body=frame?.msg?.body??frame?.msg??frame?.body;
  const rawRequestId=frame?.request_id??frame?.requestId??frame?.msg?.request_id??frame?.msg?.requestId;
  const rid=rawRequestId==null?null:String(rawRequestId);
  const a=direction==='page-out'?(this.attempt||this.retiredAttempt(provider,body)):this.awaiting.get(provider+'|'+rid);
  if(direction==='page-out'){
   if(!/(?:open-option|place-digital-option|buyv3)$/.test(name))return;
   const outboundKey=provider+'|'+rid;if(this.outboundSeen.has(outboundKey))return;this.outboundSeen.add(outboundKey);if(this.outboundSeen.size>4096)this.outboundSeen.delete(this.outboundSeen.values().next().value);
   if(!a||a.provider!==provider){this.onUnexpectedOrder();return;}
   if(a.requestId===rid)return;
   const account=body?.user_balance_id??body?.balance_id;
   const value=body?.price??body?.amount;
   const directionSide=({call:'CALL',put:'PUT',buy:'CALL',sell:'PUT'})[String(body?.direction||body?.action||'').toLowerCase()];
   const active=body?.active_id??body?.active;
   // Broker's actual outgoing order is authoritative for accounting, including
   // changes to the trade-size input made after the bot was activated.
   if(!rid||!finite(value)||!(Number(value)>0)||
    (directionSide&&directionSide!==a.order.side)||(active!=null&&Number(active)!==Number(a.order.activeId))||(account!=null&&a.order.accountId!=null&&String(account)!==String(a.order.accountId))){a.reject(Error('Comando da corretora divergiu da entrada programada.'));return;}
   a.digitalTrade=isDigitalOrderPacket(name,body);
   a.order.useBrokerStake?.(Number(value),{confirmed:true});
   if(account!=null)a.order.accountId=String(account);
   a.requestId=rid;if(this.attempt===a)this.attempt=null;if(this.unidentifiedClick===a)this.unidentifiedClick=null;
   this.retiredAttempts=this.retiredAttempts.filter(p=>p.attempt!==a);
   const duration=Date.now()-Number(a.dispatchStartedAt||0);
   if(duration>0&&duration<=this.ackTimeoutMs){
    const key=this.dispatchKey(provider,a.order.activeId);
    const samples=this.confirmedDispatchDurations.get(key)||[];
    samples.push(duration);if(samples.length>32)samples.shift();
    this.confirmedDispatchDurations.set(key,samples);
   }
   this.awaiting.set(provider+'|'+rid,a);if(this.awaiting.size>2048)this.awaiting.delete(this.awaiting.keys().next().value);this.onSent(rid,a.order.id);a.sent?.();return;
  }
  if(direction!=='page-in')return;
  // A 15s option can CLOSE before a slow broker sends its order ACK.
  // Keep recent close packets briefly so a later identified order can be
  // settled from that SAME broker event, never from inferred candle prices.
  const closed=closingKind(frame);
  if(closed){
   this.recentCloseFrames=this.recentCloseFrames.filter(x=>Date.now()-x.at<=120000);
   this.recentCloseFrames.push({provider,frame,at:Date.now()});
   if(this.recentCloseFrames.length>60)this.recentCloseFrames.splice(0,this.recentCloseFrames.length-60);
  }
  if(a&&provider===a.provider&&rid&&rid===a.requestId){
   const id=body&&typeof body==='object'?(body.id??body.option_id??body.position_id??body.order_id):finite(body)?body:null;
   const failed=body?.isSuccessful===false||body?.success===false||body?.error||name==='error';
   if(failed){this.awaiting.delete(provider+'|'+rid);this.onRejected({provider,requestId:rid,localId:a.order.id});a.reject(Object.assign(Error('Ordem rejeitada pela corretora.'),{brokerRejected:true}));return;}
   if(id!=null&&['string','number'].includes(typeof id)&&String(id)!=='0'&&String(id)!=='-1'){
    const result={accepted:true,requestId:rid,orderId:String(id),accountId:a.order.accountId??null,localId:a.order.id};
    const opening=body?.open_price??body?.open_quote;
    if(finite(opening)&&Number(opening)>0)result.entryPrice=Number(opening);
    const expires=body?.expiration_time??body?.expired;
    if(finite(expires))result.exitAt=Number(expires)<1e12?Number(expires)*1000:Number(expires);
    const identified={...a.order,provider,orderId:String(id),digitalTrade:a.digitalTrade===true};
    this.orders.set(provider+'|'+id,identified);
    if(this.orders.size>2048)this.orders.delete(this.orders.keys().next().value);
    this.awaiting.delete(provider+'|'+rid);
    this.onAccepted({...result,provider});a.resolve(result);
    // Replay only an exact matching broker option/position ID and valid
    // payout from the previously buffered close packets.
    for(const cached of this.recentCloseFrames){
     if(cached.provider!==provider)continue;
     const settled=settlementFromFrame(provider,cached.frame,identified);
     if(settled){this.orders.delete(provider+'|'+id);this.onSettlement(settled);this.digitalOrderClosed(provider,identified);break;}
    }
   }
  }
  if(!closed)return;
  // Finish every identified child contained in a batched broker response.
  for(const [key,known] of [...this.orders]){
   if(known.provider!==provider)continue;
   const result=settlementFromFrame(provider,frame,known);
   if(result){this.orders.delete(key);this.onSettlement(result);this.digitalOrderClosed(provider,known);}
  }
 }
}

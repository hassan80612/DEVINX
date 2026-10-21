// Fixed broker stake. Martingale changes only the number of CALL/PUT clicks.
// An identified close for every order completes one progression step.
// Balance is optional; identified broker settlements control session loss limits.
import {ExecutorBalanceRisk} from './executor-balance-risk.mjs';
// Three increases after the normal 1-click entry. User-selected multiplier 2 or 3.
// Finishing the last complete losing batch cycles back to one normal click.
export const MAX_MARTINGALE_LEVELS=3;
export const MAX_SIGNAL_TO_CLICK_AGE_MS=Object.freeze({short:1600,thirty:6000,other:7000});
// Freshness of the FIRST broker entry differs from completion of an already
// started multi-click batch. Each broker click has its own 30s expiry.
export const MAX_BATCH_DISPATCH_MS=Object.freeze({five:850,short:1600,fifteen:2500,thirty:5000,other:8000});
export function maxSignalAgeMs(durationMs){
 const ms=Number(durationMs);
 // A broker DOM search is asynchronous. The previous 500/900/1500ms gate
 // repeatedly invalidated legitimate approved signals before the click.
 // Never wait this long intentionally: dispatch immediately and accept only
 // transport lag still within the ORIGINAL trade window.
 return Math.min(ms<=5000?1600:ms<=10000?2800:ms<=15000?4000:
   ms<=30000?MAX_SIGNAL_TO_CLICK_AGE_MS.thirty:MAX_SIGNAL_TO_CLICK_AGE_MS.other,
   Math.max(0,ms-250));
}
export function maxBatchDispatchMs(durationMs){
 const ms=Number(durationMs);
 return ms<=5000?MAX_BATCH_DISPATCH_MS.five:
  ms<=10000?MAX_BATCH_DISPATCH_MS.short:
  ms<=15000?MAX_BATCH_DISPATCH_MS.fifteen:
  ms<=30000?MAX_BATCH_DISPATCH_MS.thirty:MAX_BATCH_DISPATCH_MS.other;
}
export const DEFAULT_EXECUTOR_CONFIG=Object.freeze({amount:0,intervalMs:30000,directionMode:'automatic',stopAfterMinutes:0,stopLoss:0,martingaleLevels:2,martingaleMultiplier:2,martingaleEnabled:false,maxConsecutiveLosses:0});
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const symbol=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const money=x=>Math.round(Number(x)*1000000)/1000000;
export function executorSignal(analysis){
 const a=analysis?.vnext?.futureEntryAnchor;
 if(a?.phase!=='fired'||!['CALL','PUT'].includes(a.side)||!(Number(a.entryTriggeredAt)>0))return null;
 return{id:[a.context,a.entryTriggeredAt].join('|'),engineId:a.engineId??String(a.context||'').split('|').at(-2)??null,side:a.side,at:Number(a.entryTriggeredAt),exitAt:Number(a.exitAt),entryPrice:Number(a.confirmedEntryPrice??a.entryPrice??a.projectedEntryPrice),durationMs:Number(a.holdingSeconds??a.actualHoldingSeconds)*1000};
}
export class SignalExecutor{
 constructor({driver,context,clock=Date.now}={}){
  this.driver=driver;this.context=context;this.clock=clock;this.config={...DEFAULT_EXECUTOR_CONFIG};
  this.balanceRisk=new ExecutorBalanceRisk();this.executing=false;this.martingaleLevel=0;this.lastEntryAt=null;this.sessionId=0;
  this.nextScheduledAt=null;this.enabled=false;this.generation=0;this.message='Desligado';this.pending=null;this.unresolvedBatches=new Map();this.queuedSignal=null;this.seen=new Set();this.sequence=0;this.executed=0;this.closed=0;this.history=[];this.ledger=new Map();this.net=0;this.consecutiveLossBatches=0;this.suspensionReason=null;this.hardHoldReason=null;
 }
 configure(patch={}){
  if(this.arming)throw Error('Aguarde a ativação do bot concluir.');
  const next={...this.config};
  for(const key of Object.keys(DEFAULT_EXECUTOR_CONFIG))if(patch[key]!==undefined){if(key==='directionMode'){if(!['automatic','call','put'].includes(patch[key]))throw Error('Modo de direção inválido.');next[key]=patch[key];}else if(key==='martingaleEnabled'){if(typeof patch[key]!=='boolean')throw Error('Ativação de martingale inválida.');next[key]=patch[key];}else next[key]=Number(patch[key]);}
  if(!num(next.amount)||next.amount<0||next.amount>1000000||!Number.isInteger(next.martingaleLevels)||next.martingaleLevels<0||next.martingaleLevels>MAX_MARTINGALE_LEVELS||![2,3].includes(next.martingaleMultiplier)||!Number.isInteger(next.intervalMs)||next.intervalMs<5000||next.intervalMs>3600000||
   !num(next.stopAfterMinutes)||next.stopAfterMinutes<0||next.stopAfterMinutes>1440||!num(next.stopLoss)||next.stopLoss<0||next.stopLoss>1e8||!Number.isInteger(next.maxConsecutiveLosses)||next.maxConsecutiveLosses<0||next.maxConsecutiveLosses>50)throw Error('Configuração do bot inválida.');
  if(this.enabled){
   if(!(next.amount>0))throw Error('Valor por entrada deve ser positivo.');
  }
  if(this.enabled&&next.directionMode!==this.config.directionMode)throw Error('Pare o bot antes de trocar Automático, CALL e PUT.');
  // Automatic follows qualified signals. CALL/PUT cadence ignores their direction.
  if(next.directionMode!==this.config.directionMode||next.intervalMs!==this.config.intervalMs)this.nextScheduledAt=null;
  this.config=next;
  if(!next.martingaleEnabled||this.martingaleLevel>next.martingaleLevels)this.martingaleLevel=0;
  if(this.enabled){
   this.deadlineAt=null;
   this.watch();
  }
  return this.status();
 }
 async start(){
  this.watch();
  if(this.enabled||this.arming)throw Error('Bot já ligado ou em ativação.');
  // A stopped bot can be rearmed while older broker orders are still
  // reconciling. Keep that exact batch and its Martingale ledger intact.
  const suspendedBatch=this.pending;
  const c=this.context(),cfg={...this.config};
  if(c.brokerBalance!==undefined)this.balanceRisk.observe(c.brokerBalance);
  const broker=this.balanceRisk.current?.provider===c.provider?this.balanceRisk.current:null;
  const openingBalance=broker?.amount;
  if(c.state!=='running')throw Error('Inicie o analista antes de ligar o bot.');
  if(!c.licensed||!c.provider||!c.asset)throw Error('Conecte a corretora e inicie o analista.');
  if(!(c.durationMs>0))throw Error('Selecione a expiração no analista.');
  this.arming=true;const generation=++this.generation;
  try{
   // A previous multi-click dispatch may still be finishing after Stop.
   // Do not reuse its in-flight clicks or allow a new batch to overlap it.
   if(this.executing&&this.inflight)await this.inflight.catch(()=>{});
   if(generation!==this.generation)throw Error('Reativação cancelada.');
   if(suspendedBatch){
    // Re-arming a pending settlement must not require the broker's CALL/PUT
    // buttons to be visible during the result screen. Check broker identity
    // without touching the controls; map controls only for NEW physical clicks.
    this.driver.checkContext?.(c.provider,c);
   }else{
    const prepared=await this.driver.prepare(c.provider,{...c,amount:cfg.amount});
    const selectedAmount=Number(prepared?.amount);
    if(Number.isFinite(selectedAmount)&&selectedAmount>0){
      cfg.amount=money(selectedAmount);this.config.amount=cfg.amount;
    }
   }
   const current=this.context();
   if(!(cfg.amount>0))throw Error('Valor da entrada ainda não identificado na corretora.');
   if(broker&&cfg.amount>openingBalance)throw Error('Saldo recebido insuficiente para o valor da corretora.');
   if(generation!==this.generation||!this.sameContext(c,current)||c.durationMs!==current.durationMs||(broker&&current.brokerBalance&&String(broker.accountId)!==String(current.brokerBalance.accountId))||current.state!=='running'||!current.licensed)throw Error('Analista mudou durante a ativação.');
   if(suspendedBatch&&this.pending===suspendedBatch){
    // Do not reset seen signals, pending orders, balance reservations,
    // session counters or Martingale level while an order is unresolved.
    if(!this.session||!this.sameContext(this.session,current)||
      Number(this.session.durationMs)!==Number(current.durationMs)||
      suspendedBatch.provider!==current.provider||
      this.session.accountId!=null&&current.brokerBalance?.accountId!=null&&
        String(this.session.accountId)!==String(current.brokerBalance.accountId))
      throw Error('Há uma operação pendente da conta/ativo anterior. Aguarde a confirmação para reiniciar com a nova configuração.');
    if(this.deadlineAt&&this.clock()>=this.deadlineAt)
      throw Error('Limite de tempo da sessão atingido. Aguarde o encerramento e inicie uma nova sessão.');
    if(this.config.stopLoss>0&&this.riskNet()<=-this.config.stopLoss)
      throw Error('Limite de perda atingido. Ajuste seu limite antes de reativar.');
    this.session.engine=current.engine;
    this.queuedSignal=null;
    const currentSignal=executorSignal(current.analysis);
    if(currentSignal)this.seen.add(currentSignal.id);
    this.enabled=true;
    const confirmed=suspendedBatch.orders.filter(order=>order.settled).length;
    this.message='Ligado novamente · aguardando encerramentos da corretora ('+
      confirmed+'/'+suspendedBatch.orders.length+') · sem duplicar entradas';
    return this.status();
   }
   this.session={provider:c.provider,asset:c.asset,durationMs:c.durationMs,engine:current.engine,accountId:broker?.accountId??current.brokerBalance?.accountId??null};
   this.startedAt=this.clock();this.deadlineAt=null;this.nextScheduledAt=this.startedAt;
   if(current.brokerBalance!==undefined)this.balanceRisk.observe(current.brokerBalance);
   const opening=this.balanceRisk.begin(c.provider);if(opening&&cfg.amount>opening.amount)throw Error('Saldo recebido insuficiente para o valor por entrada.');
   this.initialBalance=opening?.amount??null;
   this.sessionId++;this.net=0;this.executed=0;this.closed=0;this.consecutiveLossBatches=0;this.history=[];this.ledger.clear();
   this.martingaleLevel=0;this.lastEntryAt=null;this.sequence=0;this.seen.clear();this.queuedSignal=null;
   const existing=executorSignal(c.analysis);if(existing)this.seen.add(existing.id);
   this.suspensionReason=null;this.hardHoldReason=null;this.enabled=true;this.message='Ligado · sessão nova · aguardando próximo CALL/PUT do analista';
  }finally{this.arming=false;}
  return this.status();
 }
 stop(reason='Parado por você',{reset=false}={}){
  this.enabled=false;this.queuedSignal=null;this.generation++;
  if(reset){
   // Stop clears the visible bot session, NOT an already-open broker trade.
   // Old orders remain quarantined for correlated settlement only.
   if(this.pending){const b=this.pending;b.detached=true;for(const p of b.orders)p.detached=true;this.unresolvedBatches.set(b.id,b);this.pending=null;}
   this.balanceRisk.trade=null;this.balanceRisk.session=null;
   this.session=null;this.startedAt=null;this.deadlineAt=null;this.nextScheduledAt=null;this.initialBalance=null;
   this.martingaleLevel=0;this.lastEntryAt=null;this.sequence=0;
   this.executed=0;this.closed=0;this.net=0;this.consecutiveLossBatches=0;this.history=[];
   this.ledger.clear();this.seen.clear();this.sessionId++;
   this.suspensionReason=null;this.hardHoldReason=null;
   this.message='Desligado · sessão zerada; ordens já enviadas à corretora não são canceladas';
  }else this.message=reason;
  return this.status();
 }
 observeBalance(value){this.balanceRisk.observe(value);}
 // Defensive reconciliation: a batch with all broker-identified results
 // should never remain in the old pending/unresolved maps after callback
 // ordering changes. Never infer an unreported result from a price move.
 reconcileCompletedBatches(){
  const pending=this.pending;
  if(pending?.dispatchComplete&&!this.executing&&pending.orders.length&&
   pending.orders.every(o=>o.settled))this.finishBatch(pending);
  for(const [id,b] of this.unresolvedBatches){
   if(!b.dispatchComplete||!b.orders.every(o=>o.settled||!o.clicked||o.rejected))continue;
   this.unresolvedBatches.delete(id);
   if(!b.detached&&b.sessionId===this.sessionId&&
    b.orders.length===b.clickCount&&b.orders.every(o=>o.settled))
    this.applyCompletedSequence(b);
  }
 }
 unresolvedDetail(now=this.clock()){
  const batches=[this.pending,...this.unresolvedBatches.values()]
   .filter(b=>b&&!b.detached&&b.sessionId===this.sessionId);
  const outstanding=batches.flatMap(b=>b.orders)
   .filter(o=>o.clicked&&!o.settled&&!o.rejected);
  const waitingId=outstanding.filter(o=>!o.orderId).length;
  const waitingResult=outstanding.length-waitingId;
  const earliestExit=batches.reduce((m,b)=>
   Number(b.exitAt)>0?Math.min(m,Number(b.exitAt)):m,Infinity);
  return{batches:batches.length,orders:outstanding.length,waitingId,
   waitingResult,overdueMs:Number.isFinite(earliestExit)?Math.max(0,now-earliestExit):0};
 }
 unresolvedExposure(){
  let amount=0;
  for(const batch of this.unresolvedBatches.values())for(const p of batch.orders)
   if(p.clicked&&!p.settled&&!p.rejected)amount+=Number(p.amount)||0;
  return money(amount);
 }
 releaseExpiredBatch(now=this.clock()){
  const batch=this.pending;
  if(!batch||!batch.dispatchComplete||this.executing||!(Number(batch.exitAt)>0))return false;
  // Broker result callbacks may arrive after option expiry. Never freeze all
  // future entries for an unconfirmed historical result. At expiry + grace,
  // reserve every unresolved stake and resume on the next NEW normal signal.
  // A confirmed trade expiry is the end of the occupied window. A further
  // 1500ms broker-ack grace was skipping the NEXT 500/900ms-fresh signal.
  // Unreported outcomes remain open in the risk ledger until identified.
  if(now<Number(batch.exitAt)||batch.orders.every(p=>p.settled))return false;
  batch.releasedAt=now;
  batch.continuationReleased=true;
  // Unknown is NOT a loss. Present the base amount while awaiting broker
  // settlement; if that identified close arrives BEFORE another physical
  // entry, its actual result may still determine the next Martingale level.
  // A later close cannot retroactively alter a newly started trade.
  if(!batch.progressionApplied)batch.recoveryEligible=true;
  this.martingaleLevel=0;
  this.unresolvedBatches.set(batch.id,batch);
  this.pending=null;
  // Keep a NEW signal queued while the old trade is closing, but only if
  // its original timestamp is still fresh when the executor retries.
  // Do NOT clear the existing broker-balance debit reconciliation here:
  // the option has expired, but the broker may have debited the stake without
  // reporting the payout. Clearing trade would turn that unconfirmed debit
  // into a fictitious realized loss in balanceRisk.view(). The next actual
  // order safely replaces the snapshot at captureEntry; unresolved stakes
  // remain separately reserved by riskNet().
  this.onBatchReleased?.(batch);
  this.message='Ligado · operação anterior vencida; próximo sinal com 1 clique · resultado financeiro pendente';
  return true;
 }
 accountCompatible(balance=this.balanceRisk.current){return !balance||!this.session||balance.provider===this.session.provider&&(this.session.accountId==null||String(balance.accountId)===String(this.session.accountId));}
 sameContext(a,b){return a.provider===b.provider&&symbol(a.asset)===symbol(b.asset);}
 watch(){
  if(!this.enabled&&!this.pending)return;
  const now=this.clock(),c=this.context(),p=this.pending;
  if(c.brokerBalance!==undefined)this.balanceRisk.observe(c.brokerBalance);
  this.reconcileCompletedBatches();
  const balance=this.balanceRisk.view(now);
  if(this.enabled){
   const blocker=this.hardHoldReason||(!c.licensed||c.state!=='running'?'aguardando analista/acesso':
    !this.session||!this.sameContext(this.session,c)?'ativo diferente · confira o ativo':
    balance.accountChanged||!this.accountCompatible(balance.current)?'conta diferente · confira a conta':null);
   this.suspensionReason=blocker;
   if(this.config.stopLoss>0&&this.riskNet(balance)<=-this.config.stopLoss)
    this.stop('Bot parado · stop-loss atingido');
   else if(!this.pending&&!this.executing&&balance.current?.provider===this.session?.provider&&
    !balance.reconciling&&balance.current.amount<this.config.amount)
    this.stop('Bot parado · saldo da corretora insuficiente para 1 clique');
   else if(blocker)this.message='Ligado · suspenso por segurança: '+blocker;
   else if(this.session.engine!==c.engine){this.session.engine=c.engine;this.queuedSignal=null;const old=executorSignal(c.analysis);if(old&&old.engineId!==c.engine)this.seen.add(old.id);this.message='Estratégia atualizada · seguindo os próximos sinais do analista';}
  }
  if(this.enabled&&this.session.accountId==null&&balance.current?.provider===this.session.provider)this.session.accountId=String(balance.current.accountId);
  if(this.enabled)this.releaseExpiredBatch(now);
  if(this.enabled&&this.pending&&!this.executing&&now>this.pending.exitAt+1500){
   // A delayed close or click acknowledgement is NOT a bot stop.
   // Unknown physical clicks remain reserved; no duplicate entry.
   const done=this.pending.orders.filter(p=>p.settled).length;
   const unidentified=this.pending.orders.filter(p=>p.clicked&&!p.orderId).length;
   this.message='Ligado · aguardando encerramentos da corretora ('+done+'/'+this.pending.orders.length+
     ' fechadas'+(unidentified?', '+unidentified+' clique(s) sem ID':'')+') · sem repetir entradas';
  }
 }
 pulse(freshAnchor=null){
  this.watch();if(!this.enabled||this.suspensionReason)return;
  const c=this.context(),mode=this.config.directionMode||'automatic';
  const clockNow=this.clock();let s;
  if(mode==='automatic')s=freshAnchor?executorSignal({vnext:{futureEntryAnchor:freshAnchor}}):executorSignal(c.analysis);
  else {
    const due=Number(this.nextScheduledAt??clockNow);
    if(clockNow>=due){
      const interval=Number(this.config.intervalMs);
      this.nextScheduledAt=due+interval*(Math.floor((clockNow-due)/interval)+1);
      const quoteAt=Number(c.quoteAt||0),price=Number(c.quote||0);
      if(!this.pending&&!this.executing&&quoteAt>0&&quoteAt<=clockNow&&clockNow-quoteAt<=2500&&price>0)
        s={id:'independent|'+this.sessionId+'|'+due,engineId:c.engine,side:mode==='call'?'CALL':'PUT',
           at:clockNow,exitAt:clockNow+c.durationMs,entryPrice:price,durationMs:c.durationMs,independent:true};
      else this.message='Ligado · entrada programada pulada: cotação atrasada ou corretora ocupada';
    }
  }
  if(s?.engineId&&s.engineId!==c.engine)return;
  if(s&&!this.seen.has(s.id)){
   this.seen.add(s.id);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value);
   // Every NEW analyst signal is eligible. No independent bot cooldown.
   this.sequence++;this.queuedSignal=s;
  }
  const queued=this.queuedSignal;if(!queued||this.executing)return;
  const now=this.clock();
  if(this.pending){
   // Do not consume the new signal ID merely because a previous batch is
   // settling. It remains subject to the original strict entry deadline.
   const b=this.pending,closed=b.orders.filter(o=>o.settled).length;
   const d=this.unresolvedDetail(now);
   this.message='Ligado · aguardando resultado da sequência anterior ('+closed+'/'+b.orders.length+
    ' encerradas; '+d.waitingId+' sem ID) · nível preservado';
   return;
  }
  // Already-expired broker orders never indefinitely freeze the next fresh
  // entry. Their worst-case losses still count through riskNet() and stop-loss.
  if([...this.unresolvedBatches.values()].some(b=>!b.detached&&
   b.sessionId===this.sessionId&&!b.continuationReleased)){
   if(this.config.stopLoss>0&&this.nextAmount()>Math.max(0,this.config.stopLoss+this.riskNet())+0.000001){
    this.stop('Bot parado · limite de perda restante insuficiente com ordens pendentes');
    return;
   }
   this.queuedSignal=null;
   const d=this.unresolvedDetail(now);
   this.message='Ligado · aguardando corretora: '+d.orders+' ordem(ns) sem resultado ('+
    d.waitingId+' sem ID; '+d.waitingResult+' com ID) · nível preservado';
   return;
  }
  if(now<queued.at||now-queued.at>maxSignalAgeMs(queued.durationMs)||now>=queued.exitAt){
   this.queuedSignal=null;
   const age=now-queued.at;
   this.message='Sinal recebido fora do prazo ('+Math.max(0,Math.round(age))+'ms; limite '+maxSignalAgeMs(queued.durationMs)+'ms) · aguardando nova análise';
   return;
  }
  const balance=this.balanceRisk.view(now);
  this.queuedSignal=null;
  const generation=this.generation,requestedClicks=queued.independent?1:this.nextClicks(),unitAmount=this.config.amount;
  // A Martingale batch must be complete at its own user-selected level.
  // Never turn a skipped 3/9/27-click recovery signal into a new baseline
  // trade: only a fully executed broker-confirmed batch changes progression.
  const canSend=this.driver.batchFeasibility?.(c.provider,{
   count:requestedClicks,activeId:c.activeId,entryAt:queued.at,now,
   maxEntryAgeMs:maxSignalAgeMs(queued.durationMs),
   maxBatchAgeMs:maxBatchDispatchMs(queued.durationMs)});
  if(canSend?.safe===false&&requestedClicks===1){
   this.message='Ligado · sinal atrasado, aguardando próximo';
   return;
  }
  if(canSend?.safe===false&&requestedClicks>1){
   this.message='Ligado · entrada ignorada: '+requestedClicks+' cliques não cabem no prazo · nível de martingale preservado';
   return;
  }
  const clickCount=requestedClicks;
  const martingaleLevel=this.martingaleLevel;
  const martingaleFallback=false;
  const amount=money(unitAmount*clickCount);
  if(!Number.isFinite(amount)||amount>1000000){this.message='Ligado · valor inválido · próximo sinal';return;}
  if(this.config.stopLoss>0&&amount>Math.max(0,this.config.stopLoss+this.riskNet(balance))+0.000001){
   this.stop('Bot parado · próxima entrada excede o limite de perda restante (stop-loss)');
   return;
  }
  if(!this.accountCompatible(balance.current)){this.suspensionReason='conta divergente';this.message='Ligado · suspenso: conta divergente';return;}
  if(balance.current&&balance.current.provider===c.provider&&!balance.reconciling&&balance.current.amount<amount){
   this.stop('Bot parado · saldo insuficiente para '+clickCount+' clique(s)');
   return;
  }
  const batch={...queued,engine:c.engine,provider:c.provider,asset:c.asset,activeId:c.activeId,amount,unitAmount,clickCount,martingaleLevel,martingaleFallback,sessionId:this.sessionId,accountId:this.session.accountId??balance.current?.accountId??null,state:'sending',orders:[],dispatchComplete:false,netPnl:0};
  // A new physical entry commits a NEW cycle. Historical unresolved
  // settlements update financial PnL but never overwrite its progression.
  for(const previous of this.unresolvedBatches.values()){
   if(!previous.detached&&previous.sessionId===this.sessionId&&
    previous.continuationReleased&&previous.recoveryEligible){
    previous.recoveryEligible=false;
    previous.progressionApplied=true;
   }
  }
  this.pending=batch;
  const valid=(clickIndex=0)=>this.enabled&&generation===this.generation&&this.pending===batch&&this.sameContext(this.session,this.context())&&batch.durationMs===this.context().durationMs&&batch.engine===this.context().engine&&this.context().state==='running'&&this.context().licensed===true&&this.accountCompatible(this.context().brokerBalance)&&(!this.context().brokerBalance||batch.accountId==null||String(this.context().brokerBalance.accountId)===String(batch.accountId))&&(this.config.stopLoss===0||batch.amount<=this.config.stopLoss+this.riskNet()+0.000001)&&this.clock()>=queued.at&&this.clock()<queued.exitAt&&this.clock()-queued.at<=(clickIndex===0?maxSignalAgeMs(queued.durationMs):maxBatchDispatchMs(queued.durationMs))&&(!this.deadlineAt||this.clock()<this.deadlineAt);
  let captured=false;
  const jobs=[];
  this.executing=true;
  for(let i=0;i<clickCount;i++){
   const order={...queued,id:batch.id+'|click-'+i,engine:batch.engine,provider:c.provider,asset:c.asset,activeId:c.activeId,amount:unitAmount,martingaleLevel:batch.martingaleLevel,sessionId:this.sessionId,accountId:batch.accountId,state:'sending',requestId:null,orderId:null};
   batch.orders.push(order);order.isValid=()=>valid(i);
   order.useBrokerStake=(source,{confirmed=false}={})=>{
    const stake=money(Number(source));
    if(!(stake>0)||stake>1000000)return;
    if(!confirmed&&this.config.stopLoss>0&&stake>Math.max(0,this.config.stopLoss+this.riskNet())+1e-6)
     throw Error('O valor escolhido na corretora excede o stop-loss restante.');
    order.amount=stake;this.config.amount=stake;batch.unitAmount=stake;
    batch.amount=money(batch.orders.reduce((sum,x)=>sum+Number(x.amount||0),0));
    if(this.balanceRisk.trade?.batchId===batch.id&&!this.balanceRisk.trade.settled)
     this.balanceRisk.trade.amount=batch.amount;
   };
   order.captureEntry=()=>{
    const snapshot=this.context();order.clickedAt=this.clock();order.exitAt=order.clickedAt+order.durationMs;batch.exitAt=Math.max(batch.exitAt,order.exitAt);this.lastEntryAt=order.at;
    if(!captured){captured=true;if(snapshot.brokerBalance!==undefined)this.balanceRisk.observe(snapshot.brokerBalance);this.balanceRisk.capture({...batch,exitAt:batch.exitAt});}
    if(num(snapshot.quote)&&Number(snapshot.quote)>0&&Number(snapshot.quoteAt)>0&&order.clickedAt-Number(snapshot.quoteAt)>=0&&order.clickedAt-Number(snapshot.quoteAt)<=2500){order.entryPrice=Number(snapshot.quote);order.entryQuoteAt=Number(snapshot.quoteAt);}
   };
   jobs.push(Promise.resolve().then(async()=>{
    if(!order.isValid())throw Object.assign(Error('Entrada cancelada antes do clique.'),{beforeClick:true});
    const result=await this.driver.execute(c.provider,order);
    if(result?.pending===true&&order.clicked===true){
     // The broker request/response may arrive later. Keep the exact
     // click open for reconciliation; never repeat it or stop the bot.
     if(order.state!=='accepted'&&!order.settled)order.state='awaiting-broker';
     if(result.requestId!=null)order.requestId=String(result.requestId);
     if(this.enabled)this.message='Ligado · clique aguardando confirmação da corretora · sem repetir';
     return;
    }
    if(result?.accepted!==true||!result.orderId)
     throw Object.assign(Error('Não foi possível confirmar o clique.'),{uncertainClick:order.clicked===true});
    this.accepted({...result,provider:c.provider,localId:order.id});
   }).catch(e=>{
    order.error=String(e?.message||e);
    if(e?.brokerRejected===true)order.rejected=true;
    if(order.clicked!==true||e?.beforeClick===true)order.cancelled=true;
    const context=this.context();
    const changed=order.clicked!==true&&this.enabled&&generation===this.generation&&this.sameContext(this.session,context)&&(batch.engine!==context.engine||batch.durationMs!==context.durationMs);
    if(changed&&!batch.orders.some(p=>p.clicked)){this.message='Estratégia alterada · aguardando próximo sinal';return;}
    // The broker may have registered the physical click without responding.
    // Preserve it as unknown until a correlated broker order arrives.
    if(order.clicked&&e?.brokerRejected!==true){
     order.state='awaiting-broker';
     if(this.enabled)this.message='Ligado · clique sem confirmação · aguardando corretora, sem repetir';
     return;
    }
    // A clearly cancelled before-click attempt can be skipped without
    // turning the automation OFF or manufacturing a Martingale loss.
    if(!order.clicked&&e?.beforeClick===true){
     if(this.enabled)this.message='Ligado · clique não realizado: '+order.error+' · aguardando próximo sinal';
     return;
    }
    // Explicit broker rejection and genuine state mismatches are distinct
    // from a delayed broker acknowledgement.
    if(this.enabled)this.message='Ligado · entrada não confirmada: '+order.error+' · próximo sinal';
   }));
  }
  this.inflight=Promise.allSettled(jobs).then(()=>{
   batch.dispatchComplete=true;batch.orders=batch.orders.filter(p=>p.clicked&&!p.rejected&&!p.cancelled);
   batch.amount=money(batch.orders.reduce((sum,p)=>sum+p.amount,0));if(!batch.detached&&this.balanceRisk.trade&&!this.balanceRisk.trade.settled)this.balanceRisk.trade.amount=batch.amount;
   if(batch.detached){
    if(batch.orders.length)this.unresolvedBatches.set(batch.id,batch);
    else this.unresolvedBatches.delete(batch.id);
    return;
   }
   if(!batch.orders.length){if(this.pending===batch)this.pending=null;this.balanceRisk.trade=null;return;}
   // The terminal stage is consumed once actual physical clicks have
   // completed dispatch. This changes only NEXT click count, never PnL.
   // No physical click means the stage remains pending for another signal.
   if(this.config.martingaleEnabled&&
    batch.martingaleLevel===this.config.martingaleLevels&&
    batch.martingaleLevel>0&&!batch.detached){
    batch.terminalCycleConsumed=true;
    batch.progressionApplied=true;
    this.martingaleLevel=0;
   }
   if(batch.orders.every(p=>p.state==='accepted'||p.settled))batch.state='accepted';
   if(batch.orders.length!==batch.clickCount&&this.enabled){
    // Do not recreate missing clicks. Stay armed, but any already-clicked
    // child still requires individual broker confirmation before progress.
    this.message='Ligado · sequência parcial · aguardando fechamento sem repetir cliques';
   }
    // Fixed-direction timing may overlap identified broker operations.
    // Keep still-open stake reserved and correlate later settlements by ID.
    if(batch.independent&&this.pending===batch&&!batch.orders.every(p=>p.settled)){
      batch.continuationReleased=true;batch.progressionApplied=true;
      this.unresolvedBatches.set(batch.id,batch);this.pending=null;
    }
    this.finishBatch(batch);
   }).finally(()=>{this.executing=false;});
 }
 sent(requestId,localId){
  let p=this.pending?.orders.find(o=>o.id===localId)||(this.pending?.orders.length===1?this.pending.orders[0]:null);
  if(!p)for(const b of this.unresolvedBatches.values()){p=b.orders.find(o=>o.id===localId);if(p)break;}
  if(p&&requestId){p.requestId=String(requestId);p.clicked=true;}
 }
 rejected(event){
  const batches=[this.pending,...this.unresolvedBatches.values()].filter(Boolean);
  const b=batches.find(b=>b.provider===event.provider&&b.orders.some(p=>p.id===event.localId||
   p.requestId!=null&&String(p.requestId)===String(event.requestId)));
  const p=b?.orders.find(p=>p.id===event.localId||p.requestId!=null&&String(p.requestId)===String(event.requestId));
  if(p){p.rejected=true;p.state='rejected';
   if(this.enabled)this.message='Ligado · corretora rejeitou uma ordem; nenhum clique será repetido';
  }
 }
 accepted(event){
  let batch=this.pending;
  if((!batch||event.provider!==batch.provider||!batch.orders.some(p=>p.id===event.localId||
    p.requestId!=null&&event.requestId!=null&&String(p.requestId)===String(event.requestId)))
    &&event.orderId)batch=[...this.unresolvedBatches.values()].find(b=>b.provider===event.provider&&b.orders.some(p=>p.id===event.localId||
      p.requestId!=null&&event.requestId!=null&&String(p.requestId)===String(event.requestId)));
  if(!batch||event.provider!==batch.provider||!event.orderId)return;
  const p=batch.orders.find(p=>p.id===event.localId||p.requestId!=null&&event.requestId!=null&&String(p.requestId)===String(event.requestId))||(batch.orders.length===1?batch.orders[0]:null);
  if(!p||p.state==='accepted'||p.settled)return;
  if(p.requestId!=null&&String(event.requestId)!==String(p.requestId))return;
  if(batch.orders.some(other=>other!==p&&String(other.orderId)===String(event.orderId))){
   this.hardHoldReason='confirmação duplicada · conferir ordens';this.suspensionReason=this.hardHoldReason;
   this.message='Ligado · suspenso por segurança: '+this.suspensionReason;return;
  }
  p.state='accepted';p.clicked=true;p.orderId=String(event.orderId);p.requestId=event.requestId??p.requestId;p.accountId=event.accountId??p.accountId;
  if(Number(event.exitAt)>p.at){
   const mismatch=Math.abs(Number(event.exitAt)-((p.clickedAt??p.at)+p.durationMs))>1500;
   p.exitAt=Number(event.exitAt);
   if(mismatch&&!batch.detached&&this.enabled){
    // Confirmed broker expiration is observed AFTER the click. Reconcile this
    // specific order using the broker timestamp; keep the bot flowing.
    this.message='Ligado · vencimento confirmado pela corretora · bot segue ativo';
   }
  }
  if(num(event.entryPrice)&&Number(event.entryPrice)>0)p.entryPrice=Number(event.entryPrice);
  if(p.accountId!=null&&!batch.detached&&this.session){
   if(this.session.accountId!=null&&String(p.accountId)!==String(this.session.accountId)){
    this.hardHoldReason='conta da ordem divergente';this.suspensionReason=this.hardHoldReason;this.message='Ligado · suspenso por segurança: '+this.suspensionReason;
   }else this.session.accountId=String(p.accountId);
  }
  batch.executionSource=p.executionSource='broker';batch.accountId=p.accountId;batch.orderId??=p.orderId;batch.exitAt=Math.max(batch.exitAt,p.exitAt);
  p.executionSource=event.source||'broker';if(batch.detached)return;
  this.lastEntryAt=p.at;this.executed++;
  if(this.enabled)this.message=p.side+' · '+batch.orders.filter(p=>p.state==='accepted').length+'/'+batch.clickCount+' cliques confirmados'+(batch.martingaleFallback?' · martingale reduzido por lentidão':'');
 }
 // Only broker-confirmed COMPLETE batches change the sequence.
 // This handler also reconciles closures received after the timeout.
 applyCompletedSequence(batch){
  const full=batch.orders.length===batch.clickCount&&!batch.orders.some(p=>p.error);
  // An earlier batch may close after expiry and before the next entry; that
  // is still an ACTUAL broker outcome, not a fabricated loss.
  // It is ineligible only after a newer physical batch has begun.
  if(!batch.progressionApplied){
   batch.progressionApplied=true;
   if(full)this.martingaleLevel=batch.independent?0:!this.config.martingaleEnabled?0:
    batch.netPnl>0?0:batch.netPnl<0?
    (batch.martingaleLevel<this.config.martingaleLevels?batch.martingaleLevel+1:0):
    (batch.martingaleLevel<=this.config.martingaleLevels?batch.martingaleLevel:0);
  }
  // Broker accounting and streak guard remain independent of stage cycling.
  // A late final-stage settlement may not overwrite a NEW cycle's level.
  if(full&&!batch.lossStreakApplied){
   batch.lossStreakApplied=true;
   if(batch.netPnl<0)this.consecutiveLossBatches++;
   else if(batch.netPnl>0)this.consecutiveLossBatches=0;
   if(this.enabled&&this.config.maxConsecutiveLosses>0&&
    this.consecutiveLossBatches>=this.config.maxConsecutiveLosses){
    this.stop('Bot parado · limite configurado de sequências perdedoras atingido');
    return;
   }
  }
  if(this.enabled)this.message='Sequência concluída · próximo sinal: '+this.nextClicks()+' clique(s)';
 }
 finishBatch(batch){
  if(this.pending!==batch||batch.detached||!batch.dispatchComplete||!batch.orders.length||!batch.orders.every(p=>p.settled))return;
  this.balanceRisk.close(batch.netPnl,this.clock());this.pending=null;
  this.applyCompletedSequence(batch);
 }
 settle(event){
  const key=event.provider+'|'+event.orderId;
  let batch=this.pending;
  let p=batch?.provider===event.provider?batch.orders.find(o=>o.orderId!=null&&String(o.orderId)===String(event.orderId)):null;
  let late=false;
  if(!p)for(const previous of this.unresolvedBatches.values()){
   if(previous.provider!==event.provider)continue;
   const found=previous.orders.find(o=>o.orderId!=null&&String(o.orderId)===String(event.orderId));
   if(found){p=found;batch=previous;late=true;break;}
  }
  if(batch?.detached&&p){
   if(!num(event.netPnl)||(event.source&&event.source!=='broker')||p.settled)return false;
   if(event.accountId!=null&&p.accountId!=null&&String(event.accountId)!==String(p.accountId))return false;
   p.settled=true;p.netPnl=Number(event.netPnl);
   if(batch.dispatchComplete&&batch.orders.every(o=>o.settled||!o.clicked||o.rejected))
    this.unresolvedBatches.delete(batch.id);
   return true; // Old broker settlement cannot change a freshly reset session.
  }
  const old=this.ledger.get(key);if((!p&&!old)||!num(event.netPnl)||(event.source&&event.source!=='broker'))return false;
  const trade=p||old;if(event.accountId!=null&&trade.accountId!=null&&String(event.accountId)!==String(trade.accountId))return false;
  if(old?.source==='broker'||trade.sessionId!==undefined&&trade.sessionId!==this.sessionId)return false;
  this.net=money(this.net+Number(event.netPnl)-Number(old?.netPnl||0));if(!old||old.source==='unresolved')this.closed++;
  const row={provider:trade.provider,accountId:trade.accountId,orderId:trade.orderId,side:trade.side,amount:trade.amount,sessionId:trade.sessionId,martingaleLevel:trade.martingaleLevel,entryPrice:event.entryPrice??trade.entryPrice,exitPrice:event.exitPrice??null,netPnl:Number(event.netPnl),source:'broker',result:Number(event.netPnl)>0?'win':Number(event.netPnl)<0?'loss':'tie',closedAt:this.clock()};
  this.ledger.set(key,row);if(this.ledger.size>2048)this.ledger.delete(this.ledger.keys().next().value);
  this.history=[row,...this.history.filter(x=>!(x.provider===row.provider&&x.orderId===row.orderId))].slice(0,5);
  if(p){p.settled=true;batch.netPnl=money(batch.netPnl+Number(event.netPnl));
   if(late){
    if(batch.orders.every(o=>o.settled||!o.clicked||o.rejected)){
     this.unresolvedBatches.delete(batch.id);
     if(batch.orders.every(o=>o.settled)&&batch.dispatchComplete){
      // Resolve the exact cached balance debit only if no subsequent
      // physical operation has replaced its reservation. This avoids a
      // phantom loss or stuck 'reconciling' while the broker payout is late.
      if(this.balanceRisk.trade?.batchId===batch.id)
       this.balanceRisk.close(batch.netPnl,this.clock());
      this.applyCompletedSequence(batch);
     }
    }
   }else this.finishBatch(batch);
  }
  if(this.enabled&&this.config.stopLoss>0&&this.riskNet()<=-this.config.stopLoss)this.stop('Bot parado · limite de perda da sessão atingido');
  return true;
 }
 nextClicks(){return this.config.directionMode!=='automatic'?1:this.config.martingaleMultiplier**(this.config.martingaleEnabled?this.martingaleLevel:0);}
 nextAmount(){return money(this.config.amount*this.nextClicks());}
 riskNet(balance=this.balanceRisk.view(this.clock())){return Math.min(this.net,this.initialBalance!=null&&balance.source==='broker'?balance.net:this.net)-this.unresolvedExposure();}
 status(){const balance=this.balanceRisk.view(this.clock()),initial=this.startedAt!=null?this.initialBalance:balance.current?.amount??null,risk=this.riskNet(balance);return{capabilities:{brokerExecution:5},enabled:this.enabled,arming:!!this.arming,executing:this.executing,config:{...this.config},message:this.message,startedAt:this.startedAt??null,deadlineAt:this.deadlineAt??null,netPnl:this.net,calculatedBalance:initial==null?null:money(initial+this.net),availableBalance:balance.source==='broker'?money(balance.available):null,balanceSource:balance.source==='broker'?'broker-received-balance':'unavailable',brokerBalance:balance.current,riskNetPnl:money(risk),balanceReconciling:balance.reconciling,initialBalance:initial,lossLimitRemaining:this.config.stopLoss>0?money(Math.max(0,this.config.stopLoss+risk)):null,durationMs:this.context()?.durationMs,martingaleLevel:this.martingaleLevel,nextClicks:this.nextClicks(),nextAmount:this.nextAmount(),suspendedReason:this.suspensionReason,unresolvedBatches:this.unresolvedBatches.size,unresolvedStake:this.unresolvedExposure(),
  unresolvedDetail:this.unresolvedDetail(),consecutiveLossBatches:this.consecutiveLossBatches,executed:this.executed,closed:this.closed,pending:this.pending?{side:this.pending.side,state:this.pending.state,amount:this.pending.amount,clickCount:this.pending.clickCount,confirmedClicks:this.pending.orders.filter(p=>p.state==='accepted').length,closedClicks:this.pending.orders.filter(p=>p.settled).length,orderId:this.pending.orderId,exitAt:this.pending.exitAt,durationMs:this.pending.durationMs,entryPrice:this.pending.entryPrice}:null,history:this.history.map(x=>({...x}))};}
}

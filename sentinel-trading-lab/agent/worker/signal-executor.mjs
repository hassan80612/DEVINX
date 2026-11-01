// Fixed broker stake. Martingale changes only the number of CALL/PUT clicks.
// An identified close for every order completes one progression step.
// Absolute bankroll targets, with pending stake reservations kept separate from confirmed losses.
import {ExecutorBalanceRisk,validBrokerBalance} from './executor-balance-risk.mjs';
import {decisionAudit,acceptedAudit,settlementAudit} from './trade-audit.mjs';
import {liveEntryQuoteReview} from './live-quote-entry-review.mjs';
import {reviewDirectionBeforeClick} from './entry-direction-before-click.mjs';
// Exactly one recovery: base 1 click, then 2 clicks once after a LOSS.
// A WIN or completed second LOSS resets the next batch to 1 click.
export const MAX_MARTINGALE_LEVELS=1;
export const MAX_SIGNAL_TO_CLICK_AGE_MS=Object.freeze({short:500,thirty:1450,minute:1950,five:2500,other:1500});
// Freshness of the FIRST broker entry differs from completion of an already
// started multi-click batch. Each broker click has its own 30s expiry.
export const MAX_BATCH_DISPATCH_MS=Object.freeze({five:850,short:1600,fifteen:2500,thirty:5000,other:8000});
export function maxSignalAgeMs(durationMs){
 const ms=Number(durationMs);
 return ms<=15000?MAX_SIGNAL_TO_CLICK_AGE_MS.short:
  ms<=30000?MAX_SIGNAL_TO_CLICK_AGE_MS.thirty:
  ms<=60000?MAX_SIGNAL_TO_CLICK_AGE_MS.minute:
  ms<=300000?MAX_SIGNAL_TO_CLICK_AGE_MS.five:MAX_SIGNAL_TO_CLICK_AGE_MS.other;
}
export function maxBatchDispatchMs(durationMs){
 const ms=Number(durationMs);
 return ms<=5000?MAX_BATCH_DISPATCH_MS.five:
  ms<=10000?MAX_BATCH_DISPATCH_MS.short:
  ms<=15000?MAX_BATCH_DISPATCH_MS.fifteen:
  ms<=30000?MAX_BATCH_DISPATCH_MS.thirty:MAX_BATCH_DISPATCH_MS.other;
}
export const DEFAULT_EXECUTOR_CONFIG=Object.freeze({amount:0,intervalMs:30000,directionMode:'automatic',stopAfterMinutes:0,stopLoss:0,stopWin:0,martingaleLevels:1,martingaleMultiplier:2,martingaleEnabled:false,maxConsecutiveLosses:0});
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const symbol=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const money=x=>Math.round(Number(x)*1000000)/1000000;
// A previously received account balance is NOT proof of today's spendable funds.
const freshBalance=(b,now)=>b&&Number.isFinite(Number(b.receivedAt))&&Number(b.receivedAt)<=now+2000&&now-Number(b.receivedAt)<=30000;
export function executorSignal(analysis){
 const a=analysis?.vnext?.futureEntryAnchor;
 if(a?.phase!=='fired'||!['CALL','PUT'].includes(a.side)||!(Number(a.entryTriggeredAt)>0))return null;
 return{id:[a.context,a.entryTriggeredAt].join('|'),engineId:a.engineId??String(a.context||'').split('|').at(-2)??null,side:a.side,at:Number(a.entryTriggeredAt),exitAt:Number(a.exitAt),entryPrice:Number(a.confirmedEntryPrice??a.entryPrice??a.projectedEntryPrice),durationMs:Number(a.holdingSeconds??a.actualHoldingSeconds)*1000,
  fiveMinuteReversalConfirmed:a.fiveMinuteReversalConfirmed===true,
  fiveMinuteContextConfirmed:a.fiveMinuteContextConfirmed===true,entryFamily:a.entryFamily||'reversal',entryFamilyExplicit:!!a.entryFamily,
  observedEntryFamily:a.observedEntryFamily||null,sourceQuoteAt:Number(a.sourceQuoteAt||0)};
}
export class SignalExecutor{
 constructor({driver,context,clock=Date.now,onAuditEvent=null}={}){
  this.driver=driver;this.context=context;this.clock=clock;this.onAuditEvent=typeof onAuditEvent==='function'?onAuditEvent:null;this.config={...DEFAULT_EXECUTOR_CONFIG};
  this.balanceRisk=new ExecutorBalanceRisk();this.lastBrokerSettlementAt=0;this.lastSettlementBalanceRevision=0;this.stopBalanceReference=null;this.stakeRefreshPending=null;this.stakeRefreshAt=0;this.accountInvestSyncPending=false;this.executing=false;this.martingaleLevel=0;this.lastEntryAt=null;this.sessionId=0;
  this.nextScheduledAt=null;this.lastCadenceDurationMs=null;this.enabled=false;this.generation=0;this.message='Desligado';this.pending=null;this.unresolvedBatches=new Map();this.queuedSignal=null;this.seen=new Set();this.sequence=0;this.executed=0;this.closed=0;this.history=[];this.ledger=new Map();this.net=0;this.sessionWins=0;this.sessionLosses=0;this.consecutiveLossBatches=0;this.suspensionReason=null;this.hardHoldReason=null;this.lastBrokerExpiryMismatch=null;this.expirySettlementEvidence=null;
 }
 emitAudit(record){
  if(!this.onAuditEvent||!record)return;
  // Never allow auditing or disk writes to delay/reject broker operations.
  setImmediate(()=>{try{this.onAuditEvent(record)}catch{}});
 }
 configure(patch={}){
  if(this.arming)throw Error('Aguarde a ativação do bot concluir.');
  const next={...this.config};
  for(const key of Object.keys(DEFAULT_EXECUTOR_CONFIG))if(patch[key]!==undefined){
   if(key==='martingaleLevels'||key==='martingaleMultiplier')continue;if(key==='directionMode'){if(!['automatic','call','put'].includes(patch[key]))throw Error('Modo de direção inválido.');next[key]=patch[key];}else if(key==='martingaleEnabled'){if(typeof patch[key]!=='boolean')throw Error('Ativação de martingale inválida.');next[key]=patch[key];}else next[key]=Number(patch[key]);}
  next.martingaleLevels=1;next.martingaleMultiplier=2;
  if(!num(next.amount)||next.amount<0||next.amount>1000000||!Number.isInteger(next.martingaleLevels)||next.martingaleLevels<0||next.martingaleLevels>MAX_MARTINGALE_LEVELS||![2,3].includes(next.martingaleMultiplier)||!Number.isInteger(next.intervalMs)||next.intervalMs<5000||next.intervalMs>3600000||
   !num(next.stopAfterMinutes)||next.stopAfterMinutes<0||next.stopAfterMinutes>1440||!num(next.stopLoss)||next.stopLoss<0||next.stopLoss>1e8||!num(next.stopWin)||next.stopWin<0||next.stopWin>1e8||!Number.isInteger(next.maxConsecutiveLosses)||next.maxConsecutiveLosses<0||next.maxConsecutiveLosses>50)throw Error('Configuração do bot inválida.');
  if(this.enabled){
   if(!(next.amount>0))throw Error('Valor por entrada deve ser positivo.');
  }
  // A running bot can change its direction LIVE. The existing open orders stay intact.
  // Fixed-direction scheduling follows the duration already chosen on the analyst.
  if(next.directionMode!==this.config.directionMode){
   this.queuedSignal=null;
   this.nextScheduledAt=this.clock();
   this.lastCadenceDurationMs=null;
   if(next.directionMode==='automatic'){
    const current=executorSignal(this.context().analysis);
    if(current)this.seen.add(current.id);
   }
  }
  this.config=next;
  if(!next.martingaleEnabled||this.martingaleLevel>next.martingaleLevels)this.martingaleLevel=0;
  if(this.enabled){
   this.deadlineAt=null;
   this.watch();
  }
  return this.status();
 }
 async start(){
  if(this.accountInvestSyncPending)throw Error('Sincronização de conta/Invest em andamento.');
  this.watch();
  if(this.enabled||this.arming)throw Error('Bot já ligado ou em ativação.');
  // A stopped bot can be rearmed while older broker orders are still
  // reconciling. Keep that exact batch and its Martingale ledger intact.
  const suspendedBatch=this.pending;
  const c=this.context();
  if(c.brokerBalance!==undefined)this.balanceRisk.observe(c.brokerBalance);
  const candidate=this.balanceRisk.current?.provider===c.provider?this.balanceRisk.current:null;
  // Ignore cached account IDs older than the user's new bot session.
  const broker=candidate&&freshBalance(candidate,this.clock())&&
    this.clock()-Number(candidate.receivedAt)<=2500?candidate:null;
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
    // Invest is intentionally read on the first physical order, not during
    // activation. A broker DOM read here used to stall the bot before it
    // could react to a valid signal and could also capture the previous asset.
   }
   const current=this.context();
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
    if(this.config.stopLoss>0&&this.stopLossReached())
      throw Error('Limite de perda atingido. Ajuste seu limite antes de reativar.');
    if(this.stopWinReached())
      throw Error('Stop Win atingido nesta sessão. Pare e inicie outra sessão para zerar o resultado.');
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
   this.session={provider:c.provider,asset:c.asset,durationMs:c.durationMs,engine:current.engine,accountId:broker?.accountId??null,brokerMode:c.brokerMode??null};
   this.startedAt=this.clock();this.deadlineAt=null;this.nextScheduledAt=this.startedAt;this.lastCadenceDurationMs=Number(c.durationMs);
   if(broker)this.balanceRisk.observe(broker);
   else this.balanceRisk.current=null; // A stale ID must not be the starting account.
   const opening=this.balanceRisk.begin(c.provider);
   this.initialBalance=opening?.amount??null;
   this.sessionId++;this.lastBrokerSettlementAt=0;this.lastSettlementBalanceRevision=0;this.stopBalanceReference=null;this.net=0;this.sessionWins=0;this.sessionLosses=0;this.executed=0;this.closed=0;this.consecutiveLossBatches=0;this.history=[];this.ledger.clear();
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
   this.balanceRisk.last=null;this.balanceRisk.current=null; // Drop stale bankroll on manual Stop.
   this.session=null;this.startedAt=null;this.deadlineAt=null;this.nextScheduledAt=null;this.lastCadenceDurationMs=null;this.initialBalance=null;
   this.martingaleLevel=0;this.lastEntryAt=null;this.sequence=0;this.lastBrokerSettlementAt=0;this.lastSettlementBalanceRevision=0;this.stopBalanceReference=null;
   this.executed=0;this.closed=0;this.net=0;this.sessionWins=0;this.sessionLosses=0;this.consecutiveLossBatches=0;this.history=[];
   this.ledger.clear();this.seen.clear();this.sessionId++;
   this.suspensionReason=null;this.hardHoldReason=null;
   this.message='Desligado · sessão zerada; ordens já enviadas à corretora não são canceladas';
  }else this.message=reason;
  return this.status();
 }
 // 218 BEGIN USER INVEST/ACCOUNT RESYNCHRONIZATION.
 async syncAccountAndInvest(){
  // Only the user's explicit click may rebind accounts; never overlap a
  // possibly executed order, including an unidentified pending broker click.
  if(this.accountInvestSyncPending||this.arming||this.executing||this.pending||
     this.unresolvedDetail().orders>0||this.unresolvedExposure()>0||
     [...this.unresolvedBatches.values()].some(b=>b.orders.some(o=>
       (o.clicked||o.dispatchUncertain)&&!o.settled&&!o.rejected)))
   throw Error('Existe operação pendente. Aguarde a confirmação da corretora antes de atualizar Invest.');
  const before=this.context(),clock=this.clock(),first=validBrokerBalance(before?.brokerBalance);
  const mode=String(before?.brokerMode||'').toLowerCase();
  if(!before?.provider||!before.asset||!['demo','real'].includes(mode)||
     !first||first.provider!==before.provider||
     !freshBalance(first,clock)||clock-Number(first.receivedAt)>5000)
   throw Error('Conta DEMO/REAL e saldo ainda não confirmados na corretora. Confira a conta e tente novamente.');
  const generation=this.generation,sessionId=this.sessionId;
  this.accountInvestSyncPending=true;
  // A queued signal from the old account is NEVER carried into the new one.
  this.queuedSignal=null;
  try{
   const reading=await this.driver.prepare(before.provider,before);
   const after=this.context(),actual=validBrokerBalance(after?.brokerBalance);
   if(this.generation!==generation||this.sessionId!==sessionId||this.arming||
      this.executing||this.pending||this.unresolvedDetail().orders>0||
      !after||!this.sameContext(before,after)||
      Number(before.durationMs)!==Number(after.durationMs)||
      String(after.brokerMode||'').toLowerCase()!==mode||
      !actual||actual.provider!==first.provider||actual.accountId!==first.accountId||
      !freshBalance(actual,this.clock())||this.clock()-Number(actual.receivedAt)>5000)
    throw Error('Conta, ativo ou prazo mudou durante a leitura. Invest antigo preservado.');
   const stake=Number(reading?.amount);
   if(!Number.isFinite(stake)||stake<=0||stake>1000000)
    throw Error('Não consegui identificar o Invest atual na corretora. Nenhum valor antigo foi confirmado.');
   const changed=!!this.session&&(
     !this.sameContext(this.session,after)||
     Number(this.session.durationMs)!==Number(after.durationMs)||
     this.session.accountId==null||String(this.session.accountId)!==actual.accountId||
     String(this.session.brokerMode||'').toLowerCase()!==mode);
   if(changed){
    // DEMO/REAL cannot inherit each other's profit, stops baseline or
    // Martingale. User must explicitly choose Ligar bot for a new account.
    this.stop('Conta alterada · sessão antiga encerrada',{reset:true});
   }
   this.config.amount=money(stake);
   this.balanceRisk.observe(actual);
   if(!changed&&this.suspensionReason==='Invest não confirmado')
    this.suspensionReason=null;
   if(!changed&&this.enabled)this.watch();
   this.queuedSignal=null;
   const latest=executorSignal(after.analysis);if(latest)this.seen.add(latest.id);
   const required=money(this.config.amount*this.nextClicks());
   const enough=actual.amount>=required&&(
      this.config.stopLoss<=0||required<=this.lossBudgetRemaining()+0.000001);
   this.message=(this.enabled?'Ligado':'Desligado')+
     ' · conta '+mode.toUpperCase()+' · Invest '+this.config.amount.toFixed(2)+' confirmado'+
     (!enough?' · saldo/Stop Loss insuficiente para próxima entrada':
       changed?' · clique Ligar bot para continuar':
       this.enabled?' · aguardando próximo sinal':' · pronto para Ligar bot');
   return this.status();
  }finally{this.accountInvestSyncPending=false;}
 }
 // 218 END USER INVEST/ACCOUNT RESYNCHRONIZATION.
 observeBalance(value){this.balanceRisk.observe(value);if(this.enabled)this.watch();}
 // Defensive reconciliation: a batch with all broker-identified results
 // should never remain in the old pending/unresolved maps after callback
 // ordering changes. Never infer an unreported result from a price move.
 reconcileCompletedBatches(){
  const pending=this.pending;
  if(pending?.dispatchComplete&&!this.executing&&pending.orders.length&&
   pending.orders.every(o=>o.settled))this.finishBatch(pending);
  for(const [id,b] of this.unresolvedBatches){
   if(!b.dispatchComplete||!b.orders.every(o=>o.settled||(!o.clicked&&!o.dispatchUncertain)||o.rejected))continue;
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
   .filter(o=>(o.clicked||o.dispatchUncertain)&&!o.settled&&!o.rejected);
  const waitingResult=outstanding.filter(o=>o.orderId!=null).length;
  const waitingId=outstanding.filter(o=>o.clicked&&!o.orderId).length;
  const uncertainAttempts=outstanding.filter(o=>o.dispatchUncertain&&!o.clicked).length;
  const earliestExit=batches.reduce((m,b)=>
   Number(b.exitAt)>0?Math.min(m,Number(b.exitAt)):m,Infinity);
  return{batches:batches.length,orders:outstanding.length,waitingId,
   waitingResult,uncertainAttempts,overdueMs:Number.isFinite(earliestExit)?Math.max(0,now-earliestExit):0};
 }
 unresolvedExposure(){
  let amount=0;
  for(const batch of this.unresolvedBatches.values())for(const p of batch.orders)
   if((p.clicked||p.dispatchUncertain)&&!p.settled&&!p.rejected)amount+=Number(p.amount)||0;
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
  // A late broker settlement cannot freeze fixed-direction martingale forever.
  // Keep a brief close-ack grace, then quarantine unknown orders with stake
  // reserved. Never invent a win/loss; a late settlement can still apply before
  // the next physical batch, otherwise new cadence resumes at baseline.
  if(batch.independent&&this.config.martingaleEnabled&&
     batch.orders.some(p=>p.clicked&&!p.settled&&!p.rejected)&&
     now<Number(batch.exitAt)+2500){
    this.message='Ligado · aguardando resultado da corretora para o próximo martingale';
    return false;
  }
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
  const attemptedOnly=batch.orders.every(p=>p.dispatchUncertain&&!p.clicked&&!p.orderId);
  this.message=attemptedOnly?
   'Ligado · janela anterior encerrada; tentativa não comprovada; próximo sinal normal':
   'Ligado · operação anterior vencida; próximo sinal com 1 clique · resultado financeiro pendente';
  return true;
 }
 confirmStakeAfterBalanceMismatch(context,now){
  if(this.stakeRefreshPending||now-this.stakeRefreshAt<5000)return;
  const provider=context.provider,asset=context.asset,generation=this.generation;
  const accountId=String(this.balanceRisk.current?.accountId||'');
  this.stakeRefreshAt=now;
  this.stakeRefreshPending=Promise.resolve().then(()=>this.driver.prepare(provider,context))
   .then(res=>{
    if(!this.enabled||this.generation!==generation||!this.session||
       !this.sameContext(this.session,this.context()))return;
    const balance=this.balanceRisk.current;
    if(!balance||String(balance.accountId)!==accountId||balance.provider!==provider)return;
    const stake=Number(res?.amount);
    if(!(Number.isFinite(stake)&&stake>0)){
      this.suspensionReason='Invest não confirmado';
      this.message='Ligado · Invest não confirmado na corretora; sem entrada por valor antigo';
      return;
    }
    this.config.amount=money(stake);
    const current=this.balanceRisk.current;
    if(current&&freshBalance(current,this.clock())&&current.amount<stake){
      this.stop('Bot parado · Invest confirmado excede o saldo atual da corretora');
    }else{
      this.suspensionReason=null;
      this.message='Ligado · Invest atualizado da corretora · aguardando próximo CALL/PUT';
    }
   })
   .catch(()=>{
    if(this.enabled&&this.generation===generation){
      this.suspensionReason='Invest não confirmado';
      this.message='Ligado · não foi possível confirmar Invest; aguardando leitura segura';
    }
   })
   .finally(()=>{this.stakeRefreshPending=null});
 }
 accountCompatible(balance=this.balanceRisk.current){return !balance||!this.session||balance.provider===this.session.provider&&(this.session.accountId==null||String(balance.accountId)===String(this.session.accountId));}
 sameContext(a,b){return a.provider===b.provider&&symbol(a.asset)===symbol(b.asset);}
 rebaseSessionIfSafe(context,balance,now){
  if(!this.enabled||!this.session||this.pending||this.executing||this.unresolvedExposure()>0)return false;
  const current=balance?.current;
  // A live account switch must remain a visible safety hold until the user
  // starts a fresh session; rebasing it silently could carry old P/L targets
  // into the wrong bankroll. Asset/duration changes without an open order can
  // still be rebased safely from the current broker balance.
  if(!this.sameContext(this.session,context))return false;
  const accountChanged=current&&this.session.accountId!=null&&
    String(this.session.accountId)!==String(current.accountId);
  if(accountChanged)return false;
  const changed=!this.sameContext(this.session,context)||
    Number(this.session.durationMs)!==Number(context.durationMs);
  if(!changed||!current||current.provider!==context.provider||!freshBalance(current,now))return false;
  this.session={provider:context.provider,asset:context.asset,durationMs:context.durationMs,
    engine:context.engine,accountId:String(current.accountId),brokerMode:context.brokerMode??null};
  this.balanceRisk.begin(context.provider);
  // Keep the session P/L counters, but anchor absolute stops to the new
  // account/asset snapshot so an old asset cannot distort the target.
  this.initialBalance=money(current.amount-this.net);
  if(this.balanceRisk.session)this.balanceRisk.session.initial=this.initialBalance;
  this.stopBalanceReference={amount:current.amount,net:this.net};
  this.lastSettlementBalanceRevision=0;this.lastBrokerSettlementAt=0;
  this.queuedSignal=null;this.seen.clear();this.lastCadenceDurationMs=null;
  this.nextScheduledAt=now;this.suspensionReason=null;
  this.message='Ligado · conta/ativo atualizado · aguardando nova confirmação';
  return true;
 }
 watch(){
  if(this.accountInvestSyncPending)return;
  if(!this.enabled&&!this.pending)return;
  const now=this.clock(),c=this.context(),p=this.pending;
  // Quarantine pre-start account readings until the native broker supplies
  // a fresh observation. Genuine changed accounts remain blocked thereafter.
  if(c.brokerBalance!==undefined&&
    (!this.startedAt||Number(c.brokerBalance?.receivedAt)>=this.startedAt||
     this.session?.accountId!=null&&String(c.brokerBalance?.accountId)===String(this.session.accountId)))
    this.balanceRisk.observe(c.brokerBalance);
  this.reconcileCompletedBatches();
  let balance=this.balanceRisk.view(now);
  if(this.enabled){
   // If a new session began without fresh broker balance, capture it once when available.
   // Let the first physical CALL/PUT happen with NO broker balance yet.
   // A pending debit is not the opening balance: defer the baseline until all
   // orders are settled and the broker supplies a post-settlement snapshot.
   if(this.initialBalance==null&&freshBalance(balance.current,now)&&balance.current.provider===this.session?.provider&&
     (this.session.accountId==null||String(balance.current.accountId)===String(this.session.accountId))&&
     !this.pending&&!this.executing&&this.unresolvedExposure()===0&&
     Number(balance.current.receivedAt)>=Number(this.lastBrokerSettlementAt||0)){
    this.balanceRisk.begin(this.session.provider);
    this.initialBalance=money(balance.current.amount-this.net);
    this.balanceRisk.session.initial=this.initialBalance;
    this.session.accountId=String(balance.current.accountId);
    balance=this.balanceRisk.view(now);
   }
   if(this.rebaseSessionIfSafe(c,balance,now))balance=this.balanceRisk.view(now);
   // Unknown balance postpones ONLY the two balance-based stops, never CALL/PUT.
   const blocker=this.hardHoldReason||(!c.licensed||c.state!=='running'?'aguardando analista/acesso':
    !this.session||!this.sameContext(this.session,c)?'ativo diferente · confira o ativo':
    balance.accountChanged||!this.accountCompatible(balance.current)?'conta diferente · confira a conta':null);
   this.suspensionReason=blocker;
   if(this.stopWinReached(balance)){
    if(this.executing){
     this.suspensionReason='Stop Win atingido · aguardando fim da sequência em execução';
     this.message='Ligado · Stop Win confirmado; concluindo cliques já iniciados';
    }else this.stop('Bot parado · Stop Win atingido (saldo-alvo: '+money(this.config.stopWin)+')');
   }
   else if(this.stopLossReached(balance))
    this.stop('Bot parado · stop-loss atingido');
   else if(blocker)this.message='Ligado · suspenso por segurança: '+blocker;
   else if(!this.pending&&!this.executing&&!(this.config.amount>0))
    this.message='Ligado · aguardando sinal; Invest será sincronizado no primeiro clique';
   else if(this.session.engine!==c.engine){this.session.engine=c.engine;this.queuedSignal=null;const old=executorSignal(c.analysis);if(old&&old.engineId!==c.engine)this.seen.add(old.id);this.message='Estratégia atualizada · seguindo os próximos sinais do analista';}
  }
  if(this.enabled&&this.session.accountId==null&&balance.current?.provider===this.session.provider&&
    Number(balance.current.receivedAt)>=Number(this.startedAt||0))
    this.session.accountId=String(balance.current.accountId);
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
 pulse(freshAnchor=null,freshAudit=null){
  if(this.accountInvestSyncPending)return;
  this.watch();if(!this.enabled||this.suspensionReason)return;
  const c=this.context(),mode=this.config.directionMode||'automatic';
  const clockNow=this.clock();let s;
  if(mode==='automatic'||Number(c.durationMs)===300000){
    // Five-minute execution requires a genuinely confirmed reversal; horizon
    // alignment or a continuation alone cannot bypass the 5m structural gate.
    // The original forced cadence remains untouched for 30s and 1m.
    s=freshAnchor?executorSignal({vnext:{futureEntryAnchor:freshAnchor}}):executorSignal(c.analysis);
    if(Number(c.durationMs)===300000){
      if(!(s?.fiveMinuteReversalConfirmed===true)){
        s=null;
        if(mode!=='automatic')this.message='Ligado · 5m apenas reversões confirmadas · aguardando';
      }else if(mode!=='automatic'&&s.side!==(mode==='call'?'CALL':'PUT')){
        s=null;
        this.message='Ligado · aguardando reversão 5m na direção escolhida';
      }
    }
  }else {
    // Below 5m, periodic CALL/PUT retains its established behavior.
    const interval=Number(c.durationMs);
    if(!(interval>=5000&&interval<=300000))return;
    if(this.lastCadenceDurationMs!==interval){
     this.lastCadenceDurationMs=interval;
     this.nextScheduledAt=clockNow;
    }
    const due=Number(this.nextScheduledAt??clockNow);
    if(clockNow>=due){
      this.nextScheduledAt=due+interval*(Math.floor((clockNow-due)/interval)+1);
      const quoteAt=Number(c.quoteAt||0),price=Number(c.quote||0);
      if(!this.pending&&!this.executing&&quoteAt>0&&quoteAt<=clockNow&&clockNow-quoteAt<=2500&&price>0)
        s={id:'independent|'+this.sessionId+'|'+mode+'|'+due,engineId:c.engine,side:mode==='call'?'CALL':'PUT',
           at:clockNow,exitAt:clockNow+c.durationMs,entryPrice:price,durationMs:c.durationMs,independent:true};
      else this.message='Ligado · entrada programada pulada: cotação atrasada ou corretora ocupada';
    }
  }
  if(s?.engineId&&s.engineId!==c.engine)return;
  if(mode==='automatic'&&s?.entryFamilyExplicit&&c.entryFamily&&s.entryFamily!==c.entryFamily)return;
  if(mode==='automatic'&&s?.entryFamilyExplicit&&s.entryFamily!=='automatic'&&s.observedEntryFamily&&s.observedEntryFamily!==s.entryFamily)return;
  // Last mile: never queue a 5m signal without the current quote's proof.
  if(Number(c.durationMs)===300000&&s&&
     (Number(s.durationMs)!==300000||!(s.fiveMinuteReversalConfirmed===true)))return;
  // Diagnostic metadata is never part of order acceptance/validation.
  if(mode==='automatic'&&freshAnchor&&freshAudit&&s)s.auditEvidence=freshAudit;
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
   if(this.config.stopLoss>0&&this.nextAmount()>Math.max(0,this.lossBudgetRemaining())+0.000001){
    this.queuedSignal=null;this.message='Ligado · aguardando: ordens pendentes podem ultrapassar o risco disponível';
    return;
   }
   this.queuedSignal=null;
   const d=this.unresolvedDetail(now);
   this.message='Ligado · aguardando corretora: '+d.orders+' ordem(ns) sem resultado ('+
    d.waitingId+' sem ID; '+d.waitingResult+' com ID) · nível preservado';
   return;
  }
  if(now<queued.at||now-queued.at>maxSignalAgeMs(queued.durationMs)||queued.durationMs!==c.durationMs||now>=queued.exitAt){
   this.queuedSignal=null;
   const age=now-queued.at;
   this.message='Sinal recebido fora do prazo ('+Math.max(0,Math.round(age))+'ms; limite '+maxSignalAgeMs(queued.durationMs)+'ms) · aguardando nova análise';
   return;
  }
  const balance=this.balanceRisk.view(now);
  this.queuedSignal=null;
  const generation=this.generation,requestedClicks=this.nextClicks(),unitAmount=this.config.amount;
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
  if(this.config.stopLoss>0&&amount>Math.max(0,this.lossBudgetRemaining(balance))+0.000001){
   this.message='Ligado · sinal ignorado: risco de entrada excede saldo conservador; stop depende do saldo confirmado';
   return;
  }
  if(!this.accountCompatible(balance.current)){this.suspensionReason='conta divergente';this.message='Ligado · suspenso: conta divergente';return;}
  if(balance.current&&balance.current.provider===c.provider&&!balance.reconciling&&freshBalance(balance.current,now)&&balance.current.amount<amount){
   this.message='Ligado · saldo abaixo do Invest atual; sinal ignorado';
   this.queuedSignal=null;
   return;
  }
  const batch={...queued,engine:c.engine,provider:c.provider,asset:c.asset,activeId:c.activeId,amount,unitAmount,clickCount,martingaleLevel,martingaleFallback,sessionId:this.sessionId,accountId:this.session.accountId??(Number(balance.current?.receivedAt)>=Number(this.startedAt||0)?balance.current?.accountId:null),state:'sending',orders:[],dispatchComplete:false,netPnl:0};
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
  // Audit is read-only. Freeze a small snapshot before the click; append later
  // outside the critical signal-to-broker path. Never gate an order on logging.
  if(this.onAuditEvent){
   try{this.emitAudit(decisionAudit({signal:queued,context:c,mode,martingaleLevel,clickCount,now}));}
   catch{}
  }
  // The FIRST broker click must meet the strict signal freshness limit.
  // Subsequent martingale clicks have a separate, bounded batch deadline;
  // they can never continue beyond this operation's selected expiry.
  const firstClickDeadline=Math.min(Number(queued.exitAt),Number(queued.at)+maxSignalAgeMs(queued.durationMs));
  const batchClickDeadline=Math.min(Number(queued.exitAt),Number(queued.at)+maxBatchDispatchMs(queued.durationMs));
  const currentMarketValid=(clickIndex=0)=>{
   if(mode!=='automatic'||clickIndex!==0)return true;
   const current=this.context();
   if(queued.entryFamilyExplicit&&current.entryFamily&&queued.entryFamily!==current.entryFamily)return false;
   if(queued.entryFamilyExplicit&&queued.entryFamily!=='automatic'&&queued.observedEntryFamily&&queued.observedEntryFamily!==queued.entryFamily)return false;
   const now=this.clock();
   if(Number(queued.sourceQuoteAt)>0&&!liveEntryQuoteReview({signal:queued,context:current,now}).ok)return false;
   return reviewDirectionBeforeClick({signal:queued,context:current,now}).ok;
  };
  const valid=(clickIndex=0)=>currentMarketValid(clickIndex)&&this.enabled&&generation===this.generation&&this.pending===batch&&this.config.directionMode===mode&&this.sameContext(this.session,this.context())&&batch.durationMs===this.context().durationMs&&batch.engine===this.context().engine&&this.context().state==='running'&&this.context().licensed===true&&this.accountCompatible(this.context().brokerBalance)&&(!this.context().brokerBalance||batch.accountId==null||String(this.context().brokerBalance.accountId)===String(batch.accountId))&&(this.config.stopLoss===0||batch.amount<=this.lossBudgetRemaining()+0.000001)&&this.clock()>=queued.at&&this.clock()<queued.exitAt&&this.clock()<=(clickIndex===0?firstClickDeadline:batchClickDeadline)&&(!this.deadlineAt||this.clock()<this.deadlineAt);
  const invalidReason=(clickIndex=0)=>{
   const current=this.context(),at=this.clock(),age=at-Number(queued.at);
   if(!this.enabled||generation!==this.generation)return 'bot desligado ou sessão alterada';
   if(this.pending!==batch)return 'operação pendente mudou antes do clique';
   if(this.config.directionMode!==mode)return 'modo do bot mudou antes do clique';
   if(mode==='automatic'&&clickIndex===0){
    if(queued.entryFamilyExplicit&&current.entryFamily&&queued.entryFamily!==current.entryFamily)return 'tipo de entrada mudou antes do clique';
    if(queued.entryFamilyExplicit&&queued.entryFamily!=='automatic'&&queued.observedEntryFamily&&queued.observedEntryFamily!==queued.entryFamily)return 'tipo de entrada não corresponde ao sinal';
    if(Number(queued.sourceQuoteAt)>0){const review=liveEntryQuoteReview({signal:queued,context:current,now:at});
     if(!review.ok)return 'leitura de preço mudou antes do clique: '+review.reason;}
    const direction=reviewDirectionBeforeClick({signal:queued,context:current,now:at});
    if(!direction.ok)return 'continuidade perdeu validade antes do clique: '+direction.reason;
   }
   if(at<Number(queued.at)||at>=(clickIndex===0?firstClickDeadline:batchClickDeadline)||at>=Number(queued.exitAt))
    return 'sinal venceu na preparação ('+Math.max(0,Math.round(age))+'ms; limite '+maxSignalAgeMs(queued.durationMs)+'ms)';
   if(!this.sameContext(this.session,current))return 'corretora ou ativo mudou antes do clique';
   if(Number(batch.durationMs)!==Number(current.durationMs))return 'expiração do analista mudou antes do clique';
   if(batch.engine!==current.engine)return 'estratégia do analista mudou antes do clique';
   if(current.state!=='running'||current.licensed!==true)return 'analista pausado ou licença inativa';
   if(!this.accountCompatible(current.brokerBalance))return 'conta da corretora mudou antes do clique';
   if(current.brokerBalance&&batch.accountId!=null&&String(current.brokerBalance.accountId)!==String(batch.accountId))
    return 'conta da corretora mudou antes do clique';
   if(this.config.stopLoss>0&&batch.amount>this.lossBudgetRemaining()+0.000001)
    return 'limite de perda restante não autoriza a entrada';
   if(this.deadlineAt&&at>=this.deadlineAt)return 'limite de tempo da sessão atingido';
   return 'validação da entrada mudou antes do clique';
  };
  let captured=false;
  const jobs=[];
  this.executing=true;
  for(let i=0;i<clickCount;i++){
   const order={...queued,entryDeadlineAt:i===0?firstClickDeadline:batchClickDeadline,invalidReason:()=>invalidReason(i),id:batch.id+'|click-'+i,engine:batch.engine,provider:c.provider,asset:c.asset,activeId:c.activeId,amount:unitAmount,martingaleLevel:batch.martingaleLevel,sessionId:this.sessionId,accountId:batch.accountId,state:'sending',requestId:null,orderId:null};
   batch.orders.push(order);order.isValid=()=>valid(i);
   order.useBrokerStake=(source,{confirmed=false}={})=>{
    const stake=money(Number(source));
    if(!(stake>0)||stake>1000000)return;
    if(!confirmed&&this.config.stopLoss>0&&stake>Math.max(0,this.lossBudgetRemaining())+1e-6)
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
    if(!order.isValid())throw Object.assign(Error(order.invalidReason?.()||'Entrada cancelada antes do clique.'),{beforeClick:true});
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
    if(this.onAuditEvent)try{
     const expiry=order.nativeExpiryInspection;
     this.emitAudit({type:'trade_dispatch_failure',ts:this.clock(),provider:c.provider,
      batchId:batch.id,localId:order.id,durationMs:order.durationMs,side:order.side,
      reason:order.error.slice(0,240),beforeClick:e?.beforeClick===true,
      clicked:order.clicked===true,dispatchUncertain:order.dispatchUncertain===true,
      nativeExpiry:expiry?{preferredMs:expiry.preferredMs??null,currentMs:expiry.currentMs??null,
       revision:expiry.revision??null,blocked:expiry.blocked===true}:null});
    }catch{}
    if(e?.brokerRejected===true)order.rejected=true;
    if((order.clicked!==true&&!order.dispatchUncertain)||e?.beforeClick===true)order.cancelled=true;
    const context=this.context();
    const changed=order.clicked!==true&&this.enabled&&generation===this.generation&&this.sameContext(this.session,context)&&(batch.engine!==context.engine||batch.durationMs!==context.durationMs);
    if(changed&&!batch.orders.some(p=>p.clicked)){this.message='Estratégia alterada · aguardando próximo sinal';return;}
    // Unknown click attempt: neither mark an executed trade nor guess LOSS.
    if(order.dispatchUncertain&&!order.clicked&&e?.brokerRejected!==true){
     // The attempt is NOT a confirmed trade. Do not stop the bot, repeat
     // a possibly delivered order, or count WIN/LOSS without a broker ID.
     // The existing expiry releases the window for the next fresh signal.
     order.state='attempt-unverified';
     if(this.enabled)this.message='Ligado · tentativa não comprovada; próxima janela segue normalmente';
     return;
    }
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
     if(this.enabled)this.message='Ligado · clique não enviado: '+String(order.error||'validação antes do clique').slice(0,105)+' · aguardando novo sinal';
     return;
    }
    // Explicit broker rejection and genuine state mismatches are distinct
    // from a delayed broker acknowledgement.
    if(this.enabled)this.message='Ligado · entrada rejeitada antes da confirmação: '+order.error+' · próximo sinal';
   }));
  }
  this.inflight=Promise.allSettled(jobs).then(()=>{
   batch.dispatchComplete=true;batch.orders=batch.orders.filter(p=>(p.clicked||p.dispatchUncertain)&&!p.rejected&&!p.cancelled);
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
    batch.martingaleLevel>0&&!batch.detached&&batch.orders.length===batch.clickCount&&
    batch.orders.every(p=>p.clicked||p.orderId!=null)){
    batch.terminalCycleConsumed=true;
    batch.progressionApplied=true;
    this.martingaleLevel=0;
   }
   if(batch.orders.every(p=>p.state==='accepted'||p.settled))batch.state='accepted';
   if(batch.orders.length!==batch.clickCount&&this.enabled&&!this.hardHoldReason){
    // Do not recreate missing clicks. Stay armed, but any already-clicked
    // child still requires individual broker confirmation before progress.
    this.message='Ligado · sequência parcial · aguardando fechamento sem repetir cliques';
   }
    // Fixed-direction timing may overlap identified broker operations.
    // Keep still-open stake reserved and correlate later settlements by ID.
    if(batch.independent&&!this.config.martingaleEnabled&&this.pending===batch&&!batch.orders.every(p=>p.settled)){
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
  p.state='accepted';p.clicked=true;p.dispatchUncertain=false;
  // A late broker ACK proves this was a real order despite earlier
  // Playwright uncertainty. It can now be accounted for normally.
  if(p.error&&p.clickAttempted)delete p.error;
  p.orderId=String(event.orderId);p.requestId=event.requestId??p.requestId;p.accountId=event.accountId??p.accountId;
  if(Number(event.exitAt)>p.at){
   const mismatch=Math.abs(Number(event.exitAt)-((p.clickedAt??p.at)+p.durationMs))>1500;
   p.exitAt=Number(event.exitAt);
   if(mismatch){
    // Broker expiry mismatch is diagnostic, never an extra CALL/PUT gate.
    // Keep the broker's actual settlement timestamp and never touch its UI.
    const clickedAt=Number(p.clickedAt??p.at);
    p.brokerExpiryMismatchMs=Number(event.exitAt)-(clickedAt+p.durationMs);
    this.lastBrokerExpiryMismatch={expectedDurationMs:p.durationMs,
      reportedExitAt:Number(event.exitAt),reportedDurationFromClickMs:Number(event.exitAt)-clickedAt,
      deltaMs:p.brokerExpiryMismatchMs,at:this.clock()};
   }
  }
  if(num(event.entryPrice)&&Number(event.entryPrice)>0)p.entryPrice=Number(event.entryPrice);
  if(p.accountId!=null&&!batch.detached&&this.session){
   if(this.session.accountId!=null&&String(p.accountId)!==String(this.session.accountId)){
    this.hardHoldReason='conta da ordem divergente';this.suspensionReason=this.hardHoldReason;this.message='Ligado · suspenso por segurança: '+this.suspensionReason;
   }else this.session.accountId=String(p.accountId);
  }
  batch.executionSource=p.executionSource='broker';batch.accountId=p.accountId;batch.orderId??=p.orderId;batch.exitAt=Math.max(batch.exitAt,p.exitAt);
  p.executionSource=event.source||'broker';
  if(this.onAuditEvent){try{this.emitAudit(acceptedAudit({...event,localId:p.id,entryPrice:p.entryPrice,exitAt:p.exitAt,brokerReportedExitAt:event.exitAt??null,nativeExpiry:p.nativeExpiryInspection??null},this.clock()))}catch{}}
  if(batch.detached)return;
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
   if(full)this.martingaleLevel=!this.config.martingaleEnabled?0:
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
   if(this.onAuditEvent){try{this.emitAudit(settlementAudit(event,this.clock()))}catch{}}
   if(batch.dispatchComplete&&batch.orders.every(o=>o.settled||(!o.clicked&&!o.dispatchUncertain)||o.rejected))
    this.unresolvedBatches.delete(batch.id);
   return true; // Old broker settlement cannot change a freshly reset session.
  }
  const old=this.ledger.get(key);if((!p&&!old)||!num(event.netPnl)||(event.source&&event.source!=='broker'))return false;
  const trade=p||old;if(event.accountId!=null&&trade.accountId!=null&&String(event.accountId)!==String(trade.accountId))return false;
  if(num(event.amount)&&Number(event.amount)>0)trade.amount=Number(event.amount);
  if(old?.source==='broker'||trade.sessionId!==undefined&&trade.sessionId!==this.sessionId)return false;
  // Settlement is independent evidence of the effective broker expiry.
  // Never mistake a 30s close for a 60s prediction. Require TWO distinct
  // broker-confirmed closes before diagnosing an unreported native reset.
  if(Number.isFinite(Number(trade.clickedAt))&&Number(trade.clickedAt)>0){
   const requested=Number(trade.durationMs),elapsed=this.clock()-Number(trade.clickedAt);
   const short60=requested===60000&&elapsed>=25000&&elapsed<=35000;
   const normal60=requested===60000&&elapsed>=54000&&elapsed<=68000;
   if(short60){
    const prior=this.expirySettlementEvidence;
    const count=prior?.expectedMs===60000&&
      this.clock()-Number(prior.at)<600000?prior.count+1:1;
    this.expirySettlementEvidence={expectedMs:60000,actualMs:30000,count,at:this.clock()};
    if(count>=2)this.lastBrokerExpiryMismatch={
      expectedDurationMs:60000,reportedDurationFromClickMs:30000,
      deltaMs:-30000,at:this.clock(),source:'broker-settlement-timing',samples:count
    };
   }else if(normal60){
    this.expirySettlementEvidence=null;
    if(this.lastBrokerExpiryMismatch?.source==='broker-settlement-timing')
      this.lastBrokerExpiryMismatch=null;
   }
  }
  this.net=money(this.net+Number(event.netPnl)-Number(old?.netPnl||0));this.lastBrokerSettlementAt=this.clock();this.lastSettlementBalanceRevision=Number(this.balanceRisk.current?.revision||0);if(!old||old.source==='unresolved'){
   this.closed++;
   if(Number(event.netPnl)>0)this.sessionWins++;
   else if(Number(event.netPnl)<0)this.sessionLosses++;
  }
  const row={provider:trade.provider,accountId:trade.accountId,orderId:trade.orderId,side:trade.side,amount:trade.amount,sessionId:trade.sessionId,martingaleLevel:trade.martingaleLevel,entryPrice:event.entryPrice??trade.entryPrice,exitPrice:event.exitPrice??null,netPnl:Number(event.netPnl),source:'broker',result:Number(event.netPnl)>0?'win':Number(event.netPnl)<0?'loss':'tie',closedAt:this.clock()};
  this.ledger.set(key,row);if(this.ledger.size>2048)this.ledger.delete(this.ledger.keys().next().value);
  this.history=[row,...this.history.filter(x=>!(x.provider===row.provider&&x.orderId===row.orderId))].slice(0,5);
  if(this.onAuditEvent){try{this.emitAudit(settlementAudit({...event,source:'broker'},this.clock()))}catch{}}
  if(p){p.settled=true;batch.netPnl=money(batch.netPnl+Number(event.netPnl));
   if(late){
    if(batch.orders.every(o=>o.settled||(!o.clicked&&!o.dispatchUncertain)||o.rejected)){
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
  if(this.enabled&&this.config.stopWin>0&&this.stopWinReached()){
   if(this.executing){
    this.suspensionReason='Stop Win atingido · aguardando fim da sequência em execução';
    this.message='Ligado · Stop Win confirmado; concluindo cliques já iniciados';
   }else this.stop('Bot parado · Stop Win atingido (saldo-alvo: '+money(this.config.stopWin)+')');
  }
  else if(this.enabled&&this.config.stopLoss>0&&this.stopLossReached())this.stop('Bot parado · limite de perda da sessão atingido');
  if(this.enabled&&this.lastBrokerExpiryMismatch?.source==='broker-settlement-timing'&&
    this.clock()-this.lastBrokerExpiryMismatch.at<600000&&
    Number(this.session?.durationMs)===60000)
   this.message='EXPIRAÇÃO DIVERGENTE: corretora encerrou em ~30s; Sentinel configurado em 60s. Confira a expiração na corretora.';
  return true;
 }
 nextClicks(){return this.config.martingaleMultiplier**(this.config.martingaleEnabled?this.martingaleLevel:0);}
 nextAmount(){return money(this.config.amount*this.nextClicks());}
 // Session limits count confirmed broker settlements and unresolved exposure,
 // not delayed account-balance revisions that can produce false losses.
 riskNet(_balance=this.balanceRisk.view(this.clock())){return money(this.net-this.unresolvedExposure());}
 brokerThresholdBalance(balance=this.balanceRisk.view(this.clock())){
  const b=balance.current;
  if(!this.session||!b||b.provider!==this.session.provider||
     (this.session.accountId!=null&&String(b.accountId)!==String(this.session.accountId))||
     !freshBalance(b,this.clock())||Number(b.receivedAt)<this.lastBrokerSettlementAt||
     (Number(b.receivedAt)===this.lastBrokerSettlementAt&&Number(b.revision)<=Number(this.lastSettlementBalanceRevision||0))||
     balance.reconciling||this.pending||this.executing||this.unresolvedExposure()>0)return null;
  return b.amount;
 }
 stopTargetBalance(balance=this.balanceRisk.view(this.clock())){
  // Only a fresh reconciled account balance can trigger absolute stop targets.
  // No cached opening bankroll, speculative P&L, or account estimates.
  return this.brokerThresholdBalance(balance);
 }
 // Stop targets are absolute broker balances: e.g. 50 -> win 60, loss 40.
 stopWinReached(balance=this.balanceRisk.view(this.clock())){
  if(!(this.config.stopWin>0))return false;
  const current=this.stopTargetBalance(balance);
  return current!=null&&current>=this.config.stopWin;
 }
 stopLossReached(balance=this.balanceRisk.view(this.clock())){
  if(!(this.config.stopLoss>0))return false;
  const current=this.stopTargetBalance(balance);
  return current!=null&&current<=this.config.stopLoss;
 }
 lossBudgetRemaining(balance=this.balanceRisk.view(this.clock())){
  // No fabricated zero remaining allowance before the broker sends a balance.
  const confirmed=this.stopTargetBalance(balance);
  // The stop itself is triggered ONLY by confirmed broker balance.
  // Separately, keep conservative pre-click exposure budgeting from already
  // settled P&L so Martingale never risks exceeding the chosen floor while
  // the broker's next balance receipt is still pending.
  const estimate=this.initialBalance==null?null:money(this.initialBalance+this.net);
  // A current broker balance supersedes any inferred baseline, including
  // deposits or withdrawals made while the bot was active.
  const current=confirmed==null?estimate:confirmed;
  if(current==null)return Number.POSITIVE_INFINITY;
  return money(Math.max(0,current-this.config.stopLoss-this.unresolvedExposure()));
 }
 status(){const balance=this.balanceRisk.view(this.clock()),context=this.context()||{};
  // Read the driver's already-cached snapshot for DISPLAY even while stopped.
  // A balance event may precede active-provider selection, and manual Stop
  // intentionally clears risk baselines. Neither should blank the account UI.
  const received=context.brokerBalance===undefined?balance.current:validBrokerBalance(context.brokerBalance);
  const displayed=received&&(!context.provider||received.provider===context.provider)?received:null;
  const initial=this.startedAt!=null?this.initialBalance:displayed?.amount??null,risk=this.riskNet(balance);return{capabilities:{brokerExecution:5},enabled:this.enabled,arming:!!this.arming,executing:this.executing,config:{...this.config},message:this.message,startedAt:this.startedAt??null,deadlineAt:this.deadlineAt??null,netPnl:this.net,sessionWins:this.sessionWins,sessionLosses:this.sessionLosses,calculatedBalance:initial==null?null:money(initial+this.net),availableBalance:displayed?money(displayed.amount):null,balanceSource:displayed?'broker-received-balance':'unavailable',brokerBalance:displayed,riskNetPnl:money(risk),balanceReconciling:balance.reconciling,initialBalance:initial,lossLimitRemaining:this.config.stopLoss>0&&this.initialBalance!=null?this.lossBudgetRemaining(balance):null,durationMs:context.durationMs,martingaleLevel:this.martingaleLevel,nextClicks:this.nextClicks(),nextAmount:this.nextAmount(),suspendedReason:this.suspensionReason,lastBrokerExpiryMismatch:this.lastBrokerExpiryMismatch,unresolvedBatches:this.unresolvedBatches.size,unresolvedStake:this.unresolvedExposure(),
  unresolvedDetail:this.unresolvedDetail(),consecutiveLossBatches:this.consecutiveLossBatches,executed:this.executed,closed:this.closed,pending:this.pending?{side:this.pending.side,state:this.pending.state,amount:this.pending.amount,clickCount:this.pending.clickCount,confirmedClicks:this.pending.orders.filter(p=>p.state==='accepted').length,closedClicks:this.pending.orders.filter(p=>p.settled).length,orderId:this.pending.orderId,exitAt:this.pending.exitAt,durationMs:this.pending.durationMs,entryPrice:this.pending.entryPrice}:null,history:this.history.map(x=>({...x}))};}
}

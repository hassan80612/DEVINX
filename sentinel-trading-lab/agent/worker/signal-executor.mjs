// Fixed broker stake. Martingale changes only the number of CALL/PUT clicks.
// An identified close for every order completes one progression step.
// Balance is optional; identified broker settlements control session loss limits.
import {ExecutorBalanceRisk} from './executor-balance-risk.mjs';
export const DEFAULT_EXECUTOR_CONFIG=Object.freeze({amount:0,intervalMs:30000,stopAfterMinutes:0,stopLoss:0,martingaleLevels:2,martingaleEnabled:false});
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
  this.enabled=false;this.generation=0;this.message='Desligado';this.pending=null;this.queuedSignal=null;this.seen=new Set();this.sequence=0;this.executed=0;this.closed=0;this.history=[];this.ledger=new Map();this.net=0;
 }
 configure(patch={}){
  if(this.arming)throw Error('Aguarde a ativação do bot concluir.');
  const next={...this.config};
  for(const key of Object.keys(DEFAULT_EXECUTOR_CONFIG))if(patch[key]!==undefined){if(key==='martingaleEnabled'){if(typeof patch[key]!=='boolean')throw Error('Ativação de martingale inválida.');next[key]=patch[key];}else next[key]=Number(patch[key]);}
  if(!num(next.amount)||next.amount<0||next.amount>1000000||!Number.isInteger(next.martingaleLevels)||next.martingaleLevels<0||next.martingaleLevels>10||!Number.isInteger(next.intervalMs)||next.intervalMs<5000||next.intervalMs>3600000||
   !num(next.stopAfterMinutes)||next.stopAfterMinutes<0||next.stopAfterMinutes>1440||!num(next.stopLoss)||next.stopLoss<0||next.stopLoss>1e8)throw Error('Configuração do bot inválida.');
  if(this.enabled){
   if(!(next.amount>0))throw Error('Valor por entrada deve ser positivo.');
  }
  // Keep intervalMs readable for older saved clients, but never use it to skip a CALL/PUT.
  this.config=next;
  if(!next.martingaleEnabled||this.martingaleLevel>next.martingaleLevels)this.martingaleLevel=0;
  if(this.enabled){
   this.deadlineAt=next.stopAfterMinutes?this.startedAt+next.stopAfterMinutes*60000:null;
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
  if(!(cfg.amount>0))throw Error('Valor por entrada deve ser positivo.');
  if(broker&&cfg.amount>openingBalance)throw Error('Saldo recebido insuficiente para o valor por entrada.');
  if(!(c.durationMs>0))throw Error('Selecione a expiração no analista.');
  this.arming=true;const generation=++this.generation;
  try{
   // A previous multi-click dispatch may still be finishing after Stop.
   // Do not reuse its in-flight clicks or allow a new batch to overlap it.
   if(this.executing&&this.inflight)await this.inflight.catch(()=>{});
   if(generation!==this.generation)throw Error('Reativação cancelada.');
   await this.driver.prepare(c.provider,{...c,amount:cfg.amount});
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
   this.startedAt=this.clock();this.deadlineAt=cfg.stopAfterMinutes?this.startedAt+cfg.stopAfterMinutes*60000:null;
   if(current.brokerBalance!==undefined)this.balanceRisk.observe(current.brokerBalance);
   const opening=this.balanceRisk.begin(c.provider);if(opening&&cfg.amount>opening.amount)throw Error('Saldo recebido insuficiente para o valor por entrada.');
   this.initialBalance=opening?.amount??null;this.sessionId++;this.martingaleLevel=0;this.lastEntryAt=null;this.net=0;this.executed=0;this.closed=0;this.sequence=0;this.history=[];this.ledger.clear();this.seen.clear();this.queuedSignal=null;
   const existing=executorSignal(c.analysis);if(existing)this.seen.add(existing.id);
   this.enabled=true;this.message='Ligado · aguardando próximo CALL/PUT do analista';
  }finally{this.arming=false;}
  return this.status();
 }
 stop(reason='Parado por você'){this.enabled=false;this.queuedSignal=null;this.generation++;this.message=reason;return this.status();}
 observeBalance(value){this.balanceRisk.observe(value);}
 accountCompatible(balance=this.balanceRisk.current){return !balance||!this.session||balance.provider===this.session.provider&&(this.session.accountId==null||String(balance.accountId)===String(this.session.accountId));}
 sameContext(a,b){return a.provider===b.provider&&symbol(a.asset)===symbol(b.asset);}
 watch(){
  if(!this.enabled&&!this.pending)return;
  const now=this.clock(),c=this.context(),p=this.pending;
  if(c.brokerBalance!==undefined)this.balanceRisk.observe(c.brokerBalance);
  const balance=this.balanceRisk.view(now);
  if(this.enabled){
   if(!c.licensed||c.state!=='running')this.stop('Bot parado · analista pausado ou acesso indisponível');
   else if(!this.sameContext(this.session,c))this.stop('Bot parado · ativo do analista mudou');
   else if(balance.accountChanged||!this.accountCompatible(balance.current))this.stop('Bot parado · conta da corretora mudou');
   else if(this.deadlineAt&&now>=this.deadlineAt)this.stop('Bot parado · tempo programado atingido');
   else if(this.config.stopLoss>0&&this.riskNet(balance)<=-this.config.stopLoss)this.stop('Bot parado · limite de perda da sessão atingido');
   else if(this.session.engine!==c.engine){this.session.engine=c.engine;this.queuedSignal=null;this.sequence=0;const old=executorSignal(c.analysis);if(old&&old.engineId!==c.engine)this.seen.add(old.id);this.message='Estratégia atualizada · seguindo os próximos sinais do analista';}
  }
  if(this.enabled&&this.session.accountId==null&&balance.current?.provider===this.session.provider)this.session.accountId=String(balance.current.accountId);
  if(this.enabled&&this.pending&&!this.executing&&now>this.pending.exitAt+1500){
   // A delayed close or click acknowledgement is NOT a bot stop.
   // Unknown physical clicks remain reserved; no duplicate entry.
   const done=this.pending.orders.filter(p=>p.settled).length;
   const unidentified=this.pending.orders.filter(p=>p.clicked&&!p.orderId).length;
   this.message='Ligado · aguardando corretora ('+done+'/'+this.pending.orders.length+
     ' fechadas'+(unidentified?', '+unidentified+' clique(s) sem ID':'')+') · sem repetir entradas';
  }
 }
 pulse(){
  this.watch();if(!this.enabled)return;
  const c=this.context(),s=executorSignal(c.analysis);
  if(s?.engineId&&s.engineId!==c.engine)return;
  if(s&&!this.seen.has(s.id)){
   this.seen.add(s.id);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value);
   // Every NEW analyst signal is eligible. No independent bot cooldown.
   this.sequence++;this.queuedSignal=s;
  }
  const queued=this.queuedSignal;if(!queued)return;
  const now=this.clock();
  if(now<queued.at||now-queued.at>1500||queued.durationMs!==c.durationMs||now>=queued.exitAt){this.queuedSignal=null;this.message='Sinal antigo descartado · aguardando próximo';return;}
  if(this.pending){this.message='Ligado · aguardando encerramento da entrada anterior';return;}
  const balance=this.balanceRisk.view(now);
  this.queuedSignal=null;
  const amount=money(this.config.amount*2**(this.config.martingaleEnabled?this.martingaleLevel:0));
  if(!Number.isFinite(amount)||amount>1000000){this.stop('Bot parado · valor da próxima entrada excede o máximo permitido');return;}
  if(this.config.stopLoss>0&&amount>Math.max(0,this.config.stopLoss+this.riskNet(balance))+0.000001){this.stop('Bot parado · próxima entrada excede o limite de perda restante');return;}
  if(!this.accountCompatible(balance.current)){this.stop('Bot parado · conta da corretora mudou');return;}
  if(balance.current&&balance.current.provider===c.provider&&!balance.reconciling&&balance.current.amount<amount){this.stop(balance.source==='broker'?'Bot parado · saldo da corretora insuficiente':'Bot parado · saldo calculado insuficiente');return;}
  const generation=this.generation,clickCount=this.nextClicks(),unitAmount=this.config.amount;
  const batch={...queued,engine:c.engine,provider:c.provider,asset:c.asset,activeId:c.activeId,amount,unitAmount,clickCount,martingaleLevel:this.martingaleLevel,sessionId:this.sessionId,accountId:this.session.accountId??balance.current?.accountId??null,state:'sending',orders:[],dispatchComplete:false,netPnl:0};
  this.pending=batch;
  const valid=()=>this.enabled&&generation===this.generation&&this.pending===batch&&this.sameContext(this.session,this.context())&&batch.durationMs===this.context().durationMs&&batch.engine===this.context().engine&&this.context().state==='running'&&this.context().licensed===true&&this.accountCompatible(this.context().brokerBalance)&&(!this.context().brokerBalance||batch.accountId==null||String(this.context().brokerBalance.accountId)===String(batch.accountId))&&(this.config.stopLoss===0||batch.amount<=this.config.stopLoss+this.riskNet()+0.000001)&&this.clock()-queued.at<=1500&&(!this.deadlineAt||this.clock()<this.deadlineAt);
  let captured=false;
  const jobs=[];
  this.executing=true;
  for(let i=0;i<clickCount;i++){
   const order={...queued,id:batch.id+'|click-'+i,engine:batch.engine,provider:c.provider,asset:c.asset,activeId:c.activeId,amount:unitAmount,martingaleLevel:batch.martingaleLevel,sessionId:this.sessionId,accountId:batch.accountId,state:'sending',requestId:null,orderId:null};
   batch.orders.push(order);order.isValid=valid;
   order.captureEntry=()=>{
    const snapshot=this.context();order.clickedAt=this.clock();order.exitAt=order.clickedAt+order.durationMs;batch.exitAt=Math.max(batch.exitAt,order.exitAt);this.lastEntryAt=order.at;
    if(!captured){captured=true;if(snapshot.brokerBalance!==undefined)this.balanceRisk.observe(snapshot.brokerBalance);this.balanceRisk.capture({...batch,exitAt:batch.exitAt});}
    if(num(snapshot.quote)&&Number(snapshot.quote)>0&&Number(snapshot.quoteAt)>0&&order.clickedAt-Number(snapshot.quoteAt)>=0&&order.clickedAt-Number(snapshot.quoteAt)<=2500){order.entryPrice=Number(snapshot.quote);order.entryQuoteAt=Number(snapshot.quoteAt);}
   };
   jobs.push(Promise.resolve().then(async()=>{
    if(!valid())throw Object.assign(Error('Entrada cancelada antes do clique.'),{beforeClick:true});
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
     if(this.enabled)this.message='Ligado · sinal ignorado antes do clique · próximo sinal do analista';
     return;
    }
    // Explicit broker rejection and genuine state mismatches are distinct
    // from a delayed broker acknowledgement.
    this.stop(order.error);
   }));
  }
  this.inflight=Promise.allSettled(jobs).then(()=>{
   batch.dispatchComplete=true;batch.orders=batch.orders.filter(p=>p.clicked&&!p.rejected&&!p.cancelled);
   batch.amount=money(batch.orders.reduce((sum,p)=>sum+p.amount,0));if(this.balanceRisk.trade&&!this.balanceRisk.trade.settled)this.balanceRisk.trade.amount=batch.amount;
   if(!batch.orders.length){if(this.pending===batch)this.pending=null;this.balanceRisk.trade=null;return;}
   if(batch.orders.every(p=>p.state==='accepted'||p.settled))batch.state='accepted';
   if(batch.orders.length!==batch.clickCount&&this.enabled){
    // Do not recreate missing clicks. Stay armed, but any already-clicked
    // child still requires individual broker confirmation before progress.
    this.message='Ligado · sequência parcial · aguardando fechamento sem repetir cliques';
   }
   this.finishBatch(batch);
  }).finally(()=>{this.executing=false;});
 }
 sent(requestId,localId){const p=this.pending?.orders.find(p=>p.id===localId)||(this.pending?.orders.length===1?this.pending.orders[0]:null);if(p&&requestId){p.requestId=String(requestId);p.clicked=true;}}
 rejected(event){const p=this.pending?.orders.find(p=>p.id===event.localId||p.requestId!=null&&String(p.requestId)===String(event.requestId));if(p&&event.provider===p.provider){p.rejected=true;this.stop('Ordem rejeitada pela corretora · sequência interrompida.');}}
 accepted(event){
  const batch=this.pending;if(!batch||event.provider!==batch.provider||!event.orderId)return;
  const p=batch.orders.find(p=>p.id===event.localId||p.requestId!=null&&event.requestId!=null&&String(p.requestId)===String(event.requestId))||(batch.orders.length===1?batch.orders[0]:null);
  if(!p||p.state==='accepted'||p.settled)return;
  if(p.requestId!=null&&String(event.requestId)!==String(p.requestId))return;
  if(batch.orders.some(other=>other!==p&&String(other.orderId)===String(event.orderId))){this.stop('Bot parado · confirmação de ordem duplicada');return;}
  p.state='accepted';p.clicked=true;p.orderId=String(event.orderId);p.requestId=event.requestId??p.requestId;p.accountId=event.accountId??p.accountId;
  if(Number(event.exitAt)>p.at){const mismatch=Math.abs(Number(event.exitAt)-((p.clickedAt??p.at)+p.durationMs))>1500;p.exitAt=Number(event.exitAt);if(mismatch)this.stop('Bot parado · duração da corretora difere do analista; ajuste manualmente');}
  if(num(event.entryPrice)&&Number(event.entryPrice)>0)p.entryPrice=Number(event.entryPrice);
  if(p.accountId!=null){if(this.session.accountId!=null&&String(p.accountId)!==String(this.session.accountId))this.stop('Bot parado · conta da corretora mudou');else this.session.accountId=String(p.accountId);}
  batch.executionSource=p.executionSource='broker';batch.accountId=p.accountId;batch.orderId??=p.orderId;batch.exitAt=Math.max(batch.exitAt,p.exitAt);
  p.executionSource=event.source||'broker';this.lastEntryAt=p.at;this.executed++;
  if(this.enabled)this.message=p.side+' · '+batch.orders.filter(p=>p.state==='accepted').length+'/'+batch.clickCount+' cliques confirmados';
 }
 finishBatch(batch){
  if(this.pending!==batch||!batch.dispatchComplete||!batch.orders.length||!batch.orders.every(p=>p.settled))return;
  this.balanceRisk.close(batch.netPnl,this.clock());this.pending=null;
  const full=batch.orders.length===batch.clickCount&&!batch.orders.some(p=>p.error);
  if(full)this.martingaleLevel=!this.config.martingaleEnabled?0:batch.netPnl>0?0:batch.netPnl<0?(batch.martingaleLevel<this.config.martingaleLevels?batch.martingaleLevel+1:0):(batch.martingaleLevel<=this.config.martingaleLevels?batch.martingaleLevel:0);
  if(this.enabled)this.message='Sequência concluída · próximo sinal: '+this.nextClicks()+' clique(s)';
 }
 settle(event){
  const key=event.provider+'|'+event.orderId,batch=this.pending;
  const p=batch?.provider===event.provider?batch.orders.find(p=>p.orderId!=null&&String(p.orderId)===String(event.orderId)):null;
  const old=this.ledger.get(key);if((!p&&!old)||!num(event.netPnl)||(event.source&&event.source!=='broker'))return false;
  const trade=p||old;if(event.accountId!=null&&trade.accountId!=null&&String(event.accountId)!==String(trade.accountId))return false;
  if(old?.source==='broker'||trade.sessionId!==undefined&&trade.sessionId!==this.sessionId)return false;
  this.net=money(this.net+Number(event.netPnl)-Number(old?.netPnl||0));if(!old||old.source==='unresolved')this.closed++;
  const row={provider:trade.provider,accountId:trade.accountId,orderId:trade.orderId,side:trade.side,amount:trade.amount,sessionId:trade.sessionId,martingaleLevel:trade.martingaleLevel,entryPrice:event.entryPrice??trade.entryPrice,exitPrice:event.exitPrice??null,netPnl:Number(event.netPnl),source:'broker',result:Number(event.netPnl)>0?'win':Number(event.netPnl)<0?'loss':'tie',closedAt:this.clock()};
  this.ledger.set(key,row);if(this.ledger.size>2048)this.ledger.delete(this.ledger.keys().next().value);
  this.history=[row,...this.history.filter(x=>!(x.provider===row.provider&&x.orderId===row.orderId))].slice(0,5);
  if(p){p.settled=true;batch.netPnl=money(batch.netPnl+Number(event.netPnl));this.finishBatch(batch);}
  if(this.enabled&&this.config.stopLoss>0&&this.riskNet()<=-this.config.stopLoss)this.stop('Bot parado · limite de perda da sessão atingido');
  return true;
 }
 nextClicks(){return 2**(this.config.martingaleEnabled?this.martingaleLevel:0);}
 nextAmount(){return money(this.config.amount*2**(this.config.martingaleEnabled?this.martingaleLevel:0));}
 riskNet(balance=this.balanceRisk.view(this.clock())){return Math.min(this.net,this.initialBalance!=null&&balance.source==='broker'?balance.net:this.net);}
 status(){const balance=this.balanceRisk.view(this.clock()),initial=this.startedAt!=null?this.initialBalance:balance.current?.amount??null,risk=this.riskNet(balance);return{capabilities:{brokerExecution:4},enabled:this.enabled,arming:!!this.arming,executing:this.executing,config:{...this.config},message:this.message,startedAt:this.startedAt??null,deadlineAt:this.deadlineAt??null,netPnl:this.net,calculatedBalance:initial==null?null:money(initial+this.net),availableBalance:balance.source==='broker'?money(balance.available):null,balanceSource:balance.source==='broker'?'broker-received-balance':'unavailable',brokerBalance:balance.current,riskNetPnl:money(risk),balanceReconciling:balance.reconciling,initialBalance:initial,lossLimitRemaining:this.config.stopLoss>0?money(Math.max(0,this.config.stopLoss+risk)):null,durationMs:this.context()?.durationMs,martingaleLevel:this.martingaleLevel,nextClicks:this.nextClicks(),nextAmount:this.nextAmount(),executed:this.executed,closed:this.closed,pending:this.pending?{side:this.pending.side,state:this.pending.state,amount:this.pending.amount,clickCount:this.pending.clickCount,confirmedClicks:this.pending.orders.filter(p=>p.state==='accepted').length,closedClicks:this.pending.orders.filter(p=>p.settled).length,orderId:this.pending.orderId,exitAt:this.pending.exitAt,durationMs:this.pending.durationMs,entryPrice:this.pending.entryPrice}:null,history:this.history.map(x=>({...x}))};}
}

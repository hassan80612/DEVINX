// Executes final analyst decisions. Risk uses received account events when
// available at session start; quote-based outcomes remain separate estimates.
import {observedExpiryQuote} from '../src/core/observed-expiry-quote-20261018.mjs';
import {ExecutorBalanceRisk} from './executor-balance-risk.mjs';
export const DEFAULT_EXECUTOR_CONFIG=Object.freeze({amount:0,initialBalance:0,payoutPercent:0,intervalMs:30000,stopAfterMinutes:0,stopLoss:0});
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
  this.balanceRisk=new ExecutorBalanceRisk();this.executing=false;
  this.enabled=false;this.generation=0;this.message='Desligado';this.pending=null;this.queuedSignal=null;this.seen=new Set();this.sequence=0;this.executed=0;this.closed=0;this.history=[];this.ledger=new Map();this.net=0;
 }
 configure(patch={}){
  if(this.arming)throw Error('Aguarde a ativação do bot concluir.');
  const next={...this.config};
  for(const key of Object.keys(DEFAULT_EXECUTOR_CONFIG))if(patch[key]!==undefined)next[key]=Number(patch[key]);
  if(!num(next.amount)||next.amount<0||next.amount>1000000||!num(next.initialBalance)||next.initialBalance<0||next.initialBalance>1e9||
   !num(next.payoutPercent)||next.payoutPercent<0||next.payoutPercent>1000||!Number.isInteger(next.intervalMs)||next.intervalMs<5000||next.intervalMs>3600000||
   !num(next.stopAfterMinutes)||next.stopAfterMinutes<0||next.stopAfterMinutes>1440||!num(next.stopLoss)||next.stopLoss<0||next.stopLoss>1e8)throw Error('Configuração do bot inválida.');
  if(this.enabled){
   const c=this.context();
   if(!(next.amount>0)||!(next.payoutPercent>0))throw Error('Valor por entrada e payout devem ser positivos.');
   if(next.intervalMs<c.durationMs||next.intervalMs%c.durationMs!==0)throw Error('Intervalo deve ser múltiplo do prazo do analista.');
  }
  const intervalChanged=next.intervalMs!==this.config.intervalMs;this.config=next;
  if(this.enabled){
   this.deadlineAt=next.stopAfterMinutes?this.startedAt+next.stopAfterMinutes*60000:null;
   if(intervalChanged){this.sequence=0;this.queuedSignal=null;}
   this.watch();
  }
  return this.status();
 }
 async start(){
  this.watch();
  if(this.enabled||this.arming||this.pending||this.executing)throw Error('Bot já ligado ou com operação pendente.');
  const c=this.context(),cfg={...this.config};
  if(c.brokerBalance!==undefined)this.balanceRisk.observe(c.brokerBalance);
  const broker=this.balanceRisk.current?.provider===c.provider?this.balanceRisk.current:null;
  const openingBalance=broker?.amount??cfg.initialBalance;
  if(c.state!=='running')throw Error('Inicie o analista antes de ligar o bot.');
  if(!c.licensed||!c.provider||!c.asset)throw Error('Conecte a corretora e inicie o analista.');
  if(!(openingBalance>0)||!(cfg.amount>0)||cfg.amount>openingBalance||!(cfg.payoutPercent>0))throw Error('Informe saldo inicial, valor por entrada e payout (%) ou confira o saldo recebido.');
  if(!(c.durationMs>0)||cfg.intervalMs<c.durationMs||cfg.intervalMs%c.durationMs!==0)throw Error('Intervalo deve ser múltiplo do prazo do analista.');
  this.arming=true;const generation=++this.generation;
  try{
   await this.driver.prepare(c.provider,{...c,amount:cfg.amount});
   const current=this.context();
   if(generation!==this.generation||!this.sameContext(c,current)||current.state!=='running'||!current.licensed)throw Error('Analista mudou durante a ativação.');
   this.session={provider:c.provider,asset:c.asset,durationMs:c.durationMs,engine:current.engine};
   this.startedAt=this.clock();this.deadlineAt=cfg.stopAfterMinutes?this.startedAt+cfg.stopAfterMinutes*60000:null;
   if(current.brokerBalance!==undefined)this.balanceRisk.observe(current.brokerBalance);
   const opening=this.balanceRisk.begin(c.provider);if(cfg.amount>(opening?.amount??cfg.initialBalance))throw Error('Saldo recebido insuficiente para o valor por entrada.');
   this.initialBalance=opening?.amount??cfg.initialBalance;this.net=0;this.executed=0;this.closed=0;this.sequence=0;this.history=[];this.ledger.clear();this.seen.clear();this.queuedSignal=null;
   const existing=executorSignal(c.analysis);if(existing)this.seen.add(existing.id);
   this.enabled=true;this.message='Ligado · aguardando próximo CALL/PUT do analista';
  }finally{this.arming=false;}
  return this.status();
 }
 stop(reason='Parado por você'){this.enabled=false;this.queuedSignal=null;this.generation++;this.message=reason;return this.status();}
 observeBalance(value){this.balanceRisk.observe(value);}
 sameContext(a,b){return a.provider===b.provider&&symbol(a.asset)===symbol(b.asset)&&a.durationMs===b.durationMs;}
 releaseUnresolved(){
  const p=this.pending;if(!p)return;
  const row={provider:p.provider,accountId:p.accountId,orderId:p.orderId||p.id,side:p.side,amount:p.amount,entryPrice:p.entryPrice,exitPrice:null,netPnl:null,source:'unresolved',result:'unknown',closedAt:this.clock()};
  this.ledger.set(row.provider+'|'+row.orderId,row);if(this.ledger.size>200)this.ledger.delete(this.ledger.keys().next().value);
  this.history=[row,...this.history].slice(0,5);this.pending=null;
  this.message=this.enabled?'Encerramento sem cotação válida · saldo recebido controla os limites':'Parado · entrada encerrada sem resultado confirmado';
 }
 watch(){
  if(!this.enabled&&!this.pending)return;
  const now=this.clock(),c=this.context(),p=this.pending;
  if(c.brokerBalance!==undefined)this.balanceRisk.observe(c.brokerBalance);
  if(p?.state==='accepted'&&now>=p.exitAt&&c.provider===p.provider&&symbol(c.asset)===symbol(p.asset)){
   const q=observedExpiryQuote({quoteHistory:c.quoteHistory||[],currentQuote:{ts:c.quoteAt,price:c.quote,receivedAt:now},dueAt:p.exitAt,now});
   if(q&&num(p.entryPrice)&&p.entryPrice>0){
    const result=q.price===p.entryPrice?'tie':((q.price>p.entryPrice?'CALL':'PUT')===p.side?'win':'loss');
    const netPnl=result==='tie'?0:result==='win'?p.amount*p.payoutPercent/100:-p.amount;
    this.settle({provider:p.provider,orderId:p.orderId,accountId:p.accountId,netPnl,source:'quote-estimate',result,entryPrice:p.entryPrice,exitPrice:q.price,exitQuoteAt:q.ts});
   }
  }
  const balance=this.balanceRisk.view(now);
  if(this.pending&&!this.executing&&now>=this.pending.exitAt+1000&&(!this.enabled||balance.source==='broker'))this.releaseUnresolved();
  if(this.enabled){
   if(!c.licensed||c.state!=='running')this.stop('Bot parado · analista pausado ou acesso indisponível');
   else if(!this.sameContext(this.session,c))this.stop('Bot parado · ativo ou prazo do analista mudou');
   else if(balance.accountChanged)this.stop('Bot parado · conta da corretora mudou');
   else if(this.deadlineAt&&now>=this.deadlineAt)this.stop('Bot parado · tempo programado atingido');
   else if(this.config.stopLoss>0&&(balance.source==='broker'?balance.net:this.net)<=-this.config.stopLoss)this.stop(balance.source==='broker'?'Bot parado · stop loss do saldo da corretora atingido':'Bot parado · stop loss do saldo calculado atingido');
   else if(this.session.engine!==c.engine){this.session.engine=c.engine;this.queuedSignal=null;this.sequence=0;const old=executorSignal(c.analysis);if(old&&old.engineId!==c.engine)this.seen.add(old.id);this.message='Estratégia atualizada · seguindo os próximos sinais do analista';}
  }
  if(this.pending&&!this.executing&&now>this.pending.exitAt+15000){this.stop('Bot parado · sem preço válido no vencimento nem resultado recebido');this.releaseUnresolved();}
 }
 pulse(){
  this.watch();if(!this.enabled)return;
  const c=this.context(),s=executorSignal(c.analysis);
  if(s?.engineId&&s.engineId!==c.engine)return;
  if(s&&!this.seen.has(s.id)){
   this.seen.add(s.id);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value);
   const selected=this.sequence++%(this.config.intervalMs/this.session.durationMs)===0;
   if(selected)this.queuedSignal=s;else this.message='Sinal pulado conforme intervalo programado';
  }
  const queued=this.queuedSignal;if(!queued)return;
  const now=this.clock();
  if(now<queued.at||now-queued.at>1500||queued.durationMs!==this.session.durationMs||now>=queued.exitAt){this.queuedSignal=null;this.message='Sinal antigo descartado · aguardando próximo';return;}
  if(this.pending){this.message='Aguardando concluir a entrada anterior';return;}
  const balance=this.balanceRisk.view(now);
  if(balance.reconciling){this.message='Conferindo saldo recebido no encerramento';return;}
  this.queuedSignal=null;
  if((balance.source==='broker'?balance.available:this.initialBalance+this.net)<this.config.amount){this.stop(balance.source==='broker'?'Bot parado · saldo da corretora insuficiente':'Bot parado · saldo calculado insuficiente');return;}
  const generation=this.generation;
  this.pending={...queued,engine:c.engine,provider:c.provider,asset:c.asset,activeId:c.activeId,amount:this.config.amount,payoutPercent:this.config.payoutPercent,state:'sending',requestId:null,orderId:null,accountId:null};
  const order=this.pending;
  const valid=()=>this.enabled&&generation===this.generation&&this.pending===order&&this.sameContext(this.session,this.context())&&order.engine===this.context().engine&&this.context().state==='running'&&this.context().licensed===true&&this.clock()-queued.at<=1500&&(!this.deadlineAt||this.clock()<this.deadlineAt);
  const captureEntry=()=>{
   const snapshot=this.context();order.clickedAt=this.clock();
   if(snapshot.brokerBalance!==undefined)this.balanceRisk.observe(snapshot.brokerBalance);
   this.balanceRisk.capture(order);
   if(num(snapshot.quote)&&Number(snapshot.quote)>0&&Number(snapshot.quoteAt)>0&&order.clickedAt-Number(snapshot.quoteAt)>=0&&order.clickedAt-Number(snapshot.quoteAt)<=2500){order.entryPrice=Number(snapshot.quote);order.entryQuoteAt=Number(snapshot.quoteAt);}
  };
  this.executing=true;this.inflight=Promise.resolve().then(async()=>{
   if(!valid())throw Error('Entrada cancelada antes do clique.');
   const result=await this.driver.execute(c.provider,Object.assign(order,{isValid:valid,captureEntry}));
   if(result?.clicked===true&&result.clickId){this.accepted({provider:c.provider,orderId:result.clickId,source:'ui-click'});return;}
   if(result?.accepted!==true||!result.orderId)throw Error('Entrada sem confirmação da corretora · não será repetida.');
   this.accepted({...result,provider:c.provider});
  }).catch(e=>{
   if(order.clicked!==true&&this.enabled&&generation===this.generation&&this.sameContext(this.session,this.context())&&order.engine!==this.context().engine){this.pending=null;this.message='Estratégia alterada · aguardando próximo sinal';return;}
   this.stop(String(e?.message||e));
   if(e?.beforeClick===true||e?.brokerRejected===true||(order.state==='sending'&&order.requestId==null&&order.clicked!==true))this.pending=null;
  }).finally(()=>{this.executing=false;});
 }
 sent(requestId){if(this.pending&&requestId){this.pending.requestId=String(requestId);this.pending.clicked=true;}}
 rejected(event){const p=this.pending;if(p?.state==='sending'&&event.provider===p.provider&&String(event.requestId)===String(p.requestId)){this.pending=null;this.stop('Ordem rejeitada pela corretora.');}}
 accepted(event){
  const p=this.pending;if(!p||event.provider!==p.provider||!event.orderId||p.state==='accepted')return;
  if(p.requestId!=null&&String(event.requestId)!==String(p.requestId))return;
  p.state='accepted';p.clicked=true;p.orderId=String(event.orderId);p.requestId=event.requestId??p.requestId;p.accountId=event.accountId??p.accountId;
  if(Number(event.exitAt)>p.at)p.exitAt=Number(event.exitAt);
  if(num(event.entryPrice)&&Number(event.entryPrice)>0)p.entryPrice=Number(event.entryPrice);
  p.executionSource=event.source||'broker';
  this.executed++;if(this.enabled)this.message=event.source==='ui-click'?p.side+' · clique enviado; cálculo pelo analista':p.side+' aberto · saldo calculado com seus parâmetros';
 }
 settle(event){
  const key=event.provider+'|'+event.orderId;
  const p=this.pending?.provider===event.provider&&String(this.pending?.orderId)===String(event.orderId)?this.pending:null;
  const old=this.ledger.get(key);if((!p&&!old)||!num(event.netPnl))return false;
  const trade=p||old;
  if(event.accountId!=null&&trade.accountId!=null&&String(event.accountId)!==String(trade.accountId))return false;
  const source=event.source||'broker';if(old&&(old.source==='broker'||source!=='broker'))return false;
  this.net=money(this.net+Number(event.netPnl)-Number(old?.netPnl||0));if(!old||old.source==='unresolved')this.closed++;
  const row={provider:trade.provider,accountId:trade.accountId,orderId:trade.orderId,side:trade.side,amount:trade.amount,entryPrice:event.entryPrice??trade.entryPrice,exitPrice:event.exitPrice??(source==='broker'?null:old?.exitPrice??null),netPnl:Number(event.netPnl),source,result:event.result||(Number(event.netPnl)>0?'win':Number(event.netPnl)<0?'loss':'tie'),closedAt:this.clock()};
  this.ledger.set(key,row);if(this.ledger.size>200)this.ledger.delete(this.ledger.keys().next().value);
  this.history=[row,...this.history.filter(x=>!(x.provider===row.provider&&x.orderId===row.orderId))].slice(0,5);if(p)this.pending=null;
  this.message=source==='broker'?'Resultado recebido da corretora':'Resultado calculado por cotação · payout informado';
  if(this.enabled&&!this.balanceRisk.session&&this.config.stopLoss>0&&this.net<=-this.config.stopLoss)this.stop('Bot parado · stop loss do saldo calculado atingido');
  return true;
 }
 status(){const initial=this.initialBalance??this.config.initialBalance,balance=this.balanceRisk.view(this.clock());return{enabled:this.enabled,arming:!!this.arming,executing:this.executing,config:{...this.config},message:this.message,startedAt:this.startedAt??null,deadlineAt:this.deadlineAt??null,netPnl:this.net,calculatedBalance:money(initial+this.net),availableBalance:balance.source==='broker'?money(balance.available):money(initial+this.net-(this.pending?.clicked?this.pending.amount:0)),balanceSource:balance.source==='broker'?'broker-received-balance':'user-configured-local-calculation',brokerBalance:balance.current,riskNetPnl:balance.source==='broker'?money(balance.net):this.net,balanceReconciling:balance.reconciling,executed:this.executed,closed:this.closed,pending:this.pending?{side:this.pending.side,state:this.pending.state,orderId:this.pending.orderId,exitAt:this.pending.exitAt,entryPrice:this.pending.entryPrice}:null,history:this.history.map(x=>({...x}))};}
}

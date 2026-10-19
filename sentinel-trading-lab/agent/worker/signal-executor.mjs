// Final analyst directions; actual broker settlements control stake progression.
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
  const intervalChanged=next.intervalMs!==this.config.intervalMs;this.config=next;
  if(!next.martingaleEnabled||this.martingaleLevel>next.martingaleLevels)this.martingaleLevel=0;
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
  const openingBalance=broker?.amount;
  if(c.state!=='running')throw Error('Inicie o analista antes de ligar o bot.');
  if(!c.licensed||!c.provider||!c.asset)throw Error('Conecte a corretora e inicie o analista.');
  if(!(cfg.amount>0))throw Error('Valor por entrada deve ser positivo.');
  if(broker&&cfg.amount>openingBalance)throw Error('Saldo recebido insuficiente para o valor por entrada.');
  if(!(c.durationMs>0))throw Error('Selecione a expiração no analista.');
  this.arming=true;const generation=++this.generation;
  try{
   await this.driver.prepare(c.provider,{...c,amount:cfg.amount});
   const current=this.context();
   if(generation!==this.generation||!this.sameContext(c,current)||c.durationMs!==current.durationMs||(broker&&current.brokerBalance&&String(broker.accountId)!==String(current.brokerBalance.accountId))||current.state!=='running'||!current.licensed)throw Error('Analista mudou durante a ativação.');
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
 releaseUnresolved(){
  const p=this.pending;if(!p)return;
  const row={provider:p.provider,accountId:p.accountId,orderId:p.orderId||p.id,side:p.side,amount:p.amount,entryPrice:p.entryPrice,exitPrice:null,netPnl:null,sessionId:p.sessionId,martingaleLevel:p.martingaleLevel,source:'unresolved',result:'unknown',closedAt:this.clock()};
  this.ledger.set(row.provider+'|'+row.orderId,row);if(this.ledger.size>200)this.ledger.delete(this.ledger.keys().next().value);
  this.history=[row,...this.history].slice(0,5);this.pending=null;
  this.message=this.enabled?'Encerramento sem cotação válida · saldo recebido controla os limites':'Parado · entrada encerrada sem resultado confirmado';
 }
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
  if(this.pending&&!this.executing&&now>this.pending.exitAt+15000){this.stop('Bot parado · resultado da ordem não confirmado pela corretora; martingale não avançou');this.releaseUnresolved();}
 }
 pulse(){
  this.watch();if(!this.enabled)return;
  const c=this.context(),s=executorSignal(c.analysis);
  if(s?.engineId&&s.engineId!==c.engine)return;
  if(s&&!this.seen.has(s.id)){
   this.seen.add(s.id);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value);
   const selected=this.lastEntryAt==null||s.at-this.lastEntryAt>=this.config.intervalMs;
   this.sequence++;
   if(selected)this.queuedSignal=s;else this.message='Sinal pulado conforme intervalo programado';
  }
  const queued=this.queuedSignal;if(!queued)return;
  const now=this.clock();
  if(now<queued.at||now-queued.at>1500||queued.durationMs!==c.durationMs||now>=queued.exitAt){this.queuedSignal=null;this.message='Sinal antigo descartado · aguardando próximo';return;}
  if(this.pending){this.message='Aguardando concluir a entrada anterior';return;}
  const balance=this.balanceRisk.view(now);
  this.queuedSignal=null;
  const amount=money(this.config.amount*2**(this.config.martingaleEnabled?this.martingaleLevel:0));
  if(!Number.isFinite(amount)||amount>1000000){this.stop('Bot parado · valor da próxima entrada excede o máximo permitido');return;}
  if(this.config.stopLoss>0&&amount>Math.max(0,this.config.stopLoss+this.riskNet(balance))+0.000001){this.stop('Bot parado · próxima entrada excede o limite de perda restante');return;}
  if(!this.accountCompatible(balance.current)){this.stop('Bot parado · conta da corretora mudou');return;}
  if(balance.current&&balance.current.provider===c.provider&&!balance.reconciling&&balance.current.amount<amount){this.stop(balance.source==='broker'?'Bot parado · saldo da corretora insuficiente':'Bot parado · saldo calculado insuficiente');return;}
  const generation=this.generation;
  this.pending={...queued,engine:c.engine,provider:c.provider,asset:c.asset,activeId:c.activeId,amount,martingaleLevel:this.martingaleLevel,sessionId:this.sessionId,accountId:this.session.accountId??balance.current?.accountId??null,state:'sending',requestId:null,orderId:null};
  const order=this.pending;
  const valid=()=>this.enabled&&generation===this.generation&&this.pending===order&&this.sameContext(this.session,this.context())&&order.durationMs===this.context().durationMs&&order.engine===this.context().engine&&this.context().state==='running'&&this.context().licensed===true&&this.accountCompatible(this.context().brokerBalance)&&(!this.context().brokerBalance||order.accountId==null||String(this.context().brokerBalance.accountId)===String(order.accountId))&&(this.config.stopLoss===0||order.amount<=this.config.stopLoss+this.riskNet()+0.000001)&&this.clock()-queued.at<=1500&&(!this.deadlineAt||this.clock()<this.deadlineAt);
  const captureEntry=()=>{
   const snapshot=this.context();order.clickedAt=this.clock();order.exitAt=order.clickedAt+order.durationMs;this.lastEntryAt=order.at;
   if(snapshot.brokerBalance!==undefined)this.balanceRisk.observe(snapshot.brokerBalance);
   this.balanceRisk.capture(order);
   if(num(snapshot.quote)&&Number(snapshot.quote)>0&&Number(snapshot.quoteAt)>0&&order.clickedAt-Number(snapshot.quoteAt)>=0&&order.clickedAt-Number(snapshot.quoteAt)<=2500){order.entryPrice=Number(snapshot.quote);order.entryQuoteAt=Number(snapshot.quoteAt);}
  };
  this.executing=true;this.inflight=Promise.resolve().then(async()=>{
   if(!valid())throw Error('Entrada cancelada antes do clique.');
   const result=await this.driver.execute(c.provider,Object.assign(order,{isValid:valid,captureEntry}));
   if(result?.accepted!==true||!result.orderId)throw Error('Entrada sem confirmação da corretora · não será repetida.');
   this.accepted({...result,provider:c.provider});
  }).catch(e=>{
   if(order.clicked!==true&&this.enabled&&generation===this.generation&&this.sameContext(this.session,this.context())&&(order.engine!==this.context().engine||order.durationMs!==this.context().durationMs)){this.pending=null;this.message='Estratégia alterada · aguardando próximo sinal';return;}
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
  if(Number(event.exitAt)>p.at){const mismatch=Math.abs(Number(event.exitAt)-((p.clickedAt??p.at)+p.durationMs))>1500;p.exitAt=Number(event.exitAt);if(mismatch)this.stop('Bot parado · expiração confirmada pela corretora difere do analista');}
  if(num(event.entryPrice)&&Number(event.entryPrice)>0)p.entryPrice=Number(event.entryPrice);
  if(p.accountId!=null){if(this.session.accountId!=null&&String(p.accountId)!==String(this.session.accountId))this.stop('Bot parado · conta da corretora mudou');else this.session.accountId=String(p.accountId);}
  p.executionSource=event.source||'broker';
  this.lastEntryAt=p.at;this.executed++;if(this.enabled)this.message=p.side+' · ordem confirmada pela corretora';
 }
 settle(event){
  const key=event.provider+'|'+event.orderId;
  const p=this.pending?.provider===event.provider&&String(this.pending?.orderId)===String(event.orderId)?this.pending:null;
  const old=this.ledger.get(key);if((!p&&!old)||!num(event.netPnl)||(event.source&&event.source!=='broker'))return false;
  const trade=p||old;
  if(event.accountId!=null&&trade.accountId!=null&&String(event.accountId)!==String(trade.accountId))return false;
  const source=event.source||'broker';if(old&&(old.source==='broker'||source!=='broker'))return false;
  if(trade.sessionId!==undefined&&trade.sessionId!==this.sessionId)return false;
  this.net=money(this.net+Number(event.netPnl)-Number(old?.netPnl||0));if(!old||old.source==='unresolved')this.closed++;
  const row={provider:trade.provider,accountId:trade.accountId,orderId:trade.orderId,side:trade.side,amount:trade.amount,sessionId:trade.sessionId,martingaleLevel:trade.martingaleLevel,entryPrice:event.entryPrice??trade.entryPrice,exitPrice:event.exitPrice??(source==='broker'?null:old?.exitPrice??null),netPnl:Number(event.netPnl),source,result:(Number(event.netPnl)>0?'win':Number(event.netPnl)<0?'loss':'tie'),closedAt:this.clock()};
  this.ledger.set(key,row);if(this.ledger.size>200)this.ledger.delete(this.ledger.keys().next().value);
  this.history=[row,...this.history.filter(x=>!(x.provider===row.provider&&x.orderId===row.orderId))].slice(0,5);if(p)this.pending=null;
  if(p)this.balanceRisk.close(Number(event.netPnl),this.clock());
  // Progress once, on an identified broker close; never on quote direction or balance debit.
  if(!old&&p){this.martingaleLevel=!this.config.martingaleEnabled?0:row.result==='win'?0:row.result==='loss'?(trade.martingaleLevel<this.config.martingaleLevels?trade.martingaleLevel+1:0):(trade.martingaleLevel<=this.config.martingaleLevels?trade.martingaleLevel:0);}
  this.message='Resultado recebido da corretora · próxima entrada '+this.nextAmount().toFixed(2);
  if(this.enabled&&this.config.stopLoss>0&&this.riskNet()<=-this.config.stopLoss)this.stop('Bot parado · limite de perda da sessão atingido');
  return true;
 }
 nextAmount(){return money(this.config.amount*2**(this.config.martingaleEnabled?this.martingaleLevel:0));}
 riskNet(balance=this.balanceRisk.view(this.clock())){return Math.min(this.net,this.initialBalance!=null&&balance.source==='broker'?balance.net:this.net);}
 status(){const balance=this.balanceRisk.view(this.clock()),initial=this.startedAt!=null?this.initialBalance:balance.current?.amount??null,risk=this.riskNet(balance);return{capabilities:{brokerExecution:3},enabled:this.enabled,arming:!!this.arming,executing:this.executing,config:{...this.config},message:this.message,startedAt:this.startedAt??null,deadlineAt:this.deadlineAt??null,netPnl:this.net,calculatedBalance:initial==null?null:money(initial+this.net),availableBalance:balance.source==='broker'?money(balance.available):null,balanceSource:balance.source==='broker'?'broker-received-balance':'unavailable',brokerBalance:balance.current,riskNetPnl:money(risk),balanceReconciling:balance.reconciling,initialBalance:initial,lossLimitRemaining:this.config.stopLoss>0?money(Math.max(0,this.config.stopLoss+risk)):null,durationMs:this.context()?.durationMs,martingaleLevel:this.martingaleLevel,nextAmount:this.nextAmount(),executed:this.executed,closed:this.closed,pending:this.pending?{side:this.pending.side,state:this.pending.state,amount:this.pending.amount,orderId:this.pending.orderId,exitAt:this.pending.exitAt,durationMs:this.pending.durationMs,entryPrice:this.pending.entryPrice}:null,history:this.history.map(x=>({...x}))};}
}

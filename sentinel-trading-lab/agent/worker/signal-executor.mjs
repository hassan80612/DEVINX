// Local execution subscribes to the analyst's final immutable event. No
// forecasts, quote polling, database calls or simulated settlements live here.
export const DEFAULT_EXECUTOR_CONFIG=Object.freeze({amount:0,intervalMs:30000,stopAfterMinutes:0,stopLoss:0,accountMode:'demo'});
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const symbol=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const side=x=>({call:'CALL',put:'PUT',buy:'CALL',sell:'PUT'}[String(x||'').toLowerCase()]||null);
export function executorSignal(analysis){
 const a=analysis?.vnext?.futureEntryAnchor;
 if(a?.phase!=='fired'||!['CALL','PUT'].includes(a.side)||!(Number(a.entryTriggeredAt)>0))return null;
 return{id:[a.context,a.entryTriggeredAt].join('|'),side:a.side,at:Number(a.entryTriggeredAt),exitAt:Number(a.exitAt),durationMs:Number(a.holdingSeconds??a.actualHoldingSeconds)*1000};
}
export class SignalExecutor{
 constructor({driver,context,clock=Date.now}={}){
  this.driver=driver;this.context=context;this.clock=clock;this.config={...DEFAULT_EXECUTOR_CONFIG};
  this.enabled=false;this.generation=0;this.message='Desligado';this.pending=null;this.seen=new Set();this.sequence=0;this.executed=0;this.closed=0;this.history=[];this.net=0;
 }
 configure(patch={}){
  if(this.enabled||this.arming||this.pending)throw Error('Pare o bot e aguarde a operação encerrar antes de alterar.');
  const next={...this.config};
  for(const key of Object.keys(DEFAULT_EXECUTOR_CONFIG))if(patch[key]!==undefined)next[key]=key==='accountMode'?String(patch[key]):Number(patch[key]);
  if(!['demo','real'].includes(next.accountMode)||!num(next.amount)||next.amount<0||next.amount>1000000||
   !Number.isInteger(next.intervalMs)||next.intervalMs<5000||next.intervalMs>3600000||
   !num(next.stopAfterMinutes)||next.stopAfterMinutes<0||next.stopAfterMinutes>1440||
   !num(next.stopLoss)||next.stopLoss<0||next.stopLoss>100000000)throw Error('Configuração do bot inválida.');
  this.config=next;return this.status();
 }
 async start({confirmedMode}={}){
  if(this.enabled||this.arming||this.pending)throw Error('Bot já ligado ou com operação pendente.');
  const c=this.context(),cfg={...this.config};
  if(c.state!=='running')throw Error('Inicie o analista antes de ligar o bot.');
  if(!c.licensed||!c.provider||!c.accountId||!num(c.balance)||!['demo','real'].includes(c.mode))throw Error('Aguardando conta e saldo confirmados na corretora.');
  if(c.mode!==cfg.accountMode||confirmedMode!==c.mode)throw Error('Confirme a mesma conta selecionada na corretora.');
  if(!(cfg.amount>0)||cfg.amount>Number(c.balance))throw Error('Informe um valor válido por entrada.');
  if(!(c.durationMs>0)||cfg.intervalMs<c.durationMs||cfg.intervalMs%c.durationMs!==0)throw Error('Intervalo deve ser múltiplo do prazo do analista.');
  this.arming=true;const generation=++this.generation;
  try{
   await this.driver.prepare(c.provider,{...c,amount:cfg.amount});
   const current=this.context();
   if(generation!==this.generation||!this.sameContext(c,current)||current.state!=='running'||!current.licensed)throw Error('Contexto mudou durante a ativação.');
   this.session={provider:c.provider,accountId:String(c.accountId),mode:c.mode,asset:c.asset,durationMs:c.durationMs,engine:c.engine};
   this.startedAt=this.clock();this.deadlineAt=cfg.stopAfterMinutes?this.startedAt+cfg.stopAfterMinutes*60000:null;
   this.initialBalance=Number(current.balance);this.net=0;this.executed=0;this.closed=0;this.sequence=0;this.history=[];this.seen.clear();
   const existing=executorSignal(c.analysis);if(existing)this.seen.add(existing.id);
   this.enabled=true;this.message='Ligado · aguardando próximo sinal do analista';
  }finally{this.arming=false;}
  return this.status();
 }
 stop(reason='Parado por você'){this.enabled=false;this.generation++;this.message=reason;return this.status();}
 sameContext(a,b){return a.provider===b.provider&&String(a.accountId)===String(b.accountId)&&a.mode===b.mode&&symbol(a.asset)===symbol(b.asset)&&a.durationMs===b.durationMs&&a.engine===b.engine;}
 watch(){
  if(!this.enabled&&!this.pending)return;
  const now=this.clock(),c=this.context();
  if(this.enabled){
   if(!c.licensed||c.state!=='running')this.stop('Bot parado · analista pausado ou acesso indisponível');
   else if(!this.sameContext(this.session,c))this.stop('Bot parado · conta, ativo ou configuração do analista mudou');
   else if(this.deadlineAt&&now>=this.deadlineAt)this.stop('Bot parado · tempo programado atingido');
   else if(this.config.stopLoss>0&&this.net<=-this.config.stopLoss)this.stop('Bot parado · stop loss atingido');
  }
  if(this.pending?.state==='accepted'&&now>this.pending.exitAt+15000)this.stop('Bot parado · aguardando encerramento confirmado pela corretora');
 }
 // Called synchronously after each existing analyst cycle. The browser promise
 // runs separately; it never holds the quote scheduler or analyst loop.
 pulse(){
  this.watch();if(!this.enabled)return;
  const c=this.context(),s=executorSignal(c.analysis);if(!s||this.seen.has(s.id))return;
  this.seen.add(s.id);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value);
  const selected=this.sequence++%(this.config.intervalMs/this.session.durationMs)===0;
  if(!selected){this.message='Sinal pulado conforme intervalo programado';return;}
  const now=this.clock();
  if(now<s.at||now-s.at>1500||s.durationMs!==this.session.durationMs||now>=s.exitAt){this.message='Sinal antigo descartado · aguardando próximo';return;}
  if(this.pending){this.message='Aguardando confirmação ou encerramento da operação anterior';return;}
  if(!num(c.balance)||Number(c.balance)<this.config.amount){this.stop('Bot parado · saldo insuficiente');return;}
  const generation=this.generation;
  this.pending={...s,provider:c.provider,asset:c.asset,activeId:c.activeId,accountId:String(c.accountId),mode:c.mode,amount:this.config.amount,balanceBefore:Number(c.balance),state:'sending',requestId:null,orderId:null};
  const order=this.pending;
  const valid=()=>this.enabled&&generation===this.generation&&this.pending===order&&this.sameContext(this.session,this.context())&&this.context().state==='running'&&this.context().licensed===true&&this.clock()-s.at<=1500&&(!this.deadlineAt||this.clock()<this.deadlineAt);
  this.inflight=Promise.resolve().then(async()=>{
   if(!valid())throw Error('Entrada cancelada antes do clique.');
   const result=await this.driver.execute(c.provider,Object.assign(order,{isValid:valid}));
   if(result?.accepted!==true||!result.orderId)throw Error('Entrada sem confirmação da corretora · não será repetida.');
   this.accepted({...result,provider:c.provider});
  }).catch(e=>{
   this.stop(String(e?.message||e));
   // Uncertain clicks remain pending: restarting must never repeat a possibly
   // accepted order. Explicit rejection/pre-click cancellation may be cleared.
   if(e?.beforeClick===true||e?.brokerRejected===true||(order.state==='sending'&&order.requestId==null&&order.clicked!==true))this.pending=null;
  });
 }
 sent(requestId){if(this.pending&&requestId){this.pending.requestId=String(requestId);this.pending.clicked=true;}}
 rejected(event){const p=this.pending;if(p?.state==='sending'&&event.provider===p.provider&&String(event.requestId)===String(p.requestId)){this.pending=null;this.stop('Ordem rejeitada pela corretora.');}}
 accepted(event){
  const p=this.pending;if(!p||event.provider!==p.provider||!event.orderId||p.state==='accepted')return;
  if(p.requestId!=null&&String(event.requestId)!==String(p.requestId))return;
  p.state='accepted';p.orderId=String(event.orderId);p.requestId=event.requestId??p.requestId;
  if(Number(event.exitAt)>p.at)p.exitAt=Number(event.exitAt);
  this.executed++;if(this.enabled)this.message=p.side+' confirmado pela corretora';
 }
 settle(event){
  const p=this.pending;if(!p||event.provider!==p.provider||String(event.accountId)!==p.accountId||String(event.orderId)!==String(p.orderId)||!num(event.netPnl))return false;
  this.net=Math.round((this.net+Number(event.netPnl))*1000000)/1000000;this.closed++;
  this.history.unshift({side:p.side,orderId:p.orderId,netPnl:Number(event.netPnl),closedAt:this.clock()});this.history=this.history.slice(0,5);this.pending=null;
  this.message='Operação encerrada pela corretora';this.watch();return true;
 }
 status(){return{enabled:this.enabled,arming:!!this.arming,config:{...this.config},message:this.message,startedAt:this.startedAt??null,deadlineAt:this.deadlineAt??null,netPnl:this.net,executed:this.executed,closed:this.closed,pending:this.pending?{side:this.pending.side,state:this.pending.state,orderId:this.pending.orderId,exitAt:this.pending.exitAt}:null,history:this.history.map(x=>({...x}))};}
}

import {DemoBrokerAdapter} from './demo-broker.mjs';
import {SimulatedFeed} from './simulated-feed.mjs';
import {engineCycle} from './engine.mjs';
import {AuditLog} from './audit.mjs';
import {nextEvaluation} from './scheduler.mjs';

function iso(ts=Date.now()){return new Date(ts).toISOString()}
function dayKey(ts,timeZone='UTC'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ts));
  const o=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
const AUTO_STOP_REASONS=new Set(['horário final atingido','perda diária máxima atingida','meta diária atingida','drawdown máximo atingido','limite de perdas consecutivas','limite diário de operações']);
function signalPlan({analysis,settings,price,now=Date.now()}={}){
  const side=String(analysis?.side||'WAIT').toUpperCase();
  const confidence=Number(analysis?.confidence||0);
  const duration=Math.max(15000,Number(settings?.orderDurationMs||60000));
  const min=Number(settings?.risk?.minConfidence||0);
  const valid=(side==='BUY'||side==='SELL')&&confidence>=min;
  return {
    signal:valid?(side==='BUY'?'CALL':'PUT'):'WAIT',
    side:valid?side:'WAIT',
    asset:settings?.asset||'—',
    price:Number(price||0),
    confidence,
    minConfidence:min,
    entry:valid?'Após fechamento/validação da candle atual':'Aguardar confluência mínima',
    entryReady:valid,
    exit:valid?`Expiração DEMO em ${Math.round(duration/1000)}s`:'Sem entrada',
    durationMs:duration,
    expiresAt:valid?new Date(now+duration).toISOString():null,
    nextCheckHint:`Nova avaliação conforme agenda (${Math.round(Number(settings?.schedule?.intervalMs||60000)/1000)}s)`
  };
}

export class DemoTradingRuntime{
  constructor({seed=20261002,balance=10000,payout=.82}={}){
    this.feed=new SimulatedFeed({seed,start:1.084});this.feed.warmup(140);
    this.broker=new DemoBrokerAdapter({balance,payout});
    this.audit=new AuditLog();
    this.stateName='stopped';this.masterFrozen=false;this.killSwitch=false;this.lastEvalMs=0;this.nextEvalMs=0;this.lastHeartbeat=Date.now();
    this.lastResult={action:'WAIT',reasons:['bot parado']};this.pending=[];this.trades=[];this.analyses=[];this.incidents=[];
    this.settings={
      mode:'demo',asset:'EUR/USD',strategy:'smart_confluence',requireLiveBroker:true,orderDurationMs:60_000,orderProposalTtlMs:60_000,
      schedule:{enabled:true,timezone:'America/Sao_Paulo',days:['sun','mon','tue','wed','thu','fri','sat'],dailyStart:'00:00',dailyEnd:'23:59',intervalMs:1_000,startAt:null,endAt:null},
      risk:{minConfidence:74,maxFeedLatencyMs:2_500,maxDecisionLatencyMs:250,maxExecutionLatencyMs:1_500,stakeMode:'fixed',fixedStake:10,stakePct:1,maxStake:50,maxTradesPerDay:20,maxTradesPerHour:5,maxConsecutiveLosses:3,maxDailyLoss:100,dailyProfitTarget:0,maxDrawdownPct:10,cooldownSeconds:60,lossCooldownSeconds:180}
    };
    this.state={cooldownUntil:null,consecutiveLosses:0,dailyPnl:0,peakBalance:balance,drawdownPct:0,executionError:false};
    this.externalMarket=null;this.executionBroker=null;
  }
  setExecutionBroker(broker=null){this.executionBroker=broker||null;return this}
  requestImmediateEvaluation(){if(this.stateName==='running')this.nextEvalMs=0;return this}
  setExternalMarket(market=null){
    if(!market){this.externalMarket=null;return this}
    const candles=Array.isArray(market.candles)?market.candles.filter(c=>[c?.open,c?.high,c?.low,c?.close].every(v=>Number.isFinite(Number(v)))):[];
    this.externalMarket={...market,candles,quote:Number(market.quote??market.price??candles.at(-1)?.close),quoteTs:Number(market.quoteTs||market.lastFrameAt||market.lastDomAt||Date.now()),source:market.source||String(market.provider||'LIVE').toUpperCase()};
    return this
  }
  _marketSnapshot(){
    if(this.externalMarket){const ready=this.externalMarket.feedValidated!==false&&this.externalMarket.candles?.length>=50&&Number.isFinite(Number(this.externalMarket.quote));return{candles:ready?[...this.externalMarket.candles]:[],quoteTs:this.externalMarket.quoteTs,price:Number(this.externalMarket.quote||this.externalMarket.candles?.at(-1)?.close||0),source:this.externalMarket.source||'LIVE',balance:this.externalMarket.balance,provider:this.externalMarket.provider,mode:this.externalMarket.mode,waitingLive:!ready,feedValidated:ready}}
    if(this.settings.requireLiveBroker)return{candles:[],quoteTs:0,price:0,source:'OFFLINE',balance:null,provider:null,mode:this.settings.mode,waitingLive:true,feedValidated:false};
    return this.feed.snapshot()
  }
  _startBlockReason(){if(this.killSwitch)return'Kill switch ativo.';if(this.masterFrozen)return'Bot congelado pelo Master.';if(this.settings.requireLiveBroker&&!this.externalMarket?.provider)return'Conecte uma corretora antes de iniciar.';return null}
  async start(actor='user'){const reason=this._startBlockReason();if(reason)throw new Error(reason);this.stateName='running';this.nextEvalMs=Date.now();this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.start'});return this.status()}
  async pause(actor='user'){this.stateName='paused';this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.pause'});return this.status()}
  async stop(actor='user',reason='manual'){this.stateName='stopped';this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.stop',metadata:{reason}});return this.status()}
  async kill(actor='user'){this.killSwitch=true;this.stateName='stopped';this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.kill_switch'});return this.status()}
  async resetKill(actor='master'){if(actor!=='master')throw new Error('master_required');this.killSwitch=false;this.audit.write({actorId:actor,actorRole:'master',action:'bot.kill_reset'});return this.status()}
  async freeze(actor='master'){if(actor!=='master')throw new Error('master_required');this.masterFrozen=true;this.stateName='stopped';this.audit.write({actorId:actor,actorRole:'master',action:'bot.freeze'});return this.status()}
  async unfreeze(actor='master'){if(actor!=='master')throw new Error('master_required');this.masterFrozen=false;this.audit.write({actorId:actor,actorRole:'master',action:'bot.unfreeze'});return this.status()}
  setMode(mode,actor='user'){if(!['demo','real'].includes(mode))throw new Error('invalid_mode');this.settings.mode=mode;this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'mode.change',metadata:{mode}});return this.status()}
  patchSettings(patch={},actor='user'){this.settings={...this.settings,...patch,schedule:{...this.settings.schedule,...(patch.schedule||{})},risk:{...this.settings.risk,...(patch.risk||{})}};this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'settings.update'});return this.status()}
  clearExecutionError(actor='master'){if(actor!=='master')throw new Error('master_required');this.state.executionError=false;if(this.stateName==='error')this.stateName='stopped';this.audit.write({actorId:actor,actorRole:'master',action:'execution_error.clear'});return this.status()}
  _riskState(now){
    const tz=this.settings.schedule.timezone||'UTC',today=dayKey(now,tz);
    const todayTrades=this.trades.filter(t=>dayKey(new Date(t.closedAt||t.openedAt).getTime(),tz)===today),hourAgo=now-3600000;
    return{killSwitch:this.killSwitch,botFrozen:this.masterFrozen,brokerConnected:this.settings.requireLiveBroker?!!this.externalMarket?.provider&&this.externalMarket?.feedValidated!==false:this.broker.connected,engineHealthy:now-this.lastHeartbeat<10_000,
      feedLatencyMs:Math.max(0,now-(this._marketSnapshot().quoteTs||now)),tradesToday:todayTrades.length,tradesLastHour:this.trades.filter(t=>new Date(t.openedAt).getTime()>=hourAgo).length,
      maxTradesPerDay:this.settings.risk.maxTradesPerDay,maxTradesPerHour:this.settings.risk.maxTradesPerHour,consecutiveLosses:this.state.consecutiveLosses,maxConsecutiveLosses:this.settings.risk.maxConsecutiveLosses,
      dailyPnl:todayTrades.reduce((s,t)=>s+Number(t.pnl||0),0),maxDailyLoss:this.settings.risk.maxDailyLoss,dailyProfitTarget:this.settings.risk.dailyProfitTarget,drawdownPct:this.state.drawdownPct,
      maxDrawdownPct:this.settings.risk.maxDrawdownPct,cooldownUntil:this.state.cooldownUntil,executionError:this.state.executionError,humanConfirmed:false};
  }
  _settleDue(now){
    const price=this._marketSnapshot().price;
    for(const p of [...this.pending]){if(p.settleAt>now)continue;const won=p.side==='BUY'?price>p.referencePrice:price<p.referencePrice;let trade;
      if(p.external){const pnl=won?Number(p.amount||0)*0.82:-Number(p.amount||0);trade={id:p.orderId,orderId:p.orderId,asset:p.asset||this.settings.asset,side:p.side,amount:Number(p.amount||0),referencePrice:p.referencePrice,openedAt:p.openedAt||iso(now-this.settings.orderDurationMs),status:'closed',won,pnl,provider:p.provider||this.externalMarket?.provider,external:true,settledPrice:price,closedAt:iso(now)}}
      else{const settled=this.broker.settle(p.orderId,won);trade={...settled,settledPrice:price,closedAt:iso(now)}}
      this.trades.unshift(trade);this.pending=this.pending.filter(x=>x.orderId!==p.orderId);
      if(won){this.state.consecutiveLosses=0;this.state.cooldownUntil=now+this.settings.risk.cooldownSeconds*1000}else{this.state.consecutiveLosses++;this.state.cooldownUntil=now+this.settings.risk.lossCooldownSeconds*1000}
      const balance=Number(this.externalMarket?.balance??this.broker.balance);this.state.peakBalance=Math.max(this.state.peakBalance,balance);this.state.drawdownPct=this.state.peakBalance?Math.max(0,(this.state.peakBalance-balance)/this.state.peakBalance*100):0;
      this.audit.write({actorId:'engine',actorRole:'system',action:'trade.settle',metadata:{orderId:p.orderId,won,pnl:trade.pnl,external:!!p.external}})}
  }
  async tick(now=Date.now()){
    this.lastHeartbeat=now;this._settleDue(now);if(this.stateName!=='running')return this.status();if(now<this.nextEvalMs)return this.status();const market=this._marketSnapshot();if(market.waitingLive){this.lastResult={action:'WAIT',analysis:{side:'WAIT',confidence:0,reasons:['Aguardando candles atuais do mesmo ativo da tela.']},reasons:['Aguardando candles atuais do mesmo ativo da tela.'],plan:signalPlan({analysis:{side:'WAIT',confidence:0},settings:this.settings,price:market.price,now})};this.lastEvalMs=now;this.nextEvalMs=nextEvaluation(now,Math.min(Number(this.settings.schedule.intervalMs||15000),5000),now);return this.status()}if(!this.externalMarket)this.feed.tick(now);
    try{
      const snap=this._marketSnapshot();const feed={snapshot:()=>snap};const liveAttached=!!this.externalMarket?.provider;const canUseExternalDemo=this.settings.mode==='demo'&&this.executionBroker&&this.externalMarket?.executionReady===true;const executionBroker=canUseExternalDemo?this.executionBroker:this.broker;const result=await engineCycle({feed,broker:executionBroker,settings:this.settings,state:this._riskState(now),balanceOverride:snap.balance,now});if(this.settings.mode==='demo'&&liveAttached&&!canUseExternalDemo&&result.action==='DEMO_ORDER'){result.action='WAIT';result.order=null;result.executionMode='broker_demo_wait';result.reasons=[...(result.reasons||[]),'Sinal válido, mas os controles DEMO da corretora ainda não foram validados — nenhuma ordem foi simulada ou clicada.']}else if(this.settings.mode==='demo'&&canUseExternalDemo&&result.action==='DEMO_ORDER')result.executionMode='broker_demo';
      result.plan=signalPlan({analysis:result.analysis,settings:this.settings,price:snap.price,now});this.lastResult=result;this.lastEvalMs=now;this.nextEvalMs=nextEvaluation(now,this.settings.schedule.intervalMs,now);
      if(result.analysis)this.analyses.unshift({ts:iso(now),asset:this.settings.asset,...result.analysis,latency:result.latency});this.analyses=this.analyses.slice(0,500);
      if(result.action==='DEMO_ORDER'){
        this.pending.push({orderId:result.order.id,side:result.order.side,referencePrice:result.order.referencePrice,amount:result.order.amount??result.amount,asset:result.order.asset||this.settings.asset,openedAt:result.order.openedAt||iso(now),external:!!result.order.external,provider:result.order.provider||this.externalMarket?.provider,settleAt:now+this.settings.orderDurationMs});
        this.audit.write({actorId:'engine',actorRole:'system',action:'order.demo_open',metadata:{orderId:result.order.id,asset:result.order.asset,side:result.order.side,amount:result.order.amount,confidence:result.order.confidence}});
        if(Number(result.latency?.executionMs||0)>Number(this.settings.risk.maxExecutionLatencyMs||1500)){this.state.executionError=true;this.incidents.unshift({ts:iso(now),severity:'error',code:'execution_latency',message:'latência de execução acima do limite'});this.stateName='error'}
      }
      const fatal=(result.reasons||[]).find(x=>AUTO_STOP_REASONS.has(x));if(fatal){this.stateName='stopped';this.audit.write({actorId:'engine',actorRole:'system',action:'bot.auto_stop',metadata:{reason:fatal}})}
      return this.status();
    }catch(error){this.state.executionError=true;this.stateName='error';this.incidents.unshift({ts:iso(now),severity:'error',code:'cycle_error',message:String(error?.message||error)});return this.status()}
  }
  snapshotPersistent(){return{version:1,settings:this.settings,state:this.state,masterFrozen:this.masterFrozen,killSwitch:this.killSwitch,trades:this.trades.slice(0,2000),analyses:this.analyses.slice(0,500),incidents:this.incidents.slice(0,500),audit:this.audit.list().slice(-2000),broker:{balance:this.broker.balance,orders:this.broker.orders},savedAt:iso()}}
  restore(data={}){if(data.settings){this.settings={...this.settings,...data.settings,schedule:{...this.settings.schedule,...(data.settings.schedule||{})},risk:{...this.settings.risk,...(data.settings.risk||{})}};if([60000,5000,2000].includes(Number(data.settings?.schedule?.intervalMs)))this.settings.schedule.intervalMs=1000}if(data.state)this.state={...this.state,...data.state};this.masterFrozen=!!data.masterFrozen;this.killSwitch=!!data.killSwitch;this.trades=Array.isArray(data.trades)?data.trades:[];this.analyses=Array.isArray(data.analyses)?data.analyses:[];this.incidents=Array.isArray(data.incidents)?data.incidents:[];if(Array.isArray(data.audit))this.audit.rows=data.audit;if(data.broker){this.broker.balance=Number(data.broker.balance||this.broker.balance);this.broker.orders=Array.isArray(data.broker.orders)?data.broker.orders:[]}this.stateName='stopped';this.lastResult={action:'WAIT',reasons:['runtime restaurada; aguardando início manual']};return this}
  async status(){
    const balance=this.externalMarket?.balance!=null?Number(this.externalMarket.balance):await this.broker.getBalance(),wins=this.trades.filter(x=>x.won).length,losses=this.trades.filter(x=>x.won===false).length,snap=this._marketSnapshot();
    return{state:this.stateName,mode:this.settings.mode,killSwitch:this.killSwitch,masterFrozen:this.masterFrozen,balance,pnl:this.trades.reduce((s,t)=>s+Number(t.pnl||0),0),trades:this.trades.length,wins,losses,winRate:this.trades.length?wins/this.trades.length*100:0,
      drawdownPct:this.state.drawdownPct,consecutiveLosses:this.state.consecutiveLosses,lastHeartbeat:this.lastHeartbeat,lastEvalMs:this.lastEvalMs,nextEvalMs:this.nextEvalMs,lastResult:this.lastResult,
      feed:{label:snap.source||'OFFLINE',price:snap.price,quoteTs:snap.quoteTs},analysisSource:this.externalMarket?.provider?(snap.feedValidated?'LIVE':'WAITING_LIVE'):(this.settings.requireLiveBroker?'OFFLINE':'SIMULATED'),executionMode:this.settings.mode==='real'?'real_manual':(this.externalMarket?.executionReady===true?'broker_demo':'sentinel_demo'),startBlockedReason:this._startBlockReason(),broker:await this.broker.getStatus(),pending:this.pending.length,recentTrades:this.trades.slice(0,50),recentAnalyses:this.analyses.slice(0,50),incidents:this.incidents.slice(0,50),settings:this.settings,audit:this.audit.list().slice(-100).reverse()}
  }
}

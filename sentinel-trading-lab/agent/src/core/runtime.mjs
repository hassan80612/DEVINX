import {DemoBrokerAdapter} from './demo-broker.mjs';
import {SimulatedFeed} from './simulated-feed.mjs';
import {engineCycle} from './engine.mjs';
import {AuditLog} from './audit.mjs';
import {nextEvaluation} from './scheduler.mjs';
import {analyzeMarket} from './strategy.mjs';

function iso(ts=Date.now()){return new Date(ts).toISOString()}
function dayKey(ts,timeZone='UTC'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ts));
  const o=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
const AUTO_STOP_REASONS=new Set(['horário final atingido','perda diária máxima atingida','meta diária atingida','drawdown máximo atingido','limite de perdas consecutivas','limite diário de operações']);
function signalPlan({analysis,settings,price,now=Date.now()}={}){
  const operational=analysis?.operationalSignal||null;
  const rawSide=String(analysis?.side||'WAIT').toUpperCase();
  const operationalSide=String(operational?.side||'').toUpperCase()==='CALL'?'BUY':String(operational?.side||'').toUpperCase()==='PUT'?'SELL':'WAIT';
  const side=operational?operationalSide:rawSide;
  const confidence=Number(operational?.strength??analysis?.confidence??0);
  const duration=Math.max(10000,Number(operational?.expiration?.brokerMs||settings?.orderDurationMs||60000));
  const min=Number(settings?.risk?.minConfidence||0);
  const valid=operational?operational.ready===true&&['BUY','SELL'].includes(side):(side==='BUY'||side==='SELL')&&confidence>=min;
  return {
    signal:valid?(side==='BUY'?'CALL':'PUT'):'WAIT',
    side:valid?side:'WAIT',
    asset:settings?.asset||'—',
    price:Number(price||0),
    confidence,
    minConfidence:min,
    entry:valid?'ENTRADA AGORA no gatilho validado':String(operational?.reason||'Aguardar confluência mínima'),
    entryReady:valid,
    exit:valid?`Expiração em ${Math.round(duration/1000)}s`:'Sem entrada',
    durationMs:duration,
    expiresAt:valid?new Date(Number(operational?.expiration?.targetAt)||now+duration).toISOString():null,
    nextCheckHint:`Nova avaliação conforme agenda (${Math.round(Number(settings?.schedule?.intervalMs||60000)/1000)}s)`
  };
}

export class DemoTradingRuntime{
  constructor({seed=20261002,balance=10000,payout=.82}={}){
    this.feed=new SimulatedFeed({seed,start:1.084});this.feed.warmup(140);
    this.broker=new DemoBrokerAdapter({balance,payout});
    this.audit=new AuditLog();
    this.stateName='stopped';this.masterFrozen=false;this.killSwitch=false;this.lastEvalMs=0;this.nextEvalMs=0;this.lastHeartbeat=Date.now();
    this.lastResult={action:'WAIT',reasons:['bot parado']};this.pending=[];this.trades=[];this.analyses=[];this.incidents=[];this.signalValidation={pending:[],outcomes:[],lastQueued:{}};this.entryStability={side:'WAIT',since:0,count:0};this.entryRelease={side:'WAIT',at:0};this.operationalSetup=null;this.expirySelection=null;
    this.settings={
      mode:'demo',asset:'EUR/USD',strategy:'smart_confluence',strategy2:'none',strategy3:'none',requireLiveBroker:true,orderDurationMs:60_000,orderProposalTtlMs:60_000,
      schedule:{enabled:true,timezone:'America/Sao_Paulo',days:['sun','mon','tue','wed','thu','fri','sat'],dailyStart:'00:00',dailyEnd:'23:59',intervalMs:1_000,startAt:null,endAt:null},
      risk:{minConfidence:74,signalValidationMinSamples:30,signalValidationMinWinRate:60,maxFeedLatencyMs:2_500,maxDecisionLatencyMs:250,maxExecutionLatencyMs:1_500,stakeMode:'fixed',fixedStake:10,stakePct:1,maxStake:50,maxTradesPerDay:20,maxTradesPerHour:5,maxConsecutiveLosses:3,maxDailyLoss:100,dailyProfitTarget:0,maxDrawdownPct:10,cooldownSeconds:60,lossCooldownSeconds:180}
    };
    this.state={cooldownUntil:null,consecutiveLosses:0,dailyPnl:0,peakBalance:balance,drawdownPct:0,executionError:false};
    this.externalMarket=null;this.executionBroker=null;
  }
  resetAnalysis(reason='Sincronizando leitura do ativo atual.'){this.operationalSetup=null;this.expirySelection=null;this.entrySetup=null;this.entryStability={side:'WAIT',since:0,count:0};this.entryRelease={side:'WAIT',at:0};this.lastResult={action:'WAIT',reasons:[reason],analysis:{side:'WAIT',confidence:0,reasons:[reason]}};this.lastEvalMs=0;this.nextEvalMs=0;return this}
  setExecutionBroker(broker=null){this.executionBroker=broker||null;return this}
  requestImmediateEvaluation(){if(this.stateName==='running')this.nextEvalMs=0;return this}
  setExternalMarket(market=null){
    if(!market){if(this.externalMarket)this.resetAnalysis('Corretora desconectada.');this.externalMarket=null;return this}
    const old=this.externalMarket;
    if(old&&(old.provider!==market.provider||old.symbol!==market.symbol||old.brokerMode!==market.brokerMode))this.resetAnalysis('Ativo ou conta alterados; sincronizando a leitura atual.');
    const candles=Array.isArray(market.candles)?market.candles.filter(c=>[c?.open,c?.high,c?.low,c?.close].every(v=>v!=null&&Number.isFinite(Number(v))&&Number(v)>0)):[];
    const quoteHistory=Array.isArray(market.quoteHistory)?market.quoteHistory.filter(x=>Number.isFinite(Number(x?.ts))&&Number.isFinite(Number(x?.price))&&Number(x.price)>0).slice(-900):[];
    this.externalMarket={...market,candles,quoteHistory,quote:Number(market.quote??market.price??quoteHistory.at(-1)?.price??candles.at(-1)?.close),quoteTs:Number(market.quoteTs||market.lastFrameAt||market.lastDomAt||Date.now()),source:market.source||String(market.provider||'LIVE').toUpperCase()};
    return this
  }
  _marketSnapshot(){
    if(this.externalMarket){const ready=this.externalMarket.assetConfirmed!==false&&this.externalMarket.feedValidated!==false&&this.externalMarket.candles?.length>=50&&Number.isFinite(Number(this.externalMarket.quote));return{candles:ready?[...this.externalMarket.candles]:[],quoteHistory:ready?[...(this.externalMarket.quoteHistory||[])]:[],quoteTs:this.externalMarket.quoteTs,price:Number(this.externalMarket.quote||this.externalMarket.quoteHistory?.at(-1)?.price||this.externalMarket.candles?.at(-1)?.close||0),source:this.externalMarket.source||'LIVE',balance:this.externalMarket.balance,provider:this.externalMarket.provider,mode:this.externalMarket.mode,waitingLive:!ready,feedValidated:ready,brokerExpirationDurationMs:Number.isFinite(Number(this.externalMarket.expirationDurationMs))?Number(this.externalMarket.expirationDurationMs):null,brokerExpirationRaw:this.externalMarket.expirationRaw||null,brokerExpirationKind:this.externalMarket.expirationKind||null,brokerExpirationConfidence:Number(this.externalMarket.expirationConfidence||0),brokerExpirationUpdatedAt:Number(this.externalMarket.expirationUpdatedAt||0)}}
    if(this.settings.requireLiveBroker)return{candles:[],quoteTs:0,price:0,source:'OFFLINE',balance:null,provider:null,mode:this.settings.mode,waitingLive:true,feedValidated:false};
    return this.feed.snapshot()
  }
  _startBlockReason(){if(this.killSwitch)return'Kill switch ativo.';if(this.masterFrozen)return'Bot congelado pelo Master.';if(this.settings.requireLiveBroker&&!this.externalMarket?.provider)return'Conecte uma corretora antes de iniciar.';return null}
  _strategyPanel(snap,now=Date.now(),primary=null){
    const analyses=new Map();if(primary?.metrics?.strategy)analyses.set(primary.metrics.strategy,primary);
    const labels={smart_confluence:'Smart Confluence',price_action:'Price Action',trendline_breakout:'Trendline Breakout',support_resistance:'Suporte / Resistência',fibonacci_retest:'Fibonacci Retest',trend:'Trend Following',mean_reversion:'Mean Reversion',breakout:'Breakout'};
    const ids=[String(this.settings.strategy||'smart_confluence'),String(this.settings.strategy2||'none'),String(this.settings.strategy3||'none')];
    const cards=ids.map((strategy,index)=>{
      if(strategy==='none'||!labels[strategy])return{slot:index+1,strategy:'none',label:'Estratégia não selecionada',active:false,side:'NEUTRO',callPct:null,putPct:null,rawCall:0,rawPut:0,reasons:[]};
      try{
        const a=analyses.get(strategy)||analyzeMarket({candles:snap.candles,quoteHistory:snap.quoteHistory||[],strategy,minConfidence:this.settings.risk.minConfidence,durationMs:this.settings.orderDurationMs,freshnessMs:this.settings.risk.maxFeedLatencyMs,quoteTs:snap.quoteTs,now,preparedMetrics:primary?.metrics});
        analyses.set(strategy,a);
        const rawCall=Math.max(0,Number(a?.metrics?.rawBuyScore||0)),rawPut=Math.max(0,Number(a?.metrics?.rawSellScore||0));
        const callPct=Math.max(0,Math.min(100,Math.round(rawCall))),putPct=Math.max(0,Math.min(100,Math.round(rawPut))),edge=callPct-putPct,strongest=Math.max(callPct,putPct);
        const side=strongest<35||Math.abs(edge)<10?'NEUTRO':edge>0?'CALL':'PUT';
        const reasons=(Array.isArray(a?.reasons)?a.reasons:[]).filter(x=>!/entrada aguardando|bloqueado por risco|fluxo \d+s|EMA micro|microestrutura/i.test(String(x))).slice(0,3);
        return{slot:index+1,strategy,label:labels[strategy],active:true,side,callPct,putPct,rawCall,rawPut,reasons};
      }catch{
        return{slot:index+1,strategy,label:labels[strategy],active:true,side:'NEUTRO',callPct:null,putPct:null,rawCall:0,rawPut:0,reasons:['Leitura indisponível neste ciclo']};
      }
    });
    const seen=new Set();
    const active=cards.filter(x=>{if(!x.active||x.callPct==null||x.putPct==null||seen.has(x.strategy))return false;seen.add(x.strategy);return true});
    // Smart already contains the other strategies: retain its card, avoid counting it twice.
    const voting=active.length>1&&active.some(x=>x.strategy==='smart_confluence')?active.filter(x=>x.strategy!=='smart_confluence'):active;
    const activeCount=active.length;
    const callPct=activeCount?Math.round(voting.reduce((s,x)=>s+Number(x.callPct),0)/voting.length):null;
    const putPct=activeCount?Math.round(voting.reduce((s,x)=>s+Number(x.putPct),0)/voting.length):null;
    const callVotes=voting.filter(x=>x.side==='CALL').length,putVotes=voting.filter(x=>x.side==='PUT').length;
    let side='AGUARDAR',agreement='SEM ESTRATÉGIAS';
    if(voting.length===1){side=voting[0].side;agreement='1 LEITURA TÉCNICA · TIMING EXIGIDO'}
    else if(voting.length>1){
      const strongest=Math.max(Number(callPct||0),Number(putPct||0)),edge=Number(callPct||0)-Number(putPct||0);
      if(callVotes>putVotes&&strongest>=35&&edge>=10)side='CALL';
      else if(putVotes>callVotes&&strongest>=35&&edge<=-10)side='PUT';
      agreement=callVotes===putVotes?'DIVERGÊNCIA':(callVotes>putVotes?`${callVotes}/${voting.length} CONCORDAM EM CALL`:`${putVotes}/${voting.length} CONCORDAM EM PUT`);
    }
    return{cards,analyses,confluence:{activeCount,effectiveCount:voting.length,callPct,putPct,callVotes,putVotes,side,agreement,overlapAdjusted:voting.length!==activeCount}};
  }

  _mergeScenarioConfluence(analysis,strategyPanel){
    const planner=analysis?.entryPlanner?.horizons;
    if(!planner||typeof planner!=='object')return;
    const general=analysis?.generalConsensus||{};
    const generalSide=['CALL','PUT'].includes(String(general.side||'').toUpperCase())?String(general.side).toUpperCase():'AGUARDAR';
    for(const plan of Object.values(planner)){
      if(!plan||typeof plan!=='object')continue;
      const horizonSide=String(plan.rawBias??plan.bias??'NEUTRO').toUpperCase();
      plan.rawBias=horizonSide;
      plan.generalBias=generalSide;
      if(generalSide!=='AGUARDAR')plan.bias=horizonSide===generalSide?generalSide:'NEUTRO';
      plan.consensusBasis=generalSide!=='AGUARDAR'?'prazo + consenso geral dos 6 cards':'prazo + leitura técnica disponível';
      plan.consensusSources=generalSide!=='AGUARDAR'?['prazo '+horizonSide,'consenso geral '+generalSide]:['prazo '+horizonSide];
    }
  }
  _generalConsensus(analysis,strategyPanel){
    const final=analysis?.finalConfluence||{},q=analysis?.quality||{},m=analysis?.metrics||{},short=m.shortModel||{};
    const avg=rows=>rows.length?Math.round(rows.reduce((s,v)=>s+v,0)/rows.length):null;
    const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
    const rapidCallRows=[short.ready?short.callScore:q.technicalBuy??m.buyScore].filter(finite).map(Number);
    const rapidPutRows=[short.ready?short.putScore:q.technicalSell??m.sellScore].filter(finite).map(Number);
    const rapidCall=avg(rapidCallRows),rapidPut=avg(rapidPutRows);
    const rapidEdge=rapidCall==null||rapidPut==null?0:rapidCall-rapidPut,rapidStrength=Math.max(Number(rapidCall||0),Number(rapidPut||0));
    const rapidSide=rapidStrength>=35&&Math.abs(rapidEdge)>=8?(rapidEdge>0?'CALL':'PUT'):'AGUARDAR';
    const sc=strategyPanel?.confluence||{},strategyCall=finite(sc.callPct)?Number(sc.callPct):null,strategyPut=finite(sc.putPct)?Number(sc.putPct):null;
    const strategySide=['CALL','PUT'].includes(String(sc.side||'').toUpperCase())?String(sc.side).toUpperCase():'AGUARDAR';
    const hasRapid=rapidCall!=null&&rapidPut!=null,hasStrategy=strategyCall!=null&&strategyPut!=null&&Number(sc.activeCount||0)>=1;
    const callScore=hasRapid&&hasStrategy?Math.round(rapidCall*.40+strategyCall*.60):hasStrategy?Math.round(strategyCall):hasRapid?Math.round(rapidCall):null;
    const putScore=hasRapid&&hasStrategy?Math.round(rapidPut*.40+strategyPut*.60):hasStrategy?Math.round(strategyPut):hasRapid?Math.round(rapidPut):null;
    const edge=callScore==null||putScore==null?0:callScore-putScore,strength=Math.max(Number(callScore||0),Number(putScore||0));
    const aligned=hasRapid&&hasStrategy&&['CALL','PUT'].includes(rapidSide)&&rapidSide===strategySide;
    const divergent=hasRapid&&hasStrategy&&['CALL','PUT'].includes(rapidSide)&&['CALL','PUT'].includes(strategySide)&&rapidSide!==strategySide;
    const side=aligned&&strength>=45&&Math.abs(edge)>=10?(edge>0?'CALL':'PUT'):'AGUARDAR';
    const state=aligned?'ALINHADO':divergent?'DIVERGÊNCIA':'FORMANDO';
    return{side,state,aligned,divergent,callScore,putScore,strength,edge,weights:{rapid:40,strategies:60},rapid:{side:rapidSide,callScore:rapidCall,putScore:rapidPut,strength:rapidStrength,edge:rapidEdge},strategies:{side:strategySide,callScore:strategyCall,putScore:strategyPut,activeCount:Number(sc.activeCount||0)}};
  }
  _strategyComboKey(){
    const ids=[this.settings.strategy,this.settings.strategy2,this.settings.strategy3].map(x=>String(x||'none')).filter(x=>x!=='none');
    return [...new Set(ids)].join('+')||'none';
  }
  _operationalSignalState(analysis,snap,now=Date.now()){
    const general=analysis?.generalConsensus||{},quality=analysis?.quality||{},plans=analysis?.entryPlanner?.horizons||{};
    const durationMs=Math.max(15000,Number(this.settings.orderDurationMs||60000)),plan=plans[String(Math.round(durationMs/1000))]||null;
    const asset=String(this.settings.asset||'—').toUpperCase(),combo=this._strategyComboKey();
    const side=['CALL','PUT'].includes(general.side)?general.side:'AGUARDAR';
    const price=Number(snap?.price??analysis?.metrics?.last),strength=Math.max(0,Number(general.strength||0)),edge=Math.abs(Number(general.edge||0));
    const minimum=Math.max(55,Number(this.settings.risk.minConfidence||74));
    const kind=String(snap?.brokerExpirationKind||''),raw=snap?.brokerExpirationRaw||null,updated=Number(snap?.brokerExpirationUpdatedAt||0);
    const scanned=snap?.brokerExpirationDurationMs;
    const remaining=scanned!=null&&Number.isFinite(Number(scanned))?Math.max(0,Number(scanned)-(kind==='clock'?Math.max(0,now-updated):0)):null;
    const detected=remaining!=null&&remaining>=10000&&Number(snap?.brokerExpirationConfidence||0)>=32&&updated>0&&now-updated<=15000;
    const targetAt=detected?(kind==='clock'?updated+Number(scanned):now+remaining):null;
    const tolerance=kind==='clock'?Math.max(5000,Math.min(30000,durationMs*.30)):Math.max(2000,Math.min(5000,durationMs*.06));
    const sameClock=this.expirySelection&&this.expirySelection.asset===asset&&this.expirySelection.durationMs===durationMs&&this.expirySelection.raw===raw&&Math.abs(this.expirySelection.targetAt-Number(targetAt))<=1500;
    const match=detected&&(Math.abs(remaining-durationMs)<=tolerance||(kind==='clock'&&sameClock));
    if(match&&kind==='clock')this.expirySelection={asset,durationMs,raw,targetAt};
    const expiration={detected,match,requestedMs:durationMs,brokerMs:detected?remaining:null,targetAt,kind,raw,confidence:Number(snap?.brokerExpirationConfidence||0),toleranceMs:tolerance};
    const blockers=[];if(side==='AGUARDAR'||general.state!=='ALINHADO')blockers.push(general.divergent?'Fluxo e estratégias divergentes.':'Fluxo e estratégias ainda sem alinhamento.');if(strength<minimum)blockers.push(`Força ${Math.round(strength)}% abaixo do filtro ${minimum}%.`);if(!detected)blockers.push('Prazo da corretora não reconhecido.');else if(!match)blockers.push('Prazo da corretora diferente do configurado.');
    const base={callStrength:Number(general.callScore||0),putStrength:Number(general.putScore||0),blockers,side,state:'AGUARDAR',ready:false,actionable:false,price,strength,technicalConfidence:strength,minimum,edge,combo,durationMs,trigger:null,invalidation:null,triggerMet:false,armed:false,expiration,reason:'Aguardando alinhamento entre leitura rápida e estratégias.'};
    if(analysis?.feedFresh===false)return{...base,state:'ATUALIZANDO PREÇO',reason:'Análise técnica disponível; aguardando cotação atual para liberar uma entrada.'};
    if(!Number.isFinite(price)||price<=0||!plan||snap?.feedValidated===false)return{...base,reason:'Sincronizando preço e cenário do ativo atual.'};
    if(side==='AGUARDAR'||general.state!=='ALINHADO'){
      this.operationalSetup=null;
      return{...base,reason:blockers.join(' ')};
    }
    if(strength<minimum)return{...base,reason:blockers.join(' ')};
    if(!detected){this.operationalSetup=null;return{...base,state:'VERIFICAR PRAZO',reason:'Expiração não identificada. Confira o prazo selecionado na corretora.'}}
    if(!match){this.operationalSetup=null;return{...base,state:'AJUSTAR PRAZO',reason:`Corretora: ${Math.round(remaining/1000)}s restantes · Sentinel: ${Math.round(durationMs/1000)}s. Ajuste a expiração.`}}
    if(!plan.outlookReady)return{...base,reason:'Coletando dados suficientes para o prazo selecionado.'};
    const reversal=/reação|revers/i.test(String(plan.basis||''));
    const horizonSide=String(plan.rawBias||plan.bias||'NEUTRO');
    if(!reversal&&['CALL','PUT'].includes(horizonSide)&&horizonSide!==side)return{...base,reason:'O cenário do prazo diverge da direção técnica.'};
    const trigger=Number(side==='CALL'?plan.callTrigger:plan.putTrigger),invalidation=Number(side==='CALL'?plan.callInvalidation:plan.putInvalidation);
    if((side==='CALL'?plan.callTrigger:plan.putTrigger)==null||(side==='CALL'?plan.callInvalidation:plan.putInvalidation)==null||!Number.isFinite(trigger)||!Number.isFinite(invalidation)||trigger<=0||invalidation<=0)return{...base,reason:'Aguardando níveis de preço válidos.'};
    const key=[asset,durationMs,combo,side,reversal?'reversal':'breakout'].join('|'),ttl=Math.max(30000,Math.min(120000,Math.round(durationMs*1.5)));
    let setup=this.operationalSetup;
    if(!setup||setup.key!==key||now>=setup.expiresAt){setup={key,asset,durationMs,combo,side,trigger,invalidation,createdAt:now,expiresAt:now+ttl,armed:false,confirmLevel:null,firedAt:0,invalidated:false,basis:plan.basis};this.operationalSetup=setup}
    const setupView={...base,trigger:setup.trigger,invalidation:setup.invalidation,createdAt:setup.createdAt,expiresAt:setup.expiresAt,armed:setup.armed};
    if(setup.invalidated)return{...setupView,reason:'Setup invalidado; aguardando um novo cenário.'};
    const invalidated=side==='CALL'?price<=setup.invalidation:price>=setup.invalidation;
    if(invalidated){setup.invalidated=true;setup.expiresAt=now+5000;return{...setupView,expiresAt:setup.expiresAt,reason:'Setup invalidado pelo preço; nova leitura em até 5s.'}}
    const buffer=Math.max(Math.abs(Number(plan.expectedMove||0))*.08,Math.abs(price)*.000002);
    if(reversal&&!setup.armed&&(side==='CALL'?price<=setup.trigger:price>=setup.trigger)){setup.armed=true;setup.confirmLevel=side==='CALL'?setup.trigger+buffer:setup.trigger-buffer}
    const triggerMet=reversal?setup.armed&&(side==='CALL'?price>=setup.confirmLevel:price<=setup.confirmLevel):(side==='CALL'?price>=setup.trigger:price<=setup.trigger);
    const entrySide=quality.entrySide==='BUY'?'CALL':quality.entrySide==='SELL'?'PUT':null;
    const timing=quality.entryReady===true&&entrySide===side;
    const horizonAligned=horizonSide===side||(reversal&&timing);
    const ready=triggerMet&&timing&&horizonAligned&&edge>=10;
    if(ready&&!setup.firedAt){setup.firedAt=now;this._queueSignalCandidate({kind:'operational',side:side==='CALL'?'BUY':'SELL',confidence:strength,referencePrice:price,asset,durationMs,strategy:combo,now,settleDurationMs:remaining,expirationSource:raw||kind})}
    const active=ready&&setup.firedAt>0&&now-setup.firedAt<=6000&&!setup.releasedAt;
    return{...setupView,armed:setup.armed,triggerMet,state:active?'ENTRADA':'PREPARAR',ready:active,actionable:active,entryAt:active?setup.firedAt:null,reason:active?'Gatilho confirmado · fluxo e prazo alinhados.':setup.firedAt?'Janela de entrada encerrada; aguardando novo setup.':reversal&&!setup.armed?'Aguardando tocar a região de reversão.':reversal&&!triggerMet?'Região tocada; aguardando reação confirmada.':!triggerMet?'Aguardando o preço atingir o gatilho fixo.':!horizonAligned?'Aguardando direção consistente no prazo.':quality.blockDetail||'Aguardando confirmação curta do fluxo.'};
  }
  async start(actor='user'){const reason=this._startBlockReason();if(reason)throw new Error(reason);this.stateName='running';this.nextEvalMs=Date.now();this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.start'});return this.status()}
  async pause(actor='user'){this.stateName='paused';this.resetAnalysis('Análise pausada.');this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.pause'});return this.status()}
  async stop(actor='user',reason='manual'){this.stateName='stopped';this.resetAnalysis('Bot parado.');this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.stop',metadata:{reason}});return this.status()}
  async kill(actor='user'){this.killSwitch=true;this.stateName='stopped';this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.kill_switch'});return this.status()}
  async resetKill(actor='master'){if(actor!=='master')throw new Error('master_required');this.killSwitch=false;this.audit.write({actorId:actor,actorRole:'master',action:'bot.kill_reset'});return this.status()}
  async freeze(actor='master'){if(actor!=='master')throw new Error('master_required');this.masterFrozen=true;this.stateName='stopped';this.audit.write({actorId:actor,actorRole:'master',action:'bot.freeze'});return this.status()}
  async unfreeze(actor='master'){if(actor!=='master')throw new Error('master_required');this.masterFrozen=false;this.audit.write({actorId:actor,actorRole:'master',action:'bot.unfreeze'});return this.status()}
  setMode(mode,actor='user'){if(!['demo','real'].includes(mode))throw new Error('invalid_mode');this.settings.mode=mode;this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'mode.change',metadata:{mode}});return this.status()}
  patchSettings(patch={},actor='user'){const resetOperational=['asset','strategy','strategy2','strategy3','orderDurationMs'].some(k=>Object.prototype.hasOwnProperty.call(patch,k));this.settings={...this.settings,...patch,schedule:{...this.settings.schedule,...(patch.schedule||{})},risk:{...this.settings.risk,...(patch.risk||{})}};if(resetOperational)this.resetAnalysis('Configuração alterada; recalculando cenário.');this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'settings.update'});return this.status()}
  clearExecutionError(actor='master'){if(actor!=='master')throw new Error('master_required');this.state.executionError=false;if(this.stateName==='error')this.stateName='stopped';this.audit.write({actorId:actor,actorRole:'master',action:'execution_error.clear'});return this.status()}
  _riskState(now){
    const tz=this.settings.schedule.timezone||'UTC',today=dayKey(now,tz);
    const todayTrades=this.trades.filter(t=>dayKey(new Date(t.closedAt||t.openedAt).getTime(),tz)===today),hourAgo=now-3600000;
    return{killSwitch:this.killSwitch,botFrozen:this.masterFrozen,brokerConnected:this.settings.requireLiveBroker?!!this.externalMarket?.provider&&this.externalMarket?.feedValidated!==false:this.broker.connected,engineHealthy:now-this.lastHeartbeat<10_000,
      feedLatencyMs:Math.max(0,now-(this._marketSnapshot().quoteTs||now)),tradesToday:todayTrades.length+this.pending.length,tradesLastHour:this.pending.length+this.trades.filter(t=>new Date(t.openedAt).getTime()>=hourAgo).length,
      maxTradesPerDay:this.settings.risk.maxTradesPerDay,maxTradesPerHour:this.settings.risk.maxTradesPerHour,consecutiveLosses:this.state.consecutiveLosses,maxConsecutiveLosses:this.settings.risk.maxConsecutiveLosses,
      dailyPnl:todayTrades.reduce((s,t)=>s+Number(t.pnl||0),0),maxDailyLoss:this.settings.risk.maxDailyLoss,dailyProfitTarget:this.settings.risk.dailyProfitTarget,drawdownPct:this.state.drawdownPct,
      maxDrawdownPct:this.settings.risk.maxDrawdownPct,cooldownUntil:this.state.cooldownUntil,executionError:this.state.executionError,humanConfirmed:false};
  }
  _validationKey(kind,asset,durationMs,strategy){return ['micro-v5',kind,String(asset||'—').toUpperCase(),Number(durationMs||0),String(strategy||'smart_confluence')].join('|')}
  _validationStats(key){
    const rows=this.signalValidation.outcomes.filter(x=>x.key===key&&x.settlementQuality==='exact').slice(-100);
    const samples=rows.length,wins=rows.filter(x=>x.won===true).length,losses=rows.filter(x=>x.won===false).length,winRate=samples?Math.round(wins/samples*1000)/10:0;
    const minSamples=Math.max(30,Number(this.settings.risk.signalValidationMinSamples||30));
    const minWinRate=Math.max(55,Number(this.settings.risk.signalValidationMinWinRate||60));
    const smoothedWinRate=Math.round(((wins+10)/(samples+20))*1000)/10;
    return{key,samples,wins,losses,winRate,smoothedWinRate,minSamples,minWinRate,ready:samples>=minSamples&&smoothedWinRate>=minWinRate}
  }
  _priceAtExpiry(snap,dueAt,now=Date.now()){
    const rows=(Array.isArray(snap?.quoteHistory)?snap.quoteHistory:[]).map(x=>({ts:Number(x?.ts),price:Number(x?.price)})).filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.price)&&x.price>0).sort((a,b)=>a.ts-b.ts);
    const exact=rows.filter(x=>Math.abs(x.ts-dueAt)<=1500).sort((a,b)=>Math.abs(a.ts-dueAt)-Math.abs(b.ts-dueAt))[0];
    if(exact)return{price:exact.price,ts:exact.ts,quality:'exact',offsetMs:exact.ts-dueAt};
    const near=rows.filter(x=>Math.abs(x.ts-dueAt)<=5000).sort((a,b)=>Math.abs(a.ts-dueAt)-Math.abs(b.ts-dueAt))[0];
    if(near&&now-dueAt>=5000)return{price:near.price,ts:near.ts,quality:'approx',offsetMs:near.ts-dueAt};
    return null
  }
  _settleSignalValidation(now,snap){
    const currentPrice=Number(snap?.price),asset=String(this.settings.asset||'—').toUpperCase();
    if(!Number.isFinite(currentPrice)||currentPrice<=0)return;
    const keep=[];
    for(const p of this.signalValidation.pending){
      const dueAt=Number(p.dueAt||0);
      if(dueAt>now){keep.push(p);continue}
      if(String(p.asset||'').toUpperCase()!==asset){if(now-dueAt<15000)keep.push(p);continue}
      const atExpiry=this._priceAtExpiry(snap,dueAt,now);
      if(!atExpiry){if(now-dueAt<15000)keep.push(p);continue}
      const won=p.side==='BUY'?atExpiry.price>Number(p.referencePrice):atExpiry.price<Number(p.referencePrice);
      this.signalValidation.outcomes.push({...p,settledAt:atExpiry.ts,settledPrice:atExpiry.price,settlementQuality:atExpiry.quality,settlementOffsetMs:atExpiry.offsetMs,won});
    }
    this.signalValidation.pending=keep.slice(-200);
    this.signalValidation.outcomes=this.signalValidation.outcomes.slice(-1000);
  }
  _queueSignalCandidate({kind,side,confidence,referencePrice,asset,durationMs,strategy,now,settleDurationMs=null,expirationSource=null}){
    if(!['BUY','SELL'].includes(String(side||'').toUpperCase()))return;
    const requestedDuration=Math.max(10000,Number(durationMs||30000)),actualDuration=settleDurationMs!=null&&Number.isFinite(Number(settleDurationMs))?Math.max(10000,Number(settleDurationMs)):requestedDuration;
    const key=this._validationKey(kind,asset,requestedDuration,strategy),spacing=Math.max(5000,Math.min(30000,Math.round(requestedDuration/2)));
    const last=Number(this.signalValidation.lastQueued[key]||0);
    if(now-last<spacing)return;
    this.signalValidation.lastQueued[key]=now;
    this.signalValidation.pending.push({key,kind,asset:String(asset||'—'),durationMs:requestedDuration,settleDurationMs:actualDuration,strategy:String(strategy||'smart_confluence'),side:String(side).toUpperCase(),confidence:Number(confidence||0),referencePrice:Number(referencePrice||0),createdAt:now,dueAt:now+actualDuration,expirationSource:expirationSource||null});
    this.signalValidation.pending=this.signalValidation.pending.slice(-200);
  }
  _signalValidationGate({analysis,snap,settings,now}){
    this._settleSignalValidation(now,snap);
    const strategyPanel=this._strategyPanel(snap,now,analysis);
    const targetSide=strategyPanel.confluence.side==='CALL'?'BUY':strategyPanel.confluence.side==='PUT'?'SELL':'WAIT';
    const matches=[...strategyPanel.analyses.values()].filter(a=>a.side===targetSide&&targetSide!=='WAIT').sort((a,b)=>b.confidence-a.confidence);
    if(matches.length)analysis={...matches[0],selectedStrategy:matches[0].metrics.strategy};
    const asset=String(settings.asset||'—'),strategy=String(analysis?.selectedStrategy||analysis?.metrics?.strategy||settings.strategy||'smart_confluence'),durationMs=Math.max(15000,Number(settings.orderDurationMs||60000));
    const rawSide=String(analysis?.side||'WAIT').toUpperCase(),rawForecastSide=String(analysis?.forecast30?.side||'WAIT').toUpperCase();
    this._queueSignalCandidate({kind:'confirmed',side:rawSide,confidence:analysis?.confidence,referencePrice:snap.price,asset,durationMs,strategy,now});
    this._queueSignalCandidate({kind:'forecast30',side:rawForecastSide,confidence:analysis?.forecast30?.confidence,referencePrice:snap.price,asset,durationMs:30000,strategy,now});
    const confirmed=this._validationStats(this._validationKey('confirmed',asset,durationMs,strategy));
    const forecast=this._validationStats(this._validationKey('forecast30',asset,30000,strategy));
    const threshold=Math.max(55,Number(settings?.risk?.minConfidence||74));
    const technicalBuy=Math.max(0,Math.min(100,Number(analysis?.metrics?.buyScore)||0));
    const technicalSell=Math.max(0,Math.min(100,Number(analysis?.metrics?.sellScore)||0));
    const technicalEdge=Math.abs(technicalBuy-technicalSell);
    const leader=technicalBuy>=technicalSell?'BUY':'SELL',leaderScore=Math.max(technicalBuy,technicalSell);
    const short=analysis?.metrics?.shortModel||{},shortHorizon=durationMs<=60000;
    let blockCode=null,blockLabel=null,blockDetail=null;
    if(!['BUY','SELL'].includes(rawSide)){
      if(shortHorizon&&!short.ready){blockCode='microflow';blockLabel='COLETANDO FLUXO';blockDetail='Aguardando microestrutura suficiente para avaliar o ponto de entrada.'}
      else if(leaderScore<threshold){blockCode='filter';blockLabel='ABAIXO DO FILTRO';blockDetail=`Força ${Math.round(leaderScore)}% · filtro ${Math.round(threshold)}%.`}
      else if(shortHorizon&&short.reversalCallCandidate){blockCode='reversal_setup';blockLabel='REVERSÃO EM FORMAÇÃO — CALL';blockDetail='O movimento de baixa está perdendo força em região relevante; aguardando o gatilho curto de subida.'}
      else if(shortHorizon&&short.reversalPutCandidate){blockCode='reversal_setup';blockLabel='REVERSÃO EM FORMAÇÃO — PUT';blockDetail='O movimento de alta está perdendo força em região relevante; aguardando o gatilho curto de queda.'}
      else if(shortHorizon&&((leader==='BUY'&&short.callOverextended)||(leader==='SELL'&&short.putOverextended))){blockCode='extended';blockLabel='MOVIMENTO ESTENDIDO';blockDetail=`Viés ${leader==='BUY'?'CALL':'PUT'} existe, mas o preço já correu; aguardando um novo ponto de entrada em vez de perseguir o movimento.`}
      else if(shortHorizon&&((leader==='BUY'&&short.callReversalRisk)||(leader==='SELL'&&short.putReversalRisk))){blockCode='reversal';blockLabel='RISCO DE REVERSÃO';blockDetail='A força atingiu o filtro, mas a microestrutura indica risco de reversão.'}
      else if(shortHorizon&&technicalEdge<15){blockCode='edge';blockLabel='VANTAGEM INSUFICIENTE';blockDetail=`Diferença CALL/PUT de ${Math.round(technicalEdge)}%; a direção ainda não está separada o suficiente.`}
      else if(shortHorizon&&((leader==='BUY'&&short.callSetup)||(leader==='SELL'&&short.putSetup))){blockCode='preparing';blockLabel=`PREPARANDO ${leader==='BUY'?'CALL':'PUT'}`;blockDetail='Início de aceleração/setup detectado; aguardando o gatilho completo sem esperar o movimento ficar esticado.'}
      else if(shortHorizon&&((leader==='BUY'&&!short.flowReadyCall)||(leader==='SELL'&&!short.flowReadyPut))){blockCode='flow';blockLabel='AGUARDANDO FLUXO';blockDetail='Filtro atingido; falta confirmação curta do fluxo.'}
      else if(shortHorizon&&((leader==='BUY'&&!short.structureReadyCall)||(leader==='SELL'&&!short.structureReadyPut))){blockCode='structure';blockLabel='AGUARDANDO ESTRUTURA';blockDetail='Filtro atingido; falta confirmação da estrutura curta.'}
      else {blockCode='strategy';blockLabel='AGUARDAR';blockDetail='O viés existe, mas ainda não há ponto de entrada válido.'}
    }
    const minConfirmMs=durationMs<=30000?250:durationMs<=60000?350:durationMs<=120000?700:1200;
    if(['BUY','SELL'].includes(rawSide)){if(this.entryStability.side===rawSide)this.entryStability.count=Number(this.entryStability.count||0)+1;else this.entryStability={side:rawSide,since:now,count:1}}
    else this.entryStability={side:'WAIT',since:now,count:0};
    const stable=['BUY','SELL'].includes(rawSide)&&this.entryStability.count>=2&&now-Number(this.entryStability.since||now)>=minConfirmMs;
    const stability={side:this.entryStability.side,count:this.entryStability.count,since:this.entryStability.since,minStableMs:minConfirmMs,ready:stable};
    const reversalGuardMs=durationMs<=30000?3000:durationMs<=60000?4000:durationMs<=120000?5000:7000;
    const lastReleaseSide=String(this.entryRelease?.side||'WAIT').toUpperCase();
    const reversalBlocked=['BUY','SELL'].includes(rawSide)&&['BUY','SELL'].includes(lastReleaseSide)&&rawSide!==lastReleaseSide&&now-Number(this.entryRelease?.at||0)<reversalGuardMs;
    if(['BUY','SELL'].includes(rawSide)&&!stable){blockCode='confirming';blockLabel='CONFIRMANDO';blockDetail='Sinal completo detectado; confirmando mais um ciclo para evitar uma indicação de um único instante.'}
    if(reversalBlocked){blockCode='reversal_guard';blockLabel='REVERSÃO — AGUARDE';blockDetail='O lado oposto apareceu logo após uma entrada; o Sentinel exige nova confirmação antes de inverter.'}
    const historyStatus=confirmed.ready?'VALIDADO':(confirmed.samples>=confirmed.minSamples?'HISTÓRICO FRACO':'EM TESTE');
    const entryReady=analysis.feedFresh!==false&&['BUY','SELL'].includes(rawSide)&&stable&&!reversalBlocked;
    let setupSide='WAIT',setupKind=null;
    if(shortHorizon&&!entryReady){
      if(short.reversalCallCandidate){setupSide='BUY';setupKind='reversal'}
      else if(short.reversalPutCandidate){setupSide='SELL';setupKind='reversal'}
      else if(leader==='BUY'&&short.callSetup){setupSide='BUY';setupKind='continuation'}
      else if(leader==='SELL'&&short.putSetup){setupSide='SELL';setupKind='continuation'}
    }
    const setupWindowMs=12000;
    if(setupSide!=='WAIT'){
      if(!this.entrySetup||this.entrySetup.side!==setupSide||this.entrySetup.kind!==setupKind)this.entrySetup={side:setupSide,kind:setupKind,since:now};
    }else this.entrySetup={side:'WAIT',kind:null,since:0};
    const setupAge=setupSide!=='WAIT'?Math.max(0,now-Number(this.entrySetup?.since||now)):0;
    const setupActive=setupSide!=='WAIT'&&setupAge<=setupWindowMs;
    const preEntry={active:setupActive,side:setupActive?setupSide:'WAIT',kind:setupActive?setupKind:null,since:Number(this.entrySetup?.since||0),expiresAt:setupActive?Number(this.entrySetup?.since||now)+setupWindowMs:null,windowMs:setupWindowMs};
    const quality={status:historyStatus,rawSide,confirmed,forecast,stability,entryReady,entrySide:entryReady?rawSide:'WAIT',threshold,technicalScore:rawSide==='BUY'?technicalBuy:rawSide==='SELL'?technicalSell:leaderScore,technicalBuy,technicalSell,technicalEdge,leader,leaderScore,strategyReady:['BUY','SELL'].includes(rawSide),historicalReady:confirmed.ready,reversalGuardMs,reversalBlocked,blockCode,blockLabel,blockDetail,preEntry};
    const gated={...analysis,quality};
    if(gated.forecast30)gated.forecast30={...gated.forecast30,biasSide:rawForecastSide,validation:forecast,provisional:!forecast.ready};
    gated.strategyCards=strategyPanel.cards;
    gated.strategyConfluence=strategyPanel.confluence;
    gated.generalConsensus=this._generalConsensus(gated,strategyPanel);
    this._mergeScenarioConfluence(gated,strategyPanel);
    gated.operationalSignal=this._operationalSignalState(gated,snap,now);
    if(!['BUY','SELL'].includes(rawSide)){gated.automationBlocked=true;gated.automationBlockReason=blockCode;return{allowed:false,analysis:gated,reasons:[blockDetail||'Aguardando confirmação da estratégia.']}}
    if(!stable||reversalBlocked){gated.automationBlocked=true;gated.automationBlockReason=blockCode;return{allowed:false,analysis:gated,reasons:[blockDetail||'Aguardando confirmação da entrada.']}}
    const operationalSide=String(gated.operationalSignal?.side||'').toUpperCase()==='CALL'?'BUY':String(gated.operationalSignal?.side||'').toUpperCase()==='PUT'?'SELL':'WAIT';
    if(gated.operationalSignal?.actionable!==true||operationalSide!==rawSide){
      gated.automationBlocked=true;
      gated.automationBlockReason='operational_timing';
      return{allowed:false,analysis:gated,reasons:[String(gated.operationalSignal?.reason||'Aguardando consenso, gatilho fixo e timing do prazo.')]}
    }
    this.entryRelease={side:rawSide,at:now};
    // Historical diagnostics never gate a technical signal or appear as a win probability.
    return{allowed:true,analysis:gated}
  }
  _bootstrapSignalValidation(){
    if(this.signalValidation.outcomes.length||!Array.isArray(this.analyses)||this.analyses.length<3)return;
    const rows=[...this.analyses].filter(x=>x?.ts&&Number.isFinite(Number(x?.metrics?.last))).sort((a,b)=>new Date(a.ts)-new Date(b.ts));
    const seen=new Set();
    for(let i=0;i<rows.length;i++){
      const a=rows[i],t0=new Date(a.ts).getTime(),asset=String(a.asset||'—'),strategy=String(a.metrics?.strategy||this.settings.strategy||'smart_confluence'),p0=Number(a.metrics.last);
      const b=rows.find((x,j)=>j>i&&String(x.asset||'—')===asset&&new Date(x.ts).getTime()>=t0+25000&&new Date(x.ts).getTime()<=t0+40000&&Number.isFinite(Number(x?.metrics?.last)));
      if(!b)continue;const p1=Number(b.metrics.last);
      for(const [kind,side,confidence] of [['forecast30',String(a.forecast30?.side||'WAIT').toUpperCase(),Number(a.forecast30?.confidence||0)],['confirmed',String(a.side||'WAIT').toUpperCase(),Number(a.confidence||0)]]){
        if(!['BUY','SELL'].includes(side))continue;
        const key=this._validationKey(kind,asset,30000,strategy),bucket=Math.floor(t0/15000),id=key+'|'+bucket;if(seen.has(id))continue;seen.add(id);
        this.signalValidation.outcomes.push({key,kind,asset,durationMs:30000,strategy,side,confidence,referencePrice:p0,createdAt:t0,dueAt:t0+30000,settledAt:new Date(b.ts).getTime(),settledPrice:p1,won:side==='BUY'?p1>p0:p1<p0,bootstrap:true,settlementQuality:'approx'});
      }
    }
    this.signalValidation.outcomes=this.signalValidation.outcomes.slice(-500);
  }
  _settleDue(now){
    const snap=this._marketSnapshot(),asset=String(this.externalMarket?.symbol||this.settings.asset||'').toUpperCase();
    for(const p of [...this.pending]){
      if(p.settleAt>now)continue;
      const matching=String(p.asset||'').toUpperCase()===asset;
      const expiry=matching?this._priceAtExpiry(snap,p.settleAt,now):null;
      if(!expiry||expiry.quality!=='exact'){
        if(now-p.settleAt<15000)continue;
        this.trades.unshift({id:p.orderId,asset:p.asset,side:p.side,amount:p.amount,openedAt:p.openedAt,status:'unverified',won:null,pnl:null,closedAt:iso(now),reason:'Resultado não confirmado pela corretora nem por cotação do mesmo ativo no vencimento.'});
        this.pending=this.pending.filter(x=>x.orderId!==p.orderId);continue;
      }
      const tie=expiry.price===Number(p.referencePrice),won=!tie&&(p.side==='BUY'?expiry.price>p.referencePrice:expiry.price<p.referencePrice);
      // A market observation is diagnostic. Never invent the broker payout or change risk counters from it.
      if(p.external){this.trades.unshift({id:p.orderId,asset:p.asset,side:p.side,amount:p.amount,openedAt:p.openedAt,status:'observed',won:null,pnl:null,observedDirection:tie?'TIE':won?'FAVORABLE':'UNFAVORABLE',external:true,settledPrice:expiry.price,closedAt:iso(expiry.ts)});this.pending=this.pending.filter(x=>x.orderId!==p.orderId);continue}
      const settled=this.broker.settle(p.orderId,won),trade={...settled,settledPrice:expiry.price,closedAt:iso(expiry.ts)};
      this.trades.unshift(trade);this.pending=this.pending.filter(x=>x.orderId!==p.orderId);
      if(won){this.state.consecutiveLosses=0;this.state.cooldownUntil=now+this.settings.risk.cooldownSeconds*1000}else{this.state.consecutiveLosses++;this.state.cooldownUntil=now+this.settings.risk.lossCooldownSeconds*1000}
      const balance=Number(this.externalMarket?.balance??this.broker.balance);this.state.peakBalance=Math.max(this.state.peakBalance,balance);this.state.drawdownPct=this.state.peakBalance?Math.max(0,(this.state.peakBalance-balance)/this.state.peakBalance*100):0;
    }
  }
  async tick(now=Date.now()){
    this.lastHeartbeat=now;this._settleDue(now);if(this.stateName!=='running')return this.status();if(now<this.nextEvalMs)return this.status();const market=this._marketSnapshot();if(market.waitingLive){this.lastResult={action:'WAIT',analysis:{side:'WAIT',confidence:0,reasons:['Aguardando candles atuais do mesmo ativo da tela.']},reasons:['Aguardando candles atuais do mesmo ativo da tela.'],plan:signalPlan({analysis:{side:'WAIT',confidence:0},settings:this.settings,price:market.price,now})};this.lastEvalMs=now;this.nextEvalMs=nextEvaluation(now,Math.min(Number(this.settings.schedule.intervalMs||15000),5000),now);return this.status()}if(!this.externalMarket)this.feed.tick(now);
    try{
      const snap=this._marketSnapshot();const feed={snapshot:()=>snap};const liveAttached=!!this.externalMarket?.provider;const canUseExternalDemo=this.settings.mode==='demo'&&this.executionBroker&&this.externalMarket?.executionReady===true;const executionBroker=canUseExternalDemo?this.executionBroker:this.broker;this._settleSignalValidation(now,snap);const result=await engineCycle({feed,broker:executionBroker,settings:this.settings,state:this._riskState(now),balanceOverride:snap.balance,signalGate:ctx=>{const g=this._signalValidationGate(ctx);return this.settings.mode==='demo'&&liveAttached&&!canUseExternalDemo&&g.allowed?{...g,allowed:false,reasons:['Controles DEMO da corretora não validados; entrada permanece manual.']}:g},now});
      let strategyPanel=null;
      if(result.analysis){
        if(Array.isArray(result.analysis.strategyCards)&&result.analysis.strategyConfluence)strategyPanel={cards:result.analysis.strategyCards,confluence:result.analysis.strategyConfluence};
        else{strategyPanel=this._strategyPanel(snap,now);result.analysis.strategyCards=strategyPanel.cards;result.analysis.strategyConfluence=strategyPanel.confluence}
        if(!result.analysis.generalConsensus)result.analysis.generalConsensus=this._generalConsensus(result.analysis,strategyPanel);
        this._mergeScenarioConfluence(result.analysis,strategyPanel);
        if(!result.analysis.operationalSignal)result.analysis.operationalSignal=this._operationalSignalState(result.analysis,snap,now);
      }
      if(['DEMO_ORDER','PREPARE_REAL'].includes(String(result.action||''))&&this.operationalSetup?.firedAt)this.operationalSetup.releasedAt=now;
      if(this.settings.mode==='demo'&&liveAttached&&!canUseExternalDemo&&result.action==='DEMO_ORDER'){result.action='WAIT';result.order=null;result.executionMode='broker_demo_wait';result.reasons=[...(result.reasons||[]),'Sinal válido, mas os controles DEMO da corretora ainda não foram validados — nenhuma ordem foi simulada ou clicada.']}else if(this.settings.mode==='demo'&&canUseExternalDemo&&result.action==='DEMO_ORDER')result.executionMode='broker_demo';
      result.plan=signalPlan({analysis:result.analysis,settings:this.settings,price:snap.price,now});this.lastResult=result;this.lastEvalMs=now;this.nextEvalMs=nextEvaluation(now,this.settings.schedule.intervalMs,now);
      if(result.analysis)this.analyses.unshift({ts:iso(now),asset:this.settings.asset,...result.analysis,latency:result.latency});this.analyses=this.analyses.slice(0,500);
      if(result.action==='DEMO_ORDER'){
        this.pending.push({orderId:result.order.id,side:result.order.side,referencePrice:result.order.referencePrice,amount:result.order.amount??result.amount,asset:result.order.asset||this.settings.asset,openedAt:result.order.openedAt||iso(now),external:!!result.order.external,provider:result.order.provider||this.externalMarket?.provider,settleAt:Number(result.analysis?.operationalSignal?.expiration?.targetAt)||now+this.settings.orderDurationMs});
        this.audit.write({actorId:'engine',actorRole:'system',action:'order.demo_open',metadata:{orderId:result.order.id,asset:result.order.asset,side:result.order.side,amount:result.order.amount,confidence:result.order.confidence}});
        if(Number(result.latency?.executionMs||0)>Number(this.settings.risk.maxExecutionLatencyMs||1500)){this.state.executionError=true;this.incidents.unshift({ts:iso(now),severity:'error',code:'execution_latency',message:'latência de execução acima do limite'});this.stateName='error'}
      }
      const fatal=(result.reasons||[]).find(x=>AUTO_STOP_REASONS.has(x));if(fatal){this.stateName='stopped';this.audit.write({actorId:'engine',actorRole:'system',action:'bot.auto_stop',metadata:{reason:fatal}})}
      return this.status();
    }catch(error){this.state.executionError=true;this.stateName='error';this.incidents.unshift({ts:iso(now),severity:'error',code:'cycle_error',message:String(error?.message||error)});return this.status()}
  }
  snapshotPersistent(){return{version:2,settings:this.settings,state:this.state,masterFrozen:this.masterFrozen,killSwitch:this.killSwitch,trades:this.trades.slice(0,2000),analyses:this.analyses.slice(0,500),signalValidation:{pending:this.signalValidation.pending.slice(-200),outcomes:this.signalValidation.outcomes.slice(-1000),lastQueued:this.signalValidation.lastQueued},incidents:this.incidents.slice(0,500),audit:this.audit.list().slice(-2000),broker:{balance:this.broker.balance,orders:this.broker.orders},savedAt:iso()}}
  restore(data={}){if(data.settings){this.settings={...this.settings,...data.settings,schedule:{...this.settings.schedule,...(data.settings.schedule||{})},risk:{...this.settings.risk,...(data.settings.risk||{})}};if([60000,5000,2000].includes(Number(data.settings?.schedule?.intervalMs)))this.settings.schedule.intervalMs=1000}if(data.state)this.state={...this.state,...data.state};this.masterFrozen=!!data.masterFrozen;this.killSwitch=!!data.killSwitch;this.trades=Array.isArray(data.trades)?data.trades:[];this.analyses=Array.isArray(data.analyses)?data.analyses:[];if(data.signalValidation&&typeof data.signalValidation==='object')this.signalValidation={pending:Array.isArray(data.signalValidation.pending)?data.signalValidation.pending:[],outcomes:Array.isArray(data.signalValidation.outcomes)?data.signalValidation.outcomes:[],lastQueued:data.signalValidation.lastQueued&&typeof data.signalValidation.lastQueued==='object'?data.signalValidation.lastQueued:{}};this._bootstrapSignalValidation();this.incidents=Array.isArray(data.incidents)?data.incidents:[];if(Array.isArray(data.audit))this.audit.rows=data.audit;if(data.broker){this.broker.balance=Number(data.broker.balance||this.broker.balance);this.broker.orders=Array.isArray(data.broker.orders)?data.broker.orders:[]}this.stateName='stopped';this.lastResult={action:'WAIT',reasons:['runtime restaurada; aguardando início manual']};return this}
  async status(){
    const balance=this.externalMarket?.balance!=null?Number(this.externalMarket.balance):await this.broker.getBalance(),wins=this.trades.filter(x=>x.won).length,losses=this.trades.filter(x=>x.won===false).length,snap=this._marketSnapshot();
    return{state:this.stateName,mode:this.settings.mode,killSwitch:this.killSwitch,masterFrozen:this.masterFrozen,balance,pnl:this.trades.reduce((s,t)=>s+Number(t.pnl||0),0),trades:this.trades.length,wins,losses,winRate:wins+losses?wins/(wins+losses)*100:0,
      drawdownPct:this.state.drawdownPct,consecutiveLosses:this.state.consecutiveLosses,lastHeartbeat:this.lastHeartbeat,lastEvalMs:this.lastEvalMs,nextEvalMs:this.nextEvalMs,lastResult:this.lastResult,
      feed:{label:snap.source||'OFFLINE',price:snap.price,quoteTs:snap.quoteTs},analysisSource:this.externalMarket?.provider?(snap.feedValidated?'LIVE':'WAITING_LIVE'):(this.settings.requireLiveBroker?'OFFLINE':'SIMULATED'),executionMode:this.settings.mode==='real'?'real_manual':(this.externalMarket?.executionReady===true?'broker_demo':'sentinel_demo'),startBlockedReason:this._startBlockReason(),broker:await this.broker.getStatus(),pending:this.pending.length,recentTrades:this.trades.slice(0,50),recentAnalyses:this.analyses.slice(0,50),signalValidation:this.lastResult?.analysis?.quality||null,incidents:this.incidents.slice(0,50),settings:this.settings,audit:this.audit.list().slice(-100).reverse()}
  }
}


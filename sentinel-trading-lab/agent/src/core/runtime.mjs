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
const AUTO_STOP_REASONS=new Set(['horário final atingido','perda diária máxima atingida','meta diária atingida','drawdown máximo atingido','limite de perdas consecutivas','limite diário de operações','limite da sessão de operações']);
function signalPlan({analysis,settings,price,now=Date.now()}={}){
  const operational=analysis?.operationalSignal||null;
  const rawSide=String(analysis?.side||'WAIT').toUpperCase();
  const operationalSide=String(operational?.side||'').toUpperCase()==='CALL'?'BUY':String(operational?.side||'').toUpperCase()==='PUT'?'SELL':'WAIT';
  const side=operational?operationalSide:rawSide;
  const confidence=Number(operational?.strength??analysis?.confidence??0);
  const duration=Math.max(15000,Number(settings?.orderDurationMs||60000));
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
    this.lastResult={action:'WAIT',reasons:['bot parado']};this.pending=[];this.trades=[];this.analyses=[];this.incidents=[];this.signalValidation={pending:[],outcomes:[],lastQueued:{}};this.entryStability={side:'WAIT',since:0,count:0};this.entryRelease={side:'WAIT',at:0};this.operationalSetup=null;this.forecastStability={};
    this.settings={
      mode:'demo',asset:'EUR/USD',strategy:'smart_confluence',strategy2:'none',strategy3:'none',requireLiveBroker:true,demoAutopilot:false,orderDurationMs:60_000,orderProposalTtlMs:60_000,
      pausedReadings:{market_confluence:false,market_entry:false,market_reversal:false,strategy_1:false,strategy_2:false,strategy_3:false},
      schedule:{enabled:true,timezone:'America/Sao_Paulo',days:['sun','mon','tue','wed','thu','fri','sat'],dailyStart:'00:00',dailyEnd:'23:59',intervalMs:1_000,startAt:null,endAt:null},
      risk:{minConfidence:74,signalValidationMinSamples:30,signalValidationMinWinRate:60,maxFeedLatencyMs:2_500,maxDecisionLatencyMs:250,maxExecutionLatencyMs:1_500,stakeMode:'fixed',fixedStake:10,stakePct:1,maxStake:50,maxTradesPerSession:10,maxTradesPerDay:20,maxTradesPerHour:5,maxConsecutiveLosses:3,maxDailyLoss:100,dailyProfitTarget:0,maxDrawdownPct:10,cooldownSeconds:60,lossCooldownSeconds:180}
    };
    this.state={cooldownUntil:null,consecutiveLosses:0,dailyPnl:0,peakBalance:balance,drawdownPct:0,executionError:false,sessionStartedAt:null,sessionTradeStartCount:0};
    this.externalMarket=null;this.executionBroker=null;
  }
  setExecutionBroker(broker=null){this.executionBroker=broker||null;return this}
  requestImmediateEvaluation(){if(this.stateName==='running')this.nextEvalMs=0;return this}
  setExternalMarket(market=null){
    if(!market){this.externalMarket=null;return this}
    const incomingAsset=String(market.symbol||market.uiSymbol||'').trim().toUpperCase();
    const currentAsset=String(this.settings.asset||'').trim().toUpperCase();
    if(incomingAsset&&incomingAsset!==currentAsset){
      this.settings.asset=incomingAsset;
      this.operationalSetup=null;
      this.generalConsensusDisplay=null;
      this.forecastStability={};
      this.entryStability={side:'WAIT',since:0,count:0};
      this.entryRelease={side:'WAIT',at:0};
      this.entrySetup={side:'WAIT',kind:null,since:0};
      this.lastResult={asset:incomingAsset,action:'WAIT',analysis:{asset:incomingAsset,side:'WAIT',confidence:0,reasons:['Atualizando análise para o novo ativo.']},reasons:['Atualizando análise para o novo ativo.']};
      this.nextEvalMs=0
    }
    const candles=Array.isArray(market.candles)?market.candles.filter(c=>[c?.open,c?.high,c?.low,c?.close].every(v=>Number.isFinite(Number(v)))):[];
    const quoteHistory=Array.isArray(market.quoteHistory)?market.quoteHistory.filter(x=>Number.isFinite(Number(x?.ts))&&Number.isFinite(Number(x?.price))&&Number(x.price)>0).slice(-900):[];
    this.externalMarket={...market,candles,quoteHistory,quote:Number(market.quote??market.price??quoteHistory.at(-1)?.price??candles.at(-1)?.close),quoteTs:Number(market.quoteTs||market.lastFrameAt||market.lastDomAt||Date.now()),source:market.source||String(market.provider||'LIVE').toUpperCase()};
    return this
  }
  _marketSnapshot(){
    if(this.externalMarket){const ready=this.externalMarket.feedValidated!==false&&this.externalMarket.candles?.length>=50&&Number.isFinite(Number(this.externalMarket.quote));return{candles:ready?[...this.externalMarket.candles]:[],quoteHistory:ready?[...(this.externalMarket.quoteHistory||[])]:[],quoteTs:this.externalMarket.quoteTs,price:Number(this.externalMarket.quote||this.externalMarket.quoteHistory?.at(-1)?.price||this.externalMarket.candles?.at(-1)?.close||0),source:this.externalMarket.source||'LIVE',balance:this.externalMarket.balance,provider:this.externalMarket.provider,mode:this.externalMarket.mode,waitingLive:!ready,feedValidated:ready,brokerExpirationDurationMs:Number.isFinite(Number(this.externalMarket.expirationDurationMs))?Number(this.externalMarket.expirationDurationMs):null,brokerExpirationRaw:this.externalMarket.expirationRaw||null,brokerExpirationKind:this.externalMarket.expirationKind||null,brokerExpirationConfidence:Number(this.externalMarket.expirationConfidence||0),brokerExpirationUpdatedAt:Number(this.externalMarket.expirationUpdatedAt||0),payout:Number.isFinite(Number(this.externalMarket.payout))?Number(this.externalMarket.payout):null}}
    if(this.settings.requireLiveBroker)return{candles:[],quoteTs:0,price:0,source:'OFFLINE',balance:null,provider:null,mode:this.settings.mode,waitingLive:true,feedValidated:false};
    return this.feed.snapshot()
  }
  _startBlockReason(){if(this.killSwitch)return'Kill switch ativo.';if(this.masterFrozen)return'Bot congelado pelo Master.';if(this.settings.requireLiveBroker&&!this.externalMarket?.provider)return'Conecte uma corretora antes de iniciar.';return null}
  _strategyPercentages(rawCall=0,rawPut=0){
    const call=Math.max(0,Number(rawCall||0)),put=Math.max(0,Number(rawPut||0)),total=call+put;
    if(total<=0)return{signalCallPct:50,signalPutPct:50,callPct:50,putPct:50,edge:0,displayBlend:0,evidenceStrength:0};
    const signalCallPct=Math.max(0,Math.min(100,call/Math.max(total,1)*100)),signalPutPct=100-signalCallPct;
    const displayBlend=Math.max(0,Math.min(.90,total/120));
    const callPct=Math.max(5,Math.min(95,Math.round(50+(signalCallPct-50)*displayBlend)));
    return{signalCallPct,signalPutPct,callPct,putPct:100-callPct,edge:callPct-(100-callPct),displayBlend,evidenceStrength:displayBlend}
  }
  _stabilizeForecast({asset,seconds,callPct,putPct,bias,now=Date.now()}={}){
    const key=String(asset||'—').toUpperCase()+'|'+String(seconds||30),prev=this.forecastStability?.[key]||null;
    const alpha=Number(seconds)<=30?.58:Number(seconds)<=60?.50:Number(seconds)<=120?.40:Number(seconds)<=300?.30:Number(seconds)<=600?.24:Number(seconds)<=900?.20:.14;
    const nextCall=Math.max(5,Math.min(95,Number(callPct||50))),nextPut=Math.max(5,Math.min(95,Number(putPct||50)));
    const smoothCall=prev?prev.callPct*(1-alpha)+nextCall*alpha:nextCall;
    const smoothPut=100-smoothCall;
    const candidate=smoothCall>=57&&smoothCall>smoothPut?'CALL':smoothPut>=57&&smoothPut>smoothCall?'PUT':'NEUTRO';
    let stableSide=prev?.side||'NEUTRO',count=Number(prev?.count||0);
    const required=Number(seconds)<=60?2:Number(seconds)<=300?2:3;
    if(candidate==='NEUTRO'){count=0;if(stableSide!=='NEUTRO'&&Math.max(smoothCall,smoothPut)<54)stableSide='NEUTRO'}
    else if(candidate===stableSide){count=Math.min(20,count+1)}
    else{
      const candidatePct=candidate==='CALL'?smoothCall:smoothPut;
      const previousPct=stableSide==='CALL'?smoothCall:stableSide==='PUT'?smoothPut:50;
      const decisive=candidatePct>=62&&candidatePct-previousPct>=8;
      count=prev?.candidate===candidate?Number(prev?.candidateCount||0)+1:1;
      if(decisive||count>=required)stableSide=candidate
    }
    const state={callPct:smoothCall,putPct:smoothPut,side:stableSide,candidate,candidateCount:count,count,at:now,bias:String(bias||'NEUTRO')};
    this.forecastStability[key]=state;
    return{callPct:Math.round(smoothCall),putPct:Math.round(smoothPut),side:stableSide,alpha,candidate,cycles:count}
  }
  _strategyPanel(snap,now=Date.now()){
    const labels={smart_confluence:'Smart Confluence',price_action:'Price Action',trendline_breakout:'Trendline Breakout',support_resistance:'Suporte / Resistência',fibonacci_retest:'Fibonacci Retest',trend:'Trend Following',mean_reversion:'Mean Reversion',breakout:'Breakout'};
    const ids=[String(this.settings.strategy||'smart_confluence'),String(this.settings.strategy2||'none'),String(this.settings.strategy3||'none')];
    const paused=this.settings.pausedReadings||{};
    const cards=ids.map((strategy,index)=>{
      const pauseKey='strategy_'+(index+1),isPaused=paused[pauseKey]===true;
      if(strategy==='none'||!labels[strategy])return{slot:index+1,strategy:'none',label:'Estratégia não selecionada',active:false,paused:isPaused,pauseKey,side:'NEUTRO',callPct:null,putPct:null,rawCall:0,rawPut:0,reasons:[]};
      try{
        const a=analyzeMarket({candles:snap.candles,quoteHistory:snap.quoteHistory||[],strategy,minConfidence:this.settings.risk.minConfidence,durationMs:this.settings.orderDurationMs,freshnessMs:this.settings.risk.maxFeedLatencyMs,quoteTs:snap.quoteTs,now});
        const rawCall=Math.max(0,Number(a?.metrics?.rawBuyScore||0)),rawPut=Math.max(0,Number(a?.metrics?.rawSellScore||0)),rawTotal=rawCall+rawPut;
        const normalized=this._strategyPercentages(rawCall,rawPut),signalCallPct=normalized.signalCallPct,signalPutPct=normalized.signalPutPct,displayBlend=normalized.displayBlend,callPct=normalized.callPct,putPct=normalized.putPct,edge=normalized.edge;
        const evidence=Math.max(0,Math.min(1,rawTotal/70));
        const side=evidence<.12||Math.abs(edge)<10?'NEUTRO':edge>0?'CALL':'PUT';
        const reasons=(Array.isArray(a?.reasons)?a.reasons:[]).filter(x=>!/entrada aguardando|bloqueado por risco|fluxo \d+s|EMA micro|microestrutura/i.test(String(x))).slice(0,3);
        const regime=String(a?.metrics?.regime?.label||'unknown'),regimeConfidence=Number(a?.metrics?.regime?.confidence||0);
        return{slot:index+1,strategy,label:labels[strategy],active:true,paused:isPaused,pauseKey,side,callPct,putPct,signalCallPct,signalPutPct,displayBlend,rawCall,rawPut,rawTotal,evidence,reasons,regime,regimeConfidence};
      }catch{
        return{slot:index+1,strategy,label:labels[strategy],active:true,paused:isPaused,pauseKey,side:'NEUTRO',callPct:null,putPct:null,rawCall:0,rawPut:0,reasons:['Leitura indisponível neste ciclo']};
      }
    });
    const activeConfigured=cards.filter(x=>x.active&&!x.paused);
    const seenStrategies=new Set();
    for(const card of activeConfigured){
      if(card.strategy==='smart_confluence'&&activeConfigured.length>1){
        card.evidence=Math.max(.05,Number(card.evidence||0)*.45);
        card.reasons=[...(card.reasons||[]),'peso reduzido para evitar duplicar os especialistas'].slice(0,3)
      }
      if(seenStrategies.has(card.strategy)){
        card.evidence=Math.max(.04,Number(card.evidence||0)*.30);
        card.reasons=[...(card.reasons||[]),'peso reduzido: estratégia repetida'].slice(0,3)
      }
      seenStrategies.add(card.strategy)
    }
    const active=cards.filter(x=>x.active&&!x.paused&&Number.isFinite(Number(x.callPct))&&Number.isFinite(Number(x.putPct)));
    const activeCount=active.length;
    const weighted=active.filter(x=>Number(x.evidence||0)>0),weight=weighted.reduce((a,x)=>a+Number(x.evidence||0),0);
    const callPct=weight>0?Math.round(weighted.reduce((a,x)=>a+Number(x.signalCallPct??x.callPct)*Number(x.evidence||0),0)/weight):(activeCount?50:null);
    const putPct=callPct==null?null:100-callPct;
    const callVotes=weighted.filter(x=>x.side==='CALL').length,putVotes=weighted.filter(x=>x.side==='PUT').length;
    let side='AGUARDAR',agreement='SEM ESTRATÉGIAS';
    if(activeCount===1){side=active[0].side;agreement='SEM CONFLUÊNCIA · 1 ESTRATÉGIA ATIVA'}
    else if(activeCount>1){
      const strongest=Math.max(Number(callPct||0),Number(putPct||0)),edge=Number(callPct||0)-Number(putPct||0);
      if(callVotes>putVotes&&strongest>=35&&edge>=10)side='CALL';
      else if(putVotes>callVotes&&strongest>=35&&edge<=-10)side='PUT';
      agreement=callVotes===0&&putVotes===0?'SEM DIREÇÃO':callVotes===putVotes?`DIVERGÊNCIA · ${callVotes} CALL / ${putVotes} PUT`:(callVotes>putVotes?`${callVotes}/${Math.max(1,weighted.length)} CONCORDAM EM CALL`:`${putVotes}/${Math.max(1,weighted.length)} CONCORDAM EM PUT`);
    }
    return{cards,confluence:{activeCount,callPct,putPct,callVotes,putVotes,side,agreement}};
  }

  _mergeScenarioConfluence(analysis,strategyPanel,snap,now=Date.now()){
    const planner=analysis?.entryPlanner?.horizons;
    if(!planner||typeof planner!=='object')return;
    const general=analysis?.generalConsensus||{};
    const generalSide=['CALL','PUT'].includes(String(general.side||'').toUpperCase())?String(general.side).toUpperCase():'AGUARDAR';
    const asset=String(this.settings.asset||'—').toUpperCase(),combo=this._strategyComboKey();
    for(const [secondsKey,plan] of Object.entries(planner)){
      if(!plan||typeof plan!=='object')continue;
      const rawBias=['CALL','PUT'].includes(String(plan.bias||'').toUpperCase())?String(plan.bias).toUpperCase():'NEUTRO';
      const durationMs=Math.max(10000,Number(secondsKey||plan.horizonSeconds||30)*1000);
      const regime=String(plan?.regime?.label||analysis?.metrics?.regime?.label||'unknown');
      const modelKey='future-v4.1:'+combo+':'+regime,legacyModelKey='future-v4:'+combo+':'+regime;
      plan.rawBias=rawBias;
      plan.asset=asset;
      plan.generatedAt=now;
      plan.generalBias=generalSide;
      plan.consensusAligned=generalSide!=='AGUARDAR'&&rawBias!=='NEUTRO'&&generalSide===rawBias;
      plan.entryAligned=plan.consensusAligned;
      plan.modelConfidence=Math.max(0,Number(plan.modelConfidence??plan.confidence??0));
      const rawLeadProbability=rawBias==='CALL'
        ?Math.max(0,Math.min(100,Number(plan.rawCallProbability??plan.callProbability??50)))
        :rawBias==='PUT'
          ?Math.max(0,Math.min(100,Number(plan.rawPutProbability??plan.putProbability??50)))
          :50;
      if(plan.outlookReady===true&&rawBias!=='NEUTRO'&&Number.isFinite(Number(snap?.price))&&Number(snap.price)>0){
        this._queueSignalCandidate({
          kind:'horizon_forecast_v41',
          side:rawBias==='CALL'?'BUY':'SELL',
          confidence:plan.modelConfidence,
          probability:rawLeadProbability,
          regime,
          referencePrice:Number(snap.price),
          asset,durationMs,
          strategy:modelKey,
          now
        })
      }
      // V13.1: calibração principal por ativo/prazo/regime + calibração adicional pela faixa
      // de probabilidade. O V4 antigo entra somente como prior fraco enquanto o V4.1 ainda
      // não acumulou amostras suficientes, evitando apagar o aprendizado anterior.
      const validationKey=this._validationKey('horizon_forecast_v41',asset,durationMs,modelKey);
      const validation=this._validationStats(validationKey);
      const bucket=this._probabilityBucket(rawLeadProbability);
      const bucketValidation=this._validationStats(validationKey,{bucket});
      const legacyValidation=this._validationStats(this._validationKey('horizon_forecast_v4',asset,durationMs,legacyModelKey));
      const baseWeight=validation.samples<20?0:Math.min(.50,Math.max(0,(validation.samples-20)/180*.50));
      const bucketWeight=bucketValidation.samples<12?0:Math.min(.22,Math.max(0,(bucketValidation.samples-12)/88*.22));
      const legacyWeight=validation.samples>=20||legacyValidation.samples<20?0:Math.min(.18,Math.max(0,(legacyValidation.samples-20)/180*.18));
      const historyWeight=Math.min(.72,baseWeight+bucketWeight+legacyWeight);
      const empiricalWeight=baseWeight+bucketWeight+legacyWeight;
      const empirical=empiricalWeight>0
        ?(Number(validation.smoothedWinRate||50)*baseWeight+Number(bucketValidation.smoothedWinRate||50)*bucketWeight+Number(legacyValidation.smoothedWinRate||50)*legacyWeight)/empiricalWeight
        :50;
      const calibratedLead=historyWeight>0?Math.round(rawLeadProbability*(1-historyWeight)+empirical*historyWeight):Math.round(rawLeadProbability);
      const calibratedConfidence=historyWeight>0?Math.round(plan.modelConfidence*(1-historyWeight)+empirical*historyWeight):Math.round(plan.modelConfidence);
      if(rawBias==='CALL'){plan.callProbability=Math.max(5,Math.min(95,calibratedLead));plan.putProbability=100-plan.callProbability}
      else if(rawBias==='PUT'){plan.putProbability=Math.max(5,Math.min(95,calibratedLead));plan.callProbability=100-plan.putProbability}
      const stable=this._stabilizeForecast({asset,seconds:Number(secondsKey||plan.horizonSeconds||30),callPct:plan.callProbability,putPct:plan.putProbability,bias:rawBias,now});
      plan.displayCallProbability=stable.callPct;plan.displayPutProbability=stable.putPct;plan.displayBias=stable.side;
      plan.executionBias=rawBias;plan.stability={alpha:stable.alpha,candidate:stable.candidate,cycles:stable.cycles};
      plan.confidence=Math.max(0,Math.min(100,calibratedConfidence));
      const historyWeak=validation.samples>=validation.minSamples&&validation.smoothedWinRate<52;
      // V13.1: antes de 30 amostras, um desempenho muito fraco já pode bloquear a direção.
      // Isso não recalibra nem inverte o modelo; apenas impede transformar uma leitura ruim em gatilho.
      const provisionalHistoryWeak=(validation.samples>=6&&validation.winRate<45)||(bucketValidation.samples>=6&&bucketValidation.winRate<45);
      if(historyWeak||provisionalHistoryWeak)plan.directionReady=false;

      // Mede separadamente somente previsões fortes, equivalentes ao que pode virar decisão travada.
      const displayLead=stable.side==='CALL'?stable.callPct:stable.side==='PUT'?stable.putPct:0;
      const decisionEligible=plan.directionReady===true&&['CALL','PUT'].includes(stable.side)&&stable.side===rawBias&&displayLead>=70&&plan.confidence>=60&&Number(plan.agreement||0)>=55;
      const decisionModelKey='decision-v13.1:'+combo+':'+regime;
      if(decisionEligible&&Number.isFinite(Number(snap?.price))&&Number(snap.price)>0){
        this._queueSignalCandidate({
          kind:'horizon_decision_v13_1',
          side:stable.side==='CALL'?'BUY':'SELL',
          confidence:plan.confidence,
          probability:displayLead,
          regime,
          referencePrice:Number(snap.price),
          asset,durationMs,
          strategy:decisionModelKey,
          now
        })
      }
      const decisionValidation=this._validationStats(this._validationKey('horizon_decision_v13_1',asset,durationMs,decisionModelKey));
      const payout=Number(snap?.payout);
      const economicBreakEven=Number.isFinite(payout)&&payout>0?100/(1+payout):null;
      const economicFloor=economicBreakEven==null?Math.max(55,Number(this.settings.risk.signalValidationMinWinRate||60)):Math.max(55,economicBreakEven+2);
      const decisionHistoryWeak=decisionValidation.samples>=decisionValidation.minSamples&&decisionValidation.smoothedWinRate<economicFloor;
      if(decisionHistoryWeak)plan.directionReady=false;

      plan.validation={
        samples:validation.samples,wins:validation.wins,losses:validation.losses,draws:validation.draws,
        winRate:validation.winRate,smoothedWinRate:validation.smoothedWinRate,
        avgPredicted:validation.avgPredicted,brierScore:validation.brierScore,
        calibrationError:validation.calibrationError,historyWeight:Math.round(historyWeight*100),
        calibrated:historyWeight>0,historyWeak,provisionalHistoryWeak,regime,
        bucket,bucketSamples:bucketValidation.samples,bucketWinRate:bucketValidation.winRate,bucketSmoothedWinRate:bucketValidation.smoothedWinRate,
        legacyPriorWeight:Math.round(legacyWeight*100),
        decisionSamples:decisionValidation.samples,decisionWins:decisionValidation.wins,decisionLosses:decisionValidation.losses,decisionDraws:decisionValidation.draws,
        decisionWinRate:decisionValidation.winRate,decisionSmoothedWinRate:decisionValidation.smoothedWinRate,decisionBrierScore:decisionValidation.brierScore,
        decisionHistoryWeak,economicBreakEven:economicBreakEven==null?null:Math.round(economicBreakEven*10)/10,
        confidenceSource:historyWeight>0?'calibrated':'model'
      };
      plan.reliabilityReady=plan.directionReady===true&&plan.confidence>=60&&Number(plan.agreement||0)>=55&&plan.consensusAligned===true&&!historyWeak&&!provisionalHistoryWeak&&!decisionHistoryWeak;
      plan.reliabilityBlockReason=plan.reliabilityReady?'':historyWeak?'histórico formal abaixo do mínimo':provisionalHistoryWeak?'histórico inicial fraco':decisionHistoryWeak?'decisões travadas abaixo do piso':plan.consensusAligned!==true?'previsão e leitura atual divergentes':plan.directionReady!==true?'direção ainda não confirmada':plan.confidence<60?'confiança insuficiente':Number(plan.agreement||0)<55?'acordo insuficiente':'aguardando validação';
      plan.modelVersion='future-v4.1';
      plan.basis='previsão futura V4.1 calibrada por horizonte/regime/faixa de confiança · diversidade de evidências · exibição estabilizada'+(plan.consensusAligned?' · entrada atual alinhada':generalSide==='AGUARDAR'?' · entrada atual ainda formando':' · entrada atual divergente');
      plan.consensusSources=['previsão bruta '+rawBias+' '+Math.round(rawLeadProbability)+'% · exibição '+String(plan.displayBias||'NEUTRO')+' '+Math.round(plan.displayBias==='CALL'?plan.displayCallProbability:plan.displayBias==='PUT'?plan.displayPutProbability:50)+'%','leitura atual '+generalSide]
    }
  }
  _generalConsensus(analysis,strategyPanel){
    const final=analysis?.finalConfluence||{},q=analysis?.quality||{},m=analysis?.metrics||{},short=m.shortModel||{},paused=this.settings.pausedReadings||{};
    const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
    const sourceRows=[
      {key:'market_confluence',group:'market',label:'Confluência Técnica',call:final.callStrength,put:final.putStrength},
      {key:'market_entry',group:'market',label:'Prontidão de Entrada',call:q.technicalBuy??m.buyScore,put:q.technicalSell??m.sellScore},
      {key:'market_reversal',group:'market',label:'Virada / Reversão',call:short.reversalCallScore,put:short.reversalPutScore},
      ...((strategyPanel?.cards||[]).filter(x=>x?.active).map(x=>({key:'strategy_'+Number(x.slot),group:'strategy',label:x.label||('Estratégia '+x.slot),call:x.signalCallPct??x.callPct,put:x.signalPutPct??x.putPct,evidence:Number(x.evidence)})))
    ].map(x=>({...x,paused:paused[x.key]===true,valid:finite(x.call)&&finite(x.put)}));
    const active=sourceRows.filter(x=>!x.paused&&x.valid);
    const marketActive=active.filter(x=>x.group==='market'),strategyActive=active.filter(x=>x.group==='strategy');
    const summarize=rows=>{
      const prepared=rows.map(x=>{
        const call=Math.max(0,Number(x.call||0)),put=Math.max(0,Number(x.put||0)),rawTotal=call+put;
        const informative=rawTotal>=5;
        const explicitEvidence=Number.isFinite(Number(x.evidence))?Math.max(0,Math.min(1,Number(x.evidence))):null;
        const evidence=informative?(explicitEvidence??Math.max(.08,Math.min(1,rawTotal/70))):0;
        const callRatio=rawTotal>0?call/rawTotal:.5,putRatio=1-callRatio;
        const vote=callRatio>=.55?'CALL':putRatio>=.55?'PUT':'NEUTRO';
        return{...x,call,put,rawTotal,informative,evidence,callRatio,putRatio,vote}
      });
      const contributing=prepared.filter(x=>x.informative&&x.evidence>0),weight=contributing.reduce((a,x)=>a+x.evidence,0);
      const callPct=weight>0?Math.round(contributing.reduce((a,x)=>a+x.callRatio*x.evidence,0)/weight*100):50,putPct=100-callPct;
      const leader=callPct>putPct?'CALL':putPct>callPct?'PUT':'AGUARDAR',edge=callPct-putPct;
      const directional=contributing.filter(x=>x.vote!=='NEUTRO'),directionalWeight=directional.reduce((a,x)=>a+x.evidence,0);
      const alignedWeight=directional.filter(x=>x.vote===leader).reduce((a,x)=>a+x.evidence,0);
      const agreement=directionalWeight>0?alignedWeight/directionalWeight:.5;
      const evidenceMean=contributing.length?contributing.reduce((a,x)=>a+x.evidence,0)/contributing.length:0;
      const neutralShare=contributing.length?contributing.filter(x=>x.vote==='NEUTRO').length/contributing.length:1;
      const strength=Math.max(50,Math.min(95,Math.round(50+Math.abs(edge)*.28+Math.max(0,agreement-.5)*22+evidenceMean*10-neutralShare*6)));
      const side=contributing.length>0&&strength>=58&&Math.abs(edge)>=10?leader:'AGUARDAR';
      return{
        activeCount:rows.length,contributingCount:contributing.length,
        callScore:callPct,putScore:putPct,callPct,putPct,edge,strength,side,
        agreement:Math.round(agreement*100),evidence:Math.round(evidenceMean*100)
      }
    };
    const rapid=summarize(marketActive),strategies=summarize(strategyActive);
    const groups=[rapid,strategies].filter(x=>x.contributingCount>0);
    const groupWeight=x=>Math.max(.25,Math.min(1,Number(x.evidence||0)/100));
    const totalGroupWeight=groups.reduce((a,x)=>a+groupWeight(x),0)||1;
    const rawCallPct=groups.length?Math.round(groups.reduce((a,x)=>a+Number(x.callPct||50)*groupWeight(x),0)/totalGroupWeight):50;
    const rawPutPct=100-rawCallPct,edge=rawCallPct-rawPutPct;
    const groupAgreement=groups.length<2?1:(Math.sign(Number(rapid.edge||0))===Math.sign(Number(strategies.edge||0))?1:0);
    const groupEvidence=groups.length?groups.reduce((a,x)=>a+Number(x.evidence||0),0)/groups.length:0;
    const strength=Math.max(50,Math.min(95,Math.round(50+Math.abs(edge)*.30+Math.max(0,groupAgreement-.5)*18+groupEvidence*.10)));
    const all={activeCount:active.length,contributingCount:groups.reduce((a,x)=>a+Number(x.contributingCount||0),0),callScore:rawCallPct,putScore:rawPutPct,callPct:rawCallPct,putPct:rawPutPct,edge,strength,side:Math.abs(edge)>=10?(edge>0?'CALL':'PUT'):'AGUARDAR',agreement:Math.round(groupAgreement*100),evidence:Math.round(groupEvidence)};
    const pauseKey=active.map(x=>x.key).sort().join(',');
    const displayKey=[String(this.settings.asset||'—').toUpperCase(),this._strategyComboKey(),pauseKey].join('|');
    const now=Date.now(),prev=this.generalConsensusDisplay;
    const same=prev&&prev.key===displayKey&&now-Number(prev.at||0)<6000;
    const alpha=.32;
    const displayCallPct=Math.round(same?Number(prev.callPct)*(1-alpha)+rawCallPct*alpha:rawCallPct);
    const displayPutPct=100-displayCallPct;
    const displayStrength=Math.round(same?Number(prev.strength||0)*(1-alpha)+strength*alpha:strength);
    this.generalConsensusDisplay={key:displayKey,callPct:displayCallPct,putPct:displayPutPct,strength:displayStrength,at:now};
    const leanSide=active.length?displayCallPct>=55?'CALL':displayPutPct>=55?'PUT':'AGUARDAR':'AGUARDAR';
    const groupsComparable=rapid.activeCount>0&&strategies.activeCount>0;
    const aligned=groupsComparable&&['CALL','PUT'].includes(rapid.side)&&rapid.side===strategies.side;
    const divergent=groupsComparable&&['CALL','PUT'].includes(rapid.side)&&['CALL','PUT'].includes(strategies.side)&&rapid.side!==strategies.side;
    const side=active.length>=2&&strength>=45&&Math.abs(edge)>=10?(edge>0?'CALL':'PUT'):'AGUARDAR';
    const state=divergent?'DIVERGÊNCIA':side!=='AGUARDAR'?'ALINHADO':'FORMANDO';
    return{
      side,leanSide,state,aligned:side!=='AGUARDAR'&&!divergent,divergent,
      callScore:all.callScore,putScore:all.putScore,strength,edge,displayCallPct,displayPutPct,displayStrength,
      weights:{mode:'family-balanced-market-vs-strategies'},
      sources:{rapid:rapid.activeCount,strategies:strategies.activeCount,total:active.length,configured:sourceRows.length,paused:sourceRows.filter(x=>x.paused).map(x=>x.key)},
      sourceRows,
      rapid:{...rapid},
      strategies:{...strategies}
    };
  }
  _strategyComboKey(){
    const ids=[this.settings.strategy,this.settings.strategy2,this.settings.strategy3].map(x=>String(x||'none')).filter(x=>x!=='none');
    return [...new Set(ids)].join('+')||'none';
  }
  _operationalSignalState(analysis,snap,now=Date.now()){
    const general=analysis?.generalConsensus||{},quality=analysis?.quality||{},plans=analysis?.entryPlanner?.horizons||{};
    const durationMs=Math.max(15000,Number(this.settings.orderDurationMs||60000)),durationKey=String(Math.round(durationMs/1000));
    const rawPlan=plans[durationKey]||plans['30']||Object.values(plans)[0]||null;
    const asset=String(this.settings.asset||'—').toUpperCase(),combo=this._strategyComboKey();
    const plan=rawPlan&&String(rawPlan.asset||asset).toUpperCase()===asset?rawPlan:null;
    const currentSide=['CALL','PUT'].includes(String(general.side||'').toUpperCase())?String(general.side).toUpperCase():'AGUARDAR';
    const futureSide=plan&&['CALL','PUT'].includes(String(plan.rawBias||plan.bias||'').toUpperCase())?String(plan.rawBias||plan.bias).toUpperCase():'NEUTRO';
    const futureConfidence=Math.max(0,Number(plan?.confidence||plan?.modelConfidence||0));
    const futureReady=!!plan&&plan.outlookReady===true&&plan.directionReady===true&&futureSide!=='NEUTRO'&&futureConfidence>=58;
    const side=futureReady&&currentSide===futureSide?futureSide:'AGUARDAR';
    const price=Number(snap?.price??analysis?.metrics?.last),strength=Math.max(0,Number(general.strength||0)),edge=Math.abs(Number(general.edge||0));
    const validation=this._validationStats(this._validationKey('operational',asset,durationMs,combo));
    const historyBlocked=validation.samples>=validation.minSamples&&validation.winRate<validation.minWinRate;
    const brokerExpirationKind=String(snap?.brokerExpirationKind||''),brokerExpirationRaw=snap?.brokerExpirationRaw||null,brokerExpirationConfidence=Number(snap?.brokerExpirationConfidence||0),brokerExpirationUpdatedAt=Number(snap?.brokerExpirationUpdatedAt||0);
    const scannedBrokerDuration=Number(snap?.brokerExpirationDurationMs);
    const brokerExpirationDurationMs=Number.isFinite(scannedBrokerDuration)&&brokerExpirationKind==='clock'&&brokerExpirationUpdatedAt>0?Math.max(0,scannedBrokerDuration-Math.max(0,now-brokerExpirationUpdatedAt)):scannedBrokerDuration;
    const expirationDetected=Number.isFinite(brokerExpirationDurationMs)&&brokerExpirationDurationMs>=10000&&brokerExpirationConfidence>=32;
    const expirationToleranceMs=brokerExpirationKind==='clock'?Math.max(5000,Math.min(12000,durationMs*.15)):Math.max(2000,Math.min(5000,durationMs*.06));
    const expirationDeltaMs=expirationDetected?Math.abs(brokerExpirationDurationMs-durationMs):null;
    const expirationMatch=expirationDetected?expirationDeltaMs<=expirationToleranceMs:false;
    const base={side,state:'AGUARDAR',ready:false,actionable:false,price,strength,technicalConfidence:strength,edge,combo,durationMs,validation,historyBlocked,currentSide,futureSide,futureConfidence,futureReady,trigger:null,invalidation:null,triggerMet:false,armed:false,createdAt:null,expiresAt:null,expiration:{detected:expirationDetected,match:expirationMatch,requestedMs:durationMs,brokerMs:expirationDetected?brokerExpirationDurationMs:null,deltaMs:expirationDeltaMs,toleranceMs:expirationToleranceMs,kind:brokerExpirationKind||null,raw:brokerExpirationRaw,confidence:brokerExpirationConfidence},reason:'Aguardando previsão futura e consenso atual.'};
    if(!Number.isFinite(price)||price<=0||!plan)return{...base,reason:'Aguardando preço e previsão do prazo.'};
    if(!futureReady){
      this.operationalSetup=null;
      return{...base,reason:'Previsão futura deste prazo ainda sem confiança suficiente.'};
    }
    if(currentSide==='AGUARDAR'||String(general.state||'').toUpperCase()!=='ALINHADO'){
      if(this.operationalSetup&&this.operationalSetup.asset===asset&&this.operationalSetup.combo===combo)this.operationalSetup=null;
      return{...base,reason:String(general.state||'').toUpperCase()==='DIVERGÊNCIA'?'Leituras atuais divergentes; previsão futura não liberada para entrada.':'Previsão futura definida; aguardando os 6 cards atuais alinharem.'};
    }
    if(currentSide!==futureSide){
      this.operationalSetup=null;
      return{...base,reason:'Previsão futura '+futureSide+' diverge do consenso atual '+currentSide+'.'};
    }
    if(!expirationDetected){
      this.operationalSetup=null;
      return{...base,side,state:'VERIFICAR PRAZO',reason:'Expiração da corretora ainda não foi confirmada pelo Agent.'};
    }
    if(!expirationMatch){
      this.operationalSetup=null;
      const brokerLabel=brokerExpirationDurationMs>=60000?`${Math.round(brokerExpirationDurationMs/60000)} min`:`${Math.round(brokerExpirationDurationMs/1000)} s`;
      return{...base,side,state:'AJUSTAR PRAZO',reason:`Prazo da corretora (${brokerLabel}) não corresponde ao Sentinel (${Math.round(durationMs/1000)} s).`};
    }
    if(historyBlocked){
      this.operationalSetup=null;
      return{...base,side,reason:`Combinação pausada pelo histórico: ${validation.winRate}% em ${validation.samples} sinais.`};
    }
    const trigger=Number(side==='CALL'?plan.callTrigger:plan.putTrigger),invalidation=Number(side==='CALL'?plan.callInvalidation:plan.putInvalidation);
    if(!Number.isFinite(trigger))return{...base,side,reason:'Consenso definido; aguardando gatilho de preço válido.'};
    const setupKey=[asset,durationMs,combo,side].join('|'),ttl=Math.max(30000,Math.min(120000,Math.round(durationMs*1.5)));
    let setup=this.operationalSetup;
    if(!setup||setup.key!==setupKey||now>Number(setup.expiresAt||0)){
      setup={key:setupKey,asset,durationMs,combo,side,trigger,invalidation:Number.isFinite(invalidation)?invalidation:null,createdAt:now,expiresAt:now+ttl,armed:false,armedAt:0,confirmLevel:null,firedAt:0,invalidated:false,basis:String(plan.basis||'')};
      this.operationalSetup=setup;
    }
    const reversal=/reação|revers/i.test(String(setup.basis||''));
    const expectedMove=Math.abs(Number(plan.expectedMove||0)),confirmBuffer=Math.max(expectedMove*.08,Math.abs(price)*.000002);
    if(reversal&&!setup.armed){
      const touched=side==='CALL'?price<=Number(setup.trigger):price>=Number(setup.trigger);
      if(touched){setup.armed=true;setup.armedAt=now;setup.confirmLevel=side==='CALL'?Number(setup.trigger)+confirmBuffer:Number(setup.trigger)-confirmBuffer}
    }
    let triggerMet=false;
    if(reversal)triggerMet=!!setup.armed&&(side==='CALL'?price>=Number(setup.confirmLevel):price<=Number(setup.confirmLevel));
    else triggerMet=side==='CALL'?price>=Number(setup.trigger):price<=Number(setup.trigger);
    const invalidated=Number.isFinite(Number(setup.invalidation))&&(side==='CALL'?price<=Number(setup.invalidation):price>=Number(setup.invalidation));
    if(invalidated){setup.invalidated=true;setup.expiresAt=now+Math.min(12000,Math.max(5000,Math.round(durationMs*.2)));return{...base,side,trigger:setup.trigger,invalidation:setup.invalidation,armed:setup.armed,createdAt:setup.createdAt,expiresAt:setup.expiresAt,reason:'Setup invalidado pelo preço; aguardando novo cenário.'}}
    const entrySide=String(quality.entrySide||'WAIT').toUpperCase()==='BUY'?'CALL':String(quality.entrySide||'WAIT').toUpperCase()==='SELL'?'PUT':null;
    const preSide=quality.preEntry?.active===true?(String(quality.preEntry.side||'WAIT').toUpperCase()==='BUY'?'CALL':String(quality.preEntry.side||'WAIT').toUpperCase()==='SELL'?'PUT':null):null;
    const timingConfirmed=(quality.entryReady===true&&entrySide===side)||(triggerMet&&preSide===side&&Number(quality.technicalEdge||0)>=12);
    const ready=triggerMet&&timingConfirmed&&futureReady&&currentSide===futureSide&&strength>=45&&edge>=10;
    if(ready&&!setup.firedAt){
      setup.firedAt=now;
      this._queueSignalCandidate({kind:'operational',side:side==='CALL'?'BUY':'SELL',confidence:strength,referencePrice:price,asset,durationMs,strategy:combo,now,settleDurationMs:brokerExpirationDurationMs,expirationSource:brokerExpirationRaw||brokerExpirationKind||'broker-ui'});
    }
    const activeWindow=Number(setup.firedAt||0)>0&&now-Number(setup.firedAt)<=6000;
    const actionable=activeWindow&&!Number(setup.releasedAt||0);
    if(Number(setup.firedAt||0)>0&&!activeWindow)return{...base,side,trigger:setup.trigger,invalidation:setup.invalidation,triggerMet:true,armed:setup.armed,createdAt:setup.createdAt,expiresAt:setup.expiresAt,reason:'Janela de entrada encerrada; aguardando novo setup.'};
    return{...base,side,state:activeWindow?'ENTRADA':'PREPARAR',ready:activeWindow,actionable,trigger:setup.trigger,invalidation:setup.invalidation,triggerMet,armed:setup.armed,createdAt:setup.createdAt,expiresAt:setup.expiresAt,entryAt:activeWindow?setup.firedAt:null,reason:activeWindow?'Previsão futura + consenso atual + gatilho confirmados.':reversal&&!setup.armed?'Previsão alinhada; aguardando tocar a região de reversão.':reversal&&setup.armed&&!triggerMet?'Região tocada; aguardando reação confirmada.':!triggerMet?'Previsão futura alinhada; aguardando o preço atingir o gatilho.':'Gatilho atingido; aguardando confirmação curta da entrada.'};
  }
  async start(actor='user'){const reason=this._startBlockReason();if(reason)throw new Error(reason);if(this.stateName!=='paused'){this.state.sessionStartedAt=Date.now();this.state.sessionTradeStartCount=this.trades.length}this.stateName='running';this.nextEvalMs=Date.now();this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.start',metadata:{demoAutopilot:this.settings.demoAutopilot===true}});return this.status()}
  async pause(actor='user'){this.stateName='paused';this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.pause'});return this.status()}
  async stop(actor='user',reason='manual'){this.stateName='stopped';this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.stop',metadata:{reason}});return this.status()}
  async kill(actor='user'){this.killSwitch=true;this.stateName='stopped';this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'bot.kill_switch'});return this.status()}
  async resetKill(actor='master'){if(actor!=='master')throw new Error('master_required');this.killSwitch=false;this.audit.write({actorId:actor,actorRole:'master',action:'bot.kill_reset'});return this.status()}
  async freeze(actor='master'){if(actor!=='master')throw new Error('master_required');this.masterFrozen=true;this.stateName='stopped';this.audit.write({actorId:actor,actorRole:'master',action:'bot.freeze'});return this.status()}
  async unfreeze(actor='master'){if(actor!=='master')throw new Error('master_required');this.masterFrozen=false;this.audit.write({actorId:actor,actorRole:'master',action:'bot.unfreeze'});return this.status()}
  setMode(mode,actor='user'){if(!['demo','real'].includes(mode))throw new Error('invalid_mode');this.settings.mode=mode;this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'mode.change',metadata:{mode}});return this.status()}
  patchSettings(patch={},actor='user'){
    const resetOperational=['asset','strategy','strategy2','strategy3','orderDurationMs','pausedReadings'].some(k=>Object.prototype.hasOwnProperty.call(patch,k));
    const wasAutopilot=this.settings.demoAutopilot===true,armingAutopilot=patch.demoAutopilot===true&&!wasAutopilot;
    this.settings={...this.settings,...patch,pausedReadings:{...this.settings.pausedReadings,...(patch.pausedReadings||{})},schedule:{...this.settings.schedule,...(patch.schedule||{})},risk:{...this.settings.risk,...(patch.risk||{})}};
    if(armingAutopilot){
      this.state.sessionStartedAt=Date.now();this.state.sessionTradeStartCount=this.trades.length;this.state.consecutiveLosses=0;
      this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'demo.autopilot_armed',metadata:{maxTradesPerSession:Number(this.settings.risk.maxTradesPerSession||10),maxConsecutiveLosses:Number(this.settings.risk.maxConsecutiveLosses||3)}})
    }
    if(wasAutopilot&&patch.demoAutopilot===false)this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'demo.autopilot_disarmed'});
    if(resetOperational)this.operationalSetup=null;this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'settings.update'});return this.status()
  }
  clearExecutionError(actor='master'){if(actor!=='master')throw new Error('master_required');this.state.executionError=false;if(this.stateName==='error')this.stateName='stopped';this.audit.write({actorId:actor,actorRole:'master',action:'execution_error.clear'});return this.status()}
  _riskState(now){
    const tz=this.settings.schedule.timezone||'UTC',today=dayKey(now,tz);
    const todayTrades=this.trades.filter(t=>dayKey(new Date(t.closedAt||t.openedAt).getTime(),tz)===today),hourAgo=now-3600000;
    const sessionBase=Math.max(0,Number(this.state.sessionTradeStartCount||0)),tradesSession=Math.max(0,this.trades.length-sessionBase);
    return{killSwitch:this.killSwitch,botFrozen:this.masterFrozen,brokerConnected:this.settings.requireLiveBroker?!!this.externalMarket?.provider&&this.externalMarket?.feedValidated!==false:this.broker.connected,engineHealthy:now-this.lastHeartbeat<10_000,
      feedLatencyMs:Math.max(0,now-(this._marketSnapshot().quoteTs||now)),tradesToday:todayTrades.length,tradesLastHour:this.trades.filter(t=>new Date(t.openedAt).getTime()>=hourAgo).length,tradesSession,
      maxTradesPerSession:this.settings.risk.maxTradesPerSession,maxTradesPerDay:this.settings.risk.maxTradesPerDay,maxTradesPerHour:this.settings.risk.maxTradesPerHour,consecutiveLosses:this.state.consecutiveLosses,maxConsecutiveLosses:this.settings.risk.maxConsecutiveLosses,
      dailyPnl:todayTrades.reduce((s,t)=>s+Number(t.pnl||0),0),maxDailyLoss:this.settings.risk.maxDailyLoss,dailyProfitTarget:this.settings.risk.dailyProfitTarget,drawdownPct:this.state.drawdownPct,
      maxDrawdownPct:this.settings.risk.maxDrawdownPct,cooldownUntil:this.state.cooldownUntil,executionError:this.state.executionError,humanConfirmed:false};
  }
  _validationKey(kind,asset,durationMs,strategy){return ['micro-v4',kind,String(asset||'—').toUpperCase(),Number(durationMs||0),String(strategy||'smart_confluence')].join('|')}
  _probabilityBucket(probability){
    const p=Math.max(0,Math.min(100,Number(probability)||0));
    if(p>=90)return'90-100';if(p>=80)return'80-89';if(p>=70)return'70-79';if(p>=60)return'60-69';return'0-59'
  }
  _validationStats(key,{bucket=null}={}){
    const exact=this.signalValidation.outcomes.filter(x=>x.key===key&&x.settlementQuality!=='approx');
    const scoped=bucket==null?exact:exact.filter(x=>(x.probabilityBucket||this._probabilityBucket(x.probability))===bucket);
    const draws=scoped.filter(x=>x.draw===true||x.won==null).length;
    const rows=scoped.filter(x=>x.won===true||x.won===false).slice(-300);
    const samples=rows.length,wins=rows.filter(x=>x.won===true).length,losses=rows.filter(x=>x.won===false).length,winRate=samples?Math.round(wins/samples*1000)/10:0;
    const minSamples=Math.max(30,Number(this.settings.risk.signalValidationMinSamples||30));
    const minWinRate=Math.max(55,Number(this.settings.risk.signalValidationMinWinRate||60));
    const smoothedWinRate=Math.round(((wins+10)/(samples+20))*1000)/10;
    const probabilityRows=rows.filter(x=>Number.isFinite(Number(x.probability)));
    const avgPredicted=probabilityRows.length?Math.round(probabilityRows.reduce((a,x)=>a+Number(x.probability),0)/probabilityRows.length*10)/10:null;
    const brierScore=probabilityRows.length?Math.round(probabilityRows.reduce((a,x)=>{const p=Math.max(0,Math.min(1,Number(x.probability)/100)),y=x.won===true?1:0;return a+(p-y)**2},0)/probabilityRows.length*10000)/10000:null;
    const calibrationError=avgPredicted==null?null:Math.round(Math.abs(avgPredicted-winRate)*10)/10;
    return{key,bucket,samples,wins,losses,draws,winRate,smoothedWinRate,avgPredicted,brierScore,calibrationError,minSamples,minWinRate,ready:samples>=minSamples&&smoothedWinRate>=minWinRate}
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
      const referencePrice=Number(p.referencePrice),delta=Number(atExpiry.price)-referencePrice,epsilon=Math.max(1e-12,Math.abs(referencePrice)*1e-10);
      const draw=Math.abs(delta)<=epsilon;
      const won=draw?null:(p.side==='BUY'?delta>0:delta<0);
      this.signalValidation.outcomes.push({...p,settledAt:atExpiry.ts,settledPrice:atExpiry.price,settlementQuality:atExpiry.quality,settlementOffsetMs:atExpiry.offsetMs,won,draw});
    }
    this.signalValidation.pending=keep.slice(-200);
    this.signalValidation.outcomes=this.signalValidation.outcomes.slice(-1000);
  }
  _queueSignalCandidate({kind,side,confidence,probability=null,regime=null,referencePrice,asset,durationMs,strategy,now,settleDurationMs=null,expirationSource=null}){
    if(!['BUY','SELL'].includes(String(side||'').toUpperCase()))return;
    const requestedDuration=Math.max(10000,Number(durationMs||30000)),actualDuration=Number.isFinite(Number(settleDurationMs))?Math.max(10000,Number(settleDurationMs)):requestedDuration;
    const isHorizon=String(kind||'').startsWith('horizon_forecast_');
    const spacing=isHorizon?requestedDuration:Math.max(5000,Math.min(30000,Math.round(requestedDuration/2)));
    const key=this._validationKey(kind,asset,requestedDuration,strategy),last=Number(this.signalValidation.lastQueued[key]||0);
    if(now-last<spacing)return;
    this.signalValidation.lastQueued[key]=now;
    this.signalValidation.pending.push({
      key,kind,asset:String(asset||'—'),durationMs:requestedDuration,settleDurationMs:actualDuration,
      strategy:String(strategy||'smart_confluence'),side:String(side).toUpperCase(),confidence:Number(confidence||0),
      probability:Number.isFinite(Number(probability))?Math.max(0,Math.min(100,Number(probability))):null,
      probabilityBucket:Number.isFinite(Number(probability))?this._probabilityBucket(probability):null,regime:regime||null,
      referencePrice:Number(referencePrice||0),createdAt:now,dueAt:now+actualDuration,expirationSource:expirationSource||null
    });
    this.signalValidation.pending=this.signalValidation.pending.slice(-240);
  }
  _signalValidationGate({analysis,snap,settings,now}){
    this._settleSignalValidation(now,snap);
    const asset=String(settings.asset||'—'),strategy=String(settings.strategy||'smart_confluence'),durationMs=Math.max(15000,Number(settings.orderDurationMs||60000));
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
      else if(leaderScore<threshold){blockCode='filter';blockLabel='ABAIXO DO FILTRO';blockDetail=`Força ${Math.round(leaderScore)} pts · filtro ${Math.round(threshold)} pts.`}
      else if(shortHorizon&&short.reversalCallCandidate){blockCode='reversal_setup';blockLabel='REVERSÃO EM FORMAÇÃO — CALL';blockDetail='O movimento de baixa está perdendo força em região relevante; aguardando o gatilho curto de subida.'}
      else if(shortHorizon&&short.reversalPutCandidate){blockCode='reversal_setup';blockLabel='REVERSÃO EM FORMAÇÃO — PUT';blockDetail='O movimento de alta está perdendo força em região relevante; aguardando o gatilho curto de queda.'}
      else if(shortHorizon&&((leader==='BUY'&&short.callOverextended)||(leader==='SELL'&&short.putOverextended))){blockCode='extended';blockLabel='MOVIMENTO ESTENDIDO';blockDetail=`Viés ${leader==='BUY'?'CALL':'PUT'} existe, mas o preço já correu; aguardando um novo ponto de entrada em vez de perseguir o movimento.`}
      else if(shortHorizon&&((leader==='BUY'&&short.callReversalRisk)||(leader==='SELL'&&short.putReversalRisk))){blockCode='reversal';blockLabel='RISCO DE REVERSÃO';blockDetail='A força atingiu o filtro, mas a microestrutura indica risco de reversão.'}
      else if(shortHorizon&&technicalEdge<15){blockCode='edge';blockLabel='VANTAGEM INSUFICIENTE';blockDetail=`Diferença CALL/PUT de ${Math.round(technicalEdge)} pts; a direção ainda não está separada o suficiente.`}
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
    const entryReady=['BUY','SELL'].includes(rawSide)&&stable&&!reversalBlocked;
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
    const strategyPanel=this._strategyPanel(snap,now);
    gated.strategyCards=strategyPanel.cards;
    gated.strategyConfluence=strategyPanel.confluence;
    gated.generalConsensus=this._generalConsensus(gated,strategyPanel);
    this._mergeScenarioConfluence(gated,strategyPanel,snap,now);
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
    if(!confirmed.ready)gated.reasons=[...(gated.reasons||[]),`Histórico ${confirmed.samples}/${confirmed.minSamples} · ${confirmed.winRate}%: em validação, sem bloquear a leitura técnica.`].slice(0,14);
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
    const price=this._marketSnapshot().price;
    for(const p of [...this.pending]){
      if(p.settleAt>now)continue;
      const reference=Number(p.referencePrice),delta=Number(price)-reference,epsilon=Math.max(1e-12,Math.abs(reference)*1e-10),draw=Math.abs(delta)<=epsilon;
      const won=draw?null:(p.side==='BUY'?delta>0:delta<0);let trade;
      if(p.external){
        const livePayout=Number(this.externalMarket?.payout),payout=Number.isFinite(livePayout)&&livePayout>0?livePayout:.82;
        const pnl=won===true?Number(p.amount||0)*payout:won===false?-Number(p.amount||0):0;
        trade={id:p.orderId,orderId:p.orderId,asset:p.asset||this.settings.asset,side:p.side,amount:Number(p.amount||0),referencePrice:p.referencePrice,openedAt:p.openedAt||iso(now-this.settings.orderDurationMs),status:draw?'draw':'closed',won,pnl,provider:p.provider||this.externalMarket?.provider,external:true,settledPrice:price,closedAt:iso(now)}
      }else{
        const settled=this.broker.settle(p.orderId,won===true);trade={...settled,settledPrice:price,closedAt:iso(now)}
      }
      this.trades.unshift(trade);this.pending=this.pending.filter(x=>x.orderId!==p.orderId);
      if(won===true){this.state.consecutiveLosses=0;this.state.cooldownUntil=now+this.settings.risk.cooldownSeconds*1000}
      else if(won===false){this.state.consecutiveLosses++;this.state.cooldownUntil=now+this.settings.risk.lossCooldownSeconds*1000}
      const balance=Number(this.externalMarket?.balance??this.broker.balance);this.state.peakBalance=Math.max(this.state.peakBalance,balance);this.state.drawdownPct=this.state.peakBalance?Math.max(0,(this.state.peakBalance-balance)/this.state.peakBalance*100):0;
      this.audit.write({actorId:'engine',actorRole:'system',action:'trade.settle',metadata:{orderId:p.orderId,won,draw,pnl:trade.pnl,external:!!p.external}})
    }
  }
  async tick(now=Date.now()){
    this.lastHeartbeat=now;this._settleDue(now);if(this.stateName!=='running')return this.status();
    const sessionTrades=Math.max(0,this.trades.length-Math.max(0,Number(this.state.sessionTradeStartCount||0))),sessionLimit=Math.max(1,Number(this.settings.risk.maxTradesPerSession||10));
    if(this.settings.mode==='demo'&&this.settings.demoAutopilot===true&&sessionTrades>=sessionLimit){
      this.settings.demoAutopilot=false;this.stateName='stopped';this.lastResult={action:'WAIT',reasons:['limite da sessão de operações'],executionMode:'broker_demo_stopped'};
      this.audit.write({actorId:'engine',actorRole:'system',action:'bot.auto_stop',metadata:{reason:'limite da sessão de operações',sessionTrades,sessionLimit}});
      return this.status()
    }
    if(now<this.nextEvalMs)return this.status();const market=this._marketSnapshot();if(market.waitingLive){this.lastResult={asset:this.settings.asset,action:'WAIT',analysis:{asset:this.settings.asset,side:'WAIT',confidence:0,reasons:['Aguardando candles atuais do mesmo ativo da tela.']},reasons:['Aguardando candles atuais do mesmo ativo da tela.'],plan:signalPlan({analysis:{side:'WAIT',confidence:0},settings:this.settings,price:market.price,now})};this.lastEvalMs=now;this.nextEvalMs=nextEvaluation(now,Math.min(Number(this.settings.schedule.intervalMs||15000),5000),now);return this.status()}if(!this.externalMarket)this.feed.tick(now);
    try{
      const snap=this._marketSnapshot();const feed={snapshot:()=>snap};const liveAttached=!!this.externalMarket?.provider;
      const brokerMode=String(this.externalMarket?.brokerMode||this.externalMarket?.mode||'').toLowerCase();
      const canUseExternalDemo=this.settings.mode==='demo'&&brokerMode==='demo'&&this.executionBroker&&this.externalMarket?.executionReady===true;
      const pendingExternalDemo=this.pending.some(p=>p.external===true&&Number(p.settleAt||0)>now);
      const executionBroker=canUseExternalDemo?this.executionBroker:this.broker;
      const cycleSettings={...this.settings,demoAutopilot:this.settings.demoAutopilot===true&&canUseExternalDemo&&!pendingExternalDemo};
      this._settleSignalValidation(now,snap);const result=await engineCycle({feed,broker:executionBroker,settings:cycleSettings,state:this._riskState(now),balanceOverride:snap.balance,signalGate:ctx=>this._signalValidationGate(ctx),now});
      let strategyPanel=null;
      if(result.analysis){
        strategyPanel=this._strategyPanel(snap,now);
        result.analysis.strategyCards=strategyPanel.cards;
        result.analysis.strategyConfluence=strategyPanel.confluence;
        result.analysis.generalConsensus=this._generalConsensus(result.analysis,strategyPanel);
        this._mergeScenarioConfluence(result.analysis,strategyPanel,snap,now);
        result.analysis.asset=this.settings.asset;
        result.analysis.operationalSignal=this._operationalSignalState(result.analysis,snap,now);
      }
      if(['DEMO_ORDER','PREPARE_REAL'].includes(String(result.action||''))&&this.operationalSetup?.firedAt)this.operationalSetup.releasedAt=now;
      if(this.settings.mode==='demo'&&result.action==='DEMO_READY'){
        result.executionMode=pendingExternalDemo?'broker_demo_wait_settlement':liveAttached?(brokerMode==='demo'?'broker_demo_disarmed':'broker_real_detected'):'broker_demo_wait';
        result.reasons=[...(result.reasons||[]),pendingExternalDemo?'Operação DEMO anterior ainda aberta — nenhuma entrada sobreposta será enviada.':brokerMode==='demo'?'Piloto DEMO desarmado — análise continua sem clicar na corretora.':'Piloto DEMO só arma quando a conta DEMO da própria corretora estiver ativa e validada.'];
      }else if(this.settings.mode==='demo'&&liveAttached&&!canUseExternalDemo&&result.action==='DEMO_ORDER'){
        result.action='WAIT';result.order=null;result.executionMode='broker_demo_wait';result.reasons=[...(result.reasons||[]),'Sinal válido, mas a conta DEMO/controles da corretora não estão validados — nenhuma ordem foi clicada.']
      }else if(this.settings.mode==='demo'&&canUseExternalDemo&&result.action==='DEMO_ORDER')result.executionMode='broker_demo';
      result.asset=this.settings.asset;result.plan=signalPlan({analysis:result.analysis,settings:this.settings,price:snap.price,now});this.lastResult=result;this.lastEvalMs=now;this.nextEvalMs=nextEvaluation(now,this.settings.schedule.intervalMs,now);
      if(result.analysis)this.analyses.unshift({ts:iso(now),asset:this.settings.asset,...result.analysis,latency:result.latency});this.analyses=this.analyses.slice(0,500);
      if(result.action==='DEMO_ORDER'){
        this.pending.push({orderId:result.order.id,side:result.order.side,referencePrice:result.order.referencePrice,amount:result.order.amount??result.amount,asset:result.order.asset||this.settings.asset,openedAt:result.order.openedAt||iso(now),external:!!result.order.external,provider:result.order.provider||this.externalMarket?.provider,settleAt:now+this.settings.orderDurationMs});
        this.audit.write({actorId:'engine',actorRole:'system',action:'order.demo_open',metadata:{orderId:result.order.id,asset:result.order.asset,side:result.order.side,amount:result.order.amount,confidence:result.order.confidence}});
        if(Number(result.latency?.executionMs||0)>Number(this.settings.risk.maxExecutionLatencyMs||1500)){this.state.executionError=true;this.incidents.unshift({ts:iso(now),severity:'error',code:'execution_latency',message:'latência de execução acima do limite'});this.stateName='error'}
      }
      const fatal=(result.reasons||[]).find(x=>AUTO_STOP_REASONS.has(x));if(fatal){if(this.settings.mode==='demo')this.settings.demoAutopilot=false;this.stateName='stopped';this.audit.write({actorId:'engine',actorRole:'system',action:'bot.auto_stop',metadata:{reason:fatal}})}
      return this.status();
    }catch(error){this.state.executionError=true;this.stateName='error';this.incidents.unshift({ts:iso(now),severity:'error',code:'cycle_error',message:String(error?.message||error)});return this.status()}
  }
  snapshotPersistent(){return{version:2,settings:this.settings,state:this.state,masterFrozen:this.masterFrozen,killSwitch:this.killSwitch,trades:this.trades.slice(0,2000),analyses:this.analyses.slice(0,500),signalValidation:{pending:this.signalValidation.pending.slice(-200),outcomes:this.signalValidation.outcomes.slice(-1000),lastQueued:this.signalValidation.lastQueued},incidents:this.incidents.slice(0,500),audit:this.audit.list().slice(-2000),broker:{balance:this.broker.balance,orders:this.broker.orders},savedAt:iso()}}
  restore(data={}){if(data.settings){this.settings={...this.settings,...data.settings,pausedReadings:{...this.settings.pausedReadings,...(data.settings.pausedReadings||{})},schedule:{...this.settings.schedule,...(data.settings.schedule||{})},risk:{...this.settings.risk,...(data.settings.risk||{})}};if([60000,5000,2000].includes(Number(data.settings?.schedule?.intervalMs)))this.settings.schedule.intervalMs=1000}if(data.state)this.state={...this.state,...data.state};this.masterFrozen=!!data.masterFrozen;this.killSwitch=!!data.killSwitch;this.trades=Array.isArray(data.trades)?data.trades:[];this.analyses=Array.isArray(data.analyses)?data.analyses:[];if(data.signalValidation&&typeof data.signalValidation==='object')this.signalValidation={pending:Array.isArray(data.signalValidation.pending)?data.signalValidation.pending:[],outcomes:Array.isArray(data.signalValidation.outcomes)?data.signalValidation.outcomes:[],lastQueued:data.signalValidation.lastQueued&&typeof data.signalValidation.lastQueued==='object'?data.signalValidation.lastQueued:{}};this._bootstrapSignalValidation();this.incidents=Array.isArray(data.incidents)?data.incidents:[];if(Array.isArray(data.audit))this.audit.rows=data.audit;if(data.broker){this.broker.balance=Number(data.broker.balance||this.broker.balance);this.broker.orders=Array.isArray(data.broker.orders)?data.broker.orders:[]}this.stateName='stopped';this.lastResult={action:'WAIT',reasons:['runtime restaurada; aguardando início manual']};return this}
  async status(){
    const balance=this.externalMarket?.balance!=null?Number(this.externalMarket.balance):await this.broker.getBalance(),wins=this.trades.filter(x=>x.won).length,losses=this.trades.filter(x=>x.won===false).length,snap=this._marketSnapshot();
    const brokerMode=String(this.externalMarket?.brokerMode||this.externalMarket?.mode||'').toLowerCase(),sessionTrades=Math.max(0,this.trades.length-Math.max(0,Number(this.state.sessionTradeStartCount||0)));
    const demoEligible=this.settings.mode==='demo'&&brokerMode==='demo'&&this.externalMarket?.executionReady===true;
    return{state:this.stateName,mode:this.settings.mode,killSwitch:this.killSwitch,masterFrozen:this.masterFrozen,balance,pnl:this.trades.reduce((s,t)=>s+Number(t.pnl||0),0),trades:this.trades.length,wins,losses,winRate:this.trades.length?wins/this.trades.length*100:0,
      drawdownPct:this.state.drawdownPct,consecutiveLosses:this.state.consecutiveLosses,lastHeartbeat:this.lastHeartbeat,lastEvalMs:this.lastEvalMs,nextEvalMs:this.nextEvalMs,lastResult:this.lastResult,
      feed:{label:snap.source||'OFFLINE',price:snap.price,quoteTs:snap.quoteTs},analysisSource:this.externalMarket?.provider?(snap.feedValidated?'LIVE':'WAITING_LIVE'):(this.settings.requireLiveBroker?'OFFLINE':'SIMULATED'),
      executionMode:this.settings.mode==='real'?'real_manual':demoEligible?(this.settings.demoAutopilot===true?'broker_demo_auto':'broker_demo_disarmed'):'broker_demo_wait',
      autopilot:{enabled:this.settings.demoAutopilot===true,eligible:demoEligible,brokerMode:brokerMode||'unknown',sessionStartedAt:this.state.sessionStartedAt,sessionTrades,maxSessionTrades:Number(this.settings.risk.maxTradesPerSession||10),maxConsecutiveLosses:Number(this.settings.risk.maxConsecutiveLosses||3)},
      startBlockedReason:this._startBlockReason(),broker:await this.broker.getStatus(),pending:this.pending.length,recentTrades:this.trades.slice(0,50),recentAnalyses:this.analyses.slice(0,50),signalValidation:this.lastResult?.analysis?.quality||null,incidents:this.incidents.slice(0,50),settings:this.settings,audit:this.audit.list().slice(-100).reverse()}
  }
}

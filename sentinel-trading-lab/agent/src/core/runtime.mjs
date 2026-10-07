import {DemoBrokerAdapter} from './demo-broker.mjs';
import {SimulatedFeed} from './simulated-feed.mjs';
import {engineCycle} from './engine.mjs';
import {AuditLog} from './audit.mjs';
import {nextEvaluation} from './scheduler.mjs';
import {analyzeMarket} from './strategy.mjs';
import {ForecastResearch} from './forecast-research.mjs';

function iso(ts=Date.now()){return new Date(ts).toISOString()}
function dayKey(ts,timeZone='UTC'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ts));
  const o=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
const AUTO_STOP_REASONS=new Set(['horário final atingido','perda diária máxima atingida','meta diária atingida','drawdown máximo atingido','limite de perdas consecutivas','limite diário de operações','limite da sessão de operações']);
const CALIBRATION_EPOCH='feed-v4-context-confirmed-quotes';
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
    this.lastResult={action:'WAIT',reasons:['bot parado']};this.pending=[];this.trades=[];this.analyses=[];this.incidents=[];this.signalValidation={pending:[],outcomes:[],lastQueued:{}};this.entryStability={side:'WAIT',since:0,count:0};this.entryRelease={side:'WAIT',at:0};this.operationalSetup=null;this.oppositeOperationalSetup=null;this.lastInvalidatedSetup=null;this.forecastStability={};this.forecastResearch=new ForecastResearch();
    this.settings={
      mode:'demo',asset:'EUR/USD',strategy:'smart_confluence',strategy2:'none',strategy3:'none',requireLiveBroker:true,demoAutopilot:false,orderDurationMs:60_000,forecastHorizonSeconds:60,futureDisplayThreshold:70,orderProposalTtlMs:60_000,
      pausedReadings:{market_confluence:false,market_entry:false,market_reversal:false,strategy_1:false,strategy_2:false,strategy_3:false},
      schedule:{enabled:true,timezone:'America/Sao_Paulo',days:['sun','mon','tue','wed','thu','fri','sat'],dailyStart:'00:00',dailyEnd:'23:59',intervalMs:1_000,startAt:null,endAt:null},
      risk:{minConfidence:74,signalValidationMinSamples:60,signalValidationMinWinRate:60,maxFeedLatencyMs:2_500,maxDecisionLatencyMs:250,maxExecutionLatencyMs:1_500,stakeMode:'fixed',fixedStake:10,stakePct:1,maxStake:50,maxTradesPerSession:10,maxTradesPerDay:20,maxTradesPerHour:5,maxConsecutiveLosses:3,maxDailyLoss:100,dailyProfitTarget:0,maxDrawdownPct:10,cooldownSeconds:60,lossCooldownSeconds:180}
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
      this.oppositeOperationalSetup=null;
      this.lastInvalidatedSetup=null;
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
  _strategyPanel(snap,now=Date.now(),{candidateModel=false}={}){
    const labels={smart_confluence:'Smart Confluence',price_action:'Price Action',trendline_breakout:'Trendline Breakout',support_resistance:'Suporte / Resistência',fibonacci_retest:'Fibonacci Retest',trend:'Trend Following',mean_reversion:'Mean Reversion',breakout:'Breakout'};
    const ids=[String(this.settings.strategy||'smart_confluence'),String(this.settings.strategy2||'none'),String(this.settings.strategy3||'none')];
    const paused=this.settings.pausedReadings||{},durationKey=String(Math.max(30,Number(this.settings.forecastHorizonSeconds||Math.round(Math.max(30000,Number(this.settings.orderDurationMs||60000))/1000))));
    const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
    const cards=ids.map((strategy,index)=>{
      const pauseKey='strategy_'+(index+1),isPaused=paused[pauseKey]===true;
      if(strategy==='none'||!labels[strategy])return{slot:index+1,strategy:'none',label:'Estratégia não selecionada',active:false,paused:isPaused,pauseKey,side:'NEUTRO',callPct:null,putPct:null,evidence:0,futureByHorizon:{},reasons:[]};
      try{
        const a=analyzeMarket({candidateModel,candles:snap.candles,quoteHistory:snap.quoteHistory||[],strategy,minConfidence:this.settings.risk.minConfidence,durationMs:this.settings.orderDurationMs,freshnessMs:this.settings.risk.maxFeedLatencyMs,quoteTs:snap.quoteTs,now});
        const futureByHorizon={};
        for(const [secondsKey,plan] of Object.entries(a?.entryPlanner?.horizons||{})){
          if(!plan||typeof plan!=='object')continue;
          const callPct=Math.max(5,Math.min(95,Number(plan.rawCallProbability??plan.callProbability??50))),putPct=100-callPct;
          const confidence=Math.max(0,Math.min(100,Number(plan.modelConfidence??plan.confidence??0)));
          const agreement=Math.max(0,Math.min(100,Number(plan.agreement||0))),dataQuality=Math.max(0,Math.min(100,Number(plan.dataQuality||0)));
          const outlookReady=plan.outlookReady===true,bias=callPct>=52?'CALL':putPct>=52?'PUT':'NEUTRO';
          const evidence=outlookReady?clamp01((confidence*.48+agreement*.27+dataQuality*.25)/100):0;
          futureByHorizon[String(secondsKey)]={horizonSeconds:Number(secondsKey),callPct,putPct,bias,side:outlookReady&&Math.abs(callPct-putPct)>=8?bias:'NEUTRO',confidence,agreement,dataQuality,outlookReady,directionReady:plan.directionReady===true,evidence,drivers:Array.isArray(plan.drivers)?plan.drivers.slice(0,3):[]}
        }
        const selected=futureByHorizon[durationKey]||futureByHorizon['60']||futureByHorizon['30']||Object.values(futureByHorizon)[0]||null;
        const reasons=selected?.drivers?.length?selected.drivers:(Array.isArray(a?.reasons)?a.reasons:[]).filter(x=>!/entrada aguardando|bloqueado por risco|fluxo \d+s|EMA micro|microestrutura/i.test(String(x))).slice(0,3);
        const regime=String(a?.metrics?.regime?.label||'unknown'),regimeConfidence=Number(a?.metrics?.regime?.confidence||0);
        return{slot:index+1,strategy,label:labels[strategy],active:true,paused:isPaused,pauseKey,side:selected?.side||'NEUTRO',callPct:selected?.callPct??null,putPct:selected?.putPct??null,signalCallPct:selected?.callPct??null,signalPutPct:selected?.putPct??null,evidence:Number(selected?.evidence||0),futureConfidence:Number(selected?.confidence||0),futureAgreement:Number(selected?.agreement||0),futureDataQuality:Number(selected?.dataQuality||0),futureByHorizon,reasons,regime,regimeConfidence,projectionHorizonSeconds:Number(selected?.horizonSeconds||durationKey)};
      }catch{
        return{slot:index+1,strategy,label:labels[strategy],active:true,paused:isPaused,pauseKey,side:'NEUTRO',callPct:null,putPct:null,evidence:0,futureByHorizon:{},reasons:['Projeção indisponível neste ciclo']};
      }
    });
    const activeConfigured=cards.filter(x=>x.active&&!x.paused),seenStrategies=new Set(),seenFamilies=new Set();
    const strategyFamily=id=>id==='smart_confluence'?'aggregate':id==='trend'?'trend':(['trendline_breakout','breakout'].includes(id)?'breakout':(['support_resistance','fibonacci_retest','mean_reversion'].includes(id)?'location_reversion':id==='price_action'?'price_action':id));
    for(const card of activeConfigured){
      let penalty=1;const family=strategyFamily(card.strategy);card.family=family;
      if(card.strategy==='smart_confluence'&&activeConfigured.length>1){penalty*=.55;card.reasons=[...(card.reasons||[]),'peso reduzido: agregador não conta como especialista independente'].slice(0,3)}
      if(seenStrategies.has(card.strategy)){penalty*=.30;card.reasons=[...(card.reasons||[]),'peso reduzido: estratégia repetida'].slice(0,3)}
      else if(seenFamilies.has(family)&&family!=='price_action'){penalty*=.55;card.reasons=[...(card.reasons||[]),'peso reduzido: evidência correlacionada com outra estratégia'].slice(0,3)}
      seenStrategies.add(card.strategy);seenFamilies.add(family);
      card.evidence=Math.max(0,Number(card.evidence||0)*penalty);
      for(const row of Object.values(card.futureByHorizon||{}))row.evidence=Math.max(0,Number(row.evidence||0)*penalty)
    }
    const horizonKeys=[...new Set(activeConfigured.flatMap(card=>Object.keys(card.futureByHorizon||{})))],horizons={};
    for(const secondsKey of horizonKeys){
      const rows=activeConfigured.map(card=>({card,row:card.futureByHorizon?.[secondsKey]})).filter(x=>x.row?.outlookReady&&Number(x.row.evidence)>0);
      const weight=rows.reduce((a,x)=>a+Number(x.row.evidence||0),0);
      const callPct=weight>0?Math.round(rows.reduce((a,x)=>a+Number(x.row.callPct||50)*Number(x.row.evidence||0),0)/weight):50,putPct=100-callPct,edge=callPct-putPct;
      const side=Math.abs(edge)>=8?(edge>0?'CALL':'PUT'):'AGUARDAR';
      const directional=rows.filter(x=>['CALL','PUT'].includes(x.row.side)),agreeWeight=directional.reduce((a,x)=>a+Number(x.row.evidence||0),0),alignedWeight=directional.filter(x=>x.row.side===side).reduce((a,x)=>a+Number(x.row.evidence||0),0);
      const agreement=agreeWeight>0?Math.round(alignedWeight/agreeWeight*100):50,evidence=rows.length?Math.round(rows.reduce((a,x)=>a+Number(x.row.evidence||0),0)/rows.length*100):0,confidence=rows.length?Math.round(rows.reduce((a,x)=>a+Number(x.row.confidence||0)*Number(x.row.evidence||0),0)/Math.max(weight,.0001)):0;
      horizons[secondsKey]={activeCount:rows.length,callPct,putPct,edge,side,agreement,evidence,confidence}
    }
    const selected=horizons[durationKey]||horizons['60']||horizons['30']||{activeCount:0,callPct:null,putPct:null,edge:0,side:'AGUARDAR',agreement:0,evidence:0,confidence:0};
    const weighted=activeConfigured.filter(x=>Number(x.evidence||0)>0),callVotes=weighted.filter(x=>x.side==='CALL').length,putVotes=weighted.filter(x=>x.side==='PUT').length;
    const agreement=selected.activeCount===0?'SEM ESTRATÉGIAS':selected.activeCount===1?'1 ESTRATÉGIA PROJETANDO':selected.side==='AGUARDAR'?'DIVERGÊNCIA · '+callVotes+' CALL / '+putVotes+' PUT':Math.max(callVotes,putVotes)+'/'+Math.max(1,weighted.length)+' PROJETAM '+selected.side;
    return{cards,confluence:{...selected,callVotes,putVotes,agreement,horizons,projectionHorizonSeconds:Number(durationKey)}};
  }

  _mergeScenarioConfluence(analysis,strategyPanel,snap,now=Date.now()){
    const planner=analysis?.entryPlanner?.horizons;
    if(!planner||typeof planner!=='object')return;
    const scenarioContext=[this.settings.asset,this._strategyComboKey(),this.settings.forecastHorizonSeconds,this.settings.orderDurationMs].join('|');
    if(analysis.scenarioProcessedAt===now&&analysis.scenarioContext===scenarioContext)return;
    analysis.scenarioProcessedAt=now;analysis.scenarioContext=scenarioContext;
    const general=analysis?.generalConsensus||{},presentSide=['CALL','PUT'].includes(String(general?.rapid?.side||'').toUpperCase())?String(general.rapid.side).toUpperCase():'AGUARDAR';
    const asset=String(this.settings.asset||'—').toUpperCase(),combo=this._strategyComboKey();
    const candidateAnalysis=snap?.candles?.length>=35?analyzeMarket({candidateModel:true,candles:snap.candles,quoteHistory:snap.quoteHistory||[],strategy:this.settings.strategy,minConfidence:this.settings.risk.minConfidence,durationMs:this.settings.orderDurationMs,quoteTs:snap.quoteTs,now}):null;
    const candidatePanel=candidateAnalysis?.entryPlanner?this._strategyPanel(snap,now,{candidateModel:true}):null;
    for(const [secondsKey,plan] of Object.entries(planner)){
      if(!plan||typeof plan!=='object')continue;
      const controlPlan={...plan},controlStrategy=strategyPanel?.confluence?.horizons?.[String(secondsKey)]||null;
      const candidatePlan=candidateAnalysis?.entryPlanner?.horizons?.[secondsKey],candidateStrategy=candidatePanel?.confluence?.horizons?.[secondsKey];
      const mix=(p,row)=>{const base=Number(p?.rawCallProbability??p?.callProbability??50),weight=row?.activeCount?Math.min(row.activeCount>=2?.30:.16,.10+Number(row.evidence||0)/500):0;return Math.round(base*(1-weight)+Number(row?.callPct??50)*weight)};
      const controlCall=mix(controlPlan,controlStrategy),candidateCall=candidatePlan?mix(candidatePlan,candidateStrategy):controlCall;
      const research=this.forecastResearch.forecast(asset,controlPlan,snap?.provider);
      const useCandidate=research.candidateQualified&&candidatePlan?.outlookReady===true;
      if(useCandidate)Object.assign(plan,candidatePlan);
      plan.candidate={callProbability:candidateCall,directionReady:candidatePlan?.directionReady===true,scenario:candidatePlan?.scenario||null};
      const durationMs=Math.max(10000,Number(secondsKey||plan.horizonSeconds||30)*1000),strategyFuture=(useCandidate?candidateStrategy:controlStrategy)||null;
      const baseCall=Math.max(5,Math.min(95,Number(plan.rawCallProbability??plan.callProbability??50))),strategyCall=Number(strategyFuture?.callPct),strategyActive=Number(strategyFuture?.activeCount||0),strategyEvidence=Math.max(0,Math.min(100,Number(strategyFuture?.evidence||0)));
      const strategyBlend=Number.isFinite(strategyCall)&&strategyActive>0?Math.min(strategyActive>=2?.30:.16,.10+strategyEvidence/500):0;
      const unlearnedCallProbability=Math.round(baseCall*(1-strategyBlend)+(Number.isFinite(strategyCall)?strategyCall:50)*strategyBlend);
      plan.unlearnedCallProbability=controlCall;plan.research={...research,features:undefined};
      const combinedCall=research.qualified?Math.round(unlearnedCallProbability*.8+research.callProbability*.2):unlearnedCallProbability,combinedPut=100-combinedCall,originalBias=['CALL','PUT'].includes(String(plan.bias||'').toUpperCase())?String(plan.bias).toUpperCase():'NEUTRO',rawBias=combinedCall>=52?'CALL':combinedPut>=52?'PUT':originalBias;
      const strategySide=['CALL','PUT'].includes(String(strategyFuture?.side||'').toUpperCase())?String(strategyFuture.side).toUpperCase():'AGUARDAR',strategyAligned=strategySide!=='AGUARDAR'&&rawBias!=='NEUTRO'&&strategySide===rawBias,strategyConflict=strategySide!=='AGUARDAR'&&rawBias!=='NEUTRO'&&strategySide!==rawBias&&strategyEvidence>=45;
      const regime=String(plan?.regime?.label||analysis?.metrics?.regime?.label||'unknown'),modelKey='future-v5.0:'+combo+':'+regime,baseModelConfidence=Math.max(0,Number(plan.scenarioBaseModelConfidence??plan.modelConfidence??plan.confidence??0)),confidenceAdjustment=strategyAligned?Math.min(6,2+strategyEvidence*.04):strategyConflict?-Math.min(12,4+strategyEvidence*.08):0;
      plan.scenarioBaseModelConfidence=baseModelConfidence;
      plan.modelConfidence=Math.max(0,Math.min(100,Math.round(baseModelConfidence+confidenceAdjustment)));
      plan.rawBias=rawBias;plan.asset=asset;plan.generatedAt=now;plan.presentBias=presentSide;plan.generalBias=presentSide;plan.strategyFutureBias=strategySide;plan.strategyFutureAligned=strategyAligned;plan.strategyFutureConflict=strategyConflict;plan.strategyFuture={...(strategyFuture||{}),blend:Math.round(strategyBlend*100),baseCall,combinedCall};plan.consensusAligned=presentSide!=='AGUARDAR'&&rawBias!=='NEUTRO'&&presentSide===rawBias;plan.entryAligned=plan.consensusAligned;if(strategyConflict)plan.directionReady=false;
      const rawLeadProbability=rawBias==='CALL'?combinedCall:rawBias==='PUT'?combinedPut:50;
      if(plan.outlookReady===true&&rawBias!=='NEUTRO'&&Number.isFinite(Number(snap?.price))&&Number(snap.price)>0)this._queueSignalCandidate({kind:'horizon_forecast_v42',side:rawBias==='CALL'?'BUY':'SELL',confidence:plan.modelConfidence,probability:rawLeadProbability,regime,referencePrice:Number(snap.price),asset,durationMs,strategy:modelKey,now});
      const validationKey=this._validationKey('horizon_forecast_v42',asset,durationMs,modelKey),validation=this._validationStats(validationKey),bucket=this._probabilityBucket(rawLeadProbability),bucketValidation=this._validationStats(validationKey,{bucket});
      const baseWeight=validation.samples<60?0:Math.min(.45,(validation.samples-60)/240*.45),bucketWeight=bucketValidation.samples<40?0:Math.min(.20,(bucketValidation.samples-40)/160*.20),historyWeight=Math.min(.65,baseWeight+bucketWeight),empiricalWeight=baseWeight+bucketWeight,empirical=empiricalWeight>0?(Number(validation.smoothedWinRate||50)*baseWeight+Number(bucketValidation.smoothedWinRate||50)*bucketWeight)/empiricalWeight:50,calibratedLead=historyWeight>0?Math.round(rawLeadProbability*(1-historyWeight)+empirical*historyWeight):Math.round(rawLeadProbability);
      if(rawBias==='CALL'){plan.callProbability=Math.max(5,Math.min(95,calibratedLead));plan.putProbability=100-plan.callProbability}else if(rawBias==='PUT'){plan.putProbability=Math.max(5,Math.min(95,calibratedLead));plan.callProbability=100-plan.putProbability}
      const stable=this._stabilizeForecast({asset,seconds:Number(secondsKey||plan.horizonSeconds||30),callPct:plan.callProbability,putPct:plan.putProbability,bias:rawBias,now});
      plan.displayCallProbability=stable.callPct;plan.displayPutProbability=stable.putPct;plan.displayBias=stable.side;plan.executionBias=rawBias;plan.stability={alpha:stable.alpha,candidate:stable.candidate,cycles:stable.cycles};plan.confidence=plan.modelConfidence;
      const historyWeak=validation.samples>=60&&validation.smoothedWinRate<50,fast30Validation=Number(secondsKey)===30?this._validationStats(this._validationKey('forecast30_v2',asset,30000,this.settings.strategy)):null,fast30HistoryWeak=!!fast30Validation&&fast30Validation.samples>=30&&fast30Validation.smoothedWinRate<50,displayLead=stable.side==='CALL'?stable.callPct:stable.side==='PUT'?stable.putPct:0;
      const configuredFutureThreshold=Math.max(50,Math.min(95,Number(this.settings.futureDisplayThreshold||70))),decisionEligible=plan.outlookReady===true&&plan.directionReady===true&&!strategyConflict&&['CALL','PUT'].includes(stable.side)&&stable.side===rawBias&&displayLead>=configuredFutureThreshold,decisionModelKey='decision-v13.3:'+combo+':'+regime;
      if(decisionEligible&&Number.isFinite(Number(snap?.price))&&Number(snap.price)>0)this._queueSignalCandidate({kind:'horizon_decision_v13_3',side:stable.side==='CALL'?'BUY':'SELL',confidence:plan.confidence,probability:displayLead,regime,referencePrice:Number(snap.price),asset,durationMs,strategy:decisionModelKey,now});
      const decisionValidation=this._validationStats(this._validationKey('horizon_decision_v13_3',asset,durationMs,decisionModelKey)),payout=Number(snap?.payout),economicBreakEven=Number.isFinite(payout)&&payout>0?100/(1+payout):null,configuredWinFloor=Math.max(60,Number(this.settings.risk.signalValidationMinWinRate||60)),economicFloor=economicBreakEven==null?configuredWinFloor:Math.max(configuredWinFloor,economicBreakEven+3),decisionHistoryWeak=decisionValidation.samples>=decisionValidation.minSamples&&decisionValidation.smoothedWinRate<economicFloor;
      if(decisionHistoryWeak)plan.directionReady=false;
      plan.validation={samples:validation.samples,wins:validation.wins,losses:validation.losses,draws:validation.draws,winRate:validation.winRate,smoothedWinRate:validation.smoothedWinRate,avgPredicted:validation.avgPredicted,brierScore:validation.brierScore,calibrationError:validation.calibrationError,historyWeight:Math.round(historyWeight*100),calibrated:historyWeight>0,historyWeak,regime,bucket,bucketSamples:bucketValidation.samples,bucketWinRate:bucketValidation.winRate,bucketSmoothedWinRate:bucketValidation.smoothedWinRate,legacyPriorWeight:0,decisionSamples:decisionValidation.samples,decisionWins:decisionValidation.wins,decisionLosses:decisionValidation.losses,decisionDraws:decisionValidation.draws,decisionWinRate:decisionValidation.winRate,decisionSmoothedWinRate:decisionValidation.smoothedWinRate,decisionBrierScore:decisionValidation.brierScore,decisionHistoryWeak,economicBreakEven:economicBreakEven==null?null:Math.round(economicBreakEven*10)/10,confidenceSource:'model',probabilitySource:historyWeight>0?'model+empirical':'model',calibrationEpoch:CALIBRATION_EPOCH,fast30Samples:fast30Validation?.samples??null,fast30WinRate:fast30Validation?.winRate??null,fast30SmoothedWinRate:fast30Validation?.smoothedWinRate??null,fast30HistoryWeak};
      plan.modelVersion='future-v5.0';plan.basis='previsão futura V5.0 · motor estrutural + projeções independentes das estratégias por prazo · calibração histórica separada da confiança do modelo';plan.consensusSources=['motor futuro '+rawBias+' '+Math.round(rawLeadProbability)+'%','estratégias futuras '+strategySide+(strategyActive?' · '+strategyActive+' ativa(s)':''),'presente '+presentSide]
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
      const seenMarketEvidence=new Set();
      for(const row of prepared){if(row.group!=='market')continue;const key=[row.call,row.put].join('|');if(seenMarketEvidence.has(key)){row.evidence=0;row.duplicateEvidence=true}else seenMarketEvidence.add(key)}
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
  _newOperationalSetup({contextKey,asset,forecastHorizonSeconds,durationMs,combo,side,plan,now}){
    const trigger=Number(side==='CALL'?plan?.callTrigger:plan?.putTrigger),rawInvalidation=side==='CALL'?plan?.callInvalidation:plan?.putInvalidation;
    if(!Number.isFinite(trigger))return null;
    const rule=String((side==='CALL'?plan?.callRule:plan?.putRule)||'');
    // The planner's general description lists every technique, including reversal.
    // It is documentation, not the type of this particular entry.
    const explicitKind=String(plan?.scenario?.kind||'');
    const kind=explicitKind||(/reação|tocar a região|rejeitar/i.test(rule)?'reversal':'continuation');
    const targetAt=now+forecastHorizonSeconds*1000;
    return{key:[contextKey,side,now].join('|'),contextKey,asset,forecastHorizonSeconds,durationMs,combo,side,kind,trigger,maxEntryDistance:Number(plan?.entryTiming?.maxDistance)||null,triggerBasis:plan?.scenario?.triggerBasis||null,invalidation:rawInvalidation==null?null:Number(rawInvalidation),createdAt:now,targetAt,entryWindowStartAt:now,entryWindowEndAt:targetAt,expiresAt:targetAt,armed:false,armedAt:0,confirmLevel:null,firedAt:0,invalidated:false,missed:false,oppositionCycles:0,basis:String(plan?.basis||''),rule};
  }
  _operationalTrigger(setup,snap,plan,now){
    const side=setup.side,price=Number(snap.price),reversal=setup.kind==='reversal';
    const confirmBuffer=Math.max(Math.abs(Number(plan?.expectedMove||0))*.08,Math.abs(price)*.000002);
    const invalidated=Number.isFinite(setup.invalidation)&&setup.invalidation!=null&&(side==='CALL'?price<=setup.invalidation:price>=setup.invalidation);
    if(reversal&&!setup.armed&&!invalidated){
      // A reaction can already have begun when the forecast changes direction.
      // Reuse only a recent real touch followed by intact prices, never a fictional retest.
      const quotes=(snap.quoteHistory||[]).filter(q=>Number(q.ts)<=now&&Number(q.ts)>=now-5000&&Number.isFinite(Number(q.price))).sort((a,b)=>Number(a.ts)-Number(b.ts));
      if(Number(snap.quoteTs||now)<=now)quotes.push({ts:Number(snap.quoteTs||now),price});
      let touchedAt=0;
      for(const q of quotes){
        const p=Number(q.price),broken=setup.invalidation!=null&&(side==='CALL'?p<=setup.invalidation:p>=setup.invalidation);
        if(broken)touchedAt=0;
        else if(side==='CALL'?p<=setup.trigger:p>=setup.trigger)touchedAt=Number(q.ts);
      }
      if(touchedAt){setup.armed=true;setup.armedAt=touchedAt;setup.confirmLevel=side==='CALL'?setup.trigger+confirmBuffer:setup.trigger-confirmBuffer}
    }
    const level=reversal?Number(setup.confirmLevel):setup.trigger;
    const triggerMet=(!reversal||setup.armed)&&(side==='CALL'?price>=level:price<=level);
    const distance=side==='CALL'?price-level:level-price;
    const pointPassed=triggerMet&&Number(setup.maxEntryDistance)>0&&distance>Number(setup.maxEntryDistance);
    const sustained=triggerMet&&!invalidated&&!pointPassed&&this._confirmPriceTrigger(setup,snap,side,level,now);
    if(!triggerMet||invalidated||pointPassed)setup.triggerQuotes=[];
    return{reversal,triggerMet,sustained,invalidated,pointPassed,distance};
  }
  _operationalSignalState(analysis,snap,now=Date.now()){
    const general=analysis?.generalConsensus||{},quality=analysis?.quality||{},plans=analysis?.entryPlanner?.horizons||{},metrics=analysis?.metrics||{},short=metrics?.shortModel||{},micro=metrics?.micro||{};
    const durationMs=Math.max(15000,Number(this.settings.orderDurationMs||60000)),durationKey=String(Math.round(durationMs/1000));
    const allowedHorizons=new Set([30,60,120,300,600,900,3600]),configuredHorizon=Math.round(Number(this.settings.forecastHorizonSeconds||durationMs/1000)),forecastHorizonSeconds=allowedHorizons.has(configuredHorizon)?configuredHorizon:Math.round(durationMs/1000),horizonKey=String(forecastHorizonSeconds),forecastHorizonMs=forecastHorizonSeconds*1000;
    const rawFuturePlan=plans[horizonKey]||null,rawExecutionPlan=plans[durationKey]||null;
    const asset=String(this.settings.asset||'—').toUpperCase(),combo=this._strategyComboKey();
    const plan=rawFuturePlan&&String(rawFuturePlan.asset||asset).toUpperCase()===asset?rawFuturePlan:null,executionPlan=rawExecutionPlan&&String(rawExecutionPlan.asset||asset).toUpperCase()===asset?rawExecutionPlan:null;
    const expirationWarning=durationMs>forecastHorizonMs,timingCompatible=true,timingOffsetMs=0,entryWindowMs=forecastHorizonMs,futureThreshold=Math.max(50,Math.min(95,Number(this.settings.futureDisplayThreshold||70))),signalPoints=Math.max(55,Math.min(95,Number(this.settings.risk?.minConfidence||74)));
    const presentSide=['CALL','PUT'].includes(String(general?.rapid?.side||'').toUpperCase())?String(general.rapid.side).toUpperCase():'AGUARDAR',strategyFutureSide=['CALL','PUT'].includes(String(plan?.strategyFutureBias||general?.strategies?.side||'').toUpperCase())?String(plan?.strategyFutureBias||general.strategies.side).toUpperCase():'AGUARDAR',futureSide=plan&&['CALL','PUT'].includes(String(plan.rawBias||plan.bias||'').toUpperCase())?String(plan.rawBias||plan.bias).toUpperCase():'NEUTRO';
    const futureConfidence=Math.max(0,Number(plan?.confidence||plan?.modelConfidence||0)),futureAgreement=Math.max(0,Number(plan?.agreement||0)),strategyConflict=plan?.strategyFutureConflict===true,strategyProjection=plan?.strategyFuture||{},strategyActiveCount=Math.max(0,Number(strategyProjection.activeCount||0)),strategyEvidence=Math.max(0,Number(strategyProjection.evidence||0)),strategySupport=strategyFutureSide===futureSide&&strategyActiveCount>=1&&strategyEvidence>=25,strongSoloFuture=futureConfidence>=signalPoints,price=Number(snap?.price??metrics?.last),strategyStrength=Math.max(0,Number(plan?.strategyFuture?.confidence||general?.strategies?.strength||0)),decisionStrength=Math.round(strategyStrength>0?futureConfidence*.72+strategyStrength*.28:futureConfidence),futureCall=Number(plan?.displayCallProbability??plan?.callProbability??50),futurePut=Number(plan?.displayPutProbability??plan?.putProbability??50),futureLead=futureSide==='CALL'?futureCall:futureSide==='PUT'?futurePut:0,futureEdge=Math.abs(futureCall-futurePut),futureReady=!!plan&&plan.outlookReady===true&&plan.directionReady===true&&!strategyConflict&&futureSide!=='NEUTRO'&&futureLead>=futureThreshold&&decisionStrength>=signalPoints,candidateSide=futureReady?futureSide:'AGUARDAR',technicalEdge=Math.abs(Number(quality.technicalEdge||0));
    const liveDown=short?.ready===true&&Number(micro?.delta5)<0&&Number(micro?.delta15)<0&&(Number(micro?.p5)<=-1.15||Number(micro?.pulse)<=-7||short?.accelDown===true),liveUp=short?.ready===true&&Number(micro?.delta5)>0&&Number(micro?.delta15)>0&&(Number(micro?.p5)>=1.15||Number(micro?.pulse)>=7||short?.accelUp===true);const violentDown=short?.ready===true&&Number(micro?.delta5)<0&&Number(micro?.delta15)<0&&(Number(micro?.p5)<=-1.75||Number(micro?.pulse)<=-12||(short?.accelDown===true&&Number(micro?.p5)<=-1.35)),violentUp=short?.ready===true&&Number(micro?.delta5)>0&&Number(micro?.delta15)>0&&(Number(micro?.p5)>=1.75||Number(micro?.pulse)>=12||(short?.accelUp===true&&Number(micro?.p5)>=1.35));
    const callTurnConfirmed=Number(micro?.delta5)>0&&(short?.turnUp===true||short?.reversalCallConfirmed===true||short?.failedBreakDown===true),putTurnConfirmed=Number(micro?.delta5)<0&&(short?.turnDown===true||short?.reversalPutConfirmed===true||short?.failedBreakUp===true);
    const validation=this._validationStats(this._validationKey('operational_v3',asset,durationMs,combo+'|h'+forecastHorizonSeconds)),historyBlocked=validation.samples>=validation.minSamples&&validation.smoothedWinRate<validation.minWinRate;
    const executionSide=String(executionPlan?.rawBias||executionPlan?.bias||'NEUTRO').toUpperCase(),executionConfidence=Number(executionPlan?.confidence??executionPlan?.modelConfidence??0),executionProbability=executionSide==='CALL'?Number(executionPlan?.displayCallProbability??executionPlan?.callProbability??50):executionSide==='PUT'?Number(executionPlan?.displayPutProbability??executionPlan?.putProbability??50):0;
    const executionSupported=!!executionPlan&&executionPlan.outlookReady===true&&executionPlan.directionReady===true&&executionPlan.strategyFutureConflict!==true&&executionPlan.safety?.blocked!==true&&executionSide===futureSide&&executionProbability>=futureThreshold&&executionConfidence>=signalPoints;
    const setupContextKey=[asset,forecastHorizonSeconds,durationMs,combo].join('|');let setup=this.operationalSetup;
    if(setup?.contextKey===setupContextKey&&(setup.invalidated||setup.missed||now>=Number(setup.targetAt||0))){
      const terminalState=setup.invalidated?'INVALIDADO':setup.firedAt?'JANELA ENCERRADA':'JANELA PERDIDA';
      if((futureReady&&futureSide!==setup.side)||(now>=Number(setup.targetAt||0)&&!futureReady)){this.operationalSetup=null;setup=null}
      else return{side:setup.side,state:terminalState,ready:false,actionable:false,asset,forecastHorizonSeconds,durationMs,trigger:setup.trigger,invalidation:setup.invalidation,createdAt:setup.createdAt,targetAt:setup.targetAt,entryWindowEndAt:setup.entryWindowEndAt,activeUntil:setup.activeUntil||null,strength:decisionStrength,decisionStrength,reason:setup.invalidationReason||'Esta janela terminou. Aguardando um novo cenário confirmado.'};
    }
    const currentMatches=!!setup&&setup.contextKey===setupContextKey&&now<Number(setup.targetAt||0)&&!setup.invalidated&&!setup.missed;
    const oppositeQualified=currentMatches&&futureReady&&futureSide!==setup.side&&executionSupported&&!historyBlocked&&plan?.safety?.blocked!==true;
    if(oppositeQualified){
      const turnConfirmed=futureSide==='CALL'?callTurnConfirmed:putTurnConfirmed;
      const structuralReaction=executionPlan?.scenario?.reversalConfirmed===true||(futureSide==='CALL'?short.failedBreakDown===true||short.reversalCallConfirmed===true:short.failedBreakUp===true||short.reversalPutConfirmed===true);
      let candidate=this.oppositeOperationalSetup;
      if(!candidate||candidate.contextKey!==setupContextKey||candidate.side!==futureSide||now>=candidate.targetAt)candidate=this._newOperationalSetup({contextKey:setupContextKey,asset,forecastHorizonSeconds,durationMs,combo,side:futureSide,plan:executionPlan,now});
      this.oppositeOperationalSetup=candidate;
      if(candidate){
        const trigger=this._operationalTrigger(candidate,snap,executionPlan,now);
        const impulseConflict=futureSide==='CALL'?liveDown&&!callTurnConfirmed:liveUp&&!putTurnConfirmed;
        if(turnConfirmed&&structuralReaction&&trigger.sustained&&!trigger.invalidated&&!impulseConflict){
          const previous=setup;
          candidate.transition={fromSide:previous.side,fromCreatedAt:previous.createdAt,confirmedAt:now,reason:'Reversão estrutural e gatilho do novo lado confirmados independentemente.'};
          previous.invalidated=true;previous.invalidationReason='Cenário substituído por reversão confirmada; resultado anterior preservado.';
          this.lastInvalidatedSetup={contextKey:previous.contextKey,side:previous.side,targetAt:previous.targetAt,invalidatedAt:now};
          setup=candidate;this.operationalSetup=candidate;this.oppositeOperationalSetup=null;
          this.audit.write({actorId:'engine',actorRole:'system',action:'scenario.reversal_confirmed',metadata:candidate.transition});
        }
      }
    }else this.oppositeOperationalSetup=null;
    const setupContextMatches=!!setup&&setup.contextKey===setupContextKey&&now<Number(setup.targetAt||0)&&setup.invalidated!==true&&setup.missed!==true;
    const lockedSide=setupContextMatches&&['CALL','PUT'].includes(String(setup.side||'').toUpperCase())?String(setup.side).toUpperCase():null;
    const side=lockedSide||candidateSide,sideProbability=side==='CALL'?futureCall:side==='PUT'?futurePut:0;
    const planSafetyBlocked=plan?.safety?.blocked===true,planSafetySide=String(plan?.safety?.blockedSide||'').toUpperCase();
    const sideSupported=!!plan&&['CALL','PUT'].includes(side)&&plan.outlookReady===true&&plan.directionReady===true&&!strategyConflict&&!planSafetyBlocked&&futureSide===side&&sideProbability>=futureThreshold&&decisionStrength>=signalPoints&&executionSupported;
    const oppositeTurnConfirmed=side==='CALL'?putTurnConfirmed:side==='PUT'?callTurnConfirmed:false;
    const weakeningConflict=side==='CALL'?short.weakeningUp===true&&Number(micro.delta2)<0:side==='PUT'?short.weakeningDown===true&&Number(micro.delta2)>0:false;
    const impulseConflict=oppositeTurnConfirmed||weakeningConflict||(side==='CALL'&&liveDown&&!callTurnConfirmed)||(side==='PUT'&&liveUp&&!putTurnConfirmed);
    const oppositeCandidate=!!lockedSide&&futureReady&&futureSide!==lockedSide,ownProbability=lockedSide==='CALL'?futureCall:lockedSide==='PUT'?futurePut:0;
    const impulseInvalidation=!!lockedSide&&((lockedSide==='CALL'&&violentDown&&!callTurnConfirmed)||(lockedSide==='PUT'&&violentUp&&!putTurnConfirmed)),safetyInvalidation=!!lockedSide&&planSafetyBlocked&&(!planSafetySide||planSafetySide===lockedSide)&&((lockedSide==='CALL'&&(putTurnConfirmed||violentDown))||(lockedSide==='PUT'&&(callTurnConfirmed||violentUp))),strongOpposition=(oppositeCandidate&&futureLead>=Math.max(72,futureThreshold+8)&&decisionStrength>=Math.max(68,signalPoints)&&futureAgreement>=62&&(futureLead-ownProbability)>=16)||impulseInvalidation||safetyInvalidation;
    const base={asset,side,state:'AGUARDAR',ready:false,actionable:false,price,strength:decisionStrength,decisionStrength,technicalConfidence:futureConfidence,edge:futureEdge,combo,durationMs,forecastHorizonSeconds,forecastHorizonMs,timingCompatible,timingOffsetMs,entryWindowMs,expirationWarning,futureThreshold,signalPoints,validation,historyBlocked,presentSide,currentSide:presentSide,strategyFutureSide,futureSide,futureConfidence,futureAgreement,futureReady,candidateSide,lockedSide,sideSupported,executionSupported,executionSide,executionConfidence,executionProbability,strongOpposition,safetyInvalidation,planSafetyBlocked,strategyConflict,strategySupport,strongSoloFuture,strategyActiveCount,strategyEvidence,transition:setup?.transition||null,oppositeOpportunity:this.oppositeOperationalSetup?{side:this.oppositeOperationalSetup.side,createdAt:this.oppositeOperationalSetup.createdAt,kind:this.oppositeOperationalSetup.kind}:null,impulseConflict,liveImpulse:liveDown?'PUT':liveUp?'CALL':'NEUTRO',trigger:null,invalidation:null,triggerMet:false,armed:false,createdAt:null,targetAt:null,entryWindowStartAt:null,entryWindowEndAt:null,expiresAt:null,expiration:{source:'card-setting',selectedMs:durationMs,requestedMs:durationMs},reason:'Aguardando previsão futura e janela de entrada.'};
    if(!Number.isFinite(price)||price<=0||!plan)return{...base,reason:'Aguardando preço e previsão do prazo.'};
    if(lockedSide){
      const oppositionQuoteTs=Number(snap?.quoteTs||snap?.quoteHistory?.at(-1)?.ts||now);
      if(setup.lastOppositionAt!==oppositionQuoteTs){setup.oppositionCycles=strongOpposition?Number(setup.oppositionCycles||0)+1:0;setup.lastOppositionAt=oppositionQuoteTs}
      if(setup.oppositionCycles>=2){
        setup.invalidated=true;
        this.lastInvalidatedSetup={contextKey:setup.contextKey,side:lockedSide,targetAt:setup.targetAt,invalidatedAt:now};
        setup.invalidationReason=safetyInvalidation?'Previsão '+lockedSide+' cancelada por exaustão, barreira ou conflito estrutural.':'Previsão '+lockedSide+' invalidada por duas confirmações fortes do lado oposto.';
        return{...base,side:lockedSide,state:'INVALIDADO',trigger:setup.trigger,invalidation:setup.invalidation,createdAt:setup.createdAt,targetAt:setup.targetAt,entryWindowStartAt:setup.entryWindowStartAt,entryWindowEndAt:setup.entryWindowEndAt,expiresAt:setup.expiresAt,reason:setup.invalidationReason}
      }
    }
    if(!lockedSide&&strategyConflict){this.operationalSetup=null;return{...base,reason:'Estratégias futuras divergem da projeção principal; entrada bloqueada até nova confluência.'}}
    if(!lockedSide&&!futureReady){
      this.operationalSetup=null;
      const reason=planSafetyBlocked?'Entrada bloqueada por exaustão, barreira ou conflito estrutural.':plan.outlookReady!==true?'Aguardando dados suficientes deste prazo.':futureSide==='NEUTRO'?'Aguardando direção futura definida.':futureLead<futureThreshold||decisionStrength<signalPoints?'Aguardando a previsão alcançar '+futureThreshold+'% e '+signalPoints+' pts.':'Direção ainda sem confirmação técnica; entrada bloqueada.';
      return{...base,reason}
    }
    if(side==='AGUARDAR')return{...base,reason:'Aguardando direção futura definida.'};
    // Invalidation stays authoritative even while the order horizon is suspended.
    if(lockedSide&&setup.invalidation!=null&&Number.isFinite(Number(setup.invalidation))&&(lockedSide==='CALL'?price<=Number(setup.invalidation):price>=Number(setup.invalidation))){
      setup.invalidated=true;setup.invalidationReason='Cenário invalidado pelo preço; entrada bloqueada.';
      return{...base,side,state:'INVALIDADO',trigger:setup.trigger,invalidation:setup.invalidation,createdAt:setup.createdAt,targetAt:setup.targetAt,entryWindowStartAt:setup.entryWindowStartAt,entryWindowEndAt:setup.entryWindowEndAt,expiresAt:setup.expiresAt,reason:'Cenário invalidado pelo preço; entrada bloqueada.'}
    }
    if(!executionSupported)return{...base,side,state:'AGUARDAR PRAZO',trigger:setup?.trigger??null,invalidation:setup?.invalidation??null,createdAt:setup?.createdAt??null,targetAt:setup?.targetAt??null,entryWindowEndAt:setup?.entryWindowEndAt??null,reason:'Entrada bloqueada: a previsão de '+Math.round(durationMs/1000)+'s precisa confirmar o mesmo lado, a porcentagem e os pontos mínimos.'};
    if(historyBlocked){return{...base,side,reason:'Combinação pausada pelo histórico limpo: '+validation.smoothedWinRate+'% em '+validation.samples+' sinais.'}}
    const triggerPlan=executionPlan||plan,liveTrigger=Number(side==='CALL'?triggerPlan?.callTrigger:triggerPlan?.putTrigger);
    if(!Number.isFinite(liveTrigger))return{...base,side,reason:'Previsão definida; aguardando gatilho de preço válido.'};
    if(!setupContextMatches){
      setup=this._newOperationalSetup({contextKey:setupContextKey,asset,forecastHorizonSeconds,durationMs,combo,side,plan:triggerPlan,now});this.operationalSetup=setup
    }
    const timeToEntryMs=0,windowRemainingMs=Math.max(0,Number(setup.entryWindowEndAt||now)-now);
    if(now>Number(setup.entryWindowEndAt||0)&&!Number(setup.firedAt||0)){setup.missed=true;return{...base,side,state:'JANELA PERDIDA',trigger:setup.trigger,invalidation:setup.invalidation,createdAt:setup.createdAt,targetAt:setup.targetAt,entryWindowStartAt:setup.entryWindowStartAt,entryWindowEndAt:setup.entryWindowEndAt,expiresAt:setup.expiresAt,timeToEntryMs:0,windowRemainingMs,reason:'A janela da previsão terminou sem confirmação. Esta previsão não será perseguida.'}}
    if(impulseConflict){setup.forceSuspendedAt=now;setup.triggerQuotes=[]}
    if(impulseConflict)return{...base,side,state:'AGUARDAR FORÇA',trigger:setup.trigger,invalidation:setup.invalidation,createdAt:setup.createdAt,targetAt:setup.targetAt,entryWindowStartAt:setup.entryWindowStartAt,entryWindowEndAt:setup.entryWindowEndAt,expiresAt:setup.expiresAt,timeToEntryMs:0,reason:oppositeTurnConfirmed?'Entrada '+side+' suspensa: virada curta contrária confirmada.':weakeningConflict?'Entrada '+side+' suspensa: movimento perdeu força e o preço começou a recuar.':side==='CALL'?'Previsão CALL mantida; aguardando a força de queda desacelerar ou virar antes da entrada.':'Previsão PUT mantida; aguardando a força de alta desacelerar ou virar antes da entrada.'};
    // A forming setup may become a confirmed continuation before its distant
    // breakout level is reached. Adopt its first qualified local trigger once,
    // keeping this scenario's identity, structural invalidation and deadline.
    if(!setup.firedAt&&setup.kind==='forming'&&triggerPlan?.scenario?.kind==='continuation'&&triggerPlan.scenario.triggerBasis==='previous-short-bar'&&sideSupported){
      const closer=side==='CALL'?liveTrigger<setup.trigger:liveTrigger>setup.trigger;
      if(closer){setup.trigger=liveTrigger;setup.kind='continuation';setup.triggerBasis='previous-short-bar';setup.maxEntryDistance=Number(triggerPlan?.entryTiming?.maxDistance)||null;setup.triggerQuotes=[]}
    }
    // A second entry is a distinct opportunity, not an extension of the first
    // burst: a new closed local bar after lost strength must confirm its own level.
    if(setup.firedAt&&setup.forceSuspendedAt&&sideSupported&&triggerPlan?.scenario?.kind==='continuation'&&triggerPlan.scenario.triggerBasis==='previous-short-bar'&&Number(triggerPlan.entryTiming?.sourceBarAt)>setup.forceSuspendedAt){
      const candidate=this._newOperationalSetup({contextKey:setupContextKey,asset,forecastHorizonSeconds,durationMs,combo,side,plan:triggerPlan,now});
      if(candidate){
        candidate.targetAt=setup.targetAt;candidate.entryWindowEndAt=setup.entryWindowEndAt;candidate.expiresAt=setup.expiresAt;
        const fresh=this._operationalTrigger(candidate,snap,triggerPlan,now);
        if(fresh.sustained&&!fresh.invalidated){
          candidate.transition={fromSide:setup.side,fromCreatedAt:setup.createdAt,confirmedAt:now,reason:'Novo ponto de continuação confirmado após perda de força; prazo e resultado anteriores preservados.'};
          setup=candidate;this.operationalSetup=candidate;base.transition=candidate.transition;
        }
      }
    }
    const {reversal,triggerMet,sustained:sustainedTrigger,invalidated,pointPassed}=this._operationalTrigger(setup,snap,triggerPlan,now);
    if(invalidated){setup.invalidated=true;setup.invalidationReason='Cenário invalidado pelo preço; entrada bloqueada.';return{...base,side,state:'INVALIDADO',trigger:setup.trigger,invalidation:setup.invalidation,armed:setup.armed,createdAt:setup.createdAt,targetAt:setup.targetAt,entryWindowStartAt:setup.entryWindowStartAt,entryWindowEndAt:setup.entryWindowEndAt,expiresAt:setup.expiresAt,reason:setup.invalidationReason}}
    if(pointPassed)return{...base,side,state:'AGUARDAR PONTO',trigger:setup.trigger,invalidation:setup.invalidation,createdAt:setup.createdAt,targetAt:setup.targetAt,entryWindowStartAt:setup.entryWindowStartAt,entryWindowEndAt:setup.entryWindowEndAt,activeUntil:setup.activeUntil||null,reason:'Ponto de entrada ultrapassado; aguardando novo ponto confirmado, sem perseguir o movimento.'};
    const entrySide=String(quality.entrySide||'WAIT').toUpperCase()==='BUY'?'CALL':String(quality.entrySide||'WAIT').toUpperCase()==='SELL'?'PUT':null,preSide=quality.preEntry?.active===true?(String(quality.preEntry.side||'WAIT').toUpperCase()==='BUY'?'CALL':String(quality.preEntry.side||'WAIT').toUpperCase()==='SELL'?'PUT':null):null,presentAligned=presentSide===side,reversalTransition=['CALL','PUT'].includes(presentSide)&&presentSide!==side,timingConfirmed=reversal?(sustainedTrigger&&(preSide===side||entrySide===side||presentAligned)&&(side==='CALL'?callTurnConfirmed:putTurnConfirmed)):sustainedTrigger,ready=triggerMet&&timingConfirmed&&sideSupported&&!impulseConflict;
    const windowOpen=now<=Number(setup.entryWindowEndAt||0);
    if(ready&&windowOpen&&!setup.firedAt){setup.firedAt=now;this._queueSignalCandidate({kind:'operational_v3',side:side==='CALL'?'BUY':'SELL',confidence:decisionStrength,probability:side==='CALL'?futureCall:futurePut,referencePrice:price,asset,durationMs,strategy:combo+'|h'+forecastHorizonSeconds,now,settleDurationMs:durationMs,expirationSource:'card-setting'})}
    const activeUntil=setup.firedAt?Math.min(Number(setup.entryWindowEndAt||0),Number(setup.firedAt)+3500):0,activeWindow=Number(setup.firedAt||0)>0&&now<=activeUntil,actionable=activeWindow&&ready&&!Number(setup.releasedAt||0);
    setup.activeUntil=activeUntil;
    if(Number(setup.firedAt||0)>0&&!activeWindow)return{...base,side,state:'ACOMPANHANDO',activeUntil,entryAt:setup.firedAt,trigger:setup.trigger,invalidation:setup.invalidation,triggerMet,armed:setup.armed,createdAt:setup.createdAt,targetAt:setup.targetAt,entryWindowStartAt:setup.entryWindowStartAt,entryWindowEndAt:setup.entryWindowEndAt,expiresAt:setup.expiresAt,reason:'Oportunidade de entrada encerrada; cenário mantido até o prazo, sem liberar nova entrada.'};
    const waitingReason=triggerMet&&!sustainedTrigger?'Gatilho tocado; aguardando sustentação em novas cotações.':!sideSupported?'Previsão '+side+' mantida; revalidando o mesmo lado antes da entrada.':reversal&&!setup.armed?'Janela aberta; aguardando tocar a região de reversão.':reversal&&setup.armed&&!triggerMet?'Região tocada; aguardando reação confirmada.':!triggerMet?'Janela aberta; aguardando o preço atingir o gatilho.':reversalTransition?'Janela aberta; aguardando confirmação curta da reversão.':presentAligned?'Janela aberta; aguardando timing final.':'Janela aberta; aguardando confirmação técnica.';
    return{...base,side,state:activeWindow?'ENTRADA':'JANELA ABERTA',ready:activeWindow&&ready,actionable,activeUntil,trigger:setup.trigger,invalidation:setup.invalidation,triggerMet,armed:setup.armed,createdAt:setup.createdAt,targetAt:setup.targetAt,entryWindowStartAt:setup.entryWindowStartAt,entryWindowEndAt:setup.entryWindowEndAt,expiresAt:setup.expiresAt,entryAt:activeWindow?setup.firedAt:null,timeToEntryMs:0,windowRemainingMs,presentAligned,reversalTransition,confirmation:{kind:reversal?'reversal':'continuation',quotes:setup.triggerQuotes?.length||0,sustained:sustainedTrigger},reason:activeWindow&&ready?'Gatilho confirmado; cenário e prazo da operação estão alinhados.':waitingReason}
  }

  _confirmPriceTrigger(setup,snap,side,level,now){
    const quoteTs=Number(snap.quoteTs||snap.quoteHistory?.at(-1)?.ts||now),price=Number(snap.price);
    const holds=p=>side==='CALL'?p>=level:p<=level;
    if(!holds(price)){setup.triggerQuotes=[];return false}
    const rows=(snap.quoteHistory||[]).filter(q=>Number(q.ts)<=Math.min(now,quoteTs)&&Number.isFinite(Number(q.price))).slice(-4);
    rows.push({ts:quoteTs,price});
    let evidence=setup.triggerQuotes||[];
    for(const q of rows){const ts=Number(q.ts);if(ts<=Number(evidence.at(-1)?.ts||0))continue;if(!holds(Number(q.price)))evidence=[];else evidence.push({ts,price:Number(q.price)})}
    setup.triggerQuotes=evidence.slice(-3);
    return setup.triggerQuotes.length>=2&&holds(price);
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
    const resetOperational=['asset','strategy','strategy2','strategy3','orderDurationMs','forecastHorizonSeconds','futureDisplayThreshold','pausedReadings'].some(k=>Object.prototype.hasOwnProperty.call(patch,k));
    const wasAutopilot=this.settings.demoAutopilot===true,armingAutopilot=patch.demoAutopilot===true&&!wasAutopilot;
    this.settings={...this.settings,...patch,pausedReadings:{...this.settings.pausedReadings,...(patch.pausedReadings||{})},schedule:{...this.settings.schedule,...(patch.schedule||{})},risk:{...this.settings.risk,...(patch.risk||{})}};
    if(armingAutopilot){
      this.state.sessionStartedAt=Date.now();this.state.sessionTradeStartCount=this.trades.length;this.state.consecutiveLosses=0;
      this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'demo.autopilot_armed',metadata:{maxTradesPerSession:Number(this.settings.risk.maxTradesPerSession||10),maxConsecutiveLosses:Number(this.settings.risk.maxConsecutiveLosses||3)}})
    }
    if(wasAutopilot&&patch.demoAutopilot===false)this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'demo.autopilot_disarmed'});
    if(resetOperational){this.operationalSetup=null;this.oppositeOperationalSetup=null;}this.audit.write({actorId:actor,actorRole:actor==='master'?'master':'user',action:'settings.update'});return this.status()
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
  _validationKey(kind,asset,durationMs,strategy){return ['micro-v5',CALIBRATION_EPOCH,kind,String(asset||'—').toUpperCase(),Number(durationMs||0),String(strategy||'smart_confluence')].join('|')}
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
    const minSamples=Math.max(60,Number(this.settings.risk.signalValidationMinSamples||60));
    const minWinRate=Math.max(55,Number(this.settings.risk.signalValidationMinWinRate||60));
    const smoothedWinRate=Math.round(((wins+10)/(samples+20))*1000)/10;
    const probabilityRows=rows.filter(x=>x.probability!=null&&Number.isFinite(Number(x.probability)));
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
    const requestedDuration=Math.max(10000,Number(durationMs||30000)),actualDuration=settleDurationMs!=null&&Number.isFinite(Number(settleDurationMs))&&Number(settleDurationMs)>0?Math.max(10000,Number(settleDurationMs)):requestedDuration;
    const isHorizon=String(kind||'').startsWith('horizon_forecast_')||String(kind||'').startsWith('horizon_decision_');
    // Operational setups already fire once. A separately confirmed reversal must
    // retain its own outcome rather than be dropped by forecast sample spacing.
    const spacing=kind==='operational_v3'?0:isHorizon?requestedDuration:Math.max(5000,Math.min(30000,Math.round(requestedDuration/2)));
    const key=this._validationKey(kind,asset,requestedDuration,strategy),last=Number(this.signalValidation.lastQueued[key]||0);
    if(now===last||now-last<spacing)return;
    this.signalValidation.lastQueued[key]=now;
    this.signalValidation.pending.push({
      key,kind,asset:String(asset||'—'),durationMs:requestedDuration,settleDurationMs:actualDuration,
      strategy:String(strategy||'smart_confluence'),side:String(side).toUpperCase(),confidence:Number(confidence||0),
      probability:probability!=null&&Number.isFinite(Number(probability))?Math.max(0,Math.min(100,Number(probability))):null,
      probabilityBucket:probability!=null&&Number.isFinite(Number(probability))?this._probabilityBucket(probability):null,regime:regime||null,
      referencePrice:Number(referencePrice||0),createdAt:now,dueAt:now+actualDuration,expirationSource:expirationSource||null
    });
    this.signalValidation.pending=this.signalValidation.pending.slice(-240);
  }
  _signalValidationGate({analysis,snap,settings,now}){
    this._settleSignalValidation(now,snap);
    const asset=String(settings.asset||'—'),strategy=String(settings.strategy||'smart_confluence'),durationMs=Math.max(15000,Number(settings.orderDurationMs||60000));
    const rawSide=String(analysis?.side||'WAIT').toUpperCase(),rawForecastSide=String(analysis?.forecast30?.side||'WAIT').toUpperCase();
    this._queueSignalCandidate({kind:'confirmed',side:rawSide,confidence:analysis?.confidence,referencePrice:snap.price,asset,durationMs,strategy,now});
    this._queueSignalCandidate({kind:'forecast30_v2',side:rawForecastSide,confidence:analysis?.forecast30?.confidence,referencePrice:snap.price,asset,durationMs:30000,strategy,now});
    const confirmed=this._validationStats(this._validationKey('confirmed',asset,durationMs,strategy));
    const forecast=this._validationStats(this._validationKey('forecast30_v2',asset,30000,strategy));
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
    const operationalSide=String(gated.operationalSignal?.side||'').toUpperCase()==='CALL'?'BUY':String(gated.operationalSignal?.side||'').toUpperCase()==='PUT'?'SELL':'WAIT';
    if(gated.operationalSignal?.actionable!==true||!['BUY','SELL'].includes(operationalSide)){
      gated.automationBlocked=true;gated.automationBlockReason='operational_timing';
      return{allowed:false,analysis:gated,reasons:[String(gated.operationalSignal?.reason||blockDetail||'Aguardando previsão, gatilho e timing do prazo.')]}
    }
    gated.side=operationalSide;
    gated.confidence=Math.max(Number(gated.confidence||0),Number(gated.operationalSignal?.decisionStrength||gated.operationalSignal?.strength||0));
    this.entryRelease={side:operationalSide,at:now};
    if(!confirmed.ready)gated.reasons=[...(gated.reasons||[]),'Histórico técnico atual '+confirmed.samples+'/'+confirmed.minSamples+': informativo; decisão operacional usa calibração limpa separada.'].slice(0,14);
    return{allowed:true,analysis:gated}
  }
  _bootstrapSignalValidation(){
    // Calibration V5 intentionally starts from exact outcomes produced by the current
    // feed/model epoch. Old analysis snapshots are kept for history/UI only and are
    // never reconstructed into statistical confidence samples.
    return
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
      if(result.analysis&&!result.analysis.operationalSignal){
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
        result.executionMode=pendingExternalDemo?'broker_demo_wait_settlement':liveAttached?(brokerMode==='demo'?(this.settings.demoAutopilot===true?'broker_demo_wait':'broker_demo_disarmed'):'broker_real_detected'):'broker_demo_wait';
        result.reasons=[...(result.reasons||[]),pendingExternalDemo?'Operação DEMO anterior ainda aberta — nenhuma entrada sobreposta será enviada.':brokerMode==='demo'?(this.settings.demoAutopilot===true?'Piloto DEMO ligado, mas os botões e o campo de valor da corretora ainda não foram reconhecidos.':'Piloto DEMO desarmado — análise continua sem clicar na corretora.'):'Piloto DEMO só arma quando a conta DEMO da própria corretora estiver ativa e validada.'];
      }else if(this.settings.mode==='demo'&&liveAttached&&!canUseExternalDemo&&result.action==='DEMO_ORDER'){
        result.action='WAIT';result.order=null;result.executionMode='broker_demo_wait';result.reasons=[...(result.reasons||[]),'Sinal válido, mas a conta DEMO/controles da corretora não estão validados — nenhuma ordem foi clicada.']
      }else if(this.settings.mode==='demo'&&canUseExternalDemo&&result.action==='DEMO_ORDER')result.executionMode='broker_demo';
      this.forecastResearch.observe({asset:this.settings.asset,analysis:result.analysis,snap,now});
      result.asset=this.settings.asset;result.plan=signalPlan({analysis:result.analysis,settings:this.settings,price:snap.price,now});this.lastResult=result;this.lastEvalMs=now;this.nextEvalMs=nextEvaluation(now,this.settings.schedule.intervalMs,now);
      if(result.analysis)this.analyses.unshift(this._compactAnalysis({ts:iso(now),asset:this.settings.asset,...result.analysis,latency:result.latency}));this.analyses=this.analyses.slice(0,180);
      if(result.action==='DEMO_ORDER'){
        this.pending.push({orderId:result.order.id,side:result.order.side,referencePrice:result.order.referencePrice,amount:result.order.amount??result.amount,asset:result.order.asset||this.settings.asset,openedAt:result.order.openedAt||iso(now),external:!!result.order.external,provider:result.order.provider||this.externalMarket?.provider,settleAt:now+this.settings.orderDurationMs});
        this.audit.write({actorId:'engine',actorRole:'system',action:'order.demo_open',metadata:{orderId:result.order.id,asset:result.order.asset,side:result.order.side,amount:result.order.amount,confidence:result.order.confidence}});
        if(Number(result.latency?.executionMs||0)>Number(this.settings.risk.maxExecutionLatencyMs||1500)){this.state.executionError=true;this.incidents.unshift({ts:iso(now),severity:'error',code:'execution_latency',message:'latência de execução acima do limite'});this.stateName='error'}
      }
      const fatal=(result.reasons||[]).find(x=>AUTO_STOP_REASONS.has(x));if(fatal){if(this.settings.mode==='demo')this.settings.demoAutopilot=false;this.stateName='stopped';this.audit.write({actorId:'engine',actorRole:'system',action:'bot.auto_stop',metadata:{reason:fatal}})}
      return this.status();
    }catch(error){this.state.executionError=true;this.stateName='error';this.incidents.unshift({ts:iso(now),severity:'error',code:'cycle_error',message:String(error?.message||error)});return this.status()}
  }
  _compactAnalysis(row={}){
    const metrics=row?.metrics||{},regime=metrics?.regime||{};
    return{
      ts:row.ts||iso(),asset:String(row.asset||this.settings.asset||'—'),side:String(row.side||'WAIT'),confidence:Number(row.confidence||0),
      reasons:Array.isArray(row.reasons)?row.reasons.slice(0,4):[],
      forecast30:row.forecast30?{side:row.forecast30.side||'WAIT',confidence:Number(row.forecast30.confidence||0),callStrength:Number(row.forecast30.callStrength||0),putStrength:Number(row.forecast30.putStrength||0)}:null,
      metrics:{last:Number(metrics.last||0),strategy:String(metrics.strategy||this.settings.strategy||'smart_confluence'),regime:{label:String(regime.label||'unknown'),confidence:Number(regime.confidence||0)}},
      latency:row.latency?{feedMs:Number(row.latency.feedMs||0),decisionMs:Number(row.latency.decisionMs||0),executionMs:Number(row.latency.executionMs||0)}:null
    }
  }
  snapshotPersistent(){return{version:3,forecastResearch:this.forecastResearch.snapshot(),settings:this.settings,state:this.state,masterFrozen:this.masterFrozen,killSwitch:this.killSwitch,trades:this.trades.slice(0,2000),analyses:this.analyses.slice(0,180),signalValidation:{pending:this.signalValidation.pending.slice(-200),outcomes:this.signalValidation.outcomes.slice(-1000),lastQueued:this.signalValidation.lastQueued},incidents:this.incidents.slice(0,500),audit:this.audit.list().slice(-2000),broker:{balance:this.broker.balance,orders:this.broker.orders},savedAt:iso()}}
  restore(data={}){this.forecastResearch=new ForecastResearch(data.forecastResearch||{});if(data.settings){this.settings={...this.settings,...data.settings,pausedReadings:{...this.settings.pausedReadings,...(data.settings.pausedReadings||{})},schedule:{...this.settings.schedule,...(data.settings.schedule||{})},risk:{...this.settings.risk,...(data.settings.risk||{})}};if([60000,5000,2000].includes(Number(data.settings?.schedule?.intervalMs)))this.settings.schedule.intervalMs=1000}if(data.state)this.state={...this.state,...data.state};this.masterFrozen=!!data.masterFrozen;this.killSwitch=!!data.killSwitch;this.trades=Array.isArray(data.trades)?data.trades:[];this.analyses=Array.isArray(data.analyses)?data.analyses.slice(0,180).map(x=>this._compactAnalysis(x)):[];if(data.signalValidation&&typeof data.signalValidation==='object'){const prefix='micro-v5|'+CALIBRATION_EPOCH+'|';const pending=Array.isArray(data.signalValidation.pending)?data.signalValidation.pending.filter(x=>String(x?.key||'').startsWith(prefix)):[],outcomes=Array.isArray(data.signalValidation.outcomes)?data.signalValidation.outcomes.filter(x=>String(x?.key||'').startsWith(prefix)):[],lastQueued=Object.fromEntries(Object.entries(data.signalValidation.lastQueued&&typeof data.signalValidation.lastQueued==='object'?data.signalValidation.lastQueued:{}).filter(([k])=>String(k).startsWith(prefix)));this.signalValidation={pending,outcomes,lastQueued}};this._bootstrapSignalValidation();this.incidents=Array.isArray(data.incidents)?data.incidents:[];if(Array.isArray(data.audit))this.audit.rows=data.audit;if(data.broker){this.broker.balance=Number(data.broker.balance||this.broker.balance);this.broker.orders=Array.isArray(data.broker.orders)?data.broker.orders:[]}this.stateName='stopped';this.lastResult={action:'WAIT',reasons:['runtime restaurada; aguardando início manual']};return this}
  async status(){
    const balance=this.externalMarket?.balance!=null?Number(this.externalMarket.balance):await this.broker.getBalance(),wins=this.trades.filter(x=>x.won).length,losses=this.trades.filter(x=>x.won===false).length,snap=this._marketSnapshot();
    const brokerMode=String(this.externalMarket?.brokerMode||this.externalMarket?.mode||'').toLowerCase(),sessionTrades=Math.max(0,this.trades.length-Math.max(0,Number(this.state.sessionTradeStartCount||0)));
    const demoEligible=this.settings.mode==='demo'&&brokerMode==='demo'&&this.externalMarket?.executionReady===true;
    return{state:this.stateName,mode:this.settings.mode,killSwitch:this.killSwitch,masterFrozen:this.masterFrozen,balance,pnl:this.trades.reduce((s,t)=>s+Number(t.pnl||0),0),trades:this.trades.length,wins,losses,winRate:this.trades.length?wins/this.trades.length*100:0,
      research:this.forecastResearch.summary(),drawdownPct:this.state.drawdownPct,consecutiveLosses:this.state.consecutiveLosses,lastHeartbeat:this.lastHeartbeat,lastEvalMs:this.lastEvalMs,nextEvalMs:this.nextEvalMs,lastResult:this.lastResult,
      feed:{label:snap.source||'OFFLINE',price:snap.price,quoteTs:snap.quoteTs},analysisSource:this.externalMarket?.provider?(snap.feedValidated?'LIVE':'WAITING_LIVE'):(this.settings.requireLiveBroker?'OFFLINE':'SIMULATED'),
      liveBroker:this.externalMarket?{...this.externalMarket,mode:brokerMode}:null,
      executionMode:this.settings.mode==='real'?'real_manual':demoEligible?(this.settings.demoAutopilot===true?'broker_demo_auto':'broker_demo_disarmed'):'broker_demo_wait',
      autopilot:{enabled:this.settings.demoAutopilot===true,eligible:demoEligible,brokerMode:brokerMode||'unknown',sessionStartedAt:this.state.sessionStartedAt,sessionTrades,maxSessionTrades:Number(this.settings.risk.maxTradesPerSession||10),maxConsecutiveLosses:Number(this.settings.risk.maxConsecutiveLosses||3)},
      startBlockedReason:this._startBlockReason(),broker:await this.broker.getStatus(),pending:this.pending.length,recentTrades:this.trades.slice(0,50),recentAnalyses:this.analyses.slice(0,20),signalValidation:this.lastResult?.analysis?.quality||null,incidents:this.incidents.slice(0,50),settings:this.settings,audit:this.audit.list().slice(-100).reverse()}
  }
}

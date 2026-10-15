'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {liveCardModel} from '../lib/live-card-model';
import {useSentinelLocale} from './SentinelLocale';
import {pcAuthoritativeWindow} from '../lib/pc-authoritative-window.mjs';
import {brokerClockView} from '../../agent/worker/broker-clock-view.mjs';
import {pcClockNow} from '../lib/pc-clock-sync.mjs';
import {strategySelectionGuidance} from '../../agent/src/core/strategy-selection-guidance.mjs';
import {SCENARIO_ENGINES} from '../../agent/src/core/scenario-engine-catalog.mjs';

type Props={s:any,busy:boolean,act:(path:string,body?:any)=>Promise<any>,compact:boolean,onToggleCompact:()=>void};
const STRATEGIES=[['smart_confluence','Smart Confluence'],['price_action','Price Action'],['trendline_breakout','Trendline Breakout'],['support_resistance','Suporte / Resistência'],['fibonacci_retest','Fibonacci Retest'],['trend','Trend Following'],['mean_reversion','Mean Reversion'],['breakout','Breakout']] as const;
const price=(n:any)=>n==null?'—':Number(n).toFixed(5);
const clock=(ts:number|null)=>ts!=null&&Number.isFinite(ts)&&ts>0?new Date(ts).toLocaleTimeString('pt-BR',{hour12:false}):'—';
const seconds=(n:number|null)=>n===null?'—':n+'s';
// Dedicated local timer: it never waits for a WebSocket packet or forces
// the full analyst card to recalculate on every countdown tick.
function MobileFutureEntryClock({windowEndsAt,windowStartedAt,entryTriggeredAt,plannedExit,side,phase,quoteAt,evaluatedAt,pcClockOffsetMs,holdingSeconds,clockMode,brokerTiming,nowMode,observation}:{
 windowEndsAt:number,windowStartedAt:number,entryTriggeredAt:number,plannedExit:number,
 side:string|null,phase:string|null,quoteAt:number,pcClockOffsetMs:number|null,holdingSeconds:number,
 clockMode:string,brokerTiming:any,nowMode:boolean,evaluatedAt:number,observation:any
}){
 const {t}=useSentinelLocale();
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{
  let timer:ReturnType<typeof setInterval>|null=null;
  const update=()=>setNow(Date.now());
  const syncVisibility=()=>{
   if(timer){clearInterval(timer);timer=null}
   if(document.visibilityState==='visible'){update();timer=setInterval(update,200)}
  };
  document.addEventListener('visibilitychange',syncVisibility);
  syncVisibility();
  return()=>{document.removeEventListener('visibilitychange',syncVisibility);if(timer)clearInterval(timer)};
 },[]);
 // Exactly the recorded PC opportunity state, not a new local scenario.
 // No cycle derivation: only an actual new Agent deadline begins another window.
 const view=pcAuthoritativeWindow({windowStartedAt,windowEndsAt,phase,side,entryTriggeredAt,quoteAt,now:pcClockNow(now,pcClockOffsetMs)});
 const running=view.active;
 const moment=view.enterNow;
 const seconds=view.remainingSeconds;
 const brokerNow=pcClockNow(now,pcClockOffsetMs);
 const brokerView=brokerClockView({timing:brokerTiming,now:brokerNow});
 const brokerSelected=clockMode==='broker';
 const brokerVerified=brokerSelected&&brokerView.verified===true;
 const purchase=brokerVerified&&brokerView.kind==='purchase';
 const signalClock=nowMode&&running;
 const shownSeconds=brokerSelected&&!brokerVerified?null:
  signalClock?seconds:purchase?Math.max(0,Math.ceil((Number('purchaseEndsAt' in brokerView?brokerView.purchaseEndsAt:0)-brokerNow)/1000)):seconds;
 const pad=(n:number)=>String(n).padStart(2,'0');
 const brokerSeconds=Number('timeSeconds' in brokerView?brokerView.timeSeconds:null);
 const brokerTime=brokerVerified&&Number.isFinite(brokerSeconds)?
  pad(Math.floor(brokerSeconds/3600))+':'+pad(Math.floor(brokerSeconds%3600/60))+':'+pad(brokerSeconds%60):'—:—';
 const countdown=brokerVerified&&!signalClock&&!purchase?brokerTime:shownSeconds==null?'—:—':
  pad(Math.floor(shownSeconds/60))+':'+pad(shownSeconds%60);
 const observedAt=Number(observation?.observedAt||0);
 const evaluated=Number(observation?.evaluatedAt||evaluatedAt);
 const observedFresh=brokerNow>=observedAt&&brokerNow-observedAt<=2500&&
  brokerNow>=evaluated&&brokerNow-evaluated<5000;
 const provisional=observedFresh?(observation?.side||observation?.provisionalSide):null;
 const scanningLabel=provisional==='CALL'?'ANALISANDO POSSÍVEL CALL':
  provisional==='PUT'?'ANALISANDO POSSÍVEL PUT':'ANALISANDO';
 const direction=nowMode?(
  moment?t('ENTRADA AGORA · '+(side==='CALL'?'↑ CALL':'↓ PUT')):
  running&&phase==='fired'?t('OPERAÇÃO EM ANDAMENTO · '+(side==='CALL'?'↑ CALL':'↓ PUT')):
  t(scanningLabel)):t(view.label);
 const activityFresh=brokerNow>=evaluatedAt&&brokerNow-evaluatedAt<5000&&
  brokerNow>=quoteAt&&brokerNow-quoteAt<5000;
 return <>
  <div className="vnextFutureDirection" data-await-entry={view.withinDeadline&&phase==='open'&&!moment?'true':undefined}>
   <strong data-testid="future-entry-decision">
   {nowMode&&!running&&<span className="sentinelAnalysisSpinner" data-testid="analysis-spinner" data-active={activityFresh?'1':'0'} aria-hidden="true"/>}
   {direction}</strong>
  </div>
  <div className={'vnextTargetCountdown '+(!running?'ended':'')} data-testid="forecast-countdown-clock" role="timer" aria-live="off">
   <div><small>{brokerSelected&&!brokerVerified?t('Relógio da corretora indisponível'):t(signalClock?'ATÉ O VENCIMENTO':purchase?'ATÉ FECHAR COMPRA':brokerVerified?'HORA DA CORRETORA':nowMode?'ANALISANDO':moment?'MOMENTO CONFIRMADO':'TEMPO RESTANTE DA JANELA')}</small><strong>{countdown}</strong>{brokerVerified&&<small>{brokerTime} · {t('SINCRONIZADO')}</small>}</div>
   <div><small>{t("MOMENTO DE ENTRADA")}</small>
    <b>{phase==='fired'&&entryTriggeredAt?clock(entryTriggeredAt):t('AGUARDANDO')}</b>
    <span>{phase==='fired'&&plannedExit>0?t('Vencimento ')+clock(plannedExit):
      t('Prazo após entrada ')+holdingSeconds+'s'}</span>
   </div>
  </div>
 </>;
}

export function LiveScenarioCard({s,busy,act,compact,onToggleCompact}:Props){
  const {t}=useSentinelLocale();
  const[localNow,setLocalNow]=useState(()=>Date.now());
  const now=pcClockNow(localNow,s?.pcClockOffsetMs);
  const[recordedSignal,setRecordedSignal]=useState<{asset:string,side:string,price:number,at:number}|null>(null);
  const[averageThreshold,setAverageThreshold]=useState(60);
  const[averageInput,setAverageInput]=useState('60');
  const thresholdEditing=useRef(false);
  const settingsEditing=useRef(false);
  // Display cache only. Never reuse expired information as a live signal.
  const lastTotals=useRef<{asset:string,market:number,strategies:number,combined:number,average:number,at:number}|null>(null);
  const[horizon,setHorizon]=useState(String(s?.settings?.forecastHorizonSeconds||60));
  const[expirySeconds,setExpirySeconds]=useState(String(Math.round(Number(s?.settings?.orderDurationMs||60000)/1000)));
  const[threshold,setThreshold]=useState(String(s?.settings?.futureDisplayThreshold||70));
  const[chosenEngine,setChosenEngine]=useState(String(s?.settings?.engine||'automatic'));
  const[clockChoice,setClockChoice]=useState(String(s?.settings?.clockMode||'current'));
  const[strategy1,setStrategy1]=useState(String(s?.settings?.strategy||'smart_confluence'));
  const[strategy2,setStrategy2]=useState(String(s?.settings?.strategy2||'none'));
  const[strategy3,setStrategy3]=useState(String(s?.settings?.strategy3||'none'));
  useEffect(()=>{
    let timer:ReturnType<typeof setInterval>|null=null;
    const update=()=>setLocalNow(Date.now());
    const syncVisibility=()=>{
      if(timer){clearInterval(timer);timer=null}
      if(document.visibilityState==='visible'){
        update();
        timer=setInterval(update,1000);
      }
    };
    document.addEventListener('visibilitychange',syncVisibility);
    syncVisibility();
    return()=>{
      document.removeEventListener('visibilitychange',syncVisibility);
      if(timer)clearInterval(timer);
    };
  },[]);
  useEffect(()=>{
    if(!settingsEditing.current){setChosenEngine(String(s?.settings?.engine||'automatic'));setHorizon(String(s?.settings?.forecastHorizonSeconds||60));setExpirySeconds(String(Math.round(Number(s?.settings?.orderDurationMs||60000)/1000)));setStrategy1(String(s?.settings?.strategy||'smart_confluence'));setStrategy2(String(s?.settings?.strategy2||'none'));setStrategy3(String(s?.settings?.strategy3||'none'));}
    // Remote status refreshes must not overwrite a value the user is typing.
    if(!thresholdEditing.current)setThreshold(String(s?.settings?.futureDisplayThreshold||70));
  },[s?.settings?.forecastMode,s?.settings?.forecastHorizonSeconds,s?.settings?.orderDurationMs,s?.settings?.futureDisplayThreshold,s?.settings?.engine,s?.settings?.strategy,s?.settings?.strategy2,s?.settings?.strategy3]);
  useEffect(()=>{setClockChoice(String(s?.settings?.clockMode||'current'))},[s?.settings?.clockMode]);
  const onAverageChange=(raw:string)=>{
    const draft=raw.replace(/\D/g,'').slice(0,2);
    setAverageInput(draft);
    const value=Number(draft);
    if(draft.length===2&&value>=50&&value<=95)setAverageThreshold(value);
  };
  const commitAverage=()=>{
    const value=Number(averageInput);
    if(averageInput!==''&&Number.isInteger(value)&&value>=50&&value<=95){
      setAverageThreshold(value);
      setAverageInput(String(value));
    }else setAverageInput(String(averageThreshold));
  };
  const onScenarioChange=(raw:string)=>setThreshold(raw.replace(/\D/g,'').slice(0,2));
  const commitScenario=()=>{
    thresholdEditing.current=false;
    const value=Number(threshold);
    if(threshold===''||!Number.isInteger(value)||value<50||value>95){
      setThreshold(String(s?.settings?.futureDisplayThreshold||70));
    }
  };
  const m=liveCardModel(s,now,averageThreshold,localNow);
  const vnext=!!s?.settings?.engine;
  // Duration selection is the lead time to a FUTURE entry.
  // Only the recorded entry schedule owns the hero countdown and direction.
  const expiryChoices=[5,10,15,30,45,60,120,180,300,600,900,3600];
  const expiryLabel=(seconds:number)=>seconds<60?seconds+'s':seconds%60===0?seconds/60+'min':seconds+'s';
  const pausedReadings=s?.settings?.pausedReadings;
  const strategyCards=s?.lastResult?.analysis?.strategyCards;
  // Price ticks and clock ticks do not change these strategy selections.
  const strategyAdvice=useMemo(()=>strategySelectionGuidance({
    ids:[strategy1,strategy2,strategy3],
    paused:pausedReadings||{},
    cards:strategyCards||[]
  }),[strategy1,strategy2,strategy3,pausedReadings,strategyCards]);
  // A signal freezes its ACTUAL broker quote at creation. Subsequent live
  // quotes never overwrite it. Cache only in the open page; no DB logging.
  const incoming=m.lastSignal;
  useEffect(()=>{
    if(!incoming)return;
    setRecordedSignal(previous=>{
      if(previous?.asset===incoming.asset&&previous.at>=incoming.at)return previous;
      return incoming;
    });
  },[incoming?.asset,incoming?.side,incoming?.price,incoming?.at]);
  const lastSignal=recordedSignal?.asset===m.asset?recordedSignal:null;
  const liveDirection=m.entrySide||(!m.scenarioInactive?m.displayScenarioSide:null);
  // Forecast CALL/PUT is not authorization to trade. Never use the word
  // "AGORA" outside a still-actionable, fresh and validated entry.
  const decisionLabel=m.entrySide?t('ENTRADA CONFIRMADA AGORA'):liveDirection?t('SOMENTE PREVISÃO · SEM ENTRADA'):m.scenarioInactive?t('CENÁRIO FINALIZADO'):t('AGUARDANDO OPORTUNIDADE');
  const decisionArrow=liveDirection==='CALL'?'↑':liveDirection==='PUT'?'↓':'◇';
  const decisionText=m.entrySide?m.entrySide:liveDirection?(t('VIÉS ')+liveDirection):m.scenarioInactive?t('ENCERRADO'):t('SEM ENTRADA');
  // Large green/red is reserved for an actionable entry, not a forecast.
  const directionClass=m.entrySide==='CALL'?'call':m.entrySide==='PUT'?'put':'neutral';
  const reversalArrow=m.alert?.side==='CALL'?'↑':m.alert?.side==='PUT'?'↓':'◇';
  const mobileDirection=m.entrySide||null;
  const mobileScenarioDirection=!m.scenarioInactive&&m.displayScenarioSide?m.displayScenarioSide:null;
  const mobileArrow=(mobileDirection||mobileScenarioDirection)==='CALL'?'↑':(mobileDirection||mobileScenarioDirection)==='PUT'?'↓':'◇';
  // Show a SHORT headline: the previous 36-character mobile headline
  // overflowed the bordered card, including the word "ENTRADA".
  const mobileDecisionText=mobileDirection?mobileDirection+' '+t('AGORA'):mobileScenarioDirection?t(m.displayScenarioPreliminary?'PROJEÇÃO ':'CENÁRIO ')+mobileScenarioDirection:m.scenarioInactive?t('ENCERRADO'):t('AGUARDANDO');
  const mobileDecisionLabel=mobileDirection?t('ENTRADA CONFIRMADA'):m.displayScenarioPreliminary?t('ESTIMATIVA ANTECIPADA · NÃO É ENTRADA'):mobileScenarioDirection?t('CENÁRIO EM ANÁLISE · SEM ENTRADA'):t('AGUARDANDO CENÁRIO');
  const mobileWatchTone=!mobileDirection&&mobileScenarioDirection?
    (mobileScenarioDirection==='CALL'?'watch-call':'watch-put'):'';
  // A delayed quote can still be shown as historical information, never live.
  const showLastQuote=m.online&&s?.liveBroker?.assetValidated===true&&m.quoteAge!==null&&m.quoteAge<=30;
  const mobileQuote=showLastQuote?Number(s?.liveBroker?.quote??s?.feed?.price):null;
  const quoteValid=mobileQuote!==null&&Number.isFinite(mobileQuote)&&mobileQuote>0;
  const entryDelta=lastSignal&&quoteValid?mobileQuote!-lastSignal.price:null;
  const entryFavourable=entryDelta!==null&&lastSignal?
    (lastSignal.side==='CALL'?entryDelta>0:entryDelta<0):false;
  const entryAgainst=entryDelta!==null&&lastSignal?
    (lastSignal.side==='CALL'?entryDelta<0:entryDelta>0):false;
  const trendLabel=entryDelta===null?t('SEM COMPARAÇÃO'):entryDelta===0?t('PREÇO IGUAL'):entryFavourable?t('A FAVOR DO SINAL'):t('CONTRA O SINAL');
  const priceChange=entryDelta===null?'—':entryDelta===0?'0.00000':(entryDelta>0?'+':'')+entryDelta.toFixed(5);
  // The scenario can have time remaining after an entry opportunity expires.
  // Neither a closed entry nor this visual clock authorizes a new trade.
  const opportunityNotice=!vnext?<div className={`liveOpportunityState ${m.opportunityEnded?'ended':''}`} data-testid="entry-opportunity-state" role="status" aria-live="off">
    <span aria-hidden="true">◇</span><span>{m.scenarioInactive?'Cenário encerrado; aguardando nova análise':m.entrySide?'Entrada sinalizada · acompanhe a cotação':m.opportunityEnded?'Aguardando novo gatilho':'Observando um novo ponto de entrada'}</span>
  </div>:null;
  const scenarioClock=<div className="liveScenarioCountdown" data-testid="scenario-clock">
    <small>{t("PRAZO DO CENÁRIO")}</small><strong>{m.scenarioInactive?t('ENCERRADO'):m.displayScenarioRemaining!==null?m.displayScenarioRemaining+'s':m.remaining!==null?m.remaining+'s':'—'}</strong>
  </div>;
  useEffect(()=>{
    if(m.fresh&&m.market!==null&&m.strategies!==null&&m.combined!==null&&m.average!==null){
      lastTotals.current={asset:m.asset,market:m.market,strategies:m.strategies,combined:m.combined,average:m.average,at:m.evaluationAt};
    }else if(!m.online||!m.running||lastTotals.current?.asset!==m.asset){
      lastTotals.current=null;
    }
  },[m.asset,m.online,m.running,m.fresh,m.market,m.strategies,m.combined,m.average,m.evaluationAt]);
  const cached=lastTotals.current;
  const cachedReadable=!m.fresh&&m.online&&m.running&&cached?.asset===m.asset&&m.market===null&&now-cached.at<=30000;
  const totals=cachedReadable&&cached?{...m,market:cached.market,strategies:cached.strategies,combined:cached.combined,average:cached.average,averageSide:'AGUARDAR',totalsStale:true}:m;
  const historicalTotals=totals.totalsStale===true;
  const historicalNotice=historicalTotals?<p className="liveInactiveNotice" role="status">ÚLTIMA LEITURA · dados atrasados ({seconds(m.analysisAge)}). Os percentuais são históricos e NÃO autorizam entrada.</p>:null;
  const disabled=busy||!m.online;
  const start=async()=>{if(await act('settings',{demoAutopilot:false})!==false)await act('control/start')};
  const changeEngine=async(value:string)=>{
    setChosenEngine(value);
    await act('settings',{engine:value,strategy2:'none',strategy3:'none'});
  };
  const changeExpiry=async(value:string)=>{
    setExpirySeconds(value);
    await act('settings',{orderDurationMs:Number(value)*1000,forecastHorizonSeconds:Number(value)});
  };
  const changeClock=async(value:string)=>{
    const mode=value==='broker'?'broker':'current';
    setClockChoice(mode);
    // Display timing only. No forecast recalculation or window reset.
    await act('settings',{clockMode:mode});
  };
  const nowMode=m.vnextMode==='now';
  const engineSettings=vnext?<div className="vnextEngineToolbar" data-testid="single-engine-selector">
    <label>{t('Estratégia ativa')}{" "}<select aria-label={t('Estratégia responsável pelo cenário')} value={chosenEngine} disabled={busy} onChange={e=>void changeEngine(e.target.value)}>
        {SCENARIO_ENGINES.map((e:any)=><option key={e.id} value={e.id}>{t(e.name)}</option>)}
      </select>
    </label>
    <label>{t('Relógio atual')}{' '}<select aria-label={t('TEMPO DA CORRETORA')} value={clockChoice} disabled={busy} data-testid="clock-mode-selector" onChange={e=>void changeClock(e.target.value)}>
      <option value="current">{t('Relógio atual')}</option><option value="broker">{t('Sincronizado com a corretora')}</option>
    </select></label>
    <label>{t(nowMode?"Duração da operação":"Entrada daqui a")}{" "}<select aria-label={t('Tempo até a entrada prevista')} value={expirySeconds} disabled={busy} onChange={e=>void changeExpiry(e.target.value)}>
        {expiryChoices.map(n=><option key={n} value={n}>{expiryLabel(n)}</option>)}
      </select>
    </label>
  </div>:null;


  // Main prediction is a FUTURE entry at now + selected time, followed by
  // a separate, explicitly shown estimated holding period.
  // It NEVER mirrors an updated current-candle CALL/PUT.
  const futureEntry=m.vnextFutureEntryAnchor;
  const opportunityPhase=m.vnextOpportunityWindow?.phase||null;
  const plannedAt=Number(futureEntry?.entryAt||0);
  const plannedExit=Number(futureEntry?.exitAt||0);
  const entryPlanValid=!!(futureEntry&&['CALL','PUT'].includes(futureEntry.side)&&
    (nowMode?plannedAt>=Number(futureEntry.issuedAt):plannedAt>Number(futureEntry.issuedAt))&&
    plannedExit>plannedAt&&
    Number(futureEntry.delaySeconds)===Number(expirySeconds));
  const entryDataFresh=m.fresh;
  // Match the PC overlay: a projected entry time is not the end of the
  // opportunity. Keep its prices until the PC's actual window deadline.
  const entryPlanDisplayable=entryPlanValid&&Number(m.vnextOpportunityWindow?.windowStartedAt)>0&&
    Number(m.vnextOpportunityWindow?.windowEndsAt)>now;
  const forecastReceipt=vnext?<div className={'vnextFutureReceipt '+(entryPlanDisplayable?futureEntry.side.toLowerCase():'neutral')} data-testid="future-price-projection" role="status" aria-live="off">
    <div className="vnextReceiptTitle"><b>{t(nowMode?'ANÁLISE EM TEMPO REAL':'ENTRADA FUTURA')} · {(futureEntry?.engineId||m.selectedEngine||chosenEngine).replaceAll('_',' ').toUpperCase()}</b><small>{t(entryDataFresh?(nowMode?'COTAÇÃO AO VIVO':'PROJEÇÃO FUTURA'):'DADOS A CONFERIR')}</small></div>
    {nowMode&&<small data-testid="now-live-reading">{t('Preço atual')}: {price(s?.feed?.price??s?.liveBroker?.quote)} · {t('Última análise')}: {clock(m.evaluationAt)}</small>}
    <MobileFutureEntryClock windowEndsAt={Number(m.vnextOpportunityWindow?.windowEndsAt||0)} windowStartedAt={Number(m.vnextOpportunityWindow?.windowStartedAt||0)} entryTriggeredAt={Number(futureEntry?.entryTriggeredAt||0)} plannedExit={plannedExit} side={futureEntry?.side||null} phase={opportunityPhase} quoteAt={Number(m.quoteAt||0)} evaluatedAt={s?.state==='running'?Number(m.evaluationAt||0):0} pcClockOffsetMs={s?.pcClockOffsetMs??null} holdingSeconds={Number(expirySeconds)} clockMode={clockChoice} brokerTiming={s?.liveBroker?.brokerTiming??null} nowMode={nowMode} observation={m.nowObservation}/>
    <div className="vnextProjectionValues">
      <div><small>{t(nowMode?"PREÇO NA ENTRADA":"PREÇO ESTIMADO NA ENTRADA")}</small><strong>{entryPlanDisplayable?price(futureEntry.projectedEntryPrice):'—'}</strong></div>
      <div><small>{t(nowMode?"PREÇO AO VENCER · AGUARDANDO":"PREÇO ESTIMADO AO VENCER")}</small><strong>{entryPlanDisplayable?price(futureEntry.projectedExitPrice):'—'}</strong></div>
    </div>
    <div className="vnextProjectionBias" aria-label="Cenário de entrada futura não confirmado">
      <span>{t(nowMode?"VENCIMENTO":"JANELA")}{" "}<b>{expiryLabel(Number(expirySeconds))}</b></span><span>{t(nowMode?"SINAL":"ENTRADA")}{" "}<b>{t(opportunityPhase==='fired'?(nowMode?'EM ANDAMENTO':'SINALIZADA'):nowMode?'ANALISANDO':'EM ANÁLISE')}</b></span>
      <span>{t("PERÍODO APÓS")}{" "}<b>{expiryLabel(Number(futureEntry?.holdingSeconds||expirySeconds))}</b></span>
    </div>
    {<details className="vnextForecastDetails" data-testid="vnext-forecast-details"><summary>{t(nowMode?"Detalhes da leitura atual":"Detalhes e qualidade da previsão")}</summary>
      <small>{t(entryDataFresh?'Cotação atual recebida':'Cotação atrasada ou indisponível · não operar com dados antigos')}.</small>
      <small>{t('Estratégia ')}{futureEntry?.engineId||chosenEngine}{t(' · emitida ')}{futureEntry?.issuedAt?clock(futureEntry.issuedAt):'—'}{t(' · entrada ')}{entryPlanValid?clock(plannedAt):'—'}{t(' · vencimento ')}{entryPlanValid?clock(plannedExit):'—'}.</small>
      <small data-testid="mobile-feed-path">{t('Cotação PC: ')}{m.quoteAgeAtFrame===null?'—':m.quoteAgeAtFrame+'s'}{t(' · canal celular: ')}{m.transportAge===null?'—':m.transportAge+'s'}.</small>
      <small data-testid="forecast-forward-outcome-research" style={{display:nowMode?'none':'block'}}> {t('Resultados antigos por prazo: ')}{(m.vnextHorizonMeasurements||[]).length?m.vnextHorizonMeasurements.map((x:any)=>expiryLabel(x.horizonSeconds)+': '+x.correct+'/'+x.verified).join(' · '):t('sem resultados suficientes')}.</small>
    </details>}
  </div>:null;
  // This is not a re-labelled candle: EVERY cell contains the selected
  // motor's actual forecast calculated at that particular future expiry.
  // 9 fixed slots prevent changing data/selection from moving the card.
  const allFutureHorizons=[...new Set([5,10,30,60,120,300,Number(expirySeconds)])]
    .filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b).slice(0,9);

  const futureByHorizon=new Map<number,any>((m.vnextFutureEntryRows||[])
    .map((r:any):[number,any]=>[Number(r.delaySeconds),r]));
  const forecastHorizonStrip=vnext&&!nowMode?<details className="vnextForwardHorizons" data-testid="future-horizon-matrix" aria-label="Outras previsões de entradas futuras">
    <summary>{t("OUTROS HORÁRIOS FUTUROS · expandir")}</summary>
    <div className="vnextForwardHorizonsGrid">
      {allFutureHorizons.map(h=>{
        const r:any=futureByHorizon.get(h);
        const valid=!!(r&&['CALL','PUT'].includes(r.side)&&
          Number(r.projectedEntryPrice)>0&&Number(r.projectedExitPrice)>0&&
          Number(r.issuedAt)>0&&Number(r.entryAt)>now&&Number(r.issuedAt)<=now+2000);
        return <div key={h} className={'vnextForwardHorizon '+(h===Number(expirySeconds)?'selected':'')} data-horizon-seconds={h}>
          <small>{t('EM ')}{expiryLabel(h)}{h===Number(expirySeconds)?t(' · ESCOLHIDO'):''}</small>
          <strong className={valid?(r.side==='CALL'?'call':'put'):'neutral'}>{valid?(r.side==='CALL'?'↑ CALL':'↓ PUT'):'—'}</strong>
          <span>{valid?price(r.projectedEntryPrice):t('Sem previsão')}</span>
        </div>;
      })}
    </div>
    <small className="vnextForwardHorizonsNote">{t("Entrada prevista no horário de cada célula; período posterior igual ao prazo.")}</small>
  </details>:null;
  const observationCards=vnext?<div className="vnextMobileReadings" data-testid="mobile-vnext-readings">
    <strong className="vnextReadingsHeading">{t("TOTAIS DO MERCADO")}</strong>
    <div className="vnextMobileReadingsGrid">
      {(s?.lastResult?.analysis?.vnext?.cards||[]).slice(0,3).map((c:any,i:number)=>
        <div key={c.id||i}><small>{t(['MERCADO AGORA','ESTRUTURA ANTERIOR','ESTRUTURA ANTERIOR + MERCADO AGORA'][i])}</small>
          <strong>{t(c.side||'AGUARDAR')}</strong>
          <span>CALL {c.callPct==null?'—':c.callPct+'%'} · PUT {c.putPct==null?'—':c.putPct+'%'}</span>
        </div>)}
    </div>
    <small>{t("O terceiro card é a média de Estrutura Anterior + Mercado Agora. A estratégia e os percentuais projetados aparecem apenas em Projeção Futura. Índices visuais, não taxas de acerto.")}</small>
  </div>:null;
  const applyScenario=async()=>{
    const ok=await act('settings',{
      forecastHorizonSeconds:Number(horizon),
      orderDurationMs:Number(expirySeconds)*1000,
      futureDisplayThreshold:Number(threshold),
      strategy:strategy1,strategy2,strategy3
    });
    if(ok)settingsEditing.current=false;
  };
  const quoteShown=m.fresh?(s?.liveBroker?.quote??s?.feed?.price):null;
  const pushed=m.fresh&&s?.liveTransport==='push'&&localNow-Number(s?.liveStreamAt||0)<4000;
  const streamBadge=pushed?<small role="status" style={{color:'#29bc9d',fontWeight:800}}>{t("● AO VIVO · PUSH")}</small>:null;
  const mobileFeedDelay=m.quoteAgeAtFrame!==null&&m.transportAge!==null?
    'PC '+m.quoteAgeAtFrame+'s · CANAL '+m.transportAge+'s':null;
  if(compact)return <section className={`liveScenario liveScenarioCompact ${m.tone}`} aria-label="Sentinel compacto flutuante" data-testid="live-scenario-compact">
    <header className="compactHeader"><div><small>{t("SENTINEL · ANALISTA PC")}</small><b className="compactAsset">{m.asset}</b></div><button type="button" className="compactToggle" onClick={onToggleCompact} aria-label="Voltar ao Início do Sentinel">{t("← Início")}</button></header>
    {engineSettings}
    {!vnext&&<>
    <div className={`liveDecision ${mobileDirection==='CALL'?'call':mobileDirection==='PUT'?'put':'neutral'} ${mobileWatchTone} ${m.displayScenarioStale?'stale-preview':''} ${m.entrySide?'actionable':''}`} data-testid="live-decision" role="status" aria-live="polite">
      <small>{mobileDecisionLabel}</small><strong><span aria-hidden="true">{mobileArrow}</span> {mobileDecisionText}</strong>
      <span className="mobileScenarioContext">{t(mobileDirection?'Gatilho de preço confirmado pelo PC':mobileScenarioDirection?m.displayScenarioStale?'COTAÇÃO ATRASADA · SEM ENTRADA':m.displayScenarioPreliminary?'PROJEÇÃO FUTURA · AGUARDE CONFIRMAÇÃO':'ANALISANDO · AGUARDE CONFIRMAÇÃO':'Nenhuma entrada confirmada')}</span>
      <small className="mobileEntryWindow">{m.entrySide?t('Entrada válida por ')+m.entryRemaining+'s':t(m.displayScenarioStale?'Aguardando atualização do preço · não entre':mobileScenarioDirection?'Preparando leitura · aguardando gatilho':m.fresh?'Analisando o preço · aguarde':'Aguardando cotação e análise atuais')}</small>
    </div>
    <div className={`compactScenario ${mobileScenarioDirection?(mobileScenarioDirection==='CALL'?'call':'put'):'neutral'} ${m.displayScenarioStale?'stale-preview':''}`}><div><small>{t("CENÁRIO PRINCIPAL")}</small><strong>{mobileScenarioDirection?t(m.displayScenarioPreliminary?'PROJEÇÃO ':'CENÁRIO ')+mobileScenarioDirection:t('CENÁRIO')} · {m.displayScenarioState}</strong></div>{scenarioClock}</div>
    </>}
    {forecastReceipt}
    {forecastHorizonStrip}
    {opportunityNotice}
    {vnext?<div className="mobileCurrentQuoteOnly" data-testid="mobile-current-quote">
      <div><small>{t("COTAÇÃO DO ATIVO")}</small><strong>{quoteValid?price(mobileQuote):'—'}</strong></div>
      <span>{m.quoteFresh?(pushed?t('● AO VIVO · PUSH'):t('Cotação recente')):t('Cotação atrasada · ')+seconds(m.quoteAge)}{mobileFeedDelay?' · '+mobileFeedDelay:''}</span>
    </div>:<>
    {lastSignal?<div className="mobilePriceComparison" data-testid="mobile-price-comparison">
      <div><small>{t('ÚLTIMO SINAL · ')}{lastSignal.side}</small><strong>{price(lastSignal.price)}</strong></div>
      <div><small>{t("COTAÇÃO DO ATIVO")}</small><strong>{quoteValid?price(mobileQuote):'—'}</strong></div>
      <div className={`mobilePriceChange ${entryFavourable?'favourable':entryAgainst?'against':'neutral'}`}>
        <span>{trendLabel}</span><b>{priceChange}</b>
      </div>
    </div>:<div className="mobileCurrentQuoteOnly" data-testid="mobile-current-quote">
      <div><small>{t("COTAÇÃO DO ATIVO")}</small><strong>{quoteValid?price(mobileQuote):'—'}</strong></div>
      <span>{m.quoteFresh?t('Cotação recebida agora'):showLastQuote?t('Última cotação · ')+seconds(m.quoteAge)+t(' atrás'):t('Sem cotação recente')}</span>
    </div>}
    </>}
    {observationCards}
    <div className="mobileBotControls" data-testid="compact-bot-controls">
      <button type="button" disabled={disabled||m.running||s?.killSwitch||s?.masterFrozen||!!s?.startBlockedReason} onClick={start}>{t(s?.state==='paused'?'Retomar':'Iniciar')}</button>
      <button type="button" disabled={disabled||s?.state!=='running'} onClick={()=>act('control/pause')}>{t("Pausar")}</button>
      <button type="button" disabled={disabled||s?.state==='stopped'} onClick={()=>act('control/stop')}>{t("Parar")}</button>
    </div>
    <div className={`mobileMonitorState ${m.quoteFresh?'':'delayed'}`} role="status">{m.quoteFresh?(pushed?t('● AO VIVO · PUSH'):t('● COTAÇÃO RECENTE · ')+seconds(m.quoteAge)+t(' atrás')):m.quoteAge!==null?t('COTAÇÃO ATRASADA · ')+seconds(m.quoteAge)+t(' atrás · SEM ENTRADA AGORA'):t('SEM COTAÇÃO ATUAL · AGUARDE A ATUALIZAÇÃO')}</div>
    {!vnext&&<div className="mobileReversalObservation" data-testid="mobile-reversal-observation">
      <span>{t("REVERSÃO · OBSERVAÇÃO")}</span>
      <strong>{m.alert?'Possível virada de '+(m.alert.side==='CALL'?'alta':'baixa'):t(m.fresh?'Monitorando reação do preço':'Aguardando dados')}</strong>
    </div>}
    {!vnext&&<details className="mobileTechnicalDetails" data-testid="mobile-technical-readings">
      <summary><span>{t("LEITURA TÉCNICA · 3 TOTAIS")}</span><b>{totals.average===null?'—':t('Média: alta ')+totals.average+'%'+t(' · baixa ')+(100-totals.average)+'%'}</b></summary>
      <div className="compactTotals">
        {([['Mercado',totals.market],['Estratégias',totals.strategies],['Presente + futuro',totals.combined]] as const).map(([label,value])=><div key={label}><span>{t(label)}</span><b>{value===null?'—':t('Alta ')+value+'%'+t(' · baixa ')+(100-Number(value))+'%'}</b></div>)}
      </div>
      <div className="compactAverage" data-testid="compact-three-totals-average"><div><small>{t("MÉDIA DOS 3 TOTAIS · LEITURA")}</small><strong>{totals.average===null?'—':t('Alta ')+totals.average+'%'+t(' · baixa ')+(100-totals.average)+'%'}</strong><span>{t("Não é ordem de entrada.")}</span></div><label>{t("Limite visual")}<input aria-label={t('Limite visual da média')} type="text" inputMode="numeric" maxLength={2} value={averageInput} onFocus={e=>e.currentTarget.select()} onChange={e=>onAverageChange(e.target.value)} onBlur={commitAverage}/></label></div>
      {!vnext&&historicalNotice}
    </details>}
    <div className="compactContext">{vnext?(nowMode?t('Estratégia · vencimento '):t('Estratégia selecionada · horizonte '))+expiryLabel(Number(s?.settings?.orderDurationMs||60000)/1000):t('Previsão ')+Math.round(Number(s?.settings?.forecastHorizonSeconds||60))+'s'}</div>
    <footer>{t("Cotação recebida do PC.")}</footer>
  </section>;
  return <section className={`liveScenario ${m.tone}`} aria-label={t('Cenário ao vivo')} data-testid="live-scenario">
    <header><div><small>{m.asset} · {t('LEITURA DO PC')}</small><h2>{t(m.scenarioLabel)}</h2><b>{t(m.state)}</b></div><div className="liveHeaderRight"><button type="button" className="compactToggle" onClick={onToggleCompact}>{t("Modo flutuante ↘")}</button></div></header>
    {engineSettings}
    {!vnext&&<div className={`liveDecision ${directionClass} ${m.entrySide?'actionable':''}`} role="status" aria-live="polite" data-testid="live-decision"><small>{decisionLabel}</small><strong><span aria-hidden="true">{decisionArrow}</span> {decisionText}</strong><span>{m.entrySide?t('JANELA DE ENTRADA ')+m.entryRemaining+t('s · confirme a expiração na corretora'):t(m.scenarioInactive?'Cenário anterior encerrado; nenhuma entrada válida':liveDirection?'Direção do cenário · ainda não é entrada':'Aguardando dados e estrutura válida')}</span>{scenarioClock}</div>}
    {forecastReceipt}
    {forecastHorizonStrip}
    {opportunityNotice}
    {observationCards}
    <div className="liveScenarioMeta"><span>{t('Cotação ')}{price(quoteShown)}</span><span>{m.quoteAge===null?t('Sem cotação'):t('Cotação recebida há ')+m.quoteAge+'s'}</span><span>{m.confidence===null?'':t('Confiança ')+m.confidence+' pts'}</span></div>
    {!vnext&&historicalNotice}
    {streamBadge}
    
    
    {!vnext&&<div className={`liveReversal liveReversalState ${m.reversalTone} ${m.reversalTesting?'testing':''}`} role={m.alert?'status':undefined} aria-live="polite"><small>{t("◈ SUBANALISTA · AVISO DE REVERSÃO")}</small><h3><span aria-hidden="true">{reversalArrow}</span> {m.subStatus}</h3>
      {m.alert?<><p>{t(m.alert.testing?'Reversão em teste':'Reversão com continuidade confirmada')}</p><div className="liveLevels"><span>{t("Gatilho")}{" "}<b>{price(m.alert.trigger)}</b></span><span>{t("Invalida")}{" "}<b>{price(m.alert.invalidation)}</b></span><span>{t("Próximo nível")}{" "}<b>{price(m.alert.target)}</b></span></div></>:<p>{t(m.fresh?'Acompanhando o preço. Ainda sem reversão confirmada.':'A leitura será retomada quando chegarem dados atuais.')}</p>}
      <small>{m.fresh&&m.evaluationAt?'Última análise '+new Date(s?.lastResult?.analysis?.operationalSignal?.subanalyst?.checkedAt||m.evaluationAt).toLocaleTimeString('pt-BR'):t('Sem análise atual')}</small>
    </div>}
    {!vnext&&<><p className="mobileTechnicalNote">{t("LEITURAS TÉCNICAS · NÃO SÃO ORDEM DE ENTRADA")}</p><div className="liveTotals">{[['Total Mercado',totals.market],['Total Estratégias',totals.strategies],['Presente + Futuro',totals.combined]].map(([label,value])=><div key={String(label)}><small>{t(String(label))}</small><b>{value===null?'—':`CALL ${value}% · PUT ${100-Number(value)}%`}</b></div>)}</div>
    <div className="liveAverage"><div><small>{t("MÉDIA DOS 3 TOTAIS")}</small><h3 className="liveAverageDirection">{totals.averageSide}</h3><h3 className="liveAverageMobile">{t(totals.average===null?'SEM LEITURA':totals.averageSide==='CALL'?'VIÉS DE ALTA':totals.averageSide==='PUT'?'VIÉS DE BAIXA':'SEM VIÉS DEFINIDO')}</h3><span>{totals.average===null?'—':`CALL ${totals.average}% · PUT ${100-totals.average}%`}</span></div><label>{t("Limite visual %")}<input aria-label={t('Limite visual da média')} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={averageInput} onFocus={e=>e.currentTarget.select()} onChange={e=>onAverageChange(e.target.value)} onBlur={commitAverage}/></label></div>
    </>}
    <div className="liveControls"><button className="primary" disabled={disabled||s?.state==='running'||s?.killSwitch||s?.masterFrozen||!!s?.startBlockedReason} onClick={start}>{t(s?.state==='paused'?'Retomar análise':'Iniciar análise')}</button><button className="secondary" disabled={disabled||s?.state!=='running'} onClick={()=>act('control/pause')}>{t("Pausar análise")}</button><button className="secondary" disabled={disabled||s?.state==='stopped'} onClick={()=>act('control/stop')}>{t("Parar análise")}</button></div>
    {!vnext&&<details className="liveSettings"><summary>{t("Ajustar cenário")}</summary><div><label>{t("Prazo da previsão")}<select value={horizon} onChange={e=>{settingsEditing.current=true;setHorizon(e.target.value)}}>{[30,60,120,300,600,900,3600].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>{t("Expiração (manual)")}<select aria-label={t('Expiração escolhida manualmente')} value={expirySeconds} onChange={e=>{settingsEditing.current=true;setExpirySeconds(e.target.value)}}>{[30,60,120,300,600,900].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>{t("Estratégia 1")}<select aria-label="Estratégia 1" value={strategy1} onChange={e=>{settingsEditing.current=true;setStrategy1(e.target.value)}}>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label><label>{t("Estratégia 2")}<select aria-label="Estratégia 2" value={strategy2} onChange={e=>{settingsEditing.current=true;setStrategy2(e.target.value)}}><option value="none">{t("Não selecionada")}</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label><label>{t("Estratégia 3")}<select aria-label="Estratégia 3" value={strategy3} onChange={e=>{settingsEditing.current=true;setStrategy3(e.target.value)}}><option value="none">{t("Não selecionada")}</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label><p data-testid="strategy-selection-advice" role="note" style={{gridColumn:'1 / -1',fontSize:11,opacity:.85,margin:'4px 0'}}>
      <b>{t("Combinação:")}</b> {t(strategyAdvice.message)} <span>· {t(strategyAdvice.recommendation)}</span>
    </p><label>{t("Limite do Cenário %")}<input aria-label="Limite do Cenário" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={threshold} onFocus={e=>{thresholdEditing.current=true;e.currentTarget.select()}} onChange={e=>onScenarioChange(e.target.value)} onBlur={commitScenario}/></label><button className="secondary" disabled={disabled||!Number.isFinite(Number(threshold))||Number(threshold)<50||Number(threshold)>95} onClick={applyScenario}>{t("Aplicar")}</button></div></details>}
    <footer>{t(vnext?(nowMode?'Análise do preço atual. O próximo sinal só poderá sair após o vencimento escolhido; confira a expiração real na corretora.':'Estratégia e prazo selecionados definem a projeção futura.'):'Previsão e prazo do cenário não são a expiração da corretora. Confira o vencimento no aplicativo.')}</footer>
  </section>
}

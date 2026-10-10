'use client';
import {useEffect,useRef,useState} from 'react';
import {liveCardModel} from '../lib/live-card-model';
import {strategySelectionGuidance} from '../../agent/src/core/strategy-selection-guidance.mjs';
import {SCENARIO_ENGINES} from '../../agent/src/core/scenario-engine-catalog.mjs';

type Props={s:any,busy:boolean,act:(path:string,body?:any)=>Promise<any>,compact:boolean,onToggleCompact:()=>void};
const STRATEGIES=[['smart_confluence','Smart Confluence'],['price_action','Price Action'],['trendline_breakout','Trendline Breakout'],['support_resistance','Suporte / Resistência'],['fibonacci_retest','Fibonacci Retest'],['trend','Trend Following'],['mean_reversion','Mean Reversion'],['breakout','Breakout']] as const;
const price=(n:any)=>n==null?'—':Number(n).toFixed(5);
const clock=(ts:number|null)=>ts!=null&&Number.isFinite(ts)&&ts>0?new Date(ts).toLocaleTimeString('pt-BR',{hour12:false}):'—';
const seconds=(n:number|null)=>n===null?'—':n+'s';
export function LiveScenarioCard({s,busy,act,compact,onToggleCompact}:Props){
  const[now,setNow]=useState(()=>Date.now());
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
  const[strategy1,setStrategy1]=useState(String(s?.settings?.strategy||'smart_confluence'));
  const[strategy2,setStrategy2]=useState(String(s?.settings?.strategy2||'none'));
  const[strategy3,setStrategy3]=useState(String(s?.settings?.strategy3||'none'));
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[]);
  useEffect(()=>{
    if(!settingsEditing.current){setChosenEngine(String(s?.settings?.engine||'automatic'));setHorizon(String(s?.settings?.forecastHorizonSeconds||60));setExpirySeconds(String(Math.round(Number(s?.settings?.orderDurationMs||60000)/1000)));setStrategy1(String(s?.settings?.strategy||'smart_confluence'));setStrategy2(String(s?.settings?.strategy2||'none'));setStrategy3(String(s?.settings?.strategy3||'none'));}
    // Remote status refreshes must not overwrite a value the user is typing.
    if(!thresholdEditing.current)setThreshold(String(s?.settings?.futureDisplayThreshold||70));
  },[s?.settings?.forecastHorizonSeconds,s?.settings?.orderDurationMs,s?.settings?.futureDisplayThreshold,s?.settings?.engine,s?.settings?.strategy,s?.settings?.strategy2,s?.settings?.strategy3]);
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
  const m=liveCardModel(s,now,averageThreshold);
  const vnext=!!s?.settings?.engine;
  const liveForecast=m.vnextReceipt;
  // Two INDEPENDENT display clocks: live forecast updates with every Agent
  // calculation; the original reference clock remains auditable until expiry.
  // Never use the fixed receipt to freeze the selected motor or its CALL/PUT indices.
  const clockForecast=m.vnextTargetAnchor||liveForecast;
  const forecast=clockForecast;
  // A slow mobile packet MUST NOT erase a still-relevant prediction.
  // Only the FRESH path may be called live or used to describe an entry.
  // Historical display never grants entry permissions or changes the motor.
  const forecastReadable=!!(liveForecast&&
    Number(liveForecast.issuedAt)>0&&Number(liveForecast.issuedAt)<=now+2000&&
    Number(liveForecast.targetAt)>now&&
    ['CALL','PUT'].includes(String(liveForecast.side)));
  const liveForecastValid=!!(forecastReadable&&m.fresh&&
    now-Number(liveForecast.issuedAt)<=6000);
  const forecastDelayed=forecastReadable&&!liveForecastValid;
  const liveProjection=forecastReadable?m.vnextProjection:null;
  const expiryChoices=[5,10,15,30,45,60,120,180,300,600,900,3600];
  const expiryLabel=(seconds:number)=>seconds<60?seconds+'s':seconds%60===0?seconds/60+'min':seconds+'s';
  // A rolling forecast always targets an exact future instant from its
  // original issuance. A countdown alone must never replace the deadline.
  const forecastTargetAt=Number(clockForecast?.targetAt||0);
  const forecastIssuedAt=Number(clockForecast?.issuedAt||0);
  const forecastExpirySeconds=Number(clockForecast?.expirySeconds||0);
  const forecastTimeValid=Boolean(clockForecast&&forecastTargetAt>forecastIssuedAt&&
    forecastExpirySeconds>0&&forecastTargetAt-forecastIssuedAt===forecastExpirySeconds*1000);
  const forecastSecondsRemaining=forecastTimeValid?Math.max(0,Math.ceil((forecastTargetAt-now)/1000)):null;
  const forecastTargetPast=forecastTimeValid&&forecastTargetAt<=now;
  const countdownTime=forecastSecondsRemaining===null?'—:—':forecastSecondsRemaining>=3600?String(Math.floor(forecastSecondsRemaining/3600)).padStart(2,'0')+':'+String(Math.floor(forecastSecondsRemaining%3600/60)).padStart(2,'0')+':'+String(forecastSecondsRemaining%60).padStart(2,'0'):String(Math.floor(forecastSecondsRemaining/60)).padStart(2,'0')+':'+String(forecastSecondsRemaining%60).padStart(2,'0');
  const forecastTimeLabel=liveForecastValid?
    'ALVO EM ANÁLISE '+clock(liveForecast.targetAt):
    forecastTargetPast?'ALVO ENCERRADO':'AGUARDANDO NOVA ANÁLISE';
  const strategyAdvice=strategySelectionGuidance({
    ids:[strategy1,strategy2,strategy3],
    paused:s?.settings?.pausedReadings||{},
    cards:s?.lastResult?.analysis?.strategyCards||[]
  });
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
  const decisionLabel=m.entrySide?'ENTRADA CONFIRMADA AGORA':liveDirection?'SOMENTE PREVISÃO · SEM ENTRADA':m.scenarioInactive?'CENÁRIO FINALIZADO':'AGUARDANDO OPORTUNIDADE';
  const decisionArrow=liveDirection==='CALL'?'↑':liveDirection==='PUT'?'↓':'◇';
  const decisionText=m.entrySide?m.entrySide:liveDirection?('VIÉS '+liveDirection):m.scenarioInactive?'ENCERRADO':'SEM ENTRADA';
  // Large green/red is reserved for an actionable entry, not a forecast.
  const directionClass=m.entrySide==='CALL'?'call':m.entrySide==='PUT'?'put':'neutral';
  const reversalArrow=m.alert?.side==='CALL'?'↑':m.alert?.side==='PUT'?'↓':'◇';
  const mobileDirection=m.entrySide||null;
  const mobileScenarioDirection=!m.scenarioInactive&&m.displayScenarioSide?m.displayScenarioSide:null;
  const mobileArrow=(mobileDirection||mobileScenarioDirection)==='CALL'?'↑':(mobileDirection||mobileScenarioDirection)==='PUT'?'↓':'◇';
  // Show a SHORT headline: the previous 36-character mobile headline
  // overflowed the bordered card, including the word "ENTRADA".
  const mobileDecisionText=mobileDirection?mobileDirection+' AGORA':mobileScenarioDirection?(m.displayScenarioPreliminary?'PROJEÇÃO ':'CENÁRIO ')+mobileScenarioDirection:m.scenarioInactive?'ENCERRADO':'AGUARDANDO';
  const mobileDecisionLabel=mobileDirection?'ENTRADA CONFIRMADA':m.displayScenarioPreliminary?'ESTIMATIVA ANTECIPADA · NÃO É ENTRADA':mobileScenarioDirection?'CENÁRIO EM ANÁLISE · SEM ENTRADA':'AGUARDANDO CENÁRIO';
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
  const trendLabel=entryDelta===null?'SEM COMPARAÇÃO':entryDelta===0?'PREÇO IGUAL':entryFavourable?'A FAVOR DO SINAL':'CONTRA O SINAL';
  const priceChange=entryDelta===null?'—':entryDelta===0?'0.00000':(entryDelta>0?'+':'')+entryDelta.toFixed(5);
  // The scenario can have time remaining after an entry opportunity expires.
  // Neither a closed entry nor this visual clock authorizes a new trade.
  const opportunityNotice=!vnext?<div className={`liveOpportunityState ${m.opportunityEnded?'ended':''}`} data-testid="entry-opportunity-state" role="status" aria-live="off">
    <span aria-hidden="true">◇</span><span>{m.scenarioInactive?'Cenário encerrado; aguardando nova análise':m.entrySide?'Entrada sinalizada · acompanhe a cotação':m.opportunityEnded?'Aguardando novo gatilho':'Observando um novo ponto de entrada'}</span>
  </div>:null;
  const scenarioClock=<div className="liveScenarioCountdown" data-testid="scenario-clock">
    <small>PRAZO DO CENÁRIO</small><strong>{m.scenarioInactive?'ENCERRADO':m.displayScenarioRemaining!==null?m.displayScenarioRemaining+'s':m.remaining!==null?m.remaining+'s':'—'}</strong>
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
  const engineSettings=vnext?<div className="vnextEngineToolbar" data-testid="single-engine-selector">
    <label>Motor do cenário
      <select aria-label="Motor responsável pelo cenário" value={chosenEngine} disabled={busy} onChange={e=>void changeEngine(e.target.value)}>
        {SCENARIO_ENGINES.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </label>
    <label>Prever até
      <select aria-label="Expiração escolhida para previsão" value={expirySeconds} disabled={busy} onChange={e=>void changeExpiry(e.target.value)}>
        {expiryChoices.map(n=><option key={n} value={n}>{expiryLabel(n)}</option>)}
      </select>
    </label>
  </div>:null;

  // All mobile modes share these exact two permanent card nodes. Neither
  // switching observation sides nor expiring a forecast inserts/removes a hero.
  const lastSettled=m.vnextLastSettled;
  const observed=m.vnextNowObservation;
  // Link ONLY the observation DISPLAY to the current live motor scenario.
  // Incompatible reactions still exist in the market and continue to be
  // calculated; they are not presented as an entry in the opposite direction.
  const observation=liveForecastValid&&observed?.side===liveForecast.side&&
    Number(observed.at)>=Number(clockForecast?.issuedAt||0)&&
    Number(observed.at)<=Number(clockForecast?.targetAt||Infinity)?observed:null;
  const opposingObserved=!!(liveForecastValid&&observed&&observed.side!==liveForecast.side);
  const observedLabel=observation?.side==='CALL'?'↑ CALL':observation?.side==='PUT'?'↓ PUT':'—';
  const forecastLabel=!forecastReadable?'EM ANÁLISE':
    (liveForecast.side==='CALL'?'↑ CALL':'↓ PUT')+(forecastDelayed?' · ATRASADO':'');
  const instantObservation=vnext?<div
    className={`vnextInstantObservation ${observation?.side==='CALL'?'call':observation?.side==='PUT'?'put':''}`}
    data-testid="vnext-immediate-observation" role="status" aria-live="off">
    <div className="vnextCompactHeading"><b>LEITURA AGORA</b><small>Reação de preço · não é ordem</small></div>
    <strong className="vnextCompactDirection">{observedLabel}</strong>
    <span className="vnextCompactLine">{observation?
      (observation.kind==='support-reaction'?'Reação no suporte':observation.kind==='resistance-reaction'?'Reação na resistência':
      observation.kind==='resistance-break'?'Rompimento da resistência':'Rompimento do suporte')+
      ' · '+price(observation.price)+' · '+clock(observation.at):
      opposingObserved?'Movimento atual contrário à projeção · aguardando alinhamento':m.fresh?'Sem reação alinhada neste instante':'Aguardando cotação atual'}</span>
    <span className="vnextCompactLine">{observation?
      'Prazo '+expiryLabel(Number(observation.expirySeconds||s?.settings?.orderDurationMs/1000||30))+
      ' · Alvo teórico '+clock(observation.targetAt):
      'A leitura acompanha apenas o cenário do motor'}</span>
  </div>:null;
  const forecastReceipt=vnext?<div className={`vnextFutureReceipt ${forecastReadable&&liveForecast?.side==='CALL'?'call':forecastReadable&&liveForecast?.side==='PUT'?'put':'neutral'} ${forecastDelayed?'delayed':''}`} data-testid="future-price-projection" role="status" aria-live="off">
    <div className="vnextReceiptTitle"><b>PROJEÇÃO FUTURA EM ANÁLISE · {(liveForecast?.engineId||m.selectedEngine||chosenEngine).replaceAll('_',' ').toUpperCase()}</b><small>{liveForecastValid?'● AO VIVO':forecastDelayed?'ÚLTIMA PREVISÃO · ATRASADA':m.quoteAge!==null?'COTAÇÃO ATRASADA':'SEM COTAÇÃO'}</small></div>
    <div className="vnextFutureDirection"><strong>{forecastLabel}</strong><span data-testid="forecast-exact-target">{forecastTimeLabel}</span></div>
    <div className={`vnextTargetCountdown ${forecastTargetPast?'ended':''}`} data-testid="forecast-countdown-clock" role="timer" aria-live="off">
      <div><small>{forecastTargetPast?'ALVO ENCERRADO':'CONTAGEM DA RODADA'}</small><strong>{countdownTime}</strong></div>
      <div><small>HORÁRIO FIXO DA RODADA</small><b>{forecastTimeValid?clock(forecastTargetAt):'—'}</b><span>{forecastTimeValid?'Emissão '+clock(forecastIssuedAt):'Aguardando previsão'}</span></div>
    </div>
    <div className="vnextProjectionValues">
      <div><small>PREÇO AGORA / REFERÊNCIA</small><strong>{forecastReadable?price(liveForecast.referencePrice):'—'}</strong></div>
      <div><small>PROJEÇÃO AO VIVO</small><strong>{forecastReadable?price(liveForecast.projectedPrice):'—'}</strong></div>
    </div>
    <div className="vnextProjectionBias" aria-label={forecastDelayed?'Últimos percentuais recebidos; cotação atrasada, não operar': 'Índices atualizados da previsão'}>
      <span>CALL <b>{liveProjection?.callPct==null?'—':liveProjection.callPct+'%'}</b></span>
      <span>PUT <b>{liveProjection?.putPct==null?'—':liveProjection.putPct+'%'}</b></span>
    </div>
    <details className="vnextForecastDetails" data-testid="vnext-forecast-details"><summary>Detalhes e resultado observado</summary>
      <small>Motor calculado: {liveForecast?.engineId?liveForecast.engineId.replaceAll('_',' ').toUpperCase():'AGUARDANDO'} · Último cálculo {liveForecast?.issuedAt?clock(liveForecast.issuedAt):'—'} · Referência {liveForecast?.referencePrice?price(liveForecast.referencePrice):'—'}</small>
      <small data-testid="mobile-feed-path">Cotação PC na transmissão: {m.quoteAgeAtFrame===null?'—':m.quoteAgeAtFrame+'s'} · Idade do pacote no celular: {m.transportAge===null?'sem push recente':m.transportAge+'s'}. {forecastDelayed?'Previsão retida apenas para consulta; não é entrada atual.':''}</small>
      <small>Prazo escolhido: {expiryLabel(forecastExpirySeconds||Number(s?.settings?.orderDurationMs||60000)/1000)} · Alvo fixado {forecastTimeValid?clock(forecastTargetAt):'—'} · Alvo móvel do motor {liveForecastValid?clock(liveForecast.targetAt):'—'}</small>
      <small>{forecast?'Faixa: '+price(forecast.expectedLow)+' a '+price(forecast.expectedHigh):'Aguardando histórico para previsão'} · {m.vnextFoundation==='historical-forward-outcomes'?'Histórico: '+m.vnextHistorical+' casos completos':'Previsão experimental, sem assertividade comprovada'}</small>
      <div className="vnextLiveCalculation" data-testid="motor-live-refresh"><small>NOVA LEITURA DO MOTOR (INDEPENDENTE DO ALVO FIXADO)</small>
        <span>{liveForecast&&forecast&&liveForecast.issuedAt!==forecast.issuedAt?
          (liveForecast.side||'AGUARDANDO')+' às '+clock(liveForecast.issuedAt)+' para '+clock(liveForecast.targetAt)+' · preço '+price(liveForecast.projectedPrice):
          'Último cálculo acompanha o mesmo alvo'}</span></div>
      <div className="vnextSettledOutcome" data-testid="last-settled-projection">
        <b>{lastSettled?'ÚLTIMA PREVISÃO AVALIADA · '+clock(lastSettled.targetAt):'AGUARDANDO RESULTADO NO VENCIMENTO'}</b>
        <span>{lastSettled?(lastSettled.correct===true?'Direção acertou':lastSettled.correct===false?'Direção não acertou':'Inconclusiva')+
          ' · Referência '+price(lastSettled.referencePrice)+' · Previsto '+price(lastSettled.projectedPrice)+' · Observado '+price(lastSettled.settledPrice):
          'Sem resultados verificados neste período'}</span></div>
    </details>
  </div>:null;
  const observationCards=vnext?<div className="vnextMobileReadings" data-testid="mobile-vnext-readings">
    <strong className="vnextReadingsHeading">TOTAIS DO MERCADO · SEM MOTOR</strong>
    <div className="vnextMobileReadingsGrid">
      {(s?.lastResult?.analysis?.vnext?.cards||[]).slice(0,3).map((c:any,i:number)=>
        <div key={c.id||i}><small>{['MERCADO AGORA','ESTRUTURA ANTERIOR','ESTRUTURA ANTERIOR + MERCADO AGORA'][i]}</small>
          <strong>{c.side||'AGUARDAR'}</strong>
          <span>CALL {c.callPct==null?'—':c.callPct+'%'} · PUT {c.putPct==null?'—':c.putPct+'%'}</span>
        </div>)}
    </div>
    <small>O terceiro card é a média de Estrutura Anterior + Mercado Agora. O motor e os percentuais projetados aparecem apenas em Projeção Futura. Índices visuais, não taxas de acerto.</small>
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
  const pushed=m.fresh&&s?.liveTransport==='push'&&now-Number(s?.liveStreamAt||0)<4000;
  const streamBadge=pushed?<small role="status" style={{color:'#29bc9d',fontWeight:800}}>● AO VIVO · PUSH</small>:null;
  const mobileFeedDelay=m.quoteAgeAtFrame!==null&&m.transportAge!==null?
    'PC '+m.quoteAgeAtFrame+'s · CANAL '+m.transportAge+'s':null;
  if(compact)return <section className={`liveScenario liveScenarioCompact ${m.tone}`} aria-label="Sentinel compacto flutuante" data-testid="live-scenario-compact">
    <header className="compactHeader"><div><small>SENTINEL · ANALISTA PC</small><b className="compactAsset">{m.asset}</b></div><button type="button" className="compactToggle" onClick={onToggleCompact} aria-label="Voltar ao Início do Sentinel">← Início</button></header>
    {engineSettings}
    {!vnext&&<>
    <div className={`liveDecision ${mobileDirection==='CALL'?'call':mobileDirection==='PUT'?'put':'neutral'} ${mobileWatchTone} ${m.displayScenarioStale?'stale-preview':''} ${m.entrySide?'actionable':''}`} data-testid="live-decision" role="status" aria-live="polite">
      <small>{mobileDecisionLabel}</small><strong><span aria-hidden="true">{mobileArrow}</span> {mobileDecisionText}</strong>
      <span className="mobileScenarioContext">{mobileDirection?'Gatilho de preço confirmado pelo PC':mobileScenarioDirection?m.displayScenarioStale?'COTAÇÃO ATRASADA · SEM ENTRADA':m.displayScenarioPreliminary?'PROJEÇÃO FUTURA · AGUARDE CONFIRMAÇÃO':'ANALISANDO · AGUARDE CONFIRMAÇÃO':'Nenhuma entrada confirmada'}</span>
      <small className="mobileEntryWindow">{m.entrySide?'Entrada válida por '+m.entryRemaining+'s':m.displayScenarioStale?'Aguardando atualização do preço · não entre':mobileScenarioDirection?'Preparando leitura · aguardando gatilho':m.fresh?'Analisando o preço · aguarde':'Aguardando cotação e análise atuais'}</small>
    </div>
    <div className={`compactScenario ${mobileScenarioDirection?(mobileScenarioDirection==='CALL'?'call':'put'):'neutral'} ${m.displayScenarioStale?'stale-preview':''}`}><div><small>CENÁRIO PRINCIPAL</small><strong>{mobileScenarioDirection?(m.displayScenarioPreliminary?'PROJEÇÃO ':'CENÁRIO ')+mobileScenarioDirection:'CENÁRIO'} · {m.displayScenarioState}</strong></div>{scenarioClock}</div>
    </>}
    {instantObservation}
    {forecastReceipt}
    {opportunityNotice}
    {vnext?<div className="mobileCurrentQuoteOnly" data-testid="mobile-current-quote">
      <div><small>COTAÇÃO DO ATIVO</small><strong>{quoteValid?price(mobileQuote):'—'}</strong></div>
      <span>{m.quoteFresh?(pushed?'● AO VIVO · PUSH':'Cotação recente'):'Cotação atrasada · '+seconds(m.quoteAge)}{mobileFeedDelay?' · '+mobileFeedDelay:''}</span>
    </div>:<>
    {lastSignal?<div className="mobilePriceComparison" data-testid="mobile-price-comparison">
      <div><small>ÚLTIMO SINAL · {lastSignal.side}</small><strong>{price(lastSignal.price)}</strong></div>
      <div><small>COTAÇÃO DO ATIVO</small><strong>{quoteValid?price(mobileQuote):'—'}</strong></div>
      <div className={`mobilePriceChange ${entryFavourable?'favourable':entryAgainst?'against':'neutral'}`}>
        <span>{trendLabel}</span><b>{priceChange}</b>
      </div>
    </div>:<div className="mobileCurrentQuoteOnly" data-testid="mobile-current-quote">
      <div><small>COTAÇÃO DO ATIVO</small><strong>{quoteValid?price(mobileQuote):'—'}</strong></div>
      <span>{m.quoteFresh?'Cotação recebida agora':showLastQuote?'Última cotação · '+seconds(m.quoteAge)+' atrás':'Sem cotação recente'}</span>
    </div>}
    </>}
    {observationCards}
    <div className="mobileBotControls" data-testid="compact-bot-controls">
      <button type="button" disabled={disabled||m.running||s?.killSwitch||s?.masterFrozen||!!s?.startBlockedReason} onClick={start}>{s?.state==='paused'?'Retomar':'Iniciar'}</button>
      <button type="button" disabled={disabled||s?.state!=='running'} onClick={()=>act('control/pause')}>Pausar</button>
      <button type="button" disabled={disabled||s?.state==='stopped'} onClick={()=>act('control/stop')}>Parar</button>
    </div>
    <div className={`mobileMonitorState ${m.quoteFresh?'':'delayed'}`} role="status">{m.quoteFresh?(pushed?'● AO VIVO · PUSH':'● COTAÇÃO RECENTE · '+seconds(m.quoteAge)+' atrás'):m.quoteAge!==null?'COTAÇÃO ATRASADA · '+seconds(m.quoteAge)+' atrás · SEM ENTRADA AGORA':'SEM COTAÇÃO ATUAL · AGUARDE A ATUALIZAÇÃO'}</div>
    {!vnext&&<div className="mobileReversalObservation" data-testid="mobile-reversal-observation">
      <span>REVERSÃO · OBSERVAÇÃO</span>
      <strong>{m.alert?'Possível virada de '+(m.alert.side==='CALL'?'alta':'baixa'):m.fresh?'Monitorando reação do preço':'Aguardando dados'}</strong>
    </div>}
    {!vnext&&<details className="mobileTechnicalDetails" data-testid="mobile-technical-readings">
      <summary><span>LEITURA TÉCNICA · 3 TOTAIS</span><b>{totals.average===null?'—':`Média: alta ${totals.average}% · baixa ${100-totals.average}%`}</b></summary>
      <div className="compactTotals">
        {([['Mercado',totals.market],['Estratégias',totals.strategies],['Presente + futuro',totals.combined]] as const).map(([label,value])=><div key={label}><span>{label}</span><b>{value===null?'—':`Alta ${value}% · baixa ${100-Number(value)}%`}</b></div>)}
      </div>
      <div className="compactAverage" data-testid="compact-three-totals-average"><div><small>MÉDIA DOS 3 TOTAIS · LEITURA</small><strong>{totals.average===null?'—':`Alta ${totals.average}% · baixa ${100-totals.average}%`}</strong><span>Não é ordem de entrada.</span></div><label>Limite visual<input aria-label="Limite visual da média" type="text" inputMode="numeric" maxLength={2} value={averageInput} onFocus={e=>e.currentTarget.select()} onChange={e=>onAverageChange(e.target.value)} onBlur={commitAverage}/></label></div>
      {!vnext&&historicalNotice}
    </details>}
    <div className="compactContext">{vnext?'Motor selecionado · horizonte '+expiryLabel(Number(s?.settings?.orderDurationMs||60000)/1000):'Previsão '+Math.round(Number(s?.settings?.forecastHorizonSeconds||60))+'s'}</div>
    <footer>Cotação recebida do PC. Projeção não é entrada confirmada.</footer>
  </section>;
  return <section className={`liveScenario ${m.tone}`} aria-label="Cenário ao vivo" data-testid="live-scenario">
    <header><div><small>{m.asset} · LEITURA DO PC</small><h2>{m.scenarioLabel}</h2><b>{m.state}</b></div><div className="liveHeaderRight"><button type="button" className="compactToggle" onClick={onToggleCompact}>Modo flutuante ↘</button></div></header>
    {engineSettings}
    {!vnext&&<div className={`liveDecision ${directionClass} ${m.entrySide?'actionable':''}`} role="status" aria-live="polite" data-testid="live-decision"><small>{decisionLabel}</small><strong><span aria-hidden="true">{decisionArrow}</span> {decisionText}</strong><span>{m.entrySide?'JANELA DE ENTRADA '+m.entryRemaining+'s · confirme a expiração na corretora':m.scenarioInactive?'Cenário anterior encerrado; nenhuma entrada válida':liveDirection?'Direção do cenário · ainda não é entrada':'Aguardando dados e estrutura válida'}</span>{scenarioClock}</div>}
    {instantObservation}
    {forecastReceipt}
    {opportunityNotice}
    {observationCards}
    <div className="liveScenarioMeta"><span>Cotação {price(quoteShown)}</span><span>{m.quoteAge===null?'Sem cotação':`Cotação recebida há ${m.quoteAge}s`}</span><span>{m.confidence===null?'':'Confiança '+m.confidence+' pts'}</span></div>
    {!vnext&&historicalNotice}
    {streamBadge}
    
    
    {!vnext&&<div className={`liveReversal liveReversalState ${m.reversalTone} ${m.reversalTesting?'testing':''}`} role={m.alert?'status':undefined} aria-live="polite"><small>◈ SUBANALISTA · AVISO DE REVERSÃO</small><h3><span aria-hidden="true">{reversalArrow}</span> {m.subStatus}</h3>
      {m.alert?<><p>{m.alert.testing?'Reversão em teste':'Reversão com continuidade confirmada'}</p><div className="liveLevels"><span>Gatilho <b>{price(m.alert.trigger)}</b></span><span>Invalida <b>{price(m.alert.invalidation)}</b></span><span>Próximo nível <b>{price(m.alert.target)}</b></span></div></>:<p>{m.fresh?'Acompanhando o preço. Ainda sem reversão confirmada.':'A leitura será retomada quando chegarem dados atuais.'}</p>}
      <small>{m.fresh&&m.evaluationAt?'Última análise '+new Date(s?.lastResult?.analysis?.operationalSignal?.subanalyst?.checkedAt||m.evaluationAt).toLocaleTimeString('pt-BR'):'Sem análise atual'}</small>
    </div>}
    {!vnext&&<><p className="mobileTechnicalNote">LEITURAS TÉCNICAS · NÃO SÃO ORDEM DE ENTRADA</p><div className="liveTotals">{[['Total Mercado',totals.market],['Total Estratégias',totals.strategies],['Presente + Futuro',totals.combined]].map(([label,value])=><div key={String(label)}><small>{label}</small><b>{value===null?'—':`CALL ${value}% · PUT ${100-Number(value)}%`}</b></div>)}</div>
    <div className="liveAverage"><div><small>MÉDIA DOS 3 TOTAIS</small><h3 className="liveAverageDirection">{totals.averageSide}</h3><h3 className="liveAverageMobile">{totals.average===null?'SEM LEITURA':totals.averageSide==='CALL'?'VIÉS DE ALTA':totals.averageSide==='PUT'?'VIÉS DE BAIXA':'SEM VIÉS DEFINIDO'}</h3><span>{totals.average===null?'—':`CALL ${totals.average}% · PUT ${100-totals.average}%`}</span></div><label>Limite visual %<input aria-label="Limite visual da média" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={averageInput} onFocus={e=>e.currentTarget.select()} onChange={e=>onAverageChange(e.target.value)} onBlur={commitAverage}/></label></div>
    </>}
    <div className="liveControls"><button className="primary" disabled={disabled||s?.state==='running'||s?.killSwitch||s?.masterFrozen||!!s?.startBlockedReason} onClick={start}>{s?.state==='paused'?'Retomar análise':'Iniciar análise'}</button><button className="secondary" disabled={disabled||s?.state!=='running'} onClick={()=>act('control/pause')}>Pausar análise</button><button className="secondary" disabled={disabled||s?.state==='stopped'} onClick={()=>act('control/stop')}>Parar análise</button></div>
    {!vnext&&<details className="liveSettings"><summary>Ajustar cenário</summary><div><label>Prazo da previsão<select value={horizon} onChange={e=>{settingsEditing.current=true;setHorizon(e.target.value)}}>{[30,60,120,300,600,900,3600].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>Expiração (manual)<select aria-label="Expiração escolhida manualmente" value={expirySeconds} onChange={e=>{settingsEditing.current=true;setExpirySeconds(e.target.value)}}>{[30,60,120,300,600,900].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>Estratégia 1<select aria-label="Estratégia 1" value={strategy1} onChange={e=>{settingsEditing.current=true;setStrategy1(e.target.value)}}>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Estratégia 2<select aria-label="Estratégia 2" value={strategy2} onChange={e=>{settingsEditing.current=true;setStrategy2(e.target.value)}}><option value="none">Não selecionada</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Estratégia 3<select aria-label="Estratégia 3" value={strategy3} onChange={e=>{settingsEditing.current=true;setStrategy3(e.target.value)}}><option value="none">Não selecionada</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><p data-testid="strategy-selection-advice" role="note" style={{gridColumn:'1 / -1',fontSize:11,opacity:.85,margin:'4px 0'}}>
      <b>Combinação:</b> {strategyAdvice.message} <span>· {strategyAdvice.recommendation}</span>
    </p><label>Limite do Cenário %<input aria-label="Limite do Cenário" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={threshold} onFocus={e=>{thresholdEditing.current=true;e.currentTarget.select()}} onChange={e=>onScenarioChange(e.target.value)} onBlur={commitScenario}/></label><button className="secondary" disabled={disabled||!Number.isFinite(Number(threshold))||Number(threshold)<50||Number(threshold)>95} onClick={applyScenario}>Aplicar</button></div></details>}
    <footer>{vnext?'Um motor por vez. Prazo escolhido aqui define o preço futuro projetado; confirme a expiração na corretora. Previsão experimental não é sinal de entrada.':'Previsão e prazo do cenário não são a expiração da corretora. Confira o vencimento no aplicativo.'}</footer>
  </section>
}

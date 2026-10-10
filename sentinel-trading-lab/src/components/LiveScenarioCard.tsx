'use client';
import {useEffect,useRef,useState} from 'react';
import {liveCardModel} from '../lib/live-card-model';
import {strategySelectionGuidance} from '../../agent/src/core/strategy-selection-guidance.mjs';

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
  const[strategy1,setStrategy1]=useState(String(s?.settings?.strategy||'smart_confluence'));
  const[strategy2,setStrategy2]=useState(String(s?.settings?.strategy2||'none'));
  const[strategy3,setStrategy3]=useState(String(s?.settings?.strategy3||'none'));
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[]);
  useEffect(()=>{
    if(!settingsEditing.current){setHorizon(String(s?.settings?.forecastHorizonSeconds||60));setExpirySeconds(String(Math.round(Number(s?.settings?.orderDurationMs||60000)/1000)));setStrategy1(String(s?.settings?.strategy||'smart_confluence'));setStrategy2(String(s?.settings?.strategy2||'none'));setStrategy3(String(s?.settings?.strategy3||'none'));}
    // Remote status refreshes must not overwrite a value the user is typing.
    if(!thresholdEditing.current)setThreshold(String(s?.settings?.futureDisplayThreshold||70));
  },[s?.settings?.forecastHorizonSeconds,s?.settings?.orderDurationMs,s?.settings?.futureDisplayThreshold,s?.settings?.strategy,s?.settings?.strategy2,s?.settings?.strategy3]);
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
  const liveDirection=m.entrySide||(!m.scenarioInactive?m.side:null);
  // Forecast CALL/PUT is not authorization to trade. Never use the word
  // "AGORA" outside a still-actionable, fresh and validated entry.
  const decisionLabel=m.entrySide?'ENTRADA CONFIRMADA AGORA':liveDirection?'SOMENTE PREVISÃO · SEM ENTRADA':m.scenarioInactive?'CENÁRIO FINALIZADO':'AGUARDANDO OPORTUNIDADE';
  const decisionArrow=liveDirection==='CALL'?'↑':liveDirection==='PUT'?'↓':'◇';
  const decisionText=m.entrySide?m.entrySide:liveDirection?('VIÉS '+liveDirection):m.scenarioInactive?'ENCERRADO':'SEM ENTRADA';
  // Large green/red is reserved for an actionable entry, not a forecast.
  const directionClass=m.entrySide==='CALL'?'call':m.entrySide==='PUT'?'put':'neutral';
  const reversalArrow=m.alert?.side==='CALL'?'↑':m.alert?.side==='PUT'?'↓':'◇';
  const mobileDirection=m.entrySide||null;
  const mobileScenarioDirection=!m.scenarioInactive&&m.side?m.side:null;
  const mobileArrow=(mobileDirection||mobileScenarioDirection)==='CALL'?'↑':(mobileDirection||mobileScenarioDirection)==='PUT'?'↓':'◇';
  // Show a SHORT headline: the previous 36-character mobile headline
  // overflowed the bordered card, including the word "ENTRADA".
  const mobileDecisionText=mobileDirection?mobileDirection+' AGORA':mobileScenarioDirection?'CENÁRIO '+mobileScenarioDirection:m.scenarioInactive?'ENCERRADO':'AGUARDANDO';
  const mobileDecisionLabel=mobileDirection?'ENTRADA CONFIRMADA':mobileScenarioDirection?'PREVISÃO · NÃO É ENTRADA':'SEM SINAL OPERACIONAL';
  const mobileWatchTone=!mobileDirection&&m.fresh&&mobileScenarioDirection?
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
  const opportunityNotice=<div className={`liveOpportunityState ${m.opportunityEnded?'ended':''}`} data-testid="entry-opportunity-state" role="status" aria-live="off">
    <span aria-hidden="true">◇</span><span>{m.scenarioInactive?'Cenário encerrado; aguardando nova análise':m.entrySide?'Entrada sinalizada · acompanhe a cotação':m.opportunityEnded?'Aguardando novo gatilho':'Observando um novo ponto de entrada'}</span>
  </div>;
  const scenarioClock=<div className="liveScenarioCountdown" data-testid="scenario-clock">
    <small>PRAZO DO CENÁRIO</small><strong>{m.scenarioInactive?'ENCERRADO':m.remaining!==null?m.remaining+'s':'—'}</strong>
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
  if(compact)return <section className={`liveScenario liveScenarioCompact ${m.tone}`} aria-label="Sentinel compacto flutuante" data-testid="live-scenario-compact">
    <header className="compactHeader"><div><small>SENTINEL · ANALISTA PC</small><b className="compactAsset">{m.asset}</b></div><button type="button" className="compactToggle" onClick={onToggleCompact} aria-label="Voltar ao Início do Sentinel">← Início</button></header>
    <div className={`liveDecision ${mobileDirection==='CALL'?'call':mobileDirection==='PUT'?'put':'neutral'} ${mobileWatchTone} ${m.entrySide?'actionable':''}`} data-testid="live-decision" role="status" aria-live="polite">
      <small>{mobileDecisionLabel}</small><strong><span aria-hidden="true">{mobileArrow}</span> {mobileDecisionText}</strong>
      <span className="mobileScenarioContext">{mobileDirection?'Gatilho de preço confirmado pelo PC':mobileScenarioDirection?'Aguarde o gatilho · cenário não é ordem':'Nenhuma entrada confirmada'}</span>
      <small className="mobileEntryWindow">{m.entrySide?'Entrada válida por '+m.entryRemaining+'s':m.fresh?'Acompanhando cotações · sem entrada agora':'Aguardando cotação e análise atuais'}</small>
    </div>
    <div className={`compactScenario ${m.fresh?m.scenarioTone:'neutral'}`}><div><small>CENÁRIO PRINCIPAL</small><strong>{m.scenarioLabel} · {m.state}</strong></div>{scenarioClock}</div>
    {opportunityNotice}
    {lastSignal?<div className="mobilePriceComparison" data-testid="mobile-price-comparison">
      <div><small>ÚLTIMO SINAL · {lastSignal.side}</small><strong>{price(lastSignal.price)}</strong></div>
      <div><small>COTAÇÃO AGORA</small><strong>{quoteValid?price(mobileQuote):'—'}</strong></div>
      <div className={`mobilePriceChange ${entryFavourable?'favourable':entryAgainst?'against':'neutral'}`}>
        <span>{trendLabel}</span><b>{priceChange}</b>
      </div>
    </div>:<div className="mobileCurrentQuoteOnly" data-testid="mobile-current-quote">
      <div><small>COTAÇÃO AGORA</small><strong>{quoteValid?price(mobileQuote):'—'}</strong></div>
      <span>{m.quoteFresh?'Cotação recebida agora':showLastQuote?'Última cotação · '+seconds(m.quoteAge)+' atrás':'Sem cotação recente'}</span>
    </div>}
    <div className="mobileBotControls" data-testid="compact-bot-controls">
      <button type="button" disabled={disabled||m.running||s?.killSwitch||s?.masterFrozen||!!s?.startBlockedReason} onClick={start}>{s?.state==='paused'?'Retomar':'Iniciar'}</button>
      <button type="button" disabled={disabled||s?.state!=='running'} onClick={()=>act('control/pause')}>Pausar</button>
      <button type="button" disabled={disabled||s?.state==='stopped'} onClick={()=>act('control/stop')}>Parar</button>
    </div>
    <div className={`mobileMonitorState ${m.quoteFresh?'':'delayed'}`} role="status">{m.quoteFresh?(pushed?'● AO VIVO · PUSH':'● COTAÇÃO RECENTE · '+seconds(m.quoteAge)+' atrás'):m.quoteAge!==null?'COTAÇÃO ATRASADA · '+seconds(m.quoteAge)+' atrás · SEM ENTRADA AGORA':'SEM COTAÇÃO ATUAL · AGUARDE A ATUALIZAÇÃO'}</div>
    <div className="mobileReversalObservation" data-testid="mobile-reversal-observation">
      <span>REVERSÃO · OBSERVAÇÃO</span>
      <strong>{m.alert?'Possível virada de '+(m.alert.side==='CALL'?'alta':'baixa'):m.fresh?'Monitorando reação do preço':'Aguardando dados'}</strong>
    </div>
    <details className="mobileTechnicalDetails" data-testid="mobile-technical-readings">
      <summary><span>LEITURA TÉCNICA · 3 TOTAIS</span><b>{totals.average===null?'—':`Média: alta ${totals.average}% · baixa ${100-totals.average}%`}</b></summary>
      <div className="compactTotals">
        {([['Mercado',totals.market],['Estratégias',totals.strategies],['Presente + futuro',totals.combined]] as const).map(([label,value])=><div key={label}><span>{label}</span><b>{value===null?'—':`Alta ${value}% · baixa ${100-Number(value)}%`}</b></div>)}
      </div>
      <div className="compactAverage" data-testid="compact-three-totals-average"><div><small>MÉDIA DOS 3 TOTAIS · LEITURA</small><strong>{totals.average===null?'—':`Alta ${totals.average}% · baixa ${100-totals.average}%`}</strong><span>Não é ordem de entrada.</span></div><label>Limite visual<input aria-label="Limite visual da média" type="text" inputMode="numeric" maxLength={2} value={averageInput} onFocus={e=>e.currentTarget.select()} onChange={e=>onAverageChange(e.target.value)} onBlur={commitAverage}/></label></div>
      {historicalNotice}
    </details>
    <div className="compactContext">Previsão {Math.round(Number(s?.settings?.forecastHorizonSeconds||60))}s · Expiração manual {Math.round(Number(s?.settings?.orderDurationMs||60000)/1000)}s</div>
    <footer>Leitura do PC. Cenário e médias não são ordens de entrada.</footer>
  </section>;
  return <section className={`liveScenario ${m.tone}`} aria-label="Cenário ao vivo" data-testid="live-scenario">
    <header><div><small>{m.asset} · LEITURA DO PC</small><h2>{m.scenarioLabel}</h2><b>{m.state}</b></div><div className="liveHeaderRight"><button type="button" className="compactToggle" onClick={onToggleCompact}>Modo flutuante ↘</button></div></header>
    <div className={`liveDecision ${directionClass} ${m.entrySide?'actionable':''}`} role="status" aria-live="polite" data-testid="live-decision"><small>{decisionLabel}</small><strong><span aria-hidden="true">{decisionArrow}</span> {decisionText}</strong><span>{m.entrySide?'JANELA DE ENTRADA '+m.entryRemaining+'s · confirme a expiração na corretora':m.scenarioInactive?'Cenário anterior encerrado; nenhuma entrada válida':liveDirection?'Direção do cenário · ainda não é entrada':'Aguardando dados e estrutura válida'}</span>{scenarioClock}</div>
    {opportunityNotice}
    <div className="liveScenarioMeta"><span>Cotação {price(quoteShown)}</span><span>{m.quoteAge===null?'Sem cotação':`Cotação recebida há ${m.quoteAge}s`}</span><span>{m.confidence===null?'':'Confiança '+m.confidence+' pts'}</span></div>
    {historicalNotice}
    {streamBadge}
    
    
    <div className={`liveReversal liveReversalState ${m.reversalTone} ${m.reversalTesting?'testing':''}`} role={m.alert?'status':undefined} aria-live="polite"><small>◈ SUBANALISTA · AVISO DE REVERSÃO</small><h3><span aria-hidden="true">{reversalArrow}</span> {m.subStatus}</h3>
      {m.alert?<><p>{m.alert.testing?'Reversão em teste':'Reversão com continuidade confirmada'}</p><div className="liveLevels"><span>Gatilho <b>{price(m.alert.trigger)}</b></span><span>Invalida <b>{price(m.alert.invalidation)}</b></span><span>Próximo nível <b>{price(m.alert.target)}</b></span></div></>:<p>{m.fresh?'Acompanhando o preço. Ainda sem reversão confirmada.':'A leitura será retomada quando chegarem dados atuais.'}</p>}
      <small>{m.fresh&&m.evaluationAt?'Última análise '+new Date(s?.lastResult?.analysis?.operationalSignal?.subanalyst?.checkedAt||m.evaluationAt).toLocaleTimeString('pt-BR'):'Sem análise atual'}</small>
    </div>
    <p className="mobileTechnicalNote">LEITURAS TÉCNICAS · NÃO SÃO ORDEM DE ENTRADA</p><div className="liveTotals">{[['Total Mercado',totals.market],['Total Estratégias',totals.strategies],['Presente + Futuro',totals.combined]].map(([label,value])=><div key={String(label)}><small>{label}</small><b>{value===null?'—':`CALL ${value}% · PUT ${100-Number(value)}%`}</b></div>)}</div>
    <div className="liveAverage"><div><small>MÉDIA DOS 3 TOTAIS</small><h3 className="liveAverageDirection">{totals.averageSide}</h3><h3 className="liveAverageMobile">{totals.average===null?'SEM LEITURA':totals.averageSide==='CALL'?'VIÉS DE ALTA':totals.averageSide==='PUT'?'VIÉS DE BAIXA':'SEM VIÉS DEFINIDO'}</h3><span>{totals.average===null?'—':`CALL ${totals.average}% · PUT ${100-totals.average}%`}</span></div><label>Limite visual %<input aria-label="Limite visual da média" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={averageInput} onFocus={e=>e.currentTarget.select()} onChange={e=>onAverageChange(e.target.value)} onBlur={commitAverage}/></label></div>
    <div className="liveControls"><button className="primary" disabled={disabled||s?.state==='running'||s?.killSwitch||s?.masterFrozen||!!s?.startBlockedReason} onClick={start}>{s?.state==='paused'?'Retomar análise':'Iniciar análise'}</button><button className="secondary" disabled={disabled||s?.state!=='running'} onClick={()=>act('control/pause')}>Pausar análise</button><button className="secondary" disabled={disabled||s?.state==='stopped'} onClick={()=>act('control/stop')}>Parar análise</button></div>
    <details className="liveSettings"><summary>Ajustar cenário</summary><div><label>Prazo da previsão<select value={horizon} onChange={e=>{settingsEditing.current=true;setHorizon(e.target.value)}}>{[30,60,120,300,600,900,3600].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>Expiração (manual)<select aria-label="Expiração escolhida manualmente" value={expirySeconds} onChange={e=>{settingsEditing.current=true;setExpirySeconds(e.target.value)}}>{[30,60,120,300,600,900].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>Estratégia 1<select aria-label="Estratégia 1" value={strategy1} onChange={e=>{settingsEditing.current=true;setStrategy1(e.target.value)}}>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Estratégia 2<select aria-label="Estratégia 2" value={strategy2} onChange={e=>{settingsEditing.current=true;setStrategy2(e.target.value)}}><option value="none">Não selecionada</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Estratégia 3<select aria-label="Estratégia 3" value={strategy3} onChange={e=>{settingsEditing.current=true;setStrategy3(e.target.value)}}><option value="none">Não selecionada</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><p data-testid="strategy-selection-advice" role="note" style={{gridColumn:'1 / -1',fontSize:11,opacity:.85,margin:'4px 0'}}>
      <b>Combinação:</b> {strategyAdvice.message} <span>· {strategyAdvice.recommendation}</span>
    </p><label>Limite do Cenário %<input aria-label="Limite do Cenário" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={threshold} onFocus={e=>{thresholdEditing.current=true;e.currentTarget.select()}} onChange={e=>onScenarioChange(e.target.value)} onBlur={commitScenario}/></label><button className="secondary" disabled={disabled||!Number.isFinite(Number(threshold))||Number(threshold)<50||Number(threshold)>95} onClick={applyScenario}>Aplicar</button></div></details>
    <footer>Escolha até 3 estratégias e toque em “Aplicar” para sincronizar a análise no PC. Previsão e prazo do cenário não são a expiração da corretora. Confira o vencimento no aplicativo; o limite visual vale apenas nesta tela.</footer>
  </section>
}

'use client';
import {useEffect,useRef,useState} from 'react';
import {liveCardModel} from '../lib/live-card-model';

type Props={s:any,busy:boolean,act:(path:string,body?:any)=>Promise<any>,compact:boolean,onToggleCompact:()=>void};
const STRATEGIES=[['smart_confluence','Smart Confluence'],['price_action','Price Action'],['trendline_breakout','Trendline Breakout'],['support_resistance','Suporte / Resistência'],['fibonacci_retest','Fibonacci Retest'],['trend','Trend Following'],['mean_reversion','Mean Reversion'],['breakout','Breakout']] as const;
const price=(n:any)=>n==null?'—':Number(n).toFixed(5);
const clock=(ts:number|null)=>ts!=null&&Number.isFinite(ts)&&ts>0?new Date(ts).toLocaleTimeString('pt-BR',{hour12:false}):'—';
const seconds=(n:number|null)=>n===null?'—':n+'s';
export function LiveScenarioCard({s,busy,act,compact,onToggleCompact}:Props){
  const[now,setNow]=useState(()=>Date.now());
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
  const diagnostic=<details className="liveTiming"><summary>Diagnóstico de atualização</summary>
    <div>Cotação recebida há <b>{seconds(m.quoteAge)}</b> · análise recebida há <b>{seconds(m.analysisAge)}</b></div>
    <div>Hora da última cotação: <b>{clock(m.quoteAt)}</b> · última análise: <b>{clock(m.evaluationAt)}</b></div>
    <div>Início do cenário: <b>{clock(m.signalCreatedAt)}</b> · subanalista conferiu: <b>{clock(m.reversalCheckedAt)}</b></div>
    <small>Tempos reportados pelo Agent; não medem sozinhos a latência da corretora ou o atraso de decisão.</small>
  </details>;
  if(compact)return <section className={`liveScenario liveScenarioCompact ${m.tone}`} aria-label="Sentinel compacto flutuante" data-testid="live-scenario-compact">
    <header className="compactHeader"><div><small>SENTINEL · ANALISTA PC</small><b className="compactAsset">{m.asset}</b></div><button type="button" className="compactToggle" onClick={onToggleCompact} aria-label="Voltar ao card completo">Expandir ↗</button></header>
    <div className="compactScenario"><div><small>{m.scenarioLabel}</small><strong>{m.state}</strong></div><div className="compactCountdown"><small>PRAZO DO CENÁRIO</small><b>{m.remaining!==null?m.remaining+'s':'—'}</b></div></div>
    <div className="compactQuote"><span><small>COTAÇÃO DO PC</small><b>{price(quoteShown)}</b></span><small>{m.fresh?'Dado '+seconds(m.quoteAge)+' atrás':'DADO INDISPONÍVEL'}</small></div>
    {historicalNotice}
    {streamBadge}
    <div className="compactReversal"><small>SUBANALISTA · REVERSÃO</small><strong>{m.subStatus}</strong>{m.alert&&<small>Gatilho {price(m.alert.trigger)} · Invalida {price(m.alert.invalidation)}</small>}</div>
    <div className="compactTotals">
      {([['Mercado',totals.market],['Estratégias',totals.strategies],['Presente + futuro',totals.combined]] as const).map(([label,value])=><div key={label}><span>{label}</span><b>{value===null?'—':`CALL ${value}% · PUT ${100-Number(value)}%`}</b></div>)}
    </div>
    <div className="compactAverage"><div><small>MÉDIA DOS 3 TOTAIS · INDICATIVA</small><strong>{totals.averageSide}</strong><span>{totals.average===null?'—':`CALL ${totals.average}% · PUT ${100-totals.average}%`}</span></div><label>Limite visual<input aria-label="Limite visual da média" type="text" inputMode="numeric" maxLength={2} value={averageInput} onFocus={e=>e.currentTarget.select()} onChange={e=>onAverageChange(e.target.value)} onBlur={commitAverage}/></label></div>
    <div className="compactContext">Previsão {Math.round(Number(s?.settings?.forecastHorizonSeconds||60))}s · Prazo configurado {Math.round(Number(s?.settings?.orderDurationMs||60000)/1000)}s <b>≠ expiração no app</b></div>
    {diagnostic}
    <footer>Somente análise. Confira ativo, entrada e vencimento na corretora. CALL/PUT aqui não executa ordens.</footer>
  </section>;
  return <section className={`liveScenario ${m.tone}`} aria-label="Cenário ao vivo" data-testid="live-scenario">
    <header><div><small>{m.asset} · LEITURA DO PC</small><h2>{m.scenarioLabel}</h2><b>{m.state}</b></div><div className="liveHeaderRight"><strong>{m.remaining!==null?'PRAZO DO CENÁRIO '+m.remaining+'s':'SEM JANELA ATIVA'}</strong><button type="button" className="compactToggle" onClick={onToggleCompact}>Modo flutuante ↘</button></div></header>
    <div className="liveScenarioMeta"><span>Cotação {price(quoteShown)}</span><span>{m.quoteAge===null?'Sem cotação':`Cotação recebida há ${m.quoteAge}s`}</span><span>{m.confidence===null?'':'Confiança '+m.confidence+' pts'}</span></div>
    {historicalNotice}
    {streamBadge}
    {m.scenarioInactive&&<p className="liveInactiveNotice">Cenário anterior encerrado ou invalidado. Não é uma nova indicação de entrada.</p>}
    <div className="liveReversal"><small>SUBANALISTA · AVISO DE REVERSÃO</small><h3>{m.subStatus}</h3>
      {m.alert?<><p>{m.alert.testing?'Reversão em teste':'Reversão com continuidade confirmada'}</p><div className="liveLevels"><span>Gatilho <b>{price(m.alert.trigger)}</b></span><span>Invalida <b>{price(m.alert.invalidation)}</b></span><span>Próximo nível <b>{price(m.alert.target)}</b></span></div></>:<p>{m.fresh?'Acompanhando o preço. Ainda sem reversão confirmada.':'A leitura será retomada quando chegarem dados atuais.'}</p>}
      <small>{m.fresh&&m.evaluationAt?'Última análise '+new Date(s?.lastResult?.analysis?.operationalSignal?.subanalyst?.checkedAt||m.evaluationAt).toLocaleTimeString('pt-BR'):'Sem análise atual'}</small>
    </div>
    <div className="liveTotals">{[['Total Mercado',totals.market],['Total Estratégias',totals.strategies],['Presente + Futuro',totals.combined]].map(([label,value])=><div key={String(label)}><small>{label}</small><b>{value===null?'—':`CALL ${value}% · PUT ${100-Number(value)}%`}</b></div>)}</div>
    <div className="liveAverage"><div><small>MÉDIA DOS 3 TOTAIS</small><h3>{totals.averageSide}</h3><span>{totals.average===null?'—':`CALL ${totals.average}% · PUT ${100-totals.average}%`}</span></div><label>Limite visual %<input aria-label="Limite visual da média" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={averageInput} onFocus={e=>e.currentTarget.select()} onChange={e=>onAverageChange(e.target.value)} onBlur={commitAverage}/></label></div>
    {diagnostic}
    <div className="liveControls"><button className="primary" disabled={disabled||s?.state==='running'||s?.killSwitch||s?.masterFrozen||!!s?.startBlockedReason} onClick={start}>{s?.state==='paused'?'Retomar análise':'Iniciar análise'}</button><button className="secondary" disabled={disabled||s?.state!=='running'} onClick={()=>act('control/pause')}>Pausar análise</button><button className="secondary" disabled={disabled||s?.state==='stopped'} onClick={()=>act('control/stop')}>Parar análise</button></div>
    <details className="liveSettings"><summary>Ajustar cenário</summary><div><label>Prazo da previsão<select value={horizon} onChange={e=>{settingsEditing.current=true;setHorizon(e.target.value)}}>{[30,60,120,300,600,900,3600].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>Expiração (manual)<select aria-label="Expiração escolhida manualmente" value={expirySeconds} onChange={e=>{settingsEditing.current=true;setExpirySeconds(e.target.value)}}>{[30,60,120,300,600,900].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>Estratégia 1<select aria-label="Estratégia 1" value={strategy1} onChange={e=>{settingsEditing.current=true;setStrategy1(e.target.value)}}>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Estratégia 2<select aria-label="Estratégia 2" value={strategy2} onChange={e=>{settingsEditing.current=true;setStrategy2(e.target.value)}}><option value="none">Não selecionada</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Estratégia 3<select aria-label="Estratégia 3" value={strategy3} onChange={e=>{settingsEditing.current=true;setStrategy3(e.target.value)}}><option value="none">Não selecionada</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Limite do Cenário %<input aria-label="Limite do Cenário" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={threshold} onFocus={e=>{thresholdEditing.current=true;e.currentTarget.select()}} onChange={e=>onScenarioChange(e.target.value)} onBlur={commitScenario}/></label><button className="secondary" disabled={disabled||!Number.isFinite(Number(threshold))||Number(threshold)<50||Number(threshold)>95} onClick={applyScenario}>Aplicar no PC</button></div></details>
    <footer>Escolha até 3 estratégias e toque em “Aplicar no PC” para sincronizar o card do computador. Previsão e prazo do cenário não são a expiração da corretora. Confira o vencimento no aplicativo; o limite visual vale apenas nesta tela.</footer>
  </section>
}

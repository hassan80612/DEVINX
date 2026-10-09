'use client';
import {useEffect,useRef,useState} from 'react';
import {liveCardModel} from '../lib/live-card-model';

type Props={s:any,busy:boolean,act:(path:string,body?:any)=>Promise<any>};
const STRATEGIES=[['smart_confluence','Smart Confluence'],['price_action','Price Action'],['trendline_breakout','Trendline Breakout'],['support_resistance','Suporte / Resistência'],['fibonacci_retest','Fibonacci Retest'],['trend','Trend Following'],['mean_reversion','Mean Reversion'],['breakout','Breakout']] as const;
const price=(n:any)=>n==null?'—':Number(n).toFixed(5);
export function LiveScenarioCard({s,busy,act}:Props){
  const[now,setNow]=useState(()=>Date.now());
  const[averageThreshold,setAverageThreshold]=useState(60);
  const[averageInput,setAverageInput]=useState('60');
  const thresholdEditing=useRef(false);
  const settingsEditing=useRef(false);
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
  return <section className={`liveScenario ${m.tone}`} aria-label="Cenário ao vivo" data-testid="live-scenario">
    <header><div><small>{m.asset} · LEITURA DO PC</small><h2>{m.side?'CENÁRIO '+m.side:'CENÁRIO'}</h2><b>{m.state}</b></div><strong>{m.remaining!==null?'FECHA EM '+m.remaining+'s':'—'}</strong></header>
    <div className="liveScenarioMeta"><span>Cotação {price(m.fresh?s?.feed?.price:null)}</span><span>{m.quoteAge===null?'Sem cotação':`Cotação recebida há ${m.quoteAge}s`}</span><span>{m.confidence===null?'':'Confiança '+m.confidence+' pts'}</span></div>
    <div className="liveReversal"><small>SUBANALISTA · AVISO DE REVERSÃO</small><h3>{m.subStatus}</h3>
      {m.alert?<><p>{m.alert.testing?'Reversão em teste':'Reversão com continuidade confirmada'}</p><div className="liveLevels"><span>Gatilho <b>{price(m.alert.trigger)}</b></span><span>Invalida <b>{price(m.alert.invalidation)}</b></span><span>Próximo nível <b>{price(m.alert.target)}</b></span></div></>:<p>{m.fresh?'Acompanhando o preço. Ainda sem reversão confirmada.':'A leitura será retomada quando chegarem dados atuais.'}</p>}
      <small>{m.fresh&&m.evaluationAt?'Última análise '+new Date(s?.lastResult?.analysis?.operationalSignal?.subanalyst?.checkedAt||m.evaluationAt).toLocaleTimeString('pt-BR'):'Sem análise atual'}</small>
    </div>
    <div className="liveTotals">{[['Total Mercado',m.market],['Total Estratégias',m.strategies],['Presente + Futuro',m.combined]].map(([label,value])=><div key={String(label)}><small>{label}</small><b>{value===null?'—':`CALL ${value}% · PUT ${100-Number(value)}%`}</b></div>)}</div>
    <div className="liveAverage"><div><small>MÉDIA DOS 3 TOTAIS</small><h3>{m.averageSide}</h3><span>{m.average===null?'—':`CALL ${m.average}% · PUT ${100-m.average}%`}</span></div><label>Limite visual %<input aria-label="Limite visual da média" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={averageInput} onFocus={e=>e.currentTarget.select()} onChange={e=>onAverageChange(e.target.value)} onBlur={commitAverage}/></label></div>
    <div className="liveControls"><button className="primary" disabled={disabled||s?.state==='running'||s?.killSwitch||s?.masterFrozen||!!s?.startBlockedReason} onClick={start}>{s?.state==='paused'?'Retomar análise':'Iniciar análise'}</button><button className="secondary" disabled={disabled||s?.state!=='running'} onClick={()=>act('control/pause')}>Pausar análise</button><button className="secondary" disabled={disabled||s?.state==='stopped'} onClick={()=>act('control/stop')}>Parar análise</button></div>
    <details className="liveSettings"><summary>Ajustar cenário</summary><div><label>Prazo da previsão<select value={horizon} onChange={e=>{settingsEditing.current=true;setHorizon(e.target.value)}}>{[30,60,120,300,600,900,3600].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>Expiração (manual)<select aria-label="Expiração escolhida manualmente" value={expirySeconds} onChange={e=>{settingsEditing.current=true;setExpirySeconds(e.target.value)}}>{[30,60,120,300,600,900].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>Estratégia 1<select aria-label="Estratégia 1" value={strategy1} onChange={e=>{settingsEditing.current=true;setStrategy1(e.target.value)}}>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Estratégia 2<select aria-label="Estratégia 2" value={strategy2} onChange={e=>{settingsEditing.current=true;setStrategy2(e.target.value)}}><option value="none">Não selecionada</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Estratégia 3<select aria-label="Estratégia 3" value={strategy3} onChange={e=>{settingsEditing.current=true;setStrategy3(e.target.value)}}><option value="none">Não selecionada</option>{STRATEGIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Limite do Cenário %<input aria-label="Limite do Cenário" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={threshold} onFocus={e=>{thresholdEditing.current=true;e.currentTarget.select()}} onChange={e=>onScenarioChange(e.target.value)} onBlur={commitScenario}/></label><button className="secondary" disabled={disabled||!Number.isFinite(Number(threshold))||Number(threshold)<50||Number(threshold)>95} onClick={applyScenario}>Aplicar no PC</button></div></details>
    <footer>Escolha até 3 estratégias e toque em “Aplicar no PC” para sincronizar o card do computador. Previsão e expiração são independentes. Confira o vencimento na corretora; o limite visual vale apenas nesta tela.</footer>
  </section>
}

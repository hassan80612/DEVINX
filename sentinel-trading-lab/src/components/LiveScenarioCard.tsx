'use client';
import {useEffect,useState} from 'react';
import {liveCardModel} from '../lib/live-card-model';

type Props={s:any,busy:boolean,act:(path:string,body?:any)=>Promise<any>};
const price=(n:any)=>n==null?'—':Number(n).toFixed(5);
export function LiveScenarioCard({s,busy,act}:Props){
  const[now,setNow]=useState(()=>Date.now());
  const[averageThreshold,setAverageThreshold]=useState(60);
  const[horizon,setHorizon]=useState(String(s?.settings?.forecastHorizonSeconds||60));
  const[threshold,setThreshold]=useState(String(s?.settings?.futureDisplayThreshold||70));
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[]);
  useEffect(()=>{setHorizon(String(s?.settings?.forecastHorizonSeconds||60));setThreshold(String(s?.settings?.futureDisplayThreshold||70))},[s?.settings?.forecastHorizonSeconds,s?.settings?.futureDisplayThreshold]);
  const m=liveCardModel(s,now,averageThreshold);
  const disabled=busy||!m.online;
  const start=async()=>{if(await act('settings',{demoAutopilot:false})!==false)await act('control/start')};
  return <section className={`liveScenario ${m.tone}`} aria-label="Cenário ao vivo" data-testid="live-scenario">
    <header><div><small>{m.asset} · LEITURA DO PC</small><h2>{m.side?'CENÁRIO '+m.side:'CENÁRIO'}</h2><b>{m.state}</b></div><strong>{m.remaining!==null?'FECHA EM '+m.remaining+'s':'—'}</strong></header>
    <div className="liveScenarioMeta"><span>Cotação {price(m.fresh?s?.feed?.price:null)}</span><span>{m.quoteAge===null?'Sem cotação':`Cotação recebida há ${m.quoteAge}s`}</span><span>{m.confidence===null?'':'Confiança '+m.confidence+' pts'}</span></div>
    <div className="liveReversal"><small>SUBANALISTA · AVISO DE REVERSÃO</small><h3>{m.subStatus}</h3>
      {m.alert?<><p>{m.alert.testing?'Reversão em teste':'Reversão com continuidade confirmada'}</p><div className="liveLevels"><span>Gatilho <b>{price(m.alert.trigger)}</b></span><span>Invalida <b>{price(m.alert.invalidation)}</b></span><span>Próximo nível <b>{price(m.alert.target)}</b></span></div></>:<p>{m.fresh?'Acompanhando o preço. Ainda sem reversão confirmada.':'A leitura será retomada quando chegarem dados atuais.'}</p>}
      <small>{m.fresh&&m.evaluationAt?'Última análise '+new Date(m.evaluationAt).toLocaleTimeString('pt-BR'):'Sem análise atual'}</small>
    </div>
    <div className="liveTotals">{[['Total Mercado',m.market],['Total Estratégias',m.strategies],['Presente + Futuro',m.combined]].map(([label,value])=><div key={String(label)}><small>{label}</small><b>{value===null?'—':`CALL ${value}% · PUT ${100-Number(value)}%`}</b></div>)}</div>
    <div className="liveAverage"><div><small>MÉDIA DOS 3 TOTAIS</small><h3>{m.averageSide}</h3><span>{m.average===null?'—':`CALL ${m.average}% · PUT ${100-m.average}%`}</span></div><label>Limite visual %<input aria-label="Limite visual da média" type="number" min="50" max="95" value={averageThreshold} onChange={e=>setAverageThreshold(Math.max(50,Math.min(95,Number(e.target.value)||50)))}/></label></div>
    <div className="liveControls"><button className="primary" disabled={disabled||s?.state==='running'||s?.killSwitch||s?.masterFrozen||!!s?.startBlockedReason} onClick={start}>{s?.state==='paused'?'Retomar análise':'Iniciar análise'}</button><button className="secondary" disabled={disabled||s?.state!=='running'} onClick={()=>act('control/pause')}>Pausar análise</button><button className="secondary" disabled={disabled||s?.state==='stopped'} onClick={()=>act('control/stop')}>Parar análise</button></div>
    <details className="liveSettings"><summary>Ajustar cenário</summary><div><label>Prazo da previsão<select value={horizon} onChange={e=>setHorizon(e.target.value)}>{[30,60,120,300,600,900,3600].map(n=><option key={n} value={n}>{n<60?n+'s':n/60+' min'}</option>)}</select></label><label>Limite do Cenário %<input type="number" min="50" max="95" value={threshold} onChange={e=>setThreshold(e.target.value)}/></label><button className="secondary" disabled={disabled||!Number.isFinite(Number(threshold))||Number(threshold)<50||Number(threshold)>95} onClick={()=>act('settings',{forecastHorizonSeconds:Number(horizon),futureDisplayThreshold:Number(threshold)})}>Aplicar no PC</button></div></details>
    <footer>O PC precisa ficar ligado com o Agent e a corretora abertos. A média é apenas observação; seu limite visual vale nesta tela. Confiança em pontos não é taxa de acerto.</footer>
  </section>
}

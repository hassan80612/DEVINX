'use client';

/**
 * Read-only experimental conclusions and mobile settings. The main live
 * projection remains independently owned by the user's chosen strategy.
 */
type Props={s:any,busy:boolean,act:(path:string,body?:any)=>Promise<any>};
const pairs={
  reversal:'Mean Reversion 70 + Smart Confluence 67',
  levels_breakout:'Suporte/Resistência 67 + Breakout 67',
  retest:'Mean Reversion 70 + Fibonacci Retest 70'
} as const;
const labels:Record<string,string>={
  automatic:'Geral · precisa confirmar trajetória',
  price_action:'Impulsos e rejeições',
  support_resistance:'Reações em níveis históricos',
  trend:'Tendências persistentes',
  mean_reversion:'Lateralização e retorno à média',
  breakout:'Rompimentos e falsos rompimentos',
  trendline_breakout:'Quebras de pivôs confirmados',
  fibonacci_retest:'Retrações estruturais',
  smart_confluence:'Confluência técnica interna'
};
const fmtTime=(values:any)=>Array.isArray(values)&&values.length===2?
  values.map((v:any)=>Number.isFinite(Number(v))?Math.round(Number(v)):'?').join('–')+'s':'não disponível';
const seconds=(v:number)=>v>=60?v/60+' min':v+'s';

export function MobileExperimentalControls({s,busy,act}:Props){
 const settings=s?.settings||{},vnext=s?.lastResult?.analysis?.vnext||{};
 const advisory=vnext.strategyAdvisor||null,fp=vnext.generalFutureResearch||vnext.general180Research||null,combo=vnext.combinedResearch||null;
 const sa=Array.isArray(vnext.sa)?vnext.sa:null;
 const fr=Array.isArray(vnext.fp)?vnext.fp:null;
 const pair=Array.isArray(vnext.tp)?vnext.tp:null;
 const mode=settings.pairResearchEnabled===true?'pair':'single';
 const pairId=String(combo?.pairId||pair?.[0]||settings.pairResearchId||'reversal');
 const pairName=pairs[pairId as keyof typeof pairs]||'Sem dupla válida';
 const pairSide=combo?.selected?.side||pair?.[2]||null;
 const currentSide=fp?.confirmedSide||fr?.[1]||null;
 const peaks=fp?.possibleExtremes?.peak?.windowSeconds||fr?.[3]||null;
 const troughs=fp?.possibleExtremes?.trough?.windowSeconds||fr?.[4]||null;
 const phase=advisory?.marketPhaseLabel||sa?.[0]||'Histórico insuficiente';
 const assessment=advisory?.selectedInterpretation||sa?.[1]||'Em análise';
 const suggestion=advisory?.recommended?.name||sa?.[2]||null;
 const chartContext=advisory?.chartContext||sa?.[3]||'Análise por estrutura e prazo';
 const selected=String(settings.engine||'automatic');
 const own=vnext.forecastOwner||null;
 const route=Array.isArray(vnext.ow)?vnext.ow:null;
 const actual=own?.effectiveEngine||route?.[1]||selected;
 const using=selected==='automatic'&&actual!=='automatic'
  ?'Automático usa '+actual.replaceAll('_',' ')
  :selected==='automatic'?'Automático · previsão geral':'Manual · '+selected.replaceAll('_',' ');

 const update=(values:Record<string,any>)=>{void act('settings',values)};
 const sel={display:'block',width:'100%',minWidth:0,marginTop:4,padding:'8px 6px',
  borderRadius:6} as const;
 const field={display:'block',fontWeight:650,fontSize:12,minWidth:0} as const;
 return <section data-testid="mobile-experimental-research"
   style={{margin:'10px 0',padding:10,border:'1px solid rgba(215,182,93,.38)',
    borderRadius:10,display:'grid',gap:8,minWidth:0,fontSize:12}}>
   <strong>PREVISÃO · {Number(settings.orderDurationMs||60000)/1000}s</strong>
   <div data-testid="mobile-context-guide">{using}</div>
   <div data-testid="mobile-future-path-summary">
     {settings.futureSignalFilterEnabled===true?(vnext.futureQualification?.confirmed||vnext.fq?.[1]?'Histórico confirmou':'AGUARDAR confirmação'):(currentSide?'Histórico confirma '+currentSide:'Histórico sem confirmação')}
     {' '}· {phase}
   </div>
   {mode==='pair'&&<div data-testid="mobile-pair-research">Dupla: {pairName} · {pairSide||'AGUARDAR'}</div>}
   <details data-testid="mobile-strategy-pair-controls">
     <summary style={{cursor:'pointer',padding:'7px 2px',fontWeight:800}}>⚙ Ajustes de previsão</summary>
     <div style={{display:'grid',gap:10,marginTop:9,minWidth:0}}>
       {selected==='automatic'&&<label style={field}>Automático escolhe a estratégia para o cálculo
         <select aria-label="Roteamento automático de estratégias" style={sel} disabled={busy}
           value={settings.autoRoutingEnabled===true?'true':'false'}
           onChange={e=>update({autoRoutingEnabled:e.target.value==='true'})}>
           <option value="true">Ligado · teste não validado</option>
           <option value="false">Desligado · previsão geral</option>
         </select>
       </label>}
       <label style={field}>Modo de estratégia
         <select aria-label="Modo de estratégia" disabled={busy} style={sel} value={mode}
           onChange={e=>update({pairResearchEnabled:e.target.value==='pair'})}>
           <option value="single">Estratégia única</option>
           <option value="pair">Combinação de duas · pesquisa</option>
         </select>
       </label>
       <label style={field}>Escolha entre três combinações
         <select aria-label="Combinação de duas estratégias" disabled={busy} style={sel}
           value={String(settings.pairResearchId||'reversal')}
           onChange={e=>update({pairResearchId:e.target.value})}>
           {Object.entries(pairs).map(([id,label])=><option value={id} key={id}>{label}</option>)}
         </select>
       </label>
       <label style={field}>Modo de entrada
         <select aria-label="Modo de entrada futura" disabled={busy} style={sel}
           value={settings.entryTimeMode||'fixed'}
           onChange={e=>update({entryTimeMode:e.target.value})}>
           <option value="fixed">Entrada com prazo fixo</option>
           <option value="automatic">Automática · por previsão</option>
         </select>
       </label>
       {settings.entryTimeMode!=='automatic'&&<label style={field}>Aguardar para entrar
         <select aria-label="Segundos até a entrada" disabled={busy} style={sel}
           value={Number(settings.entryLeadSeconds||30)}
           onChange={e=>update({entryLeadSeconds:Number(e.target.value)})}>
           {[5,10,15,30,60,120,300].map(v=><option value={v} key={v}>{seconds(v)}</option>)}
         </select>
       </label>}
       <label style={field}>Duração da operação depois da entrada
         <select aria-label="Duração independente da operação" disabled={busy} style={sel}
           value={Number(settings.holdingSeconds||60)}
           onChange={e=>update({holdingSeconds:Number(e.target.value)})}>
           {[15,30,45,60,120,180,300,600,900].map(v=><option value={v} key={v}>{seconds(v)}</option>)}
         </select>
       </label>
       <label style={field}>Observação das nove estratégias
         <select aria-label="Orientação por contexto" disabled={busy} style={sel}
           value={settings.strategyAdvisorEnabled===true?'true':'false'}
           onChange={e=>update({strategyAdvisorEnabled:e.target.value==='true'})}>
           <option value="false">Desativada</option><option value="true">Ativada</option>
         </select>
       </label>
       <label style={field}>Orientação contextual
         <select aria-label="Modo de orientação" disabled={busy} style={sel}
           value={settings.strategyAdvisorMode||'manual'}
           onChange={e=>update({strategyAdvisorMode:e.target.value})}>
           <option value="manual">Manual · minha estratégia permanece</option>
           <option value="automatic_advisory">Automático · apenas indica contexto</option>
         </select>
       </label>
       <label style={field}>Filtrar previsão
         <select aria-label="Exigir confirmação histórica para CALL e PUT" disabled={busy} style={sel}
           value={settings.futureSignalFilterEnabled===true?'true':'false'}
           onChange={e=>update({futureSignalFilterEnabled:e.target.value==='true'})}>
           <option value="false">Desligado · previsão original</option>
           <option value="true">Ligado · AGUARDAR sem confirmação</option>
         </select>
       </label>
       <label style={field}>Histórico da previsão futura
         <select aria-label="Comparação por trajetória" disabled={busy} style={sel}
           value={settings.futureResearchEnabled===true?'true':'false'}
           onChange={e=>update({futureResearchEnabled:e.target.value==='true'})}>
           <option value="false">Desativada</option>
           <option value="true">Confirmar pelo histórico</option>
         </select>
       </label>
       <details>
         <summary style={{cursor:'pointer'}}>Onde usar cada uma das nove estratégias</summary>
         <div style={{display:'grid',gap:5,padding:'8px 2px'}}>
           {Object.entries(labels).map(([id,label])=><small key={id}>{id.replaceAll('_',' ')}: {label}</small>)}
         </div>
       </details>
       <small>As três combinações são experimentais. Nenhum desses controles envia CALL ou PUT.
         Não existem percentuais de acerto calibrados da corretora nesta análise.</small>
     </div>
   </details>
 </section>
}

'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';

type Status=any;
const tabDefs=[
  {key:'Dashboard',label:'Início',icon:'⌂',group:'Visão geral',title:'Sentinel 13.1',subtitle:'Resumo da conta, do Agent e da sessão em andamento.'},
  {key:'Bot Control',label:'Piloto DEMO',icon:'◉',group:'Operação',title:'Piloto automático DEMO',subtitle:'Arme a automação somente na conta DEMO da própria corretora, com limites de sessão.'},
  {key:'Market Analysis',label:'Mercado',icon:'⌁',group:'Operação',title:'Análise de mercado',subtitle:'Sinal, confiança, indicadores e motivos da decisão.'},
  {key:'Trades / History',label:'Histórico',icon:'≡',group:'Operação',title:'Operações e histórico',subtitle:'Revise entradas DEMO, resultados e desempenho da sessão.'},
  {key:'Broker Connection',label:'Corretora',icon:'⇄',group:'Conta',title:'Corretora conectada',subtitle:'O Sentinel acompanha a conta REAL ou DEMO que estiver ativa dentro da IQ Option/Exnova.'},
  {key:'Risk & Limits',label:'Risco',icon:'⛨',group:'Conta',title:'Risco e limites',subtitle:'Defina stake e travas automáticas antes de armar o piloto DEMO.'},
  {key:'Settings',label:'Conta & Agent',icon:'⚙',group:'Conta',title:'Conta & Agent',subtitle:'Licença, PC vinculado e segurança da sessão.'},
  {key:'Strategies',label:'Estratégias',icon:'◇',group:'Avançado',title:'Estratégias',subtitle:'Ajustes avançados do motor técnico.'},
  {key:'Scheduler',label:'Agenda',icon:'◷',group:'Avançado',title:'Agenda',subtitle:'Janela de funcionamento e prazo das operações.'},
  {key:'Logs / Diagnostics',label:'Diagnóstico',icon:'⌘',group:'Avançado',title:'Diagnóstico',subtitle:'Auditoria, incidentes e saúde técnica do Agent.'},
  {key:'Master Console',label:'Master',icon:'◆',group:'Admin',title:'Master Sentinel',subtitle:'Clientes, acessos, PCs, presença online e suporte remoto.'},
] as const;
const money=(n:any)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0));
const pct=(n:any)=>`${Number(n||0).toFixed(1)}%`;
const tm=(ts:any)=>ts?new Date(ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
function Metric({label,value,sub}:{label:string,value:string,sub?:string}){return <div className="metric"><small>{label}</small><b>{value}</b>{sub&&<em>{sub}</em>}</div>}
function Pill({children,tone='neutral'}:{children:any,tone?:string}){return <span className={`pill ${tone}`}>{children}</span>}
function friendlyError(error:any){
  const m=String(error?.message||error||'');
  const map:Record<string,string>={
    pc_offline:'Agent do PC está offline. Abra o Sentinel Agent no computador e tente novamente.',
    pc_nao_vinculado:'Este PC ainda não está vinculado à sua conta.',
    agent_access_required:'Esta conta ainda não tem acesso liberado ao Agent.',
    agent_access_inactive:'O acesso deste Agent está bloqueado ou vencido.',
    subscription_inactive:'O acesso deste Agent está bloqueado ou vencido.',
    agent_not_paired:'O Agent ainda não está vinculado à conta.',
    limite_de_pcs:'O limite de computadores desta conta foi atingido.',
    replace_device_required:'Escolha qual computador antigo deseja substituir antes de vincular este.',
    broker_open_requires_manual_action:'Use o botão Abrir corretora para iniciar a primeira sessão.',
    broker_open_timeout:'O Agent tentou abrir a corretora, mas o navegador não respondeu a tempo. Reinicie o Agent e tente novamente.',
    chrome_or_edge_not_found:'O Agent não encontrou Google Chrome ou Microsoft Edge neste PC. Instale um dos dois e reinicie o Agent.',
    browser_debug_port_not_ready:'O navegador da corretora não abriu corretamente. Reinicie o Agent e tente de novo.',
    background_browser_debug_port_not_ready:'A sessão em segundo plano não iniciou. Reinicie o Agent.',
    broker_session_not_detected:'A sessão da corretora não foi encontrada. Abra a corretora e faça login novamente.'
  };
  return map[m]||m.replaceAll('_',' ');
}

const LOCAL_WORKER='http://127.0.0.1:8787';
const LOCAL_MANAGER='http://127.0.0.1:8788';
async function rawLocal(base:string,path:string,method='GET',body?:any,timeout=1800){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
  try{const init:any={method,headers:{'content-type':'application/json'},cache:'no-store',signal:controller.signal,targetAddressSpace:'loopback'};if(body!==undefined)init.body=JSON.stringify(body);const r=await fetch(`${base}/${path.replace(/^\//,'')}`,init);const j=await r.json().catch(()=>({}));if(!r.ok||j?.ok===false)throw new Error(j?.error||`local_${r.status}`);return j?.data??j}finally{clearTimeout(timer)}
}
const localFetch=(path:string,method='GET',body?:any,timeout=2200)=>rawLocal(LOCAL_WORKER,path,method,body,timeout);
const managerFetch=(path:string,method='GET',body?:any,timeout=2200)=>rawLocal(LOCAL_MANAGER,path,method,body,timeout);
async function cloudFetch(path:string,method='GET',body?:any){const r=await fetch(`/api/runtime/${path.replace(/^\//,'')}`,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const j=await r.json();if(!j.ok)throw new Error(j.error);return j.data}

function normalizeStatus(data:any){
  const d=data&&typeof data==='object'?data:{};
  const settings=d.settings&&typeof d.settings==='object'?d.settings:{};
  const schedule=settings.schedule&&typeof settings.schedule==='object'?settings.schedule:{};
  const risk=settings.risk&&typeof settings.risk==='object'?settings.risk:{};
  return{
    ...d,
    state:d.state||'stopped',
    settings:{
      ...settings,
      asset:settings.asset||d.liveBroker?.symbol||d.liveBroker?.uiSymbol||'—',
      orderDurationMs:Number(settings.orderDurationMs||60000),
      schedule:{timezone:'America/Sao_Paulo',dailyStart:'00:00',dailyEnd:'23:59',intervalMs:1000,...schedule},
      risk:{fixedStake:10,maxStake:50,stakePct:1,maxDailyLoss:50,dailyProfitTarget:0,maxDrawdownPct:10,maxTradesPerSession:10,maxTradesPerDay:30,maxTradesPerHour:10,maxConsecutiveLosses:3,minConfidence:70,maxFeedLatencyMs:5000,maxDecisionLatencyMs:2500,...risk}
    },
    recentTrades:Array.isArray(d.recentTrades)?d.recentTrades:[],
    recentAnalyses:Array.isArray(d.recentAnalyses)?d.recentAnalyses:[],
    incidents:Array.isArray(d.incidents)?d.incidents:[],
    audit:Array.isArray(d.audit)?d.audit:[]
  }
}

export default function Page(){
  const[tab,setTab]=useState('Dashboard');const[s,setS]=useState<Status|null>(null);const[err,setErr]=useState('');const[notice,setNotice]=useState('');const[busy,setBusy]=useState(false);const[source,setSource]=useState<'remote'|'local'>('remote');const[agent,setAgent]=useState<any>({process:false,worker:false,remote:false});const[account,setAccount]=useState<any>(null);const[pairCode,setPairCode]=useState('');const[mobileMore,setMobileMore]=useState(false);const[theme,setTheme]=useState<'light'|'dark'>('light');const refreshBusy=useRef(false);
  const isMaster=account?.profile?.role==='master';const agentAccess=isMaster||account?.profile?.access_active===true;const visibleTabs=tabDefs.filter(x=>x.key!=='Master Console'||isMaster);
  const refreshMe=useCallback(async()=>{try{const r=await fetch('/api/auth/me',{cache:'no-store'});const j=await r.json();if(r.ok&&j.ok)setAccount(j);else if(r.status===401)window.location.href='/login'}catch{}},[]);
  const refresh=useCallback(async()=>{
    if(refreshBusy.current)return;refreshBusy.current=true;
    try{
      const [mhResult,localResult]=await Promise.allSettled([managerFetch('health','GET',undefined,1200),localFetch('status','GET',undefined,1500)]);
      const mh=mhResult.status==='fulfilled'?mhResult.value:null;
      if(localResult.status==='fulfilled'){
        const data=normalizeStatus(localResult.value);setS(data);setSource('local');setErr('');
        setAgent((v:any)=>({...v,process:true,worker:true,remote:false,version:data.agentVersion||v.version,lastSeen:Date.now(),pairingCode:data.remoteRelay?.pairingCode||null,paired:data.remoteRelay?.paired}));
        if(data.remoteRelay?.paired===false&&data.remoteRelay?.pairingCode)setPairCode((v:string)=>v||String(data.remoteRelay.pairingCode).toUpperCase());
        return
      }
      if(mh?.ok){
        setAgent((v:any)=>({...v,process:true,worker:!!mh.workerHealthy,remote:false,version:mh.version,status:mh.status,lastSeen:Date.now()}));
        setSource('local');setErr(`Agent aberto, mas o worker não respondeu (${String(localResult.status==='rejected'?localResult.reason?.message||localResult.reason:'timeout')}).`);return
      }
      try{
        const data=normalizeStatus(await cloudFetch('status'));setS(data);setSource('remote');const online=!!data?.remote?.online;
        setAgent((v:any)=>({...v,remote:online,process:online,worker:online,paired:true,version:data.agentVersion||v.version}));
        setErr(online?'':'PC vinculado, mas Agent offline.')
      }catch(e:any){
        setS(null);setSource('remote');setAgent((v:any)=>({...v,remote:false,process:false,worker:false}));
        const m=String(e?.message||e);setErr(m==='pc_nao_vinculado'?'':m)
      }
    }finally{refreshBusy.current=false}
  },[]);
  useEffect(()=>{try{const saved=localStorage.getItem('sentinel-theme');const next=saved==='light'?'light':'dark';setTheme(next);document.documentElement.dataset.theme=next}catch{}},[]);
  useEffect(()=>{try{document.documentElement.dataset.theme=theme;localStorage.setItem('sentinel-theme',theme)}catch{}},[theme]);
  useEffect(()=>{refreshMe();try{const q=new URLSearchParams(window.location.search);const c=q.get('pair');if(c)setPairCode(c.toUpperCase())}catch{};refresh();const id=setInterval(refresh,2500);return()=>clearInterval(id)},[refresh,refreshMe]);
  const act=async(path:string,body:any={})=>{
    const previous=s;
    setBusy(true);setErr('');
    if(path==='mode'&&body?.mode)setS((v:Status|null)=>v?{...v,mode:body.mode}:v);
    if(path==='settings'&&body&&typeof body==='object')setS((v:Status|null)=>v?{...v,settings:{...(v.settings||{}),...body}}:v);
    if(path==='mode')setNotice(body.mode==='demo'?'Mudando para DEMO…':'Mudando para REAL…');
    else if(path==='settings'&&body?.strategy)setNotice('Ativando estratégia…');
    else if(path.startsWith('brokers/')&&path.endsWith('/login'))setNotice('Abrindo a corretora no PC…');
    else setNotice('Enviando comando ao Agent…');
    try{
      const method=path==='settings'?'PATCH':'POST';
      const commandTimeout=path.startsWith('brokers/')&&path.endsWith('/login')?30000:2200;
      const data=source==='local'&&agent.worker?await localFetch(path,method,body,commandTimeout):await cloudFetch(path,method,body);
      setS(normalizeStatus(data));setErr('');
      if(path==='mode')setNotice(body.mode==='demo'?'Modo DEMO ativo.':'Modo REAL ativo para análise; execução continua manual.');
      else if(path==='settings'&&body?.strategy)setNotice('Estratégia aplicada ao motor: '+String(body.strategy).replaceAll('_',' ')+'.');
      else if(path.startsWith('brokers/')&&path.endsWith('/login'))setNotice('Comando enviado ao Agent. A janela controlada da corretora deve abrir no PC.');
      else setNotice('Comando aplicado.');
      setTimeout(()=>refresh(),650);setTimeout(()=>refresh(),1900);setTimeout(()=>setNotice(''),4200);
    }catch(e:any){
      setS(previous);setNotice('');setErr(friendlyError(e));setTimeout(()=>refresh(),300);
    }finally{setBusy(false)}
  };
  const agentCommand=async(action:'restart'|'exit')=>{if(source!=='local'){setErr('Reiniciar/desligar o Agent exige acesso ao PC. Pelo celular você controla o Bot: iniciar, pausar, parar e Kill Switch.');return}setBusy(true);try{await managerFetch(action,'POST',{});if(action==='exit'){setAgent({process:false,worker:false});setSource('remote')}setTimeout(refresh,700);setErr('')}catch(e:any){setErr(`Agent: ${String(e?.message||e)}`)}finally{setBusy(false)}};
  const claimPair=async()=>{if(!pairCode.trim())return;setBusy(true);const send=async(replaceExisting=false)=>{const r=await fetch('/api/devices/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:pairCode,replaceExisting})});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Falha ao vincular PC');return j};try{let j:any;try{j=await send(false)}catch(e:any){if(String(e?.message||e)==='limite_de_pcs'){const ok=window.confirm('Esta conta já atingiu o limite de computadores. Substituir o PC antigo por este novo computador?');if(!ok)throw e;j=await send(true)}else throw e}setPairCode('');setErr('');setNotice(j?.replaced?'Novo computador vinculado. O PC antigo foi substituído.':'Computador vinculado com sucesso.');setTimeout(refresh,300);setTimeout(()=>setNotice(''),4200)}catch(e:any){setErr(friendlyError(e))}finally{setBusy(false)}};
  const current=visibleTabs.find(x=>x.key===tab)??visibleTabs[0];const groups=['Visão geral','Operação','Conta','Avançado','Admin'];const content=useMemo(()=>tab==='Master Console'?<Master s={s} act={act} busy={busy}/>:s?<Panel name={tab} s={s} act={act} busy={busy} agent={agent} agentCommand={agentCommand} account={account} pairCode={pairCode} setPairCode={setPairCode} claimPair={claimPair}/>:<OfflinePanel/>,[tab,s,busy,agent,account,pairCode,isMaster]);
  const mobileMain=[['Dashboard','Início','⌂'],['Bot Control','Piloto','◉'],['Market Analysis','Mercado','⌁'],['Trades / History','Histórico','≡']] as const;
  return <div className="app"><aside className="sidebar"><div className="brand"><div className="brandmark"><img src="/favicon.ico" alt="Sentinel"/></div><div><span>SENTINEL</span><strong>Trading Lab</strong><small>Automation Console</small></div></div><nav className="navGroups">{groups.map(group=><div className="navGroup" key={group}><div className="navTitle">{group}</div>{visibleTabs.filter(x=>x.group===group).map(x=><button key={x.key} className={tab===x.key?'active':''} onClick={()=>setTab(x.key)}><i>{x.icon}</i><span>{x.label}</span></button>)}</div>)}</nav><div className="sidefoot"><div className="masterBadge"><span className={`statusDot ${agent.worker?'online':''}`}/>{isMaster?'MASTER':'CONTA'}</div><span>{account?.user?.email||'Sentinel'} · {source==='local'?'PC local':'PC remoto'}</span></div></aside>
    <main className="main"><header className="topbar"><div className="pageHeading"><div className="topBrand"><img src="/favicon.ico" alt="Sentinel"/><span>Sentinel Trading Lab 13.1</span></div><div className="eyebrow">{current.group} / {current.label}</div><h1>{current.title}</h1><p>{current.subtitle}</p></div><div className="topactions">
        <div className="runtimeBadges"><span className="privateBadge">🔒 {account?.profile?.role==='master'?'MASTER':'PRIVADO'}</span><Pill tone={agent.process?'good':'neutral'}>{agent.process?'AGENT ONLINE':'AGENT OFF'}</Pill><Pill tone={agent.worker?'good':'neutral'}>{agent.worker?'WORKER ONLINE':'WORKER OFF'}</Pill><Pill tone={String(s?.liveBroker?.mode||s?.mode||'').toLowerCase()==='demo'?'good':String(s?.liveBroker?.mode||s?.mode||'').toLowerCase()==='real'?'bad':'neutral'}>CONTA {String(s?.liveBroker?.mode||s?.mode||'—').toUpperCase()}</Pill><Pill tone={s?.autopilot?.enabled?'good':s?.state==='error'?'bad':'neutral'}>{s?.autopilot?.enabled?'PILOTO ARMADO':String(s?.state||'offline').toUpperCase()}</Pill></div>
        <div className="topUtility"><button className="themeToggle" onClick={()=>setTheme(theme==='light'?'dark':'light')} title="Alternar tema">{theme==='light'?'◐ Petróleo':'☀ Claro'}</button><button className="kill" disabled={busy||!s} onClick={()=>window.confirm('Ativar KILL SWITCH e parar imediatamente?')&&act('control/kill')}>KILL SWITCH</button><button className="secondary logoutBtn" onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});window.location.href='/login'}}>Sair</button></div>
      </div></header>
      {!agent.process&&<div className="agentbanner"><div className="agentIcon">!</div><div className="agentText"><b>Vincule o PC à sua conta Sentinel</b><span>Instale o Agent no PC que ficará ligado com IQ Option/Exnova. No ícone S ao lado do relógio aparecerá um código SNTL. Digite aqui uma vez.</span><div className="pairInline"><input value={pairCode} onChange={e=>setPairCode(e.target.value.toUpperCase())} placeholder="SNTL-XXXX-XXXX"/><button className="primary" disabled={busy||!pairCode} onClick={claimPair}>Vincular PC</button></div></div><div className="agentActions">{agentAccess?<a className="secondary linkbtn" href="/downloads/Sentinel-Agent-Windows.exe?v=13.1.0-r11&release=sentinel-v13-1-clean-feed-core" download>Baixar Agent V13.1</a>:<button className="secondary" disabled title="O Agent é liberado após a compra ser confirmada nesta conta.">Agent V13.1 · compra necessária</button>}<button className="primary" onClick={()=>setTab('Settings')}>Minha conta</button></div></div>}
      {agent.process&&!agent.worker&&source==='local'&&<div className="alert"><b>Agent aberto, worker parado.</b> <button className="secondary" disabled={busy} onClick={()=>agentCommand('restart')}>Reiniciar Agent</button></div>}
      {notice&&<div className="notice"><span className="noticeDot"/><b>{notice}</b></div>}{err&&<div className="alert"><b>Sentinel:</b> {err}</div>}{content}</main>
      <nav className="mobileDock">{mobileMain.map(([k,l,i])=><button key={k} className={tab===k?'active':''} onClick={()=>{setTab(k);setMobileMore(false)}}><i>{i}</i><span>{l}</span></button>)}<button className={mobileMore?'active':''} onClick={()=>setMobileMore(v=>!v)}><i>•••</i><span>Mais</span></button></nav>{mobileMore&&<div className="mobileMorePanel">{visibleTabs.filter(x=>!mobileMain.some(([k])=>k===x.key)).map(x=><button key={x.key} onClick={()=>{setTab(x.key);setMobileMore(false)}}><i>{x.icon}</i><span>{x.label}</span></button>)}</div>}
    </div>}


function Loading(){return <div className="grid"><section className="card span12"><div className="skeleton h32"/><div className="skeleton h90"/></section></div>}
function OfflinePanel(){return <div className="grid"><section className="card span12"><div className="eyebrow">SENTINEL PRONTO</div><h3>Aguardando o PC vinculado</h3><p className="muted">Sua conta está funcionando. Instale ou abra o Agent no PC, use o código SNTL para vincular e o painel começará a receber saldo, mercado e estado do bot automaticamente.</p><div className="metrics"><Metric label="Site" value="ONLINE"/><Metric label="Conta" value="ATIVA"/><Metric label="Agent" value="AGUARDANDO"/><Metric label="Bot" value="OFFLINE"/></div></section></div>}
function Panel({name,s,act,busy,agent,agentCommand,account,pairCode,setPairCode,claimPair}:{name:string,s:Status,act:(p:string,b?:any)=>Promise<void>,busy:boolean,agent:any,agentCommand:any,account:any,pairCode:string,setPairCode:any,claimPair:any}){
  if(name==='Dashboard')return <Dashboard s={s} act={act} busy={busy}/>;if(name==='Bot Control')return <BotControl s={s} act={act} busy={busy}/>;if(name==='Market Analysis')return <Market s={s}/>;if(name==='Strategies')return <Strategies s={s} act={act} busy={busy}/>;if(name==='Risk & Limits')return <Risk s={s} act={act}/>;if(name==='Scheduler')return <Scheduler s={s} act={act}/>;if(name==='Broker Connection')return <Broker s={s} act={act} busy={busy} account={account}/>;if(name==='Trades / History')return <Trades s={s}/>;if(name==='Logs / Diagnostics')return <Logs s={s}/>;if(name==='Master Console')return <Master s={s} act={act} busy={busy}/>;return <Settings s={s} agent={agent} agentCommand={agentCommand} busy={busy} account={account} pairCode={pairCode} setPairCode={setPairCode} claimPair={claimPair}/>}


function Dashboard({s,act,busy}:{s:Status,act:any,busy:boolean}){const r=s.lastResult||{},a=r.analysis||{},lat=r.latency||{},ap=s.autopilot||{},schedule=s.settings?.schedule||{},brokerMode=String(s.liveBroker?.mode||s.mode||'unknown').toUpperCase();return <div className="grid">
  <section className="card hero"><div className="herohead"><div><div className="eyebrow">BOT STATUS</div><div className="bigline"><span className={`dot ${s.state}`}/>{String(s.state).toUpperCase()}</div><p>{brokerMode==='DEMO'?(ap.enabled?'Piloto DEMO armado: o Agent opera somente o saldo DEMO da corretora quando o cenário e as travas aprovam.':'Conta DEMO detectada. O Sentinel analisa normalmente; o piloto só clica quando você armar em Piloto DEMO.'):'Conta REAL detectada: análise automática ativa, mas nenhuma ordem REAL é enviada automaticamente.'}</p></div><div className="price"><small>{s.feed?.label}</small><b>{Number(s.feed?.price||0).toFixed(5)}</b><span>{s.settings?.asset}</span></div></div>
    <div className="metrics"><Metric label={s.balanceSource==='broker'?"Saldo conta ativa":"Saldo simulado"} value={money(s.balance)}/><Metric label="P&L Sentinel" value={money(s.pnl)} sub={`${s.wins}W / ${s.losses}L`}/><Metric label="Win rate interno" value={pct(s.winRate)}/><Metric label="Drawdown interno" value={pct(s.drawdownPct)}/></div>
    <div className="actions"><button className="primary" disabled={busy||s.state==='running'||s.killSwitch||s.masterFrozen||!!s.startBlockedReason} onClick={()=>act('control/start')}>Iniciar análise</button><button className="secondary" disabled={busy||s.state!=='running'} onClick={()=>act('control/pause')}>Pausar</button><button className="secondary" disabled={busy||s.state==='stopped'} onClick={()=>act('control/stop')}>Parar</button></div>{s.startBlockedReason&&<p className="formerror">{s.startBlockedReason}</p>}
  </section>
  <section className="card side"><div className="eyebrow">ÚLTIMO CICLO</div><div className={`signal ${String(r.action||'WAIT').toLowerCase()}`}><span>{r.action||'WAIT'}</span><b>{a.confidence??0}%</b></div><div className="reasonlist">{(r.reasons||a.reasons||['Aguardando ciclo']).slice(0,4).map((x:string,i:number)=><div key={i}>• {x}</div>)}</div><div className="latrow"><span>Feed <b>{lat.feedMs??0}ms</b></span><span>Decisão <b>{lat.decisionMs??0}ms</b></span><span>Execução <b>{lat.executionMs??0}ms</b></span></div></section>
  <section className="card span4"><h3>Risco em tempo real</h3><div className="stack"><Row k="Piloto DEMO" v={ap.enabled?'ARMADO':'DESARMADO'}/><Row k="Operações da sessão" v={String(ap.sessionTrades??0)+' / '+String(ap.maxSessionTrades??s.settings?.risk?.maxTradesPerSession??10)}/><Row k="Perdas seguidas" v={String(s.consecutiveLosses)+' / '+String(ap.maxConsecutiveLosses??s.settings?.risk?.maxConsecutiveLosses??3)}/><Row k="Pendentes" v={String(s.pending)}/></div></section>
  <section className="card span4"><h3>Agenda</h3><div className="stack"><Row k="Timezone" v={schedule.timezone||'—'}/><Row k="Janela" v={`${schedule.dailyStart||'—'} – ${schedule.dailyEnd||'—'}`}/><Row k="Intervalo" v={`${Math.round(Number(schedule.intervalMs||1000)/1000)}s`}/><Row k="Expiração" v={Number(s.settings.orderDurationMs||60000)<60000?`${Math.round(Number(s.settings.orderDurationMs||60000)/1000)}s`:`${Math.round(Number(s.settings.orderDurationMs||60000)/60000)} min`}/><Row k="Próxima análise" v={s.nextEvalMs?tm(s.nextEvalMs):'—'}/></div></section>
  <section className="card span4"><h3>Saúde do sistema</h3><div className="stack"><Row k="Heartbeat" v={tm(s.lastHeartbeat)}/><Row k="Fonte" v={s.runtimeKind==='persistent-worker'?(s.liveBroker?.provider?'Corretora local':'Worker local'):'Simulador Vercel'}/><Row k="Feed" v={s.feed?.label||'—'}/><Row k="Kill switch" v={s.killSwitch?'ATIVO':'Livre'}/></div></section>
  <section className="card span8"><h3>Operações recentes</h3><TradeTable rows={s.recentTrades}/></section>
  <section className="card span4"><h3>Últimas análises</h3><div className="timeline">{(s.recentAnalyses||[]).slice(0,6).map((x:any,i:number)=><div className="event" key={i}><time>{tm(x.ts)}</time><div><b>{x.side} · {x.confidence}%</b><span>{x.reasons?.[0]||'sem motivo'}</span></div></div>)}{!s.recentAnalyses?.length&&<Empty text="Nenhuma análise ainda"/>}</div></section>
</div>}

function BotControl({s,act,busy}:{s:Status,act:any,busy:boolean}){
  const ap=s.autopilot||{},live=s.liveBroker||{},brokerMode=String(live.mode||s.mode||'unknown').toUpperCase();
  const demoDetected=brokerMode==='DEMO',controlsReady=ap.eligible===true&&demoDetected;
  const risk=s.settings?.risk||{};
  const[stake,setStake]=useState(String(risk.fixedStake??10));
  const[maxOps,setMaxOps]=useState(String(risk.maxTradesPerSession??10));
  const[maxLosses,setMaxLosses]=useState(String(risk.maxConsecutiveLosses??3));
  useEffect(()=>{setStake(String(risk.fixedStake??10));setMaxOps(String(risk.maxTradesPerSession??10));setMaxLosses(String(risk.maxConsecutiveLosses??3))},[risk.fixedStake,risk.maxTradesPerSession,risk.maxConsecutiveLosses]);
  const safetyPatch=()=>({demoAutopilot:true,risk:{fixedStake:Math.max(.01,Number(stake)||10),maxTradesPerSession:Math.max(1,Math.min(50,Math.round(Number(maxOps)||10))),maxConsecutiveLosses:Math.max(1,Math.min(10,Math.round(Number(maxLosses)||3)))}});
  const arm=async()=>{
    if(!demoDetected){window.alert(brokerMode==='REAL'?'Troque a própria corretora para a conta DEMO antes de armar o piloto. O Sentinel nunca converte a conta REAL em automática.':'Aguarde o Agent identificar a conta DEMO da corretora.');return}
    if(ap.enabled&&s.state==='paused'){await act('control/start');return}
    await act('settings',safetyPatch());
    if(s.state!=='running')await act('control/start');
  };
  const analyze=async()=>{await act('settings',{demoAutopilot:false});if(s.state!=='running')await act('control/start')};
  const disarm=async()=>{await act('settings',{demoAutopilot:false});if(s.state!=='stopped')await act('control/stop')};
  const stateTone=ap.enabled&&demoDetected?'good':brokerMode==='REAL'?'bad':'neutral';
  return <div className="grid">
    <section className="card span8 autopilotHero premiumSweep">
      <div className="split"><div><div className="eyebrow">PILOTO AUTOMÁTICO · SOMENTE DEMO</div><h3>{ap.enabled&&demoDetected?(controlsReady?'Piloto armado':'Piloto armado · aguardando controles'):'Piloto desarmado'}</h3><p className="muted">{brokerMode==='DEMO'?'A conta DEMO da corretora está selecionada. Você pode armar o piloto agora; ele só clica quando CALL/PUT, valor, ativo e expiração estiverem validados pelo Agent.':'A conta ativa da corretora é REAL. O Sentinel continua analisando, mas o piloto DEMO fica bloqueado.'}</p></div><Pill tone={stateTone}>{brokerMode==='DEMO'?(controlsReady?'DEMO PRONTA':'DEMO DETECTADA'):'REAL · MANUAL'}</Pill></div>
      <div className="pilotStatusGrid">
        <div><small>Conta da corretora</small><b>{brokerMode}</b></div>
        <div><small>Piloto</small><b>{ap.enabled?'ARMADO':'DESARMADO'}</b></div>
        <div><small>Sessão</small><b>{String(ap.sessionTrades??0)} / {String(ap.maxSessionTrades??risk.maxTradesPerSession??10)}</b></div>
        <div><small>Perdas seguidas</small><b>{String(s.consecutiveLosses||0)} / {String(ap.maxConsecutiveLosses??risk.maxConsecutiveLosses??3)}</b></div>
      </div>
      <div className="pilotConfig">
        <label><span>Valor por entrada</span><input type="number" min="0.01" step="0.01" value={stake} onChange={e=>setStake(e.target.value)}/></label>
        <label><span>Máx. operações / sessão</span><input type="number" min="1" max="50" value={maxOps} onChange={e=>setMaxOps(e.target.value)}/></label>
        <label><span>Parar após perdas seguidas</span><input type="number" min="1" max="10" value={maxLosses} onChange={e=>setMaxLosses(e.target.value)}/></label>
      </div>
      <div className="actions pilotActions">
        <button className="primary" disabled={busy||!demoDetected||(ap.enabled&&s.state!=='paused')} onClick={arm}>{ap.enabled&&s.state==='paused'?'▶ RETOMAR PILOTO':ap.enabled?'● PILOTO ATIVO':'▶ ARMAR PILOTO DEMO'}</button>
        <button className="secondary" disabled={busy||s.state==='running'&&!ap.enabled} onClick={analyze}>⌁ SOMENTE ANALISAR</button>
        <button className="secondary" disabled={busy||(!ap.enabled&&s.state==='stopped')} onClick={disarm}>■ DESARMAR E PARAR</button>
      </div>
      {s.startBlockedReason&&<p className="formerror">{s.startBlockedReason}</p>}
    </section>
    <section className="card span4 pilotGuard">
      <div className="eyebrow">TRAVAS DA SESSÃO</div><h3>Fail closed</h3>
      <div className="stack">
        <Row k="Conta REAL" v="Nunca automática"/>
        <Row k="Conta DEMO" v={demoDetected?(controlsReady?'Pronta':'Detectada · validando controles'):'Não detectada'}/>
        <Row k="Limite da sessão" v={String(ap.maxSessionTrades??risk.maxTradesPerSession??10)+' operações'}/>
        <Row k="Perdas seguidas" v={String(ap.maxConsecutiveLosses??risk.maxConsecutiveLosses??3)}/>
        <Row k="Kill Switch" v={s.killSwitch?'ATIVO':'Livre'}/>
      </div>
      <p className="muted">Se a corretora mudar de DEMO para REAL, o Agent desarma o piloto automaticamente. Feed, expiração ou controles duvidosos também impedem o clique.</p>
    </section>
    <section className="card span12 mobileRemoteCard">
      <div className="split"><div><div className="eyebrow">CONTROLE PELO CELULAR</div><h3>Seu PC fica em casa; este painel controla a sessão</h3><p className="muted">Com o Agent online no computador, você pode abrir esta conta pelo celular para armar, pausar, parar e acompanhar o piloto DEMO. O navegador da corretora continua no PC.</p></div><Pill tone={s.runtimeKind==='remote-agent'?'good':'neutral'}>{s.runtimeKind==='remote-agent'?'PC REMOTO':'PC LOCAL'}</Pill></div>
      <div className="mobileQuick">
        <button className="primary" disabled={busy||!demoDetected||(ap.enabled&&s.state!=='paused')} onClick={arm}>{ap.enabled&&s.state==='paused'?'Retomar':ap.enabled?'Piloto ativo':'Armar DEMO'}</button>
        <button className="secondary" disabled={busy||s.state!=='running'} onClick={()=>act('control/pause')}>Pausar</button>
        <button className="secondary" disabled={busy||s.state==='stopped'} onClick={disarm}>Parar</button>
        <button className="kill" disabled={busy} onClick={()=>window.confirm('Ativar KILL SWITCH e bloquear a sessão?')&&act('control/kill')}>Kill Switch</button>
      </div>
    </section>
  </div>
}

function Market({s}:{s:Status}){
  const a=s.lastResult?.analysis||s.recentAnalyses?.[0]||{};
  const m=a.metrics||{};
  const fib=m.fib?.nearest;
  const live=s.liveBroker||{};
  const plan=s.lastResult?.plan||{};
  const side=String(a.side||'WAIT').toUpperCase();
  const signal=side==='BUY'?'CALL / COMPRA':side==='SELL'?'PUT / VENDA':'WAIT';
  const next=s.nextEvalMs?new Date(s.nextEvalMs).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
  const orderExpiry=plan.expiresAt?new Date(plan.expiresAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
  const trend=m.structure?.bias==='bullish'?'ALTA':m.structure?.bias==='bearish'?'BAIXA':'LATERAL';
  const macdState=m.macd?.histogram>0?'POSITIVO':m.macd?.histogram<0?'NEGATIVO':'NEUTRO';
  const rsiState=m.rsi==null?'—':m.rsi>=70?'SOBRECOMPRADO':m.rsi<=30?'SOBREVENDIDO':m.rsi>=52?'FORÇA COMPRADORA':m.rsi<=48?'FORÇA VENDEDORA':'NEUTRO';
  const bbState=m.bb&&m.last!=null?(m.last>=m.bb.upper?'BANDA SUPERIOR':m.last<=m.bb.lower?'BANDA INFERIOR':m.last>m.bb.mid?'ACIMA DA MÉDIA':'ABAIXO DA MÉDIA'):'—';
  return <div className="grid">
    <section className="card span12 signalCockpit">
      <div className="split cockpitTop">
        <div>
          <div className="eyebrow">COCKPIT TÉCNICO · {s.analysisSource||'OFFLINE'}</div>
          <h3>{live.uiSymbol||s.settings.asset||'—'}</h3>
          <p className="muted">Mesmo ativo da tela da corretora. Sinal experimental para validação em DEMO.</p>
        </div>
        <div className={'signalBadge '+side.toLowerCase()}>
          <span>{signal}</span>
          <b>{Math.round(Number(a.confidence||0))}%</b>
        </div>
      </div>
      <div className="cockpitPlan">
        <div><small>Estratégia</small><b>{String(s.settings?.strategy||'—').replaceAll('_',' ')}</b></div>
        <div><small>Entrada</small><b>{plan.entry||'Aguardar confirmação'}</b></div>
        <div><small>Saída / expiração</small><b>{plan.exit||'Sem entrada'}</b></div>
        <div><small>Expira às</small><b>{orderExpiry}</b></div>
        <div><small>Próxima análise</small><b>{next}</b></div>
        <div><small>Estado</small><b>{String(s.state||'—').toUpperCase()}</b></div>
      </div>
      <div className="confidence"><i style={{width:String(a.confidence||0)+'%'}}/></div>
      <div className="reasonlist large">{(a.reasons||s.lastResult?.reasons||['Aguardando análise']).slice(0,6).map((x:string,i:number)=><div key={i}>• {x}</div>)}</div>
    </section>

    <section className="card span8">
      <div className="split"><div><div className="eyebrow">INDICADORES</div><h3>Leitura técnica ao vivo</h3></div><Pill tone={side==='WAIT'?'warn':'good'}>{signal}</Pill></div>
      <div className="indicatorGrid">
        <div className="indicatorBox"><small>Estrutura</small><b>{m.structure?.label||'—'}</b><span>{trend}</span></div>
        <div className="indicatorBox"><small>EMA 9</small><b>{fmt(m.fast)}</b><span>{m.fast!=null&&m.slow!=null?(m.fast>m.slow?'ACIMA DA 21':'ABAIXO DA 21'):'—'}</span></div>
        <div className="indicatorBox"><small>EMA 21</small><b>{fmt(m.slow)}</b><span>CURTA</span></div>
        <div className="indicatorBox"><small>EMA 50</small><b>{fmt(m.ema50)}</b><span>{m.last!=null&&m.ema50!=null?(m.last>m.ema50?'PREÇO ACIMA':'PREÇO ABAIXO'):'—'}</span></div>
        <div className="indicatorBox"><small>EMA 200</small><b>{fmt(m.ema200)}</b><span>LONGA</span></div>
        <div className="indicatorBox"><small>RSI 14</small><b>{fmt(m.rsi,1)}</b><span>{rsiState}</span></div>
        <div className="indicatorBox"><small>MACD hist.</small><b>{fmt(m.macd?.histogram,5)}</b><span>{macdState}</span></div>
        <div className="indicatorBox"><small>Estocástico</small><b>{fmt(m.stoch,1)}</b><span>{m.stoch==null?'—':m.stoch>80?'SOBRECOMPRADO':m.stoch<20?'SOBREVENDIDO':'NEUTRO'}</span></div>
        <div className="indicatorBox"><small>Bollinger</small><b>{bbState}</b><span>{m.bb?fmt(m.bb.lower)+' — '+fmt(m.bb.upper):'—'}</span></div>
        <div className="indicatorBox"><small>ATR 14</small><b>{fmt(m.atr,5)}</b><span>VOLATILIDADE</span></div>
        <div className="indicatorBox"><small>Suporte</small><b>{fmt(m.sr?.support)}</b><span>NÍVEL</span></div>
        <div className="indicatorBox"><small>Resistência</small><b>{fmt(m.sr?.resistance)}</b><span>NÍVEL</span></div>
        <div className="indicatorBox"><small>Fibonacci</small><b>{fib?String(fib.name).replace('l',''):'—'}</b><span>{fib?fmt(fib.price):'—'}</span></div>
        <div className="indicatorBox"><small>Momentum</small><b>{fmt(m.momentum,3)}</b><span>{m.momentum>0?'POSITIVO':m.momentum<0?'NEGATIVO':'NEUTRO'}</span></div>
        <div className="indicatorBox"><small>Score BUY</small><b>{String(Math.round(m.buyScore||0))}</b><span>PONTOS</span></div>
        <div className="indicatorBox"><small>Score SELL</small><b>{String(Math.round(m.sellScore||0))}</b><span>PONTOS</span></div>
      </div>
    </section>

    <section className="card span4">
      <h3>Confirmações</h3>
      <div className="stack">
        <Row k="Ativo na tela" v={live.uiSymbol||'—'}/>
        <Row k="Ativo analisado" v={live.symbol||s.settings.asset||'—'}/>
        <Row k="Candles" v={String(m.sourceCandles||live.candles?.length||0)}/>
        <Row k="Feed atual" v={live.candleFresh?'SIM':'NÃO'}/>
        <Row k="Timeframe superior" v={m.higherTF?.structure?.label||m.higherTF?.structure?.bias||'—'}/>
        <Row k="Padrões de vela" v={(m.patterns||[]).map((x:any)=>x.label).join(', ')||'—'}/>
        <Row k="Breakout/reteste" v={m.retest?.side||'WAIT'}/>
        <Row k="Confiança mínima" v={pct(s.settings?.risk?.minConfidence)}/>
        <Row k="Confiança atual" v={pct(a.confidence)}/>
      </div>
      <div className="demoDisclaimer">Nenhum indicador elimina risco. Use o histórico DEMO para medir taxa de acerto por estratégia antes de confiar no sistema.</div>
    </section>
  </div>
}

function Strategies({s,act,busy}:{s:Status,act:any,busy:boolean}){
  const rows=[
    ['smart_confluence','Smart Confluence','Combina estrutura, EMA, MACD, padrões de vela, suporte/resistência, Fibonacci e timeframe superior.'],
    ['price_action','Price Action','Usa estrutura de mercado, pivôs e padrões de vela como engolfo, pin bar, martelo e estrela cadente.'],
    ['trendline_breakout','Trendline Breakout','Projeta linhas por pivôs e procura rompimento confirmado + reteste.'],
    ['support_resistance','Suporte & Resistência','Busca reação e rompimentos nas zonas técnicas mais recentes.'],
    ['fibonacci_retest','Fibonacci Retest','Procura retrações 23,6 / 38,2 / 50 / 61,8 / 78,6 alinhadas à tendência.'],
    ['trend','Trend Following','Segue EMA, momentum e estrutura de tendência.'],
    ['mean_reversion','Mean Reversion','Procura extremos de RSI, Estocástico e Bollinger.'],
    ['breakout','Breakout','Procura rompimento + reteste de suporte/resistência.']
  ];
  const set=async(strategy:string)=>{if(busy||s.settings.strategy===strategy)return;await act('settings',{strategy})};
  const active=rows.find(x=>x[0]===s.settings.strategy);
  return <section className="card span12 strategySection">
    <div className="split"><div><div className="eyebrow">MOTOR DE DECISÃO</div><h3>Estratégias técnicas</h3><p className="muted">Escolher uma estratégia altera o motor do Agent. A ativa aparece destacada e o status é confirmado pelo Worker.</p></div><div className="strategyActive"><span>Ativa agora</span><b>{active?.[1]||s.settings.strategy}</b></div></div>
    <div className="strategygrid">{rows.map(([id,title,desc])=><button disabled={busy} key={id} className={'strategy '+(s.settings.strategy===id?'selected':'')} onClick={()=>set(id)}><div className="strategyHead"><b>{title}</b><span className={'strategyState '+(s.settings.strategy===id?'live':'')}>{s.settings.strategy===id?'ATIVA':'USAR'}</span></div><span className="strategyDesc">{desc}</span><small>{s.settings.strategy===id?'✓ Motor usando esta estratégia':'Clique para aplicar ao Worker'}</small></button>)}</div>
  </section>
}

function Risk({s,act}:{s:Status,act:any}){const q=s.settings.risk;const keys=['fixedStake','maxStake','stakePct','maxDailyLoss','dailyProfitTarget','maxDrawdownPct','maxTradesPerSession','maxTradesPerDay','maxTradesPerHour','maxConsecutiveLosses','minConfidence','maxFeedLatencyMs','maxDecisionLatencyMs'];const make=()=>Object.fromEntries(keys.map(k=>[k,String(q?.[k]??'')]));const[form,setForm]=useState<any>(make);const[dirty,setDirty]=useState(false);const[msg,setMsg]=useState('');useEffect(()=>{if(!dirty)setForm(make())},[JSON.stringify(q),dirty]);const set=(k:string)=>(e:any)=>{setDirty(true);setForm((v:any)=>({...v,[k]:e.target.value}))};const save=async()=>{try{const out:any={};for(const k of keys){if(String(form[k]).trim()==='')throw new Error(`Preencha ${k}`);const n=Number(form[k]);if(!Number.isFinite(n))throw new Error(`Valor inválido em ${k}`);out[k]=n}await act('settings',{risk:out});setDirty(false);setMsg('')}catch(e:any){setMsg(String(e?.message||e))}};return <section className="card span12"><div className="split"><div><h3>Risco & Limites</h3><p className="muted">Você pode apagar e digitar outro valor. Só é aplicado ao clicar Salvar.</p></div>{dirty&&<Pill tone="warn">ALTERAÇÕES NÃO SALVAS</Pill>}</div><div className="formgrid three"><Num label="Stake fixa" value={form.fixedStake} onChange={set('fixedStake')}/><Num label="Stake máxima" value={form.maxStake} onChange={set('maxStake')}/><Num label="Stake %" value={form.stakePct} onChange={set('stakePct')}/><Num label="Perda diária máx." value={form.maxDailyLoss} onChange={set('maxDailyLoss')}/><Num label="Meta diária opcional" value={form.dailyProfitTarget} onChange={set('dailyProfitTarget')}/><Num label="Drawdown máx. %" value={form.maxDrawdownPct} onChange={set('maxDrawdownPct')}/><Num label="Máx. operações/sessão" value={form.maxTradesPerSession} onChange={set('maxTradesPerSession')}/><Num label="Máx trades/dia" value={form.maxTradesPerDay} onChange={set('maxTradesPerDay')}/><Num label="Máx trades/hora" value={form.maxTradesPerHour} onChange={set('maxTradesPerHour')}/><Num label="Perdas consecutivas" value={form.maxConsecutiveLosses} onChange={set('maxConsecutiveLosses')}/><Num label="Confiança mínima %" value={form.minConfidence} onChange={set('minConfidence')}/><Num label="Feed latency máx. ms" value={form.maxFeedLatencyMs} onChange={set('maxFeedLatencyMs')}/><Num label="Decision latency máx. ms" value={form.maxDecisionLatencyMs} onChange={set('maxDecisionLatencyMs')}/></div>{msg&&<p className="formerror">{msg}</p>}<div className="actions"><button className="primary save" disabled={!dirty} onClick={save}>Salvar limites</button>{dirty&&<button className="secondary save" onClick={()=>{setForm(make());setDirty(false);setMsg('')}}>Descartar</button>}</div></section>}

function Scheduler({s,act}:{s:Status,act:any}){
  const q=s.settings.schedule;
  const make=()=>({...q,intervalMs:String(q.intervalMs),orderDurationMs:String(s.settings.orderDurationMs||60000)});
  const[form,setForm]=useState<any>(make);
  const[dirty,setDirty]=useState(false);
  const[msg,setMsg]=useState('');
  useEffect(()=>{if(!dirty)setForm(make())},[JSON.stringify(q),s.settings.orderDurationMs,dirty]);
  const set=(k:string)=>(e:any)=>{setDirty(true);setForm((v:any)=>({...v,[k]:e.target.value}))};
  const save=async()=>{
    try{
      const intervalMs=Number(form.intervalMs),orderDurationMs=Number(form.orderDurationMs);
      if(!Number.isFinite(intervalMs)||intervalMs<1000)throw new Error('Intervalo inválido');
      const allowed=[30000,60000,120000,300000,600000,900000];
      if(!allowed.includes(orderDurationMs))throw new Error('Tempo da operação inválido');
      const{orderDurationMs:_drop,...scheduleForm}=form;
      await act('settings',{orderDurationMs,schedule:{...scheduleForm,intervalMs}});
      setDirty(false);setMsg('')
    }catch(e:any){setMsg(String(e?.message||e))}
  };
  return <section className="card span12"><div className="split"><div><h3>Análise em tempo real & tempo da operação</h3><p className="muted">A análise acompanha cada atualização do mercado em tempo real. CALL/PUT só é liberado como entrada depois que o próprio Sentinel valida o desempenho recente daquele ativo e duração; até lá ele mostra apenas viés técnico.</p></div>{dirty&&<Pill tone="warn">ALTERAÇÕES NÃO SALVAS</Pill>}</div><div className="formgrid three"><Text label="Timezone" value={form.timezone} onChange={set('timezone')}/><Text label="Início diário" type="time" value={form.dailyStart} onChange={set('dailyStart')}/><Text label="Fim diário" type="time" value={form.dailyEnd} onChange={set('dailyEnd')}/><Select label="Fallback sem novo evento" value={String(form.intervalMs)} onChange={set('intervalMs')} options={[["1000","1 segundo"],["2000","2 segundos"],["5000","5 segundos"]]}/><Select label="Tempo da operação / expiração" value={String(form.orderDurationMs)} onChange={set('orderDurationMs')} options={[["30000","30 segundos"],["60000","1 minuto"],["120000","2 minutos"],["300000","5 minutos"],["600000","10 minutos"],["900000","15 minutos"]]}/><Text label="Data/hora inicial (ISO opcional)" value={form.startAt||''} onChange={set('startAt')}/><Text label="Data/hora final (ISO opcional)" value={form.endAt||''} onChange={set('endAt')}/></div>{msg&&<p className="formerror">{msg}</p>}<div className="actions"><button className="primary save" disabled={!dirty} onClick={save}>Salvar análise e tempo</button>{dirty&&<button className="secondary save" onClick={()=>{setForm(make());setDirty(false);setMsg('')}}>Descartar</button>}</div></section>
}
function Broker({s,act,busy,account}:{s:Status,act:any,busy:boolean,account:any}){const live=s.liveBroker||{},access=account?.profile?.role==='master'||account?.profile?.access_active===true;const card=(key:'iq_option'|'exnova',label:string)=>{const b=s.brokers?.[key]||{};const login=s.loginStates?.[key]||{};const md=b.marketData||{};const checks=Object.entries(b.checklist||{});const local=s.runtimeKind==='persistent-worker';const remote=s.runtimeKind==='remote-agent'&&s.remote?.online===true;const controllable=local||remote;const loginError=login.error?friendlyError(login.error):'';const openBroker=()=>act(`brokers/${key}/login`,{userInitiated:true});const mode=String(b.accountMode||md.mode||'unknown').toUpperCase();const status=b.validated?`LEITURA ${mode} OK`:b.connected?'SESSÃO CONECTADA':b.hasSession?'LOGIN CONFIRMADO':'NÃO CONECTADO';const tone=b.validated?'good':(b.connected||b.hasSession)?'neutral':'bad';return <section className="card span4 brokerCard"><div className="split"><h3>{label}</h3><Pill tone={tone}>{status}</Pill></div><div className="stack topgap"><Row k="Janela" v={login.open?'Aberta':'Fechada'}/><Row k="Login" v={login.likelyAuthenticated?'Confirmado':login.sessionPresent?'Sessão encontrada':'Aguardando'}/><Row k="Agent" v={controllable?'Online':'Offline'}/><Row k="Conta ativa" v={mode}/><Row k="Saldo lido" v={md.balance==null?'—':money(md.balance)}/><Row k="Fonte do saldo" v={md.balanceSource||'—'}/><Row k="Ativos lidos" v={String(md.assets?.length||0)}/><Row k="Cotação" v={md.quote==null?'—':String(md.quote)}/><Row k="Candles" v={String(md.candles?.length||0)}/><Row k="Mercado" v={String(md.marketStatus||'—').toUpperCase()}/><Row k="Última candle" v={md.candleAgeMs==null?'—':Math.round(Number(md.candleAgeMs)/1000)+'s atrás'}/><Row k="Ativo na tela" v={md.uiSymbol||'—'}/><Row k="Ativo analisado" v={md.symbol||'—'}/><Row k="Sugestão de ativo" v={md.suggestedSymbol||'—'}/><Row k="ID ativo" v={md.activeId==null?'—':String(md.activeId)}/><Row k="Protocolo" v={md.protocol==='active-websocket'?'ACTIVE WS':md.protocol||'—'}/><Row k="Feed validado" v={md.feedValidated?'SIM':'NÃO'}/><Row k="Execução DEMO" v={mode==='DEMO'?(md.executionReady?'CORRETORA PRONTA':'AGUARDANDO CONTROLES'):'N/A — REAL MANUAL'}/><Row k="Última solicitação" v={md.lastCandleRequest?.transport||'—'}/><Row k="Resposta candles" v={md.lastCandleResponse?.name||md.lastCandleResponse?.error||'—'}/></div>{!controllable&&<div className="brokerOffline"><b>Agent offline</b><span>Ligue o Sentinel Agent no PC para abrir e controlar a corretora.</span></div>}<div className="brokerFlow"><button className="primary brokerOpenBtn" disabled={busy||!access} onClick={()=>controllable?openBroker():window.alert('O Agent do PC está offline. Abra o Sentinel Agent no computador e tente novamente.')}>{busy?'Processando…':b.connected?'Trazer corretora para frente':login.open?'Continuar conexão da corretora':'Abrir / conectar corretora'}</button>{b.connected&&<button className="secondary" disabled={busy} onClick={()=>act(`brokers/${key}/validate-market`)}>Atualizar leitura</button>}{b.connected&&<button className="secondary subtle" disabled={busy} onClick={()=>act(`brokers/${key}/disconnect`)}>Desconectar</button>}</div><div className="sessionhint"><b>Conexão automática</b><span>{b.connected?'Sessão detectada e conectada.':login.open?'Faça login na janela da corretora; o Agent conecta sozinho ao entrar no traderoom.':'Clique em Abrir / conectar. O Agent abre o traderoom e assume a conexão após o login.'}</span></div>{loginError&&<p className="formerror">Erro ao abrir corretora: {loginError}</p>}{login.url&&<div className="sessionhint"><b>Janela atual</b><span>{login.title||label}</span><em>{login.url}</em></div>}<div className="checklist">{checks.map(([k,v]:any)=><div className={v.ok?'check ok':'check'} key={k}><span>{v.ok?'✓':'•'}</span><b>{k.replaceAll('_',' ')}</b><em>{v.message}</em></div>)}</div>{b.connected&&!b.validated&&<div className="brokerNote"><b>Sessão conectada.</b><span>Depois do primeiro login, o Agent mantém a sessão em segundo plano. Ele sempre tenta analisar o mesmo ativo que está aberto na tela. Se esse ativo ficar sem feed, o bot entra em WAIT, continua tentando recuperar e, quando houver alternativa disponível, mostra a sugestão sem trocar escondido. Nunca opera com candle velha.</span></div>}{b.lastError&&<p className="muted">Diagnóstico: {String(b.lastError).replaceAll('_',' ')}</p>}</section>};return <div className="grid"><section className="card span12 connectIntro"><div><div className="eyebrow">CONEXÃO PC V13.1</div><h3>REAL ou DEMO é escolhido dentro da própria corretora</h3><p>O site não cria uma segunda conta DEMO. O Agent lê exatamente a conta que estiver ativa na IQ Option/Exnova. Se estiver em DEMO, o piloto pode ser armado; se mudar para REAL, ele é desarmado automaticamente.</p><div className="actions">{access?<a className="primary linkbtn" href="/downloads/Sentinel-Agent-Windows.exe?v=13.1.0-r11&release=sentinel-v13-1-clean-feed-core" download>Baixar Agent V13.1</a>:<button className="secondary" disabled>Compra necessária para liberar o Agent</button>}</div></div><div className="steps"><span>1 <b>Abra o Agent</b></span><span>2 <b>Abrir / conectar</b></span><span>3 <b>Faça login se necessário</b></span><span>4 <b>O Agent conecta sozinho</b></span></div></section><section className="card span4"><h3>Conta usada pelo painel</h3><Pill tone={live.provider?'good':'neutral'}>{live.provider?String(live.mode||'ATIVA').toUpperCase():'SEM LEITURA'}</Pill><div className="stack topgap"><Row k="Corretora" v={live.provider==='iq_option'?'IQ Option':live.provider==='exnova'?'Exnova':'—'}/><Row k="Saldo" v={live.balance==null?'—':money(live.balance)}/><Row k="Ativo" v={live.symbol||'—'}/><Row k="Cotação" v={live.quote==null?'—':String(live.quote)}/><Row k="Candles" v={String(live.candles?.length||0)}/><Row k="Mercado" v={String(live.marketStatus||'—').toUpperCase()}/><Row k="Última candle" v={live.candleAgeMs==null?'—':Math.round(Number(live.candleAgeMs)/1000)+'s atrás'}/><Row k="Protocolo" v={live.protocol==='active-websocket'?'ACTIVE WS':live.protocol||'—'}/><Row k="Análise" v={s.analysisSource==='LIVE'?'MERCADO REAL':s.analysisSource==='WAITING_LIVE'?'AGUARDANDO DADOS REAIS':s.analysisSource==='OFFLINE'?'SEM FEED':'SIMULADOR'}/></div><p className="muted">O card de US$ 10.000 foi removido daqui para não confundir com o saldo da corretora.</p></section>{card('iq_option','IQ Option')}{card('exnova','Exnova')}</div>}
function Trades({s}:{s:Status}){return <section className="card span12"><div className="split"><h3>Trades / History</h3><div><Pill>{s.trades} trades</Pill> <Pill tone={s.pnl>=0?'good':'bad'}>{money(s.pnl)}</Pill></div></div><TradeTable rows={s.recentTrades}/></section>}
function Logs({s}:{s:Status}){return <div className="grid"><section className="card span7"><h3>Auditoria</h3><div className="timeline">{(s.audit||[]).slice(0,20).map((x:any,i:number)=><div className="event" key={i}><time>{tm(x.ts)}</time><div><b>{x.action}</b><span>{x.actorRole} · {x.actorId}</span></div></div>)}</div></section><section className="card span5"><h3>Incidentes</h3>{(s.incidents||[]).length?(s.incidents||[]).map((x:any,i:number)=><div className="incident" key={i}><Pill tone="bad">{x.severity}</Pill><b>{x.code}</b><span>{x.message}</span></div>):<Empty text="Nenhum incidente registrado"/>}</section></div>}

function Master({s,act,busy}:{s:Status|null,act:any,busy:boolean}){
  const[data,setData]=useState<any>(null);
  const[adminBusy,setAdminBusy]=useState(false);
  const[msg,setMsg]=useState('');
  const[email,setEmail]=useState('');
  const[days,setDays]=useState('30');
  const[query,setQuery]=useState('');
  const[onlineOnly,setOnlineOnly]=useState(false);

  const load=useCallback(async()=>{try{const r=await fetch('/api/master',{cache:'no-store'});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'master_failed');setData(j.data);setMsg('')}catch(e:any){setMsg(String(e?.message||e))}},[]);
  useEffect(()=>{load();const id=setInterval(load,5000);return()=>clearInterval(id)},[load]);

  const admin=async(payload:any)=>{setAdminBusy(true);setMsg('');try{const r=await fetch('/api/master',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'master_action_failed');await load();return true}catch(e:any){setMsg(String(e?.message||e));return false}finally{setAdminBusy(false)}};

  const grantByEmail=async()=>{const clean=email.trim().toLowerCase();if(!clean){setMsg('Digite o e-mail da conta.');return}const ok=await admin({action:'grant_agent_by_email',value:{email:clean,days:days==='forever'?null:Number(days)}});if(ok)setMsg(days==='forever'?'Agent liberado sem vencimento para '+clean+'.':'Agent liberado por '+days+' dias para '+clean+'.')};
  const revokeByEmail=async()=>{const clean=email.trim().toLowerCase();if(!clean){setMsg('Digite o e-mail da conta.');return}if(!window.confirm('Bloquear o Agent desta conta agora?'))return;const ok=await admin({action:'revoke_agent_by_email',value:{email:clean}});if(ok)setMsg('Agent bloqueado para '+clean+'.')};
  const revokeSessionsByEmail=async()=>{const clean=email.trim().toLowerCase();if(!clean){setMsg('Digite o e-mail da conta.');return}if(!window.confirm('Encerrar as sessões web desta conta?'))return;const ok=await admin({action:'revoke_sessions_by_email',value:{email:clean}});if(ok)setMsg('Sessões encerradas para '+clean+'.')};

  const accounts=data?.accounts||[];
  const devices=accounts.flatMap((x:any)=>x.devices||[]);
  const onlineNow=data?.onlineNow||[];
  const summary=data?.summary||{};
  const q=query.trim().toLowerCase();
  const filteredAccounts=accounts.filter((x:any)=>(!q||String(x.email||'').toLowerCase().includes(q)||String(x.plan||'').toLowerCase().includes(q))&&(!onlineOnly||x.webOnline||x.agentOnline));
  return <div className="grid">
    <section className="card span12">
      <div className="split"><div><div className="eyebrow">MASTER PRIVADA</div><h3>Central administrativa Sentinel</h3><p className="muted">Acesso exclusivo da sua conta Master. Controle clientes, licenças do Agent, PCs, sessões e operação remota.</p></div><div className="actions"><Pill tone="good">MASTER ACTIVE</Pill><button className="secondary" disabled={adminBusy} onClick={load}>Atualizar</button></div></div>
      <div className="metrics">
        <Metric label="Contas" value={String(summary.accounts??accounts.length)}/>
        <Metric label="Acessos Agent" value={String(summary.licensedAccounts??0)}/>
        <Metric label="Online no site" value={String(summary.webOnline??0)}/>
        <Metric label="PCs online" value={String(summary.onlineDevices??devices.filter((d:any)=>d.online).length)}/>
      </div>
      <div className="masterFilters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cliente por e-mail ou plano"/><button className={onlineOnly?'primary':'secondary'} onClick={()=>setOnlineOnly(v=>!v)}>{onlineOnly?'Mostrando online':'Somente online'}</button></div>
      {msg&&<div className="alert"><b>Master:</b> {msg}</div>}
    </section>

    <section className="card span7">
      <div className="split"><div><div className="eyebrow">LIBERAÇÃO RÁPIDA</div><h3>Liberar Agent por e-mail</h3><p className="muted">A conta precisa existir. O mesmo controle depois será alimentado automaticamente pelo pagamento e vencimento.</p></div><Pill tone="good">POR CONTA</Pill></div>
      <div className="formgrid three topgap">
        <label className="field"><span>E-mail da conta</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="cliente@email.com"/></label>
        <label className="field"><span>Validade</span><select value={days} onChange={e=>setDays(e.target.value)}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">1 ano</option><option value="forever">Sem vencimento</option></select></label>
        <div className="field"><span>Ações</span><div className="actions"><button className="primary" disabled={adminBusy||!email.trim()} onClick={grantByEmail}>Liberar</button><button className="secondary" disabled={adminBusy||!email.trim()} onClick={revokeSessionsByEmail}>Encerrar sessões</button><button className="kill" disabled={adminBusy||!email.trim()} onClick={revokeByEmail}>Bloquear</button></div></div>
      </div>
    </section>

    <section className="card span5">
      <div className="split"><div><div className="eyebrow">PRESENÇA</div><h3>Pessoas online</h3></div><Pill tone={onlineNow.length?'good':'neutral'}>{onlineNow.length} agora</Pill></div>
      <div className="timeline topgap">{onlineNow.slice(0,12).map((x:any)=><div className="event" key={x.id}><time>{x.agentOnline?'PC':x.webOnline?'WEB':'—'}</time><div><b>{x.email}</b><span>{x.agentOnline?'Agent online':x.webOnline?'Painel ativo':'Offline'}{x.lastAgentSeenAt?' · PC '+tm(x.lastAgentSeenAt):''}</span></div></div>)}{!onlineNow.length&&<Empty text="Nenhuma conta ativa agora"/>}</div>
    </section>

    {filteredAccounts.map((x:any)=><MasterAccount key={x.id} a={x} admin={admin} busy={adminBusy}/>)}
    {!filteredAccounts.length&&<section className="card span12"><Empty text={accounts.length?'Nenhuma conta corresponde ao filtro.':'Carregando contas da Master...'}/></section>}
    {(data?.unpairedDevices||[]).length>0&&<section className="card span12"><div className="split"><div><div className="eyebrow">PCs AINDA NÃO VINCULADOS</div><h3>Instalações aguardando conta</h3></div><Pill tone="warn">{String(data.unpairedDevices.length)}</Pill></div><div className="timeline topgap">{data.unpairedDevices.map((d:any)=><div className="event" key={d.id}><time>{d.online?'ONLINE':'OFF'}</time><div><b>{d.displayName||'PC Sentinel'}</b><span>Agent {d.agentVersion||'—'} · aguardando vínculo por código</span></div></div>)}</div></section>}

    <section className="card span12">
      <div className="split"><div><h3>Auditoria Master</h3><p className="muted">Liberações, bloqueios, alterações e comandos ficam registrados. Senhas e credenciais da corretora não aparecem aqui.</p></div><Pill>{String(data?.audit?.length||0)} eventos</Pill></div>
      <div className="timeline">{(data?.audit||[]).map((x:any)=><div className="event" key={x.id}><time>{tm(x.createdAt)}</time><div><b>{String(x.action).replaceAll('_',' ')}</b><span>{x.targetDeviceId?'PC '+String(x.targetDeviceId).slice(0,8):x.targetAccountId?'Conta '+String(x.targetAccountId).slice(0,8):'Sistema'}</span></div></div>)}</div>
    </section>
  </div>
}

function MasterAccount({a,admin,busy}:{a:any,admin:any,busy:boolean}){
  const[plan,setPlan]=useState(String(a.plan||'free'));
  const[max,setMax]=useState(String(a.maxDevices||1));
  useEffect(()=>{setPlan(String(a.plan||'free'));setMax(String(a.maxDevices||1))},[a.plan,a.maxDevices]);
  const cmd=(d:any,command:string)=>admin({action:'device_command',accountId:a.id,deviceId:d.id,value:{command}});
  const grant30=()=>admin({action:'set_agent_access',accountId:a.id,value:{enabled:true,expiresAt:new Date(Date.now()+30*86400000).toISOString()}});
  const grantForever=()=>admin({action:'set_agent_access',accountId:a.id,value:{enabled:true,expiresAt:null}});
  const blockAgent=()=>window.confirm('Bloquear o Agent desta conta?')&&admin({action:'set_agent_access',accountId:a.id,value:{enabled:false,expiresAt:null}});
  const expiry=a.accessExpiresAt?new Date(a.accessExpiresAt).toLocaleString('pt-BR'):'Sem vencimento';

  return <section className="card span12">
    <div className="split"><div><div className="eyebrow">{a.role==='master'?'SUA CONTA MASTER':'CONTA CLIENTE'}</div><h3>{a.email}</h3><p className="muted">Criada em {new Date(a.createdAt).toLocaleString('pt-BR')} · {a.sessionCount||0} sessão(ões) ativa(s) · último painel {a.lastWebSeenAt?new Date(a.lastWebSeenAt).toLocaleString('pt-BR'):'—'}</p></div><div className="actions"><Pill tone={a.agentOnline?'good':'neutral'}>{a.agentOnline?'PC ONLINE':'PC OFFLINE'}</Pill><Pill tone={a.webOnline?'good':'neutral'}>{a.webOnline?'WEB ONLINE':'WEB OFFLINE'}</Pill><Pill tone={a.accessActive?'good':'bad'}>{a.role==='master'?'MASTER LIVRE':a.accessActive?'AGENT LIBERADO':'AGENT BLOQUEADO'}</Pill><Pill tone={a.status==='active'?'good':'bad'}>{String(a.status).toUpperCase()}</Pill></div></div>

    <div className="formgrid three">
      <label className="field"><span>Plano</span><input value={plan} disabled={a.role==='master'} onChange={e=>setPlan(e.target.value)}/></label>
      <label className="field"><span>Limite de PCs</span><input type="number" min="1" max="50" value={max} disabled={a.role==='master'} onChange={e=>setMax(e.target.value)}/></label>
      <div className="field"><span>Validade do Agent</span><div className="row"><span>{a.agentEnabled?'Habilitado':'Desabilitado'}</span><b>{a.role==='master'?'Permanente':expiry}</b></div></div>
    </div>

    <div className="actions topgap">
      {a.role!=='master'&&<><button className="primary" disabled={busy} onClick={grant30}>Liberar 30 dias</button><button className="secondary" disabled={busy} onClick={grantForever}>Liberar sem vencimento</button><button className="kill" disabled={busy||!a.agentEnabled} onClick={blockAgent}>Bloquear Agent</button><button className={a.status==='active'?'kill':'primary'} disabled={busy} onClick={()=>admin({action:'set_status',accountId:a.id,value:{status:a.status==='active'?'suspended':'active'}})}>{a.status==='active'?'Suspender conta':'Reativar conta'}</button><button className="secondary" disabled={busy} onClick={()=>admin({action:'set_plan',accountId:a.id,value:{plan}})}>Salvar plano</button><button className="secondary" disabled={busy} onClick={()=>admin({action:'set_max_devices',accountId:a.id,value:{maxDevices:Number(max)}})}>Salvar PCs</button></>}
      <button className="secondary" disabled={busy} onClick={()=>window.confirm('Encerrar as outras sessões desta conta?')&&admin({action:'revoke_sessions',accountId:a.id,value:{}})}>Encerrar sessões</button>
    </div>

    <div className="topgap">{(a.devices||[]).map((d:any)=><div className="card" key={d.id}>
      <div className="split"><div><b>{d.displayName||'PC Sentinel'}</b><div className="muted">Agent {d.agentVersion||'—'} · {d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString('pt-BR'):'nunca visto'}</div></div><div><Pill tone={d.online?'good':'neutral'}>{d.online?'ONLINE':'OFFLINE'}</Pill> <Pill tone={d.status==='active'?'good':'bad'}>{String(d.status).toUpperCase()}</Pill></div></div>
      <div className="stack topgap"><Row k="Bot" v={String(d.state?.state||'—').toUpperCase()}/><Row k="Conta" v={String(d.state?.liveBroker?.mode||d.state?.mode||'—').toUpperCase()}/><Row k="Piloto DEMO" v={d.state?.autopilot?.enabled?'ARMADO':'DESARMADO'}/><Row k="Ativo" v={String(d.state?.liveBroker?.symbol||d.state?.settings?.asset||'—')}/><Row k="Mercado" v={String(d.state?.liveBroker?.marketStatus||'—').toUpperCase()}/><Row k="Heartbeat" v={d.heartbeatAt?new Date(d.heartbeatAt).toLocaleTimeString('pt-BR'):'—'}/></div>
      <div className="actions topgap">
        <button className="primary" disabled={busy||!d.online||d.status!=='active'||!a.accessActive} onClick={()=>window.confirm('Iniciar/retomar a análise neste PC? O piloto DEMO só opera se estiver armado na conta do cliente.')&&cmd(d,'control/start')}>Iniciar análise</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/pause')}>Pausar</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/stop')}>Parar</button>
        <button className="kill" disabled={busy||!d.online||d.status!=='active'} onClick={()=>window.confirm('Ativar KILL SWITCH neste PC?')&&cmd(d,'control/kill')}>Kill Switch</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/freeze')}>Freeze</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/unfreeze')}>Unfreeze</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/reset-kill')}>Liberar Kill</button>
        <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/clear-error')}>Limpar erro</button>
        <button className={d.status==='active'?'kill':'primary'} disabled={busy} onClick={()=>window.confirm(d.status==='active'?'Revogar este PC?':'Reativar este PC?')&&admin({action:d.status==='active'?'revoke_device':'restore_device',accountId:a.id,deviceId:d.id,value:{}})}>{d.status==='active'?'Revogar PC':'Reativar PC'}</button>
      </div>
    </div>)}{!(a.devices||[]).length&&<Empty text="Nenhum PC vinculado a esta conta"/>}</div>
  </section>
}

function Settings({s,agent,agentCommand,busy,account,pairCode,setPairCode,claimPair}:{s:Status,agent:any,agentCommand:any,busy:boolean,account:any,pairCode:string,setPairCode:any,claimPair:any}){const remote=s?.remote||{},access=account?.profile?.access_active===true||account?.profile?.role==='master',expires=account?.profile?.access_expires_at?new Date(account.profile.access_expires_at).toLocaleString('pt-BR'):'Sem vencimento';return <div className="grid"><section className="card span6"><div className="split"><h3>Minha conta</h3><Pill tone={account?.profile?.role==='master'?'good':access?'good':'bad'}>{account?.profile?.role==='master'?'MASTER':access?'AGENT LIBERADO':'AGENT BLOQUEADO'}</Pill></div><div className="stack topgap"><Row k="E-mail" v={account?.user?.email||'—'}/><Row k="Plano" v={account?.profile?.plan||'free'}/><Row k="Acesso Agent" v={account?.profile?.role==='master'?'Permanente':access?'Ativo':'Inativo'}/><Row k="Validade" v={account?.profile?.role==='master'?'Permanente':expires}/><Row k="Limite de PCs" v={String(account?.profile?.max_devices||1)}/><Row k="PC atual" v={remote.displayName||'—'}/><Row k="Agent remoto" v={remote.online?'ONLINE':'OFFLINE'}/><Row k="Versão" v={String(s?.agentVersion||agent.version||'13.1.0')}/></div></section><section className="card span6"><h3>{agent.paired===false&&agent.pairingCode?'Novo computador detectado':'Vincular PC'}</h3><p className="muted">{access?(agent.paired===false&&agent.pairingCode?'O Sentinel detectou este computador como uma instalação nova. Vincule-o à conta. Se o limite de PCs estiver cheio, você poderá substituir o computador antigo.':'No primeiro uso, abra o ícone S do Agent no PC e copie o código SNTL. O vínculo é feito uma vez e o PC passa a pertencer a esta conta.'):'Esta conta ainda não tem licença de Agent. O login funciona, mas o vínculo do PC fica bloqueado até a Master ou o pagamento liberar o acesso.'}</p><div className="pairBox"><input value={pairCode} disabled={!access} onChange={e=>setPairCode(e.target.value.toUpperCase())} placeholder="SNTL-XXXX-XXXX"/><button className="primary" disabled={busy||!pairCode||!access} onClick={claimPair}>{agent.paired===false&&agent.pairingCode?'Vincular este PC':'Vincular'}</button></div><div className="actions topgap">{access?<a className="secondary linkbtn" href="/downloads/Sentinel-Agent-Windows.exe?v=13.1.0-r11&release=sentinel-v13-1-clean-feed-core" download>Baixar Agent V13.1</a>:<button className="secondary" disabled>Agent V13.1 · aguardando compra</button>}</div></section><section className="card span6"><h3>Agent local</h3><div className="stack"><Row k="Runtime" v={s.runtimeKind==='persistent-worker'?'Este PC':'PC remoto'}/><Row k="Agent" v={agent.process?'ONLINE':'OFFLINE'}/><Row k="Worker" v={agent.worker?'ONLINE':'OFFLINE'}/><Row k="Browser driver" v={s.browserDriver?.configured?'Configurado':s.runtimeKind==='remote-agent'?'No PC remoto':'Não configurado'}/></div><div className="actions topgap"><button className="primary" disabled={busy||s.runtimeKind!=='persistent-worker'||!agent.process} onClick={()=>agentCommand('restart')}>Reiniciar Agent</button><button className="secondary" disabled={busy||s.runtimeKind!=='persistent-worker'||!agent.process} onClick={()=>window.confirm('Desligar o Agent local? O ícone do Sentinel continuará na bandeja para você ligar novamente.')&&agentCommand('exit')}>Desligar Agent</button></div></section><section className="card span6"><h3>Segurança</h3><div className="stack"><Row k="Piloto DEMO" v="Só arma na conta DEMO da própria corretora e exige validação dos controles"/><Row k="Conta REAL" v="Análise automática; nenhuma ordem REAL é enviada automaticamente"/><Row k="Senha da corretora" v="Nunca enviada ao site"/><Row k="Agent" v="Identidade única por instalação + licença da conta"/><Row k="Conta/PC" v="Comandos aceitos somente do dono do dispositivo"/><Row k="Vencimento" v="Agent para e portas remotas fecham"/><Row k="Fail closed" v="WAIT / bloqueio em dúvida"/></div></section></div>}

function TradeTable({rows=[]}:{rows:any[]}){return <div className="tablewrap"><table className="table"><thead><tr><th>Hora</th><th>Ativo</th><th>Direção</th><th>Valor</th><th>Status</th><th>P&L</th></tr></thead><tbody>{rows.map((x:any)=><tr key={x.id}><td>{tm(x.openedAt)}</td><td>{x.asset}</td><td>{x.side}</td><td>{money(x.amount)}</td><td><Pill tone={x.won===true?'good':x.won===false?'bad':'neutral'}>{x.status}</Pill></td><td className={Number(x.pnl)>=0?'positive':'negative'}>{x.pnl==null?'—':money(x.pnl)}</td></tr>)}{!rows.length&&<tr><td colSpan={6}><Empty text="Nenhuma operação concluída"/></td></tr>}</tbody></table></div>}
function Row({k,v}:{k:string,v:string}){return <div className="row"><span>{k}</span><b>{v}</b></div>}
function Empty({text}:{text:string}){return <div className="empty">{text}</div>}
function Text({label,value,onChange,type='text'}:{label:string,value:any,onChange:any,type?:string}){return <label className="field"><span>{label}</span><input type={type} value={value??''} onChange={onChange}/></label>}
function Num({label,value,onChange}:{label:string,value:any,onChange:any}){return <label className="field"><span>{label}</span><input type="number" value={value??''} onChange={onChange}/></label>}
function Select({label,value,onChange,options}:{label:string,value:any,onChange:any,options:string[][]}){return <label className="field"><span>{label}</span><select value={value} onChange={onChange}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
function fmt(v:any,d=5){return Number.isFinite(Number(v))?Number(v).toFixed(d):'—'}

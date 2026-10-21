'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';

import {BotControl} from '../../components/BotControl';
import {unpackExecutor} from '../../../agent/worker/executor-remote.mjs';
import {LiveScenarioCard} from '../../components/LiveScenarioCard';
import {VISIBLE_STRATEGIES,normalizeUserStrategy} from '../../../agent/src/core/visible-strategy-guide.mjs';
import {ActiveBrowserSession} from '../../components/ActiveBrowserSession';
import {LanguageSwitcher,T,useSentinelLocale} from '../../components/SentinelLocale';
import {watchSignedLiveAnalyst} from '../../lib/signed-live-analyst-channel';
import agentRelease from '../../../agent/release.json';
import {acceptSignedPcFrame,keepNewerVerifiedQuote,keepSignedViewOverCloud,reconcileSignedAnalystDisplay,reconcileCloudPcOpportunity} from '../../lib/signed-pc-window-order.mjs';

type Status=any;
// The site's AVAILABLE version comes from the release packaged in this
// deployment. The INSTALLED Windows Agent version still comes only from its
// authenticated worker/manager status and may legitimately be older.
const WEB_RELEASE_VERSION=agentRelease.publicVersion||agentRelease.version;
const AVAILABLE_AGENT_VERSION=agentRelease.version;
const AGENT_DOWNLOAD_URL=`/downloads/Sentinel-Agent-${encodeURIComponent(AVAILABLE_AGENT_VERSION)}.exe?build=${encodeURIComponent(agentRelease.build)}`;
const AGENT_ZIP_DOWNLOAD_URL=`/downloads/Sentinel-Agent-${AVAILABLE_AGENT_VERSION}-Alternativo.zip`;
function AgentZipDownload(){
 const {language}=useSentinelLocale();
 return <div className="sentinelPcOnly" style={{maxWidth:270}}>
  <a className="secondary linkbtn" href={AGENT_ZIP_DOWNLOAD_URL} download>{language==='en'?'Download ZIP installer':'Baixar instalador em ZIP'}</a>
  <small className="muted" style={{display:'block',marginTop:5,lineHeight:1.4}}>{language==='en'?'Extract all files and open Instalar-Sentinel.cmd.':'Extraia todos os arquivos e abra Instalar-Sentinel.cmd.'}</small>
 </div>;
}
const tabDefs=[
  {key:'Market Analysis',label:'Mercado',icon:'⌁',group:'Análise',title:'Analista em tempo real',subtitle:'Cenário, sinais, reversões e controles em uma única tela.'},
  {key:'Strategies',label:'Estratégias',icon:'◇',group:'Análise',title:'Estratégias',subtitle:'Escolha uma estratégia de previsão.'},
  {key:'Broker Connection',label:'Corretora',icon:'⇄',group:'Conexão',title:'Corretora',subtitle:'Conecte IQ Option ou Exnova no computador.'},
  {key:'Settings',label:'Minha conta',icon:'⚙',group:'Conta',title:'Minha conta',subtitle:'Seu acesso, licença e Agent Windows.'},
  {key:'Membership',label:'Licença',icon:'◈',group:'Conta',title:'Sua licença',subtitle:'Pagamento único, sem renovação.'},
  {key:'Master Console',label:'Master',icon:'◆',group:'Admin',title:'Master Sentinel',subtitle:'Gerencie clientes, licenças, PCs e suporte remoto.'}
] as const;
const money=(n:any)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0));
const pct=(n:any)=>`${Number(n||0).toFixed(1)}%`;
const tm=(ts:any)=>ts?new Date(ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const modeLabel=(v:any)=>{const m=String(v??'—').toLowerCase();return m==='demo'?'PRÁTICA':m==='real'?'REAL':String(v??'—').toUpperCase()};
function Metric({label,value,sub}:{label:string,value:string,sub?:string}){const {t}=useSentinelLocale();return <div className="metric"><small>{t(label)}</small><b>{t(value)}</b>{sub&&<em>{t(sub)}</em>}</div>}
function Pill({children,tone='neutral'}:{children:any,tone?:string}){return <span className={`pill ${tone}`}>{children}</span>}
function friendlyError(error:any){
  const m=String(error?.message||error||'');
  const map:Record<string,string>={
    pc_offline:'Agent do PC está offline. Abra o Sentinel Agent no computador e tente novamente.',
    pc_nao_vinculado:'Este PC ainda não está vinculado à sua conta.',
    agent_access_required:'Esta conta ainda não tem acesso liberado ao Agent.',
    agent_access_inactive:'O acesso deste Agent está bloqueado ou ainda não foi ativado.',
    subscription_inactive:'O acesso deste Agent está bloqueado ou ainda não foi ativado.',
    agent_not_paired:'O Agent ainda não está vinculado à conta.',
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
  const {t,language}=useSentinelLocale();

  const[tab,setTab]=useState('Market Analysis');const[s,setS]=useState<Status|null>(null);const[err,setErr]=useState('');const[notice,setNotice]=useState('');const[busy,setBusy]=useState(false);const[source,setSource]=useState<'remote'|'local'>('remote');const[agent,setAgent]=useState<any>({process:false,worker:false,remote:false});const[account,setAccount]=useState<any>(null);const[mobileMore,setMobileMore]=useState(false);const[theme,setTheme]=useState<'light'|'dark'>('light');const[compactAnalyst,setCompactAnalyst]=useState(false);const refreshBusy=useRef(false);
  const autoLinkedDevice=useRef(new Set<string>());
  const remotePolledAt=useRef(0);
  const liveFrameAt=useRef(0);
  // Reconcile an in-flight user selection with delayed Agent status/broadcast.
  // This only retains display settings; it never overrides actual Agent signals.
  const pendingSettingsRef=useRef<{values:Record<string,any>,until:number}|null>(null);
  const reconcileSettings=useCallback((serverSettings:any)=>{
    const pending=pendingSettingsRef.current;
    if(!pending)return serverSettings;
    if(Date.now()>pending.until){pendingSettingsRef.current=null;return serverSettings;}
    const incoming=serverSettings&&typeof serverSettings==='object'?serverSettings:{};
    if(Object.entries(pending.values).every(([k,v])=>incoming[k]===v)){
      pendingSettingsRef.current=null;return incoming;
    }
    return {...incoming,...pending.values};
  },[]);
  const reconcileStatus=useCallback((data:Status)=>data?
    {...data,settings:reconcileSettings(data.settings)}:data,[reconcileSettings]);
  const isMaster=account?.profile?.role==='master';const agentAccess=isMaster||account?.profile?.access_active===true;const visibleTabs=tabDefs.filter(x=>x.key!=='Master Console'||isMaster);
  const refreshMe=useCallback(async()=>{try{const r=await fetch('/api/auth/me',{cache:'no-store'});const j=await r.json();if(r.ok&&j.ok)setAccount(j);else if(r.status===401)window.location.href='/login'}catch{}},[]);
  const refresh=useCallback(async()=>{
    // Do not run the expensive remote status endpoint on every 2.5s tick.
    // Live broadcast drives the screen; when broadcasts are interrupted,
    // use an 8s fallback rather than a flood of duplicate requests.
    const lastCloudPollAge=Date.now()-remotePolledAt.current;
    const streaming=Date.now()-liveFrameAt.current<8000;
    if(remotePolledAt.current>0&&lastCloudPollAge<(streaming?45000:6000))return;
    if(refreshBusy.current)return;refreshBusy.current=true;
    try{
      const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      const [mhResult,localResult]=mobile?await Promise.allSettled([Promise.reject(new Error('remote_mobile')),Promise.reject(new Error('remote_mobile'))]):await Promise.allSettled([managerFetch('health','GET',undefined,1200),localFetch('status','GET',undefined,1500)]);
      const mh=mhResult.status==='fulfilled'?mhResult.value:null;
      if(localResult.status==='fulfilled'){
        const data=normalizeStatus(localResult.value);setS(reconcileStatus(data));setSource('local');setErr('');
        setAgent((v:any)=>({...v,process:true,worker:true,remote:false,version:data.agentVersion||v.version,lastSeen:Date.now(),pairingCode:data.remoteRelay?.pairingCode||null,paired:data.remoteRelay?.paired}));
        return
      }
      if(mh?.ok){
        setAgent((v:any)=>({...v,process:true,worker:!!mh.workerHealthy,remote:false,version:mh.version,status:mh.status,lastSeen:Date.now()}));
        setSource('local');setErr(`Agent aberto, mas o worker não respondeu (${String(localResult.status==='rejected'?localResult.reason?.message||localResult.reason:'timeout')}).`);return
      }
      try{
        const data=normalizeStatus(await cloudFetch('status'));
        remotePolledAt.current=Date.now();
        setS((previous:Status|null)=>{
          // An occasional incomplete cloud status is not an instruction
          // from the PC to clear its currently displayed opportunity.
          // Preserve the authenticated clock calibration across polls too.
          if(keepSignedViewOverCloud(previous,data))return {...previous,autoExecutor:Number(previous?.autoExecutor?.updatedAt)>Number(data?.autoExecutor?.updatedAt)?previous.autoExecutor:data.autoExecutor};
          return reconcileStatus(reconcileCloudPcOpportunity(previous,data));
        });
        setSource('remote');const online=!!data?.remote?.online;
        setAgent((v:any)=>({...v,remote:online,process:online,worker:online,paired:true,version:data.agentVersion||v.version}));
        setErr(online?'':'PC vinculado, mas Agent offline.')
      }catch(e:any){
        // A single failed/slow cloud refresh must NOT unmount the analyst,
        // tear down the authenticated WebSocket or blank a valid scenario.
        // Last quotes become stale naturally and cannot authorize entries.
        setSource('remote');
        const m=String(e?.message||e);
        if(m==='pc_nao_vinculado'){
          setS(null);
          setAgent((v:any)=>({...v,remote:false,process:false,worker:false}));
          setErr('');
        }else{
          // Keep the fixed-height card's own stale-quote notice; a transient
          // cloud error must not add a banner that shifts the entire layout.
          setErr('');
        }
      }
    }finally{refreshBusy.current=false}
  },[reconcileStatus]);
  // Supabase Broadcast carries only temporary numeric analyst snapshots; it
  // never writes quote history to Postgres. Every session still authenticates
  // using the existing remote status route before learning the random channel.
  useEffect(()=>{
    const topic=source==='remote'?String(s?.liveTopic||''):'';
    const key=source==='remote'?String(s?.liveSignatureKey||''):'';
    if(!/^realtime:sentinel-[0-9a-f]{48}$/.test(topic)||!/^[0-9a-f]{64}$/.test(key))return;
    return watchSignedLiveAnalyst(topic,key,payload=>{
      setS((previous:Status|null)=>{
        if(!previous||String(previous.liveTopic||'')!==topic)return previous;
        // Ignore out-of-order events across remote status snapshots.
        // Compact PC packets may momentarily omit a window at rollover.
        // Reuse only the last already-confirmed PC window while retaining
        // fresh quotes; the next window must still originate from the Agent.
        const pcFrame=reconcileSignedAnalystDisplay(previous,payload);
        const incomingBot=unpackExecutor(payload.bot);
        const autoExecutor=incomingBot&&Number(incomingBot.updatedAt)>=Number(previous.autoExecutor?.updatedAt||0)?incomingBot:previous.autoExecutor;
        const prevPriceAt=Number(previous.liveBroker?.lastQuoteAt||0);
        // An updated strategy evaluation may use a quote older than a concurrent
        // full-status response. Accept that evaluation, but never rewind price.
        const olderQuote=Number(pcFrame.liveBroker?.lastQuoteAt||0)<prevPriceAt-250;
        const prevEval=Number(previous.lastEvalMs||0),nextEval=Number(pcFrame.lastEvalMs||0);
        // Every accepted signed frame comes from the PC. Do not discard its
        // fired/open transition because a cloud status has a newer quote.
        // Also never move backwards to a previous opportunity window.
        if(!acceptSignedPcFrame(previous,pcFrame))return {...keepNewerVerifiedQuote(previous,pcFrame),autoExecutor};
        // Only an accepted, current frame keeps the fast channel healthy.
        // Obsolete frames must not suppress the authenticated status fallback.
        liveFrameAt.current=Date.now();
        return {...previous,autoExecutor,
          state:pcFrame.state,
          killSwitch:pcFrame.killSwitch,masterFrozen:pcFrame.masterFrozen,
          lastEvalMs:Math.max(prevEval,nextEval),
          // Motor and expiration can change on the PC between the expensive
          // authenticated status polls. The signed live packet must update
          // both so the mobile card immediately follows the actual motor.
          settings:reconcileSettings({...(previous.settings||{}),
            ...(pcFrame.settings||{})}),
          // The live packet is intentionally compact. Preserve all other
          // diagnostic/strategy fields from the slower complete snapshot.
          lastResult:{
            ...(previous.lastResult||{}),...pcFrame.lastResult,
            analysis:{...(previous.lastResult?.analysis||{}),...(pcFrame.lastResult?.analysis||{})}
          },
          liveBroker:olderQuote?previous.liveBroker:{...(previous.liveBroker||{}),...pcFrame.liveBroker},
          feed:olderQuote?previous.feed:{...(previous.feed||{}),...pcFrame.feed},
          // Both values are derived from the signed frame. No extra API or
          // Supabase writes; distinguish an old PC quote from a delayed socket.
          liveQuoteAgeAtFrame:Number(pcFrame.liveBroker?.lastQuoteAt)>0?
            Math.max(0,Number(pcFrame.at)-Number(pcFrame.liveBroker.lastQuoteAt)):null,
          liveStreamAt:Date.now(),liveTransport:'push',
          remote:{...(previous.remote||{}),online:true}
        };
      });
    },(offsetMs:number,rttMs:number)=>{
      setS((previous:Status|null)=>previous?.liveTopic===topic?
        {...previous,pcClockOffsetMs:offsetMs,pcClockRttMs:rttMs}:previous);
    });
  },[s?.liveTopic,s?.liveSignatureKey,source,reconcileSettings]);
  // Compact mode affects presentation only: no new feeds, timers, or Supabase subscriptions.
  useEffect(()=>{try{setCompactAnalyst(new URLSearchParams(window.location.search).get('compact')==='1')}catch{}},[]);
  useEffect(()=>{try{const requested=new URLSearchParams(window.location.search).get('tab');if(requested==='Dashboard')setTab('Market Analysis');else if(requested&&tabDefs.some(t=>t.key===requested))setTab(requested)}catch{}},[]);
  const toggleCompactAnalyst=()=>{
    const next=!compactAnalyst;
    setCompactAnalyst(next);
    // Return within the authenticated app: do not navigate to /login.
    setTab('Market Analysis');
    try{const url=new URL(window.location.href);
      if(next){url.searchParams.set('compact','1');url.searchParams.set('tab','Market Analysis')}
      else{url.searchParams.delete('compact');url.searchParams.set('tab','Market Analysis')}
      window.history.replaceState(null,'',url.toString());
    }catch{}
  };
  useEffect(()=>{try{const saved=localStorage.getItem('sentinel-theme');const next=saved==='light'?'light':'dark';setTheme(next);document.documentElement.dataset.theme=next}catch{}},[]);
  useEffect(()=>{try{document.documentElement.dataset.theme=theme;localStorage.setItem('sentinel-theme',theme)}catch{}},[theme]);
  useEffect(()=>{refreshMe();refresh();const id=setInterval(refresh,2500);return()=>clearInterval(id)},[refresh,refreshMe]);
  const act=async(path:string,body:any={})=>{
    const previous=s;
    setBusy(true);setErr('');
    if(path==='mode'&&body?.mode)setS((v:Status|null)=>v?{...v,mode:body.mode}:v);
    if(path==='settings'&&body&&typeof body==='object'){
      pendingSettingsRef.current={values:{...(pendingSettingsRef.current?.values||{}),...body},until:Date.now()+45000};
      setS((v:Status|null)=>v?{...v,settings:{...(v.settings||{}),...body}}:v);
    }
    if(path==='mode')setNotice(body.mode==='demo'?'Mudando para conta de prática…':'Mudando para REAL…');
    else if(path==='settings'&&body?.strategy)setNotice('Ativando estratégia…');
    else if(path.startsWith('brokers/')&&path.endsWith('/login'))setNotice('Abrindo a corretora no PC…');
    else setNotice('Enviando comando ao Agent…');
    try{
      const method=path==='settings'?'PATCH':'POST';
      const commandTimeout=path==='executor/start'||path.startsWith('brokers/')&&path.endsWith('/login')?30000:2200;
      const data=source==='local'&&agent.worker?await localFetch(path,method,body,commandTimeout):await cloudFetch(path,method,body);
      setS((current:Status|null)=>{const next=reconcileStatus(reconcileCloudPcOpportunity(current,normalizeStatus(data)));return Number(current?.autoExecutor?.updatedAt)>Number(next.autoExecutor?.updatedAt)?{...next,autoExecutor:current.autoExecutor}:next;});setErr('');
      if(path==='mode')setNotice(body.mode==='demo'?'Conta de prática ativa.':'Modo REAL ativo para análise; execução continua manual.');
      else if(path==='settings'&&body?.strategy)setNotice('Estratégia aplicada: '+String(body.strategy).replaceAll('_',' ')+'.');
      else if(path.startsWith('brokers/')&&path.endsWith('/login'))setNotice('Comando enviado ao Agent. A janela controlada da corretora deve abrir no PC.');
      else setNotice('Comando aplicado.');
      setTimeout(()=>refresh(),650);setTimeout(()=>refresh(),1900);setTimeout(()=>setNotice(''),4200);return true;
    }catch(e:any){
      if(path==='settings')pendingSettingsRef.current=null;
      if(!path.startsWith('executor/'))setS(previous);else remotePolledAt.current=0;setNotice('');setErr(friendlyError(e));setTimeout(()=>refresh(),300);return false;
    }finally{setBusy(false)}
  };
  // Language belongs to the SITE, including the PC overlay inside the
  // broker. Deliver it through the existing Agent command (no new market
  // polling, subscriptions or strategy resets).
  // A failed remote command must NOT silently suppress all future attempts.
  useEffect(()=>{
    // Each phone/tablet translates its own card from the site locale.
    // NEVER enqueue a remote Agent command for language changes on mobile:
    // no cloud ACK, extra polling, or PC-dependent mobile display.
    const mobileBrowser=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||
      (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    if(mobileBrowser)return;
    if(!s||!agent.worker||s.settings?.uiLanguage===language)return;
    let disposed=false;
    let retryTimer:ReturnType<typeof setTimeout>|null=null;
    let attempts=0;
    const sync=async()=>{
      attempts++;
      try{
        const update={uiLanguage:language};
        const result=source==='local'?
          await localFetch('settings','PATCH',update,2200):
          await cloudFetch('settings','PATCH',update);
        if(disposed)return;
        // A remote ACK is authoritative; reflect the chosen locale without
        // waiting for the slower cloud status poll. Never touch entry windows.
        if(result?.settings?.uiLanguage===language)
          setS((old:Status|null)=>old?{...old,settings:{...(old.settings||{}),uiLanguage:language}}:old);
        else if(attempts<4)retryTimer=setTimeout(sync,5000);
      }catch{
        if(!disposed&&attempts<4)retryTimer=setTimeout(sync,Math.min(12000,3500*attempts));
      }
    };
    void sync();
    return()=>{disposed=true;if(retryTimer)clearTimeout(retryTimer)};
  },[language,source,agent.worker,agent.version,s?.agentVersion,s?.settings?.uiLanguage]);
  const agentCommand=async(action:'restart'|'exit')=>{if(source!=='local'){setErr('Reiniciar/desligar o Agent exige acesso ao PC. Pelo celular você controla o Bot: iniciar, pausar, parar e Kill Switch.');return}setBusy(true);try{await managerFetch(action,'POST',{});if(action==='exit'){setAgent({process:false,worker:false});setSource('remote')}setTimeout(refresh,700);setErr('')}catch(e:any){setErr(`Agent: ${String(e?.message||e)}`)}finally{setBusy(false)}};
  // Pair the authenticated local Windows Agent automatically with the paid
  // account. The proof is read only from the local loopback worker; a remote
  // mobile browser cannot silently claim a random PC.
  useEffect(()=>{
    const code=String(agent?.pairingCode||'');
    const key=String(account?.user?.id||'')+':'+code;
    if(source!=='local'||!agentAccess||agent?.paired!==false||!code||!account?.user?.id)return;
    if(autoLinkedDevice.current.has(key))return;
    autoLinkedDevice.current.add(key);
    const claim=async(replaceExisting=false)=>{
      const res=await fetch('/api/devices/claim',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({code,replaceExisting})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.ok)throw new Error(data.error||'device_claim_failed');
    };
    void (async()=>{
      try{await claim();setNotice('Agent autorizado automaticamente para esta conta.');setTimeout(refresh,600)}
      catch{setErr('Não foi possível autorizar automaticamente o Agent. Verifique sua conta no PC.');}
    })();
  },[source,agentAccess,agent?.paired,agent?.pairingCode,account?.user?.id,refresh]);
  const current=visibleTabs.find(x=>x.key===tab)??visibleTabs[0];const content=useMemo(()=>{
    // Hidden dashboard grids are expensive. During compact/market streaming,
    // only render the analyst; build the other tab AFTER navigating there.
    if(compactAnalyst||tab==='Market Analysis')return null;
    return tab==='Master Console'?<Master s={s} act={act} busy={busy}/>:
      (s||tab==='Membership')?<Panel name={tab} s={s||{}} act={act} busy={busy} agent={agent} agentCommand={agentCommand} account={account} onNavigate={setTab}/>:<OfflinePanel/>;
  },[compactAnalyst,tab,s,busy,agent,account,isMaster,source]);
  const mobileMain=[['Market Analysis','Mercado','⌁'],['Strategies','Estratégias','◇'],['Broker Connection','Corretora','⇄'],['Settings','Conta','⚙']] as const;
  return <div className={`app ${compactAnalyst?"compactAnalyst":""} ${tab==='Market Analysis'?"marketWorkspace":""}`}><ActiveBrowserSession/><aside className="sidebar"><div className="brand"><div className="brandmark"><img src="/devinx-icon.svg" alt="DevinX Trading Lab"/></div><div><span>DEVINX</span><strong>Trading Lab</strong><small>{t('Análise em tempo real')}</small></div></div><nav className="navGroups" aria-label={t('Navegação')}><div className="navGroup">{visibleTabs.map(x=><button key={x.key} className={tab===x.key?'active':''} onClick={()=>setTab(x.key)}><i>{x.icon}</i><span>{t(x.label)}</span></button>)}</div></nav><div className="sidefoot"><div className="masterBadge"><span className={`statusDot ${agent.worker?'online':''}`}/>{isMaster?'MASTER':t('CONTA')}</div><span>{account?.user?.email||'Sentinel'} · {t(source==='local'?'PC local':'PC remoto')}</span></div></aside>
    <main className="main"><header className="topbar"><div className="pageHeading"><div className="eyebrow">{'DEVINX TRADING LAB'} · WEB {WEB_RELEASE_VERSION}</div><h1>{t(current.title)}</h1><p>{t(current.subtitle)}</p></div><div className="topactions">
        <div className="runtimeBadges"><span className="privateBadge">🔒 {account?.profile?.role==='master'?'MASTER':t('PRIVADO')}</span><Pill tone={agent.process?'good':'neutral'}>{t(agent.process?'AGENT ONLINE':'AGENT OFF')}</Pill><Pill tone={agent.worker?'good':'neutral'}>{t(agent.worker?'WORKER ONLINE':'WORKER OFF')}</Pill><Pill tone={String(s?.liveBroker?.mode||s?.mode||'').toLowerCase()==='demo'?'good':String(s?.liveBroker?.mode||s?.mode||'').toLowerCase()==='real'?'bad':'neutral'}>{t('CONTA')} {t(modeLabel(s?.liveBroker?.mode||s?.mode||'—'))}</Pill><Pill tone={s?.state==='error'?'bad':s?.state==='running'?'good':'neutral'}>{t(String(s?.state||'offline').toUpperCase())}</Pill></div>
        <div className="topUtility"><LanguageSwitcher/><button className="themeToggle" onClick={()=>setTheme(theme==='light'?'dark':'light')} title={t("Alternar tema")} aria-label={t("Alternar tema")}>{theme==='light'?t('Escuro'):t('Claro')}</button><button className="kill" disabled={busy||!s} onClick={()=>window.confirm('Ativar KILL SWITCH e parar imediatamente?')&&act('control/kill')}>KILL SWITCH</button><button className="secondary logoutBtn" onClick={async()=>{try{const response=await fetch('/api/auth/logout',{method:'POST'});if(!response.ok)throw new Error('logout_unconfirmed');window.location.replace('/')}catch{setErr(language==='en'?'Logout could not be confirmed. Please try again.':'Não foi possível confirmar a saída. Tente novamente.')}}}>{t('Sair')}</button></div>
      </div></header>
      {(!agent.process||tab==='Market Analysis')&&<div className="agentbanner"><div className="agentIcon">↓</div><div className="agentText"><b>{language==='en'?'Start here: install the Windows Agent':'Comece por aqui: instale o Agent Windows'}</b><span>{language==='en'?'Download and open the installer on your computer. Then choose IQ Option or Exnova in Broker. Your account is recognized automatically.':'Baixe e abra o instalador no computador. Depois, escolha IQ Option ou Exnova em Corretora. Sua conta é reconhecida automaticamente.'}</span></div><div className="agentActions sentinelPcOnly">{agentAccess?<><a className="primary linkbtn" href={AGENT_DOWNLOAD_URL} download="sentinel-agent-windows.exe">{language==='en'?'Install Agent':'Instalar Agent'} · {AVAILABLE_AGENT_VERSION}</a><AgentZipDownload/></>:<a className="primary linkbtn" href={'/api/checkout?market='+(language==='en'?'INTL':'BR')}>{t('Ativar acesso')}</a>}</div></div>}
      {agent.process&&!agent.worker&&source==='local'&&<div className="alert"><b>{t('Agent aberto, worker parado.')}</b> <button className="secondary" disabled={busy} onClick={()=>agentCommand('restart')}>{t('Reiniciar Agent')}</button></div>}
      {notice&&<div className="notice"><span className="noticeDot"/><b>{notice}</b></div>}{err&&<div className="alert"><b>Sentinel:</b> {err}</div>}{(compactAnalyst||tab==='Market Analysis')&&<LiveScenarioCard s={s} busy={busy} act={act} compact={compactAnalyst} onToggleCompact={toggleCompactAnalyst}/>}{(compactAnalyst||tab==='Market Analysis')&&<BotControl s={s} act={act} online={!!agent.worker}/>} {!compactAnalyst&&content}</main>
      <nav className="mobileDock">{mobileMain.map(([k,l,i])=><button key={k} className={tab===k?'active':''} onClick={()=>{setTab(k);setMobileMore(false)}}><i>{i}</i><span>{t(l)}</span></button>)}<button className={mobileMore?'active':''} onClick={()=>setMobileMore(v=>!v)}><i>•••</i><span>{t('Mais')}</span></button></nav>{mobileMore&&<div className="mobileMorePanel">{visibleTabs.filter(x=>!mobileMain.some(([k])=>k===x.key)).map(x=><button key={x.key} onClick={()=>{setTab(x.key);setMobileMore(false)}}><i>{x.icon}</i><span>{t(x.label)}</span></button>)}</div>}
    </div>}


function Loading(){return <div className="grid"><section className="card span12"><div className="skeleton h32"/><div className="skeleton h90"/></section></div>}
function OfflinePanel(){return <div className="grid"><section className="card span12">
  <h3><T>Abra o Agent no computador</T></h3>
  <p className="muted"><T>Depois de entrar nesta conta, instale ou abra o Sentinel Agent. O acesso autorizado é reconhecido automaticamente e o card passa a acompanhar a corretora escolhida.</T></p>
</section></div>}

function Panel({name,s,act,busy,agent,agentCommand,account,onNavigate}:{name:string,s:Status,act:(p:string,b?:any)=>Promise<any>,busy:boolean,agent:any,agentCommand:any,account:any,onNavigate:(v:string)=>void}){
   if(name==='Market Analysis')return null;
   if(name==='Broker Connection')return <Broker s={s} act={act} busy={busy} account={account}/>;
   if(name==='Strategies')return <Strategies s={s} act={act} busy={busy}/>;
   if(name==='Membership')return <Membership account={account}/>;
   return <Settings s={s} agent={agent} agentCommand={agentCommand} busy={busy} account={account}/>;
}

function Membership({account}:{account:any}){
 const {language}=useSentinelLocale();
 const intl=language==='en';
 const localizedPrice=intl?'US$ 100':'R$ 549';
 const profile=account?.profile||{};
 const active=profile.role==='master'||profile.access_active===true;
 const expiry=profile.access_expires_at?new Date(profile.access_expires_at).toLocaleDateString('pt-BR'):'Permanente';
 return <section className="sentinelMembership">
   <span className="sentinelEyebrow"><T>LICENÇA E PAGAMENTO ÚNICO</T></span>
   <h2><T>Seu acesso ao Sentinel</T></h2>
   <p><strong>{localizedPrice}</strong> · <T>Uma compra aprovada libera acesso permanente à conta. Sem mensalidade ou renovação obrigatória.</T></p>
   <div className="sentinelMembershipSummary"><div><small><T>Estado do plano</T></small><strong>{profile.role==='master'?'MASTER':active?'ATIVO':'AGUARDANDO ATIVAÇÃO'}</strong></div><div><small><T>Validade</T></small><strong>{profile.role==='master'?'Permanente':expiry}</strong></div><div><small><T>PCs permitidos</T></small><strong>{profile.max_devices||1}</strong></div></div>
   <div className="sentinelMembershipActions"><span>{localizedPrice} · {intl?'one-time':'pagamento único'}</span>{!active&&<a href={intl?'/api/checkout?market=INTL':'/api/checkout?market=BR'} className="secondary linkbtn"><T>Comprar acesso</T></a>}</div>
 </section>
}

function Strategies({s,act,busy}:{s:Status,act:any,busy:boolean}){
  const {t}=useSentinelLocale();
  const motors=VISIBLE_STRATEGIES;
  const selected=normalizeUserStrategy(s.settings?.engine);
  const active=motors.find(x=>x.id===selected)||motors[0];
  return <section className="card span12 strategySection">
    <div className="split"><div><div className="eyebrow"><T>ESTRATÉGIAS SENTINEL</T></div><h3><T>Escolha uma estratégia para o cenário</T></h3><p className="muted"><T>A estratégia escolhida analisa o mercado atual. A duração selecionada define o vencimento após o sinal.</T></p></div><div className="strategyActive"><span><T>Estratégia em uso</T></span><b>{t(active.name)}</b></div></div>
    <label className="vnextStrategyPicker"><T>Estratégia responsável</T>
      <select disabled={busy} aria-label={t('Selecionar estratégia')} value={selected} onChange={e=>void act('settings',{engine:e.target.value,strategy2:'none',strategy3:'none'})}>
        {motors.map(e=><option value={e.id} key={e.id}>{t(e.name)} · {t(e.short)}</option>)}
      </select>
    </label>
    <p className="muted" style={{marginTop:12}}>{t(active.when)}</p>
    <div data-testid="strategy-when-full-guide" style={{display:'grid',gap:10,marginTop:16}}>
     <b>{t('Quando usar cada estratégia')}</b>
     {motors.map(e=><p key={e.id} className="muted" style={{margin:'0 0 4px'}}><strong>{t(e.name)}:</strong> {t(e.when)}</p>)}
     <small className="muted">{t('As estratégias ajudam a interpretar o gráfico. Todas usam o mesmo motor-base. Nenhuma delas garante acerto.')}</small>
    </div>
  </section>
}

function Risk({s,act}:{s:Status,act:any}){const q=s.settings.risk;const keys=['fixedStake','maxStake','stakePct','maxDailyLoss','dailyProfitTarget','maxDrawdownPct','maxTradesPerSession','maxTradesPerDay','maxTradesPerHour','maxConsecutiveLosses','minConfidence','maxFeedLatencyMs','maxDecisionLatencyMs'];const make=()=>Object.fromEntries(keys.map(k=>[k,String(q?.[k]??'')]));const[form,setForm]=useState<any>(make);const[dirty,setDirty]=useState(false);const[msg,setMsg]=useState('');useEffect(()=>{if(!dirty)setForm(make())},[JSON.stringify(q),dirty]);const set=(k:string)=>(e:any)=>{setDirty(true);setForm((v:any)=>({...v,[k]:e.target.value}))};const save=async()=>{try{const out:any={};for(const k of keys){if(String(form[k]).trim()==='')throw new Error(`Preencha ${k}`);const n=Number(form[k]);if(!Number.isFinite(n))throw new Error(`Valor inválido em ${k}`);out[k]=n}await act('settings',{risk:out});setDirty(false);setMsg('')}catch(e:any){setMsg(String(e?.message||e))}};return <section className="card span12"><div className="split"><div><h3><T>Risco & Limites</T></h3><p className="muted"><T>Você pode apagar e digitar outro valor. Só é aplicado ao clicar Salvar.</T></p></div>{dirty&&<Pill tone="warn"><T>ALTERAÇÕES NÃO SALVAS</T></Pill>}</div><div className="formgrid three"><Num label="Stake fixa" value={form.fixedStake} onChange={set('fixedStake')}/><Num label="Stake máxima" value={form.maxStake} onChange={set('maxStake')}/><Num label="Stake %" value={form.stakePct} onChange={set('stakePct')}/><Num label="Perda diária máx." value={form.maxDailyLoss} onChange={set('maxDailyLoss')}/><Num label="Meta diária opcional" value={form.dailyProfitTarget} onChange={set('dailyProfitTarget')}/><Num label="Drawdown máx. %" value={form.maxDrawdownPct} onChange={set('maxDrawdownPct')}/><Num label="Máx. operações/sessão" value={form.maxTradesPerSession} onChange={set('maxTradesPerSession')}/><Num label="Máx trades/dia" value={form.maxTradesPerDay} onChange={set('maxTradesPerDay')}/><Num label="Máx trades/hora" value={form.maxTradesPerHour} onChange={set('maxTradesPerHour')}/><Num label="Perdas consecutivas" value={form.maxConsecutiveLosses} onChange={set('maxConsecutiveLosses')}/><Num label="Confiança mínima %" value={form.minConfidence} onChange={set('minConfidence')}/><Num label="Feed latency máx. ms" value={form.maxFeedLatencyMs} onChange={set('maxFeedLatencyMs')}/><Num label="Decision latency máx. ms" value={form.maxDecisionLatencyMs} onChange={set('maxDecisionLatencyMs')}/></div>{msg&&<p className="formerror">{msg}</p>}<div className="actions"><button className="primary save" disabled={!dirty} onClick={save}><T>Salvar limites</T></button>{dirty&&<button className="secondary save" onClick={()=>{setForm(make());setDirty(false);setMsg('')}}><T>Descartar</T></button>}</div></section>}

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
      const allowed=[5000,10000,15000,30000,60000];
      if(!allowed.includes(orderDurationMs))throw new Error('Tempo da operação inválido');
      const{orderDurationMs:_drop,...scheduleForm}=form;
      await act('settings',{orderDurationMs,schedule:{...scheduleForm,intervalMs}});
      setDirty(false);setMsg('')
    }catch(e:any){setMsg(String(e?.message||e))}
  };
  return <section className="card span12"><div className="split"><div><h3><T>Análise em tempo real & tempo da operação</T></h3><p className="muted">A análise acompanha cada atualização do mercado em tempo real. CALL/PUT só é liberado como entrada depois que o próprio Sentinel valida o desempenho recente daquele ativo e duração; até lá ele mostra apenas viés técnico.</p></div>{dirty&&<Pill tone="warn"><T>ALTERAÇÕES NÃO SALVAS</T></Pill>}</div><div className="formgrid three"><Text label="Timezone" value={form.timezone} onChange={set('timezone')}/><Text label="Início diário" type="time" value={form.dailyStart} onChange={set('dailyStart')}/><Text label="Fim diário" type="time" value={form.dailyEnd} onChange={set('dailyEnd')}/><Select label="Fallback sem novo evento" value={String(form.intervalMs)} onChange={set('intervalMs')} options={[["1000","1 segundo"],["2000","2 segundos"],["5000","5 segundos"]]}/><Select label="Tempo da operação / expiração" value={String(form.orderDurationMs)} onChange={set('orderDurationMs')} options={[["5000","5 segundos"],["10000","10 segundos"],["15000","15 segundos"],["30000","30 segundos"],["60000","1 minuto"]]}/><Text label="Data/hora inicial (ISO opcional)" value={form.startAt||''} onChange={set('startAt')}/><Text label="Data/hora final (ISO opcional)" value={form.endAt||''} onChange={set('endAt')}/></div>{msg&&<p className="formerror">{msg}</p>}<div className="actions"><button className="primary save" disabled={!dirty} onClick={save}><T>Salvar análise e tempo</T></button>{dirty&&<button className="secondary save" onClick={()=>{setForm(make());setDirty(false);setMsg('')}}><T>Descartar</T></button>}</div></section>
}
function Broker({s,act,busy,account}:{s:Status,act:any,busy:boolean,account:any}){
 const {t}=useSentinelLocale();
 const allowed=account?.profile?.role==='master'||account?.profile?.access_active===true;
 const live=s?.liveBroker||{};
 const local=s?.runtimeKind==='persistent-worker';
 const remote=s?.runtimeKind==='remote-agent'&&s?.remote?.online===true;
 const connected=local||remote;
 const open=(provider:'iq_option'|'exnova')=>{
   if(!connected){window.alert(t('Abra o Sentinel Agent no PC para continuar.'));return}
   void act(`brokers/${provider}/login`,{userInitiated:true});
 };
 return <div className="grid">
   <section className="card span12">
     <h3>{t('Escolha sua corretora')}</h3>
     <p className="muted">{t('O analista acompanha a conta e o ativo da corretora. O bot só executa operações automaticamente quando você o ativa no Agent Windows.')}</p>
     <div className="actions topgap">
       <button className="primary" disabled={busy||!allowed} onClick={()=>open('iq_option')}>{t('Abrir IQ Option')}</button>
       <button className="primary" disabled={busy||!allowed} onClick={()=>open('exnova')}>{t('Abrir Exnova')}</button>
     </div>
   </section>
   <section className="card span12">
     <div className="split"><h3>{t('Conexão do PC')}</h3>
       <Pill tone={connected?'good':'neutral'}>{connected?t('Agent conectado'):t('Agent offline')}</Pill></div>
     <div className="stack topgap">
       <Row k="Corretora" v={live.provider==='iq_option'?'IQ Option':live.provider==='exnova'?'Exnova':'—'}/>
       <Row k="Conta" v={modeLabel(live.mode||'—')}/>
       <Row k="Ativo" v={live.symbol||'—'}/>
       <Row k="Leitura" v={live.analysisFeedValidated||live.feedValidated?t('Em tempo real'):t('Aguardando')}/>
     </div>
     {!connected&&<div className="actions topgap sentinelPcOnly">
       <a className="secondary linkbtn" href={AGENT_DOWNLOAD_URL} download="sentinel-agent-windows.exe">{t('Baixar Agent Windows')}</a>
       <AgentZipDownload/>
     </div>}
   </section>
 </div>
}

function Trades({s}:{s:Status}){return <section className="card span12"><div className="split"><h3>Trades / History</h3><div><Pill>{s.trades} trades</Pill> <Pill tone={s.pnl>=0?'good':'bad'}>{money(s.pnl)}</Pill></div></div><TradeTable rows={s.recentTrades}/></section>}
function Logs({s}:{s:Status}){return <div className="grid"><section className="card span7"><h3><T>Auditoria</T></h3><div className="timeline">{(s.audit||[]).slice(0,20).map((x:any,i:number)=><div className="event" key={i}><time>{tm(x.ts)}</time><div><b>{x.action}</b><span>{x.actorRole} · {x.actorId}</span></div></div>)}</div></section><section className="card span5"><h3><T>Incidentes</T></h3>{(s.incidents||[]).length?(s.incidents||[]).map((x:any,i:number)=><div className="incident" key={i}><Pill tone="bad">{x.severity}</Pill><b>{x.code}</b><span>{x.message}</span></div>):<Empty text="Nenhum incidente registrado"/>}</section></div>}


function Master({s,act,busy}:{s:Status|null,act:any,busy:boolean}){
  const[data,setData]=useState<any>(null);
  const[adminBusy,setAdminBusy]=useState(false);
  const[msg,setMsg]=useState('');
  const[email,setEmail]=useState('');
  const[query,setQuery]=useState('');
  const[filter,setFilter]=useState<'all'|'online'|'released'|'blocked'>('all');
  const[updatedAt,setUpdatedAt]=useState<number|null>(null);

  const load=useCallback(async()=>{
    try{
      const response=await fetch('/api/master',{cache:'no-store'});
      const json=await response.json();
      if(!response.ok||!json.ok)throw new Error(json.error||'Não foi possível consultar a Master.');
      const snapshot=json.data;
      if(!snapshot||!Array.isArray(snapshot.accounts))throw new Error('A Master não recebeu a lista de contas do servidor.');
      setData(snapshot);
      setUpdatedAt(Date.now());
      return snapshot;
    }catch(e:any){
      setMsg('Não foi possível atualizar a lista: '+String(e?.message||e));
      return null;
    }
  },[]);
  useEffect(()=>{
    void load();
    // Presence comes from the authenticated server snapshot. Never poll while hidden.
    const id=setInterval(()=>{if(document.visibilityState==='visible')void load()},20000);
    return()=>clearInterval(id);
  },[load]);

  const admin=async(payload:any,verification?:{email:string;accessActive:boolean})=>{
    if(adminBusy)return false;
    setAdminBusy(true);
    setMsg('');
    try{
      const response=await fetch('/api/master',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const json=await response.json();
      if(!response.ok||!json.ok)throw new Error(json.error||'A ação não foi confirmada pelo servidor.');
      const fresh=await load();
      if(!fresh){
        setMsg('O comando foi recebido, mas não consegui verificar o resultado na lista. Consulte novamente antes de repetir.');
        return false;
      }
      if(verification){
        const account=fresh.accounts.find((x:any)=>String(x.email||'').trim().toLowerCase()===verification.email);
        if(!account){
          setMsg('Comando recebido, mas a conta '+verification.email+' não aparece na lista. Liberação ainda NÃO CONFIRMADA.');
          return false;
        }
        if(Boolean(account.accessActive)!==verification.accessActive){
          setMsg('Comando recebido, mas '+verification.email+' continua '+(account.accessActive?'LIBERADO':'SEM ACESSO')+' na consulta. Não considero a ação confirmada.');
          return false;
        }
        setMsg((verification.accessActive?'LIBERADO E CONFIRMADO: ':'BLOQUEADO E CONFIRMADO: ')+verification.email+'. A informação foi conferida no cadastro.');
      }else{
        setMsg('Comando recebido. Lista de contas atualizada.');
      }
      return true;
    }catch(e:any){setMsg('Erro ao executar: '+String(e?.message||e));return false}
    finally{setAdminBusy(false)}
  };
  const grantByEmail=async()=>{
    const clean=email.trim().toLowerCase();
    if(!clean){setMsg('Informe o e-mail cadastrado.');return}
    setQuery(clean);setFilter('all');
    await admin({action:'grant_agent_by_email',value:{email:clean,days:null}},{email:clean,accessActive:true});
  };
  const revokeByEmail=async()=>{
    const clean=email.trim().toLowerCase();
    if(!clean){setMsg('Informe o e-mail cadastrado.');return}
    if(!window.confirm('Bloquear o acesso de '+clean+'?'))return;
    setQuery(clean);setFilter('all');
    await admin({action:'revoke_agent_by_email',value:{email:clean}},{email:clean,accessActive:false});
  };

  const accounts:any[]=Array.isArray(data?.accounts)?data.accounts:[];
  const devices=accounts.flatMap((x:any)=>Array.isArray(x.devices)?x.devices:[]);
  const q=query.trim().toLowerCase();
  const onlineCount=accounts.filter((x:any)=>x.webOnline||x.agentOnline).length;
  const releasedCount=accounts.filter((x:any)=>x.role==='master'||x.accessActive===true).length;
  const summary=data?.summary||{};
  const filteredAccounts=accounts.filter((x:any)=>{
    const match=!q||String(x.email||'').toLowerCase().includes(q)||String(x.plan||'').toLowerCase().includes(q);
    if(!match)return false;
    if(filter==='online')return Boolean(x.webOnline||x.agentOnline);
    if(filter==='released')return x.role==='master'||x.accessActive===true;
    if(filter==='blocked')return x.role!=='master'&&x.accessActive!==true;
    return true;
  }).sort((a:any,b:any)=>{
    const aOnline=Number(Boolean(a.webOnline||a.agentOnline)),bOnline=Number(Boolean(b.webOnline||b.agentOnline));
    if(aOnline!==bOnline)return bOnline-aOnline;
    const aRecent=Date.parse(a.lastWebSeenAt||a.createdAt||'')||0;
    const bRecent=Date.parse(b.lastWebSeenAt||b.createdAt||'')||0;
    return bRecent-aRecent;
  });
  const pending:any[]=Array.isArray(data?.unpairedDevices)?data.unpairedDevices:[];
  const recentPending=pending.filter((d:any)=>{
    const timestamp=Date.parse(d.lastSeenAt||d.heartbeatAt||'');
    return d.online===true||(Number.isFinite(timestamp)&&Date.now()-timestamp<30*86400000&&timestamp<=Date.now());
  });
  const oldPending=pending.length-recentPending.length;
  const audit:any[]=Array.isArray(data?.audit)?data.audit:[];
  const onlineNow:any[]=Array.isArray(data?.onlineNow)?data.onlineNow:[];

  return <div className="grid">
    <section className="card span12">
      <div className="split">
        <div><div className="eyebrow">MASTER · SENTINEL</div><h3>Contas e acessos</h3><p className="muted">Clientes cadastrados, liberação do bot e presença em uma única lista.</p></div>
        <div className="actions"><Pill tone="good">MASTER</Pill><button className="secondary" disabled={adminBusy} onClick={()=>void load()}>Atualizar</button></div>
      </div>
      <div className="metrics">
        <Metric label="Cadastrados" value={String(summary.accounts??accounts.length)}/>
        <Metric label="Com acesso" value={String(releasedCount)}/>
        <Metric label="Online (WEB/PC)" value={String(onlineCount)}/>
        <Metric label="PCs online" value={String(devices.filter((d:any)=>d.online).length)}/>
      </div>
      <div className="masterFilters">
        <input aria-label="Buscar e-mail cadastrado" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar qualquer conta por e-mail"/>
        <div className="actions">
          {([['all','Todas'],['online','Online'],['released','Liberadas'],['blocked','Sem acesso']] as const).map(([id,label])=>
            <button key={id} className={filter===id?'primary':'secondary'} onClick={()=>setFilter(id)}>{label}</button>)}
        </div>
      </div>
      <p className="muted" style={{margin:'8px 0 0',fontSize:12}}>
        {data?String(filteredAccounts.length)+' de '+String(accounts.length)+' contas na lista':'Consultando contas...'}
        {updatedAt?' · Última consulta '+new Date(updatedAt).toLocaleTimeString('pt-BR'):''}
        {' · Online conforme última presença recebida do servidor'}
      </p>
      {msg&&<div className="alert" role="status"><b>Master:</b> {msg}</div>}
    </section>

    <section className="card span12">
      <div className="split"><div><div className="eyebrow">LIBERAÇÃO POR E-MAIL</div><h3>Autorizar ou bloquear acesso</h3></div><Pill>Sem vencimento</Pill></div>
      <div className="masterFilters">
        <input type="email" aria-label="E-mail do cliente para liberação" value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail já cadastrado no Sentinel"/>
        <div className="actions">
          <button className="primary" disabled={adminBusy||!email.trim()} onClick={grantByEmail}>Liberar</button>
          <button className="kill" disabled={adminBusy||!email.trim()} onClick={revokeByEmail}>Bloquear</button>
        </div>
      </div>
      <p className="muted" style={{margin:'7px 0 0',fontSize:12}}>Após a ação, o e-mail será localizado na lista e o estado atualizado será conferido. A confirmação não depende apenas da resposta do botão.</p>
    </section>

    <section className="span12" aria-label="Contas cadastradas">
      <div className="split" style={{margin:'0 0 8px'}}>
        <h3 style={{margin:0}}>Contas cadastradas</h3>
        <Pill>{String(filteredAccounts.length)} exibidas</Pill>
      </div>
      <div className="grid" style={{gap:8}}>
        {filteredAccounts.map((a:any)=><MasterAccount key={a.id} a={a} admin={admin} busy={adminBusy}/>)}
        {!filteredAccounts.length&&<section className="card span12"><Empty text={accounts.length?'Nenhuma conta corresponde à busca ou ao filtro.':data?'Nenhuma conta foi devolvida pela Master.':'Carregando contas cadastradas...'}/></section>}
      </div>
    </section>

    <section className="card span12">
      <details>
        <summary style={{cursor:'pointer',fontWeight:700}}>Presença recente · {onlineNow.length} conta(s) informadas online</summary>
        <div className="timeline topgap">
          {onlineNow.slice(0,15).map((x:any)=><div className="event" key={x.id}>
            <time>{x.agentOnline?'PC + WEB':x.webOnline?'WEB':'—'}</time>
            <div><b>{x.email}</b><span>{x.agentOnline?'Agent conectado':x.webOnline?'Painel ativo':'Sem sinal de presença'}{x.lastAgentSeenAt?' · Último PC '+tm(x.lastAgentSeenAt):''}</span></div>
          </div>)}
          {!onlineNow.length&&<Empty text="Nenhuma presença recente informada pelo servidor"/>}
        </div>
      </details>
    </section>

    {pending.length>0&&<section className="card span12">
      <details>
        <summary style={{cursor:'pointer',fontWeight:700}}>Instalações sem conta · {recentPending.length} recente(s), {oldPending} antiga(s) ocultas</summary>
        <p className="muted" style={{fontSize:12}}>Esses registros não são necessariamente clientes cadastrados. Instalações antigas permanecem no banco, mas não ocupam a tela principal.</p>
        <div className="timeline">
          {recentPending.slice(0,15).map((d:any)=><div className="event" key={d.id}><time>{d.online?'ONLINE':'OFF'}</time><div><b>{d.displayName||'Agent sem conta'}</b><span>Versão {d.agentVersion||'—'} · visto em {d.lastSeenAt?tm(d.lastSeenAt):'data não informada'}</span></div></div>)}
          {recentPending.length===0&&<Empty text="Nenhuma instalação recente pendente"/>}
        </div>
        {oldPending>0&&<details className="topgap"><summary style={{cursor:'pointer'}}>Ver {oldPending} instalação(ões) antigas</summary>
          <div className="timeline">{pending.filter(d=>!recentPending.includes(d)).slice(0,25).map((d:any)=><div className="event" key={d.id}><time>ANTIGO</time><div><b>{d.displayName||'Agent antigo'}</b><span>{d.agentVersion||'Versão desconhecida'} · {d.lastSeenAt?tm(d.lastSeenAt):'sem atividade recente'}</span></div></div>)}</div>
        </details>}
      </details>
    </section>}

    <section className="card span12">
      <details>
        <summary style={{cursor:'pointer',fontWeight:700}}>Auditoria · {audit.length} evento(s) (recolhida)</summary>
        <div className="timeline topgap">{audit.slice(0,25).map((x:any)=><div className="event" key={x.id}><time>{tm(x.createdAt)}</time><div><b>{String(x.action||'').replaceAll('_',' ')}</b><span>{x.targetDeviceId?'PC '+String(x.targetDeviceId).slice(0,8):x.targetAccountId?'Conta '+String(x.targetAccountId).slice(0,8):'Sistema'}</span></div></div>)}{!audit.length&&<Empty text="Nenhum evento disponível"/>}</div>
      </details>
    </section>
  </div>;
}

function MasterAccount({a,admin,busy}:{a:any,admin:any,busy:boolean}){
  const[plan,setPlan]=useState(String(a.plan||'free'));
  useEffect(()=>{setPlan(String(a.plan||'free'))},[a.plan]);
  const cmd=(d:any,command:string)=>admin({action:'device_command',accountId:a.id,deviceId:d.id,value:{command}});
  const grantForever=()=>admin({action:'set_agent_access',accountId:a.id,value:{enabled:true,expiresAt:null}},
    {email:String(a.email||'').toLowerCase(),accessActive:true});
  const blockAgent=()=>window.confirm('Bloquear o acesso desta conta?')&&admin(
    {action:'set_agent_access',accountId:a.id,value:{enabled:false,expiresAt:null}},
    {email:String(a.email||'').toLowerCase(),accessActive:false});
  const expiry=a.accessExpiresAt?new Date(a.accessExpiresAt).toLocaleString('pt-BR'):'Permanente';
  const online=Boolean(a.webOnline||a.agentOnline);
  const active=a.role==='master'||a.accessActive===true;
  const clientDevices:any[]=Array.isArray(a.devices)?a.devices:[];

  return <details className="card span12" style={{padding:'12px 14px'}}>
    <summary style={{cursor:'pointer',listStyle:'none'}}>
      <div className="split" style={{alignItems:'center',gap:10}}>
        <div style={{minWidth:0,flex:'1 1 220px'}}>
          <div style={{fontSize:14,fontWeight:750,overflowWrap:'anywhere'}}>{a.email||'E-mail não informado'} {a.role==='master'?'· MASTER':''}</div>
          <div className="muted" style={{fontSize:11}}>
            Cadastro: {a.createdAt?new Date(a.createdAt).toLocaleDateString('pt-BR'):'—'}
            {' · Último acesso: '}{a.lastWebSeenAt?tm(a.lastWebSeenAt):'não informado'}
            {' · '+clientDevices.length+' PC(s)'}
          </div>
        </div>
        <div className="actions" style={{gap:5,flexWrap:'wrap'}}>
          <Pill tone={active?'good':'bad'}>{active?'ACESSO LIBERADO':'SEM ACESSO'}</Pill>
          {a.webOnline&&<Pill tone="good">WEB ONLINE</Pill>}
          {a.agentOnline&&<Pill tone="good">PC ONLINE</Pill>}
          {!online&&<Pill tone="neutral">OFFLINE</Pill>}
          {a.status!=='active'&&<Pill tone="bad">{String(a.status||'suspenso').toUpperCase()}</Pill>}
          <span style={{fontSize:12,opacity:.75}}>Detalhes ▾</span>
        </div>
      </div>
    </summary>
    <div style={{paddingTop:12,marginTop:12,borderTop:'1px solid rgba(137,154,160,.24)'}}>
      <div className="formgrid three">
        <label className="field"><span>Plano</span><input value={plan} disabled={a.role==='master'} onChange={e=>setPlan(e.target.value)}/></label>
        <div className="field"><span>Licença do Agent</span><strong>{active?'Liberada':'Bloqueada'} · {a.role==='master'?'Master':expiry}</strong></div>
        <div className="field"><span>Sessões web</span><strong>{a.sessionCount||0} registrada(s)</strong></div>
      </div>
      <div className="actions topgap">
        {a.role!=='master'&&<>
          <button className="primary" disabled={busy||active} onClick={grantForever}>Liberar acesso</button>
          <button className="kill" disabled={busy||!active} onClick={blockAgent}>Bloquear acesso</button>
          <button className={a.status==='active'?'kill':'primary'} disabled={busy} onClick={()=>admin({action:'set_status',accountId:a.id,value:{status:a.status==='active'?'suspended':'active'}})}>{a.status==='active'?'Suspender conta':'Reativar conta'}</button>
          <button className="secondary" disabled={busy} onClick={()=>admin({action:'set_plan',accountId:a.id,value:{plan}})}>Salvar plano</button>
        </>}
        <button className="secondary" disabled={busy} onClick={()=>window.confirm('Encerrar as sessões web desta conta?')&&admin({action:'revoke_sessions',accountId:a.id,value:{}})}>Encerrar sessões</button>
      </div>

      <details className="topgap" style={{padding:'10px 0'}}>
        <summary style={{cursor:'pointer',fontWeight:700}}>PCs e comandos avançados · {clientDevices.length}</summary>
        <div className="topgap">{clientDevices.map((d:any)=><div className="card" key={d.id} style={{marginBottom:9,padding:12}}>
          <div className="split"><div><b>{d.displayName||'PC Sentinel'}</b><div className="muted">Agent {d.agentVersion||'—'} · {d.lastSeenAt?tm(d.lastSeenAt):'nunca visto'}</div></div><div className="actions"><Pill tone={d.online?'good':'neutral'}>{d.online?'ONLINE':'OFFLINE'}</Pill><Pill tone={d.status==='active'?'good':'bad'}>{String(d.status||'—').toUpperCase()}</Pill></div></div>
          <div className="stack topgap"><Row k="Estado" v={String(d.state?.state||'—').toUpperCase()}/><Row k="Conta na corretora" v={String(d.state?.liveBroker?.mode||d.state?.mode||'—').toUpperCase()}/><Row k="Ativo" v={String(d.state?.liveBroker?.symbol||d.state?.settings?.asset||'—')}/><Row k="Heartbeat" v={d.heartbeatAt?tm(d.heartbeatAt):'—'}/></div>
          <div className="actions topgap">
            <button className="primary" disabled={busy||!d.online||d.status!=='active'||!active} onClick={()=>window.confirm('Iniciar ou retomar a análise neste PC?')&&cmd(d,'control/start')}>Iniciar análise</button>
            <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/pause')}>Pausar</button>
            <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/stop')}>Parar</button>
            <button className="kill" disabled={busy||!d.online||d.status!=='active'} onClick={()=>window.confirm('Acionar Kill Switch neste PC?')&&cmd(d,'control/kill')}>Kill Switch</button>
            <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/freeze')}>Freeze</button>
            <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/unfreeze')}>Unfreeze</button>
            <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/reset-kill')}>Liberar Kill</button>
            <button className="secondary" disabled={busy||!d.online||d.status!=='active'} onClick={()=>cmd(d,'control/clear-error')}>Limpar erro</button>
            <button className={d.status==='active'?'kill':'primary'} disabled={busy} onClick={()=>window.confirm(d.status==='active'?'Revogar este PC?':'Reativar este PC?')&&admin({action:d.status==='active'?'revoke_device':'restore_device',accountId:a.id,deviceId:d.id,value:{}})}>{d.status==='active'?'Revogar PC':'Reativar PC'}</button>
          </div>
        </div>)}{!clientDevices.length&&<Empty text="Nenhum PC vinculado a esta conta"/>}</div>
      </details>
    </div>
  </details>;
}

function Settings({s,agent,agentCommand,busy,account}:{s:Status,agent:any,agentCommand:any,busy:boolean,account:any}){
 const {t,language}=useSentinelLocale();
 const p=account?.profile||{};
 const access=p.role==='master'||p.access_active===true;
 const expiry=p.access_expires_at?new Date(p.access_expires_at).toLocaleDateString(language==='en'?'en-US':'pt-BR'):(language==='en'?'Permanent':'Permanente');
 return <div className="grid">
   <section className="card span12">
     <div className="split"><h3>{t('Minha conta Sentinel')}</h3><Pill tone={access?'good':'bad'}>{access?t('Ativa'):t('Acesso inativo')}</Pill></div>
     <div className="stack topgap"><Row k="E-mail" v={account?.user?.email||'—'}/>
       <Row k="Plano" v={p.role==='master'?'MASTER':'Pagamento único'}/>
       <Row k="Validade" v={p.role==='master'?'Permanente':expiry}/>
       <Row k="Agent" v={agent.worker?t('Online'):t('Offline')}/>
     </div>
     <div className="actions topgap">
       {!access&&<a className="primary linkbtn" href={'/api/checkout?market='+(language==='en'?'INTL':'BR')}>{t('Comprar na Kiwify')}</a>}
       <a className="secondary linkbtn accountAgentDownload" href={AGENT_DOWNLOAD_URL} download="sentinel-agent-windows.exe">{t('Instalar / atualizar Agent')}</a>
       <AgentZipDownload/>
     </div>
   </section>
   {s?.runtimeKind==='persistent-worker'&&<section className="card span12 accountAgentCard">
     <div className="accountAgentCopy">
       <h3>{t('Agent neste computador')}</h3>
       <p className="muted">{t('O Agent permanece instalado e libera análises com login ativo e licença aprovada. Não é necessário vincular o celular.')}</p>
     </div>
     <div className="accountAgentActions">
       <button className="secondary" disabled={busy||!agent.process} onClick={()=>agentCommand('restart')}>{t('Reiniciar Agent')}</button>
       <button className="secondary" disabled={busy||!agent.process} onClick={()=>agentCommand('exit')}>{t('Desligar Agent')}</button>
     </div>
   </section>}
 </div>
}

function TradeTable({rows=[]}:{rows:any[]}){return <div className="tablewrap"><table className="table"><thead><tr><th><T>Hora</T></th><th><T>Ativo</T></th><th><T>Direção</T></th><th><T>Valor</T></th><th><T>Status</T></th><th>P&L</th></tr></thead><tbody>{rows.map((x:any)=><tr key={x.id}><td>{tm(x.openedAt)}</td><td>{x.asset}</td><td>{x.side}</td><td>{money(x.amount)}</td><td><Pill tone={x.won===true?'good':x.won===false?'bad':'neutral'}>{x.status}</Pill></td><td className={Number(x.pnl)>=0?'positive':'negative'}>{x.pnl==null?'—':money(x.pnl)}</td></tr>)}{!rows.length&&<tr><td colSpan={6}><Empty text="Nenhuma operação concluída"/></td></tr>}</tbody></table></div>}
function Row({k,v}:{k:string,v:string}){const {t}=useSentinelLocale();return <div className="row"><span>{t(k)}</span><b>{t(v)}</b></div>}
function Empty({text}:{text:string}){const {t}=useSentinelLocale();return <div className="empty">{t(text)}</div>}
function Text({label,value,onChange,type='text'}:{label:string,value:any,onChange:any,type?:string}){const {t}=useSentinelLocale();return <label className="field"><span>{t(label)}</span><input type={type} value={value??''} onChange={onChange}/></label>}
function Num({label,value,onChange}:{label:string,value:any,onChange:any}){const {t}=useSentinelLocale();return <label className="field"><span>{t(label)}</span><input type="number" value={value??''} onChange={onChange}/></label>}
function Select({label,value,onChange,options}:{label:string,value:any,onChange:any,options:string[][]}){const {t}=useSentinelLocale();return <label className="field"><span>{t(label)}</span><select value={value} onChange={onChange}>{options.map(([v,l])=><option key={v} value={v}>{t(l)}</option>)}</select></label>}
function fmt(v:any,d=5){return Number.isFinite(Number(v))?Number(v).toFixed(d):'—'}




'use client';

import {FormEvent,useCallback,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import styles from './LaserAdminPanel.module.css';

type Summary={
  known_customers:number;
  active_access:number;
  mentor_plans:number;
  manual_grants:number;
  linked_pcs:number;
  active_mentor_sessions:number;
};

type Customer={
  email:string;
  user_id:string|null;
  account_exists:boolean;
  is_admin:boolean;
  access_status:string;
  access_source:string;
  plan_id:string|null;
  expires_at:string|null;
  max_pcs:number;
  mentor_credits:number;
  manual_grant:boolean;
  device_count:number;
  active_mentor_sessions:number;
  last_seen_at:string|null;
};

type LiveRow={
  session_id:string;
  user_id:string|null;
  email:string|null;
  authenticated:boolean;
  is_master:boolean;
  path:string;
  source:string;
  language:string;
  first_seen_at:string;
  last_seen_at:string;
  age_seconds:number;
};

type AdminDevice={
  device_id:string;
  owner_user_id:string;
  owner_email:string|null;
  display_name:string;
  device_status:string;
  connection_mode:string;
  agent_version:string|null;
  adapter:string|null;
  last_seen_at:string|null;
  online:boolean;
  lightburn_online:boolean|null;
  machine_connected:boolean|null;
  machine_name:string|null;
  job_state:string|null;
  progress_permille:number|null;
  project_file:string|null;
  captured_at:string|null;
  remote_control_enabled:boolean;
  local_arm_until:string|null;
  paired_at:string|null;
  access_expires_at:string|null;
  preview_requested_until:string|null;
  preview_last_frame_at:string|null;
  preview_frame_width:number|null;
  preview_frame_height:number|null;
};

type AdminSession={
  session_kind:'mentor'|'remote'|'control';
  session_id:string;
  owner_user_id:string;
  owner_email:string|null;
  device_id:string;
  device_name:string|null;
  status:string;
  started_at:string;
  expires_at:string;
  closed_at:string|null;
  detail:string;
  is_active:boolean;
};

type OpsSnapshot={
  generated_at:string;
  presence_window_seconds:number;
  live:{
    site_online:number;
    external_online:number;
    laser_online:number;
    laser_external:number;
    last_presence_at:string|null;
  };
  agents:{
    total:number;
    active:number;
    revoked:number;
    online:number;
    lightburn_online:number;
    last_heartbeat_at:string|null;
  };
  sessions:{
    remote_active:number;
    mentor_active:number;
    control_active:number;
    stale:number;
  };
  realtime:{
    commands_pending:number;
    commands_rejected_24h:number;
    webrtc_pending:number;
    preview_active:number;
  };
  health:{
    database_size_bytes:number;
    laser_schema_size_bytes:number;
    connections:number;
    max_connections:number;
  };
  security:{
    rls_disabled_tables:string[];
    rls_disabled_count:number;
  };
  languages:Array<{language:string;sessions:number}>;
  funnel:{
    window_hours:number;
    laser_visitors:number;
    landing_view:number;
    presentation_open:number;
    presentation_play:number;
    login_click:number;
    control_click:number;
    mentor_click:number;
    sales:number;
  };
};

type SectionKey='overview'|'live'|'funnel'|'sessions'|'customers'|'devices'|'health'|'security';
const SECTION_KEYS:SectionKey[]=['overview','live','funnel','sessions','customers','devices','health','security'];
const SECTION_LABELS:Record<SectionKey,string>={
  overview:'Geral',
  live:'Ao vivo',
  funnel:'Funil',
  sessions:'Sessões',
  customers:'Clientes',
  devices:'PCs',
  health:'Saúde',
  security:'Segurança'
};

function asNumber(value:unknown){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}

function bytes(value:number){
  if(!value)return '0 MB';
  const mb=value/1024/1024;
  if(mb<1024)return mb.toFixed(mb<10?1:0)+' MB';
  return (mb/1024).toFixed(2)+' GB';
}

function age(seconds:number){
  const value=Math.max(0,asNumber(seconds));
  if(value<10)return 'agora';
  if(value<60)return 'há '+value+'s';
  return 'há '+Math.floor(value/60)+'min';
}

export function LaserAdminPanel(){
  const[open,setOpen]=useState(false);
  const[loaded,setLoaded]=useState(false);
  const[loading,setLoading]=useState(false);
  const[summary,setSummary]=useState<Summary|null>(null);
  const[snapshot,setSnapshot]=useState<OpsSnapshot|null>(null);
  const[customers,setCustomers]=useState<Customer[]>([]);
  const[presence,setPresence]=useState<LiveRow[]>([]);
  const[devices,setDevices]=useState<AdminDevice[]>([]);
  const[sessions,setSessions]=useState<AdminSession[]>([]);
  const[search,setSearch]=useState('');
  const[notice,setNotice]=useState('');
  const[email,setEmail]=useState('');
  const[plan,setPlan]=useState<'control'|'mentor'>('control');
  const[maxPcs,setMaxPcs]=useState(1);
  const[expiry,setExpiry]=useState('');
  const[note,setNote]=useState('');
  const[actionKey,setActionKey]=useState<string|null>(null);
  const[openSections,setOpenSections]=useState<Set<SectionKey>>(new Set(['overview','live']));
  const[openCustomers,setOpenCustomers]=useState<Set<string>>(new Set());

  const loadAll=useCallback(async(silent=false)=>{
    if(!silent)setLoading(true);
    const s=createClient();
    const[sum,list,ops,live,pcs,sessionList]=await Promise.all([
      s.rpc('admin_get_laser_summary'),
      s.rpc('admin_list_laser_customers'),
      s.rpc('admin_get_laser_ops_snapshot',{p_presence_seconds:210,p_funnel_hours:24}),
      s.rpc('admin_list_laser_live_presence',{p_window_seconds:210}),
      s.rpc('admin_list_laser_devices'),
      s.rpc('admin_list_laser_sessions',{p_limit:120})
    ]);

    const failed=[sum.error,list.error,ops.error,live.error,pcs.error,sessionList.error].filter(Boolean);
    if(failed.length){
      if(!silent)setNotice('Não foi possível carregar toda a Central Master. Atualize novamente.');
      if(!silent)setLoading(false);
      return;
    }

    const sr=Array.isArray(sum.data)?sum.data[0]:sum.data;
    setSummary((sr||null) as Summary|null);
    setCustomers((list.data||[]) as Customer[]);
    setSnapshot((ops.data||null) as OpsSnapshot|null);
    setPresence((live.data||[]) as LiveRow[]);
    setDevices((pcs.data||[]) as AdminDevice[]);
    setSessions((sessionList.data||[]) as AdminSession[]);
    setLoaded(true);
    if(!silent){
      setNotice('');
      setLoading(false);
    }
  },[]);

  useEffect(()=>{
    if(!open)return;
    if(!loaded)void loadAll();
    const timer=window.setInterval(()=>void loadAll(true),7000);
    return()=>window.clearInterval(timer);
  },[open,loaded,loadAll]);

  async function toggle(){
    const next=!open;
    setOpen(next);
    if(next&&!loaded)await loadAll();
  }

  function toggleSection(key:SectionKey){
    setOpenSections(previous=>{
      const next=new Set(previous);
      next.has(key)?next.delete(key):next.add(key);
      return next;
    });
  }

  function jump(key:SectionKey){
    setOpenSections(previous=>new Set(previous).add(key));
    window.setTimeout(()=>{
      document.getElementById('laser-master-'+key)?.scrollIntoView({behavior:'smooth',block:'start'});
    },40);
  }

  function setAllSections(expanded:boolean){
    setOpenSections(expanded?new Set(SECTION_KEYS):new Set());
  }

  function toggleCustomer(customerEmail:string){
    setOpenCustomers(previous=>{
      const next=new Set(previous);
      next.has(customerEmail)?next.delete(customerEmail):next.add(customerEmail);
      return next;
    });
  }

  async function grant(event:FormEvent){
    event.preventDefault();
    const normalized=email.trim().toLowerCase();
    if(!normalized)return;
    setActionKey('grant:'+normalized);
    setNotice('');
    const s=createClient();
    const expires=expiry?new Date(expiry+'T23:59:59').toISOString():null;
    const{data,error}=await s.rpc('admin_set_laser_access_by_email',{
      p_email:normalized,
      p_plan_id:plan,
      p_allowed:true,
      p_expires_at:expires,
      p_max_pcs:maxPcs,
      p_note:note.trim()||null
    });
    if(error){
      setNotice('Não foi possível conceder o acesso.');
    }else{
      const row=data as {account_exists?:boolean}|null;
      setNotice(row?.account_exists===false
        ?'Acesso salvo. A conta ainda não existe; será aplicado quando esse e-mail criar a conta DevinX.'
        :'Acesso do Laser concedido.');
      setEmail('');setExpiry('');setNote('');setMaxPcs(1);setPlan('control');
      await loadAll(true);
    }
    setActionKey(null);
  }

  async function setAccess(customer:Customer,allowed:boolean){
    if(customer.is_admin)return;
    const key='access:'+customer.email;
    setActionKey(key);
    const s=createClient();
    const{error}=await s.rpc('admin_set_laser_access_by_email',{
      p_email:customer.email,
      p_plan_id:customer.plan_id==='mentor'?'mentor':'control',
      p_allowed:allowed,
      p_expires_at:allowed?null:customer.expires_at,
      p_max_pcs:Math.max(customer.max_pcs||1,1),
      p_note:allowed?'Liberado pelo Master Laser':'Bloqueado pelo Master Laser'
    });
    setNotice(error?'Não foi possível alterar o acesso.':allowed?'Acesso do Laser liberado.':'Acesso do Laser bloqueado.');
    await loadAll(true);
    setActionKey(null);
  }

  async function clearManual(customer:Customer){
    if(!customer.manual_grant||customer.is_admin)return;
    if(!confirm('Remover a concessão manual de '+customer.email+'? Compra válida continuará valendo.'))return;
    const key='manual:'+customer.email;
    setActionKey(key);
    const s=createClient();
    const{error}=await s.rpc('admin_clear_laser_manual_access_by_email',{p_email:customer.email});
    setNotice(error?'Não foi possível remover a concessão manual.':'Concessão manual removida.');
    await loadAll(true);
    setActionKey(null);
  }

  async function setMentorCredits(customer:Customer){
    if(!customer.account_exists)return;
    const answer=prompt('Novo saldo de sessões Mentor para '+customer.email,Math.max(0,customer.mentor_credits).toString());
    if(answer===null)return;
    const credits=Number(answer);
    if(!Number.isInteger(credits)||credits<0||credits>999){
      setNotice('Informe um número inteiro entre 0 e 999.');
      return;
    }
    if(!confirm('Definir o saldo Mentor de '+customer.email+' para '+credits+'?'))return;
    const key='credits:'+customer.email;
    setActionKey(key);
    const s=createClient();
    const{error}=await s.rpc('admin_set_laser_mentor_credits_by_email',{p_email:customer.email,p_credits:credits});
    setNotice(error?'Não foi possível alterar os créditos Mentor.':'Créditos Mentor atualizados.');
    await loadAll(true);
    setActionKey(null);
  }

  async function closeUserSessions(customer:Customer){
    if(!customer.account_exists)return;
    if(!confirm('Encerrar todas as sessões ativas do Laser Control para '+customer.email+'?'))return;
    const key='sessions:'+customer.email;
    setActionKey(key);
    const s=createClient();
    const{data,error}=await s.rpc('admin_laser_close_user_sessions',{p_email:customer.email});
    const result=(data||{}) as {remote?:number;control?:number;mentor?:number};
    setNotice(error
      ?'Não foi possível encerrar as sessões.'
      :'Sessões encerradas · remoto '+asNumber(result.remote)+' · controle '+asNumber(result.control)+' · mentor '+asNumber(result.mentor)+'.');
    await loadAll(true);
    setActionKey(null);
  }

  async function deviceAction(device:AdminDevice){
    const action=device.device_status==='revoked'?'reactivate':'revoke';
    const label=action==='revoke'?'revogar':'reativar';
    if(!confirm('Deseja '+label+' o PC “'+device.display_name+'” de '+(device.owner_email||'conta desconhecida')+'?'))return;
    const key='device:'+device.device_id;
    setActionKey(key);
    const s=createClient();
    const{error}=await s.rpc('admin_laser_device_action',{p_device_id:device.device_id,p_action:action});
    setNotice(error?'Não foi possível alterar o PC.':action==='revoke'?'PC revogado.':'PC reativado.');
    await loadAll(true);
    setActionKey(null);
  }

  async function closeSession(session:AdminSession){
    if(!session.is_active)return;
    if(!confirm('Encerrar esta sessão '+session.session_kind+' agora?'))return;
    const key='session:'+session.session_id;
    setActionKey(key);
    const s=createClient();
    const{error}=await s.rpc('admin_laser_close_session',{
      p_session_kind:session.session_kind,
      p_session_id:session.session_id
    });
    setNotice(error?'Não foi possível encerrar a sessão.':'Sessão encerrada.');
    await loadAll(true);
    setActionKey(null);
  }

  async function cleanupExpired(){
    if(!confirm('Limpar somente sessões, comandos e sinais que já expiraram? Sessões válidas não serão encerradas.'))return;
    setActionKey('cleanup');
    const s=createClient();
    const{data,error}=await s.rpc('admin_laser_cleanup_expired');
    const result=(data||{}) as Record<string,unknown>;
    setNotice(error
      ?'A limpeza segura não foi concluída.'
      :'Limpeza concluída · remoto '+asNumber(result.remote)+' · controle '+asNumber(result.control)+' · mentor '+asNumber(result.mentor)+' · comandos '+asNumber(result.commands)+' · sinais '+asNumber(result.signals)+'.');
    await loadAll(true);
    setActionKey(null);
  }

  const visibleCustomers=useMemo(()=>{
    const q=search.trim().toLowerCase();
    const filtered=q?customers.filter(c=>c.email.toLowerCase().includes(q)):customers;
    return [...filtered].sort((a,b)=>{
      const aLive=presence.some(p=>p.email===a.email)||devices.some(d=>d.owner_email===a.email&&d.online);
      const bLive=presence.some(p=>p.email===b.email)||devices.some(d=>d.owner_email===b.email&&d.online);
      return Number(bLive)-Number(aLive)||a.email.localeCompare(b.email);
    });
  },[customers,search,presence,devices]);

  const liveLaser=useMemo(()=>presence.filter(row=>row.path.startsWith('/laser-control')),[presence]);
  const activeSessions=useMemo(()=>sessions.filter(row=>row.is_active),[sessions]);
  const planClicks=asNumber(snapshot?.funnel.control_click)+asNumber(snapshot?.funnel.mentor_click);

  const date=(value:string|null)=>{
    if(!value)return '—';
    try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'}).format(new Date(value))}
    catch{return value}
  };

  function sectionHeader(key:SectionKey,title:string,subtitle:string,extra?:string){
    const expanded=openSections.has(key);
    return <button type="button" className={styles.sectionHeader} onClick={()=>toggleSection(key)}>
      <div><small>{subtitle}</small><h3>{title}</h3></div>
      <div className={styles.sectionHeaderRight}>{extra&&<span>{extra}</span>}<em>{expanded?'−':'＋'}</em></div>
    </button>;
  }

  return <section className={styles.shell}>
    <button type="button" className={styles.masterButton} onClick={()=>void toggle()}>
      <span>◆</span><b>MASTER LASER</b><em>{open?'Fechar central':'Abrir central'}</em>
    </button>

    {open&&<div className={styles.panel}>
      <div className={styles.head}>
        <div>
          <small>ADMINISTRAÇÃO · LASER CONTROL</small>
          <h2>Central Master</h2>
          <p>Operação, clientes, sessões, PCs, funil, Supabase e segurança em um só lugar.</p>
        </div>
        <div className={styles.headActions}>
          <button type="button" onClick={()=>void loadAll()} disabled={loading}>{loading?'Atualizando…':'Atualizar tudo'}</button>
          <button type="button" onClick={()=>setAllSections(true)}>Expandir</button>
          <button type="button" onClick={()=>setAllSections(false)}>Recolher</button>
        </div>
      </div>

      <div className={styles.quickNav}>
        {SECTION_KEYS.map(key=><button type="button" key={key} onClick={()=>jump(key)} className={openSections.has(key)?styles.quickActive:''}>{SECTION_LABELS[key]}</button>)}
      </div>

      {notice&&<div className={styles.notice}>{notice}</div>}

      <section id="laser-master-overview" className={styles.sectionCard}>
        {sectionHeader('overview','Visão geral','STATUS OPERACIONAL',snapshot?'atualizado '+date(snapshot.generated_at):'')}
        {openSections.has('overview')&&<div className={styles.sectionBody}>
          <div className={styles.metrics}>
            <article className={styles.greenMetric}><small>VISITANTES EXTERNOS</small><b>{snapshot?.live.external_online??0}</b><span>navegadores ativos</span></article>
            <article className={styles.greenMetric}><small>NO LASER AGORA</small><b>{snapshot?.live.laser_external??0}</b><span>sem contar Master</span></article>
            <article><small>AGENTS ONLINE</small><b>{snapshot?.agents.online??0}</b><span>heartbeat &lt; 15s</span></article>
            <article><small>LIGHTBURN ONLINE</small><b>{snapshot?.agents.lightburn_online??0}</b><span>Agents ativos</span></article>
            <article><small>SESSÕES ATIVAS</small><b>{activeSessions.length}</b><span>mentor + remoto + controle</span></article>
            <article><small>ACESSOS LASER</small><b>{summary?.active_access??0}</b><span>{summary?.known_customers??0} conhecidos</span></article>
          </div>
          <div className={styles.explainer}>
            <b>Por que Vercel e Master podem mostrar números diferentes?</b>
            <span>Vercel conta requisições HTTP — inclusive HEAD, pré-visualizadores e scanners de links. Aqui “online” significa navegador real com heartbeat recente. Agent/PC é contado separadamente.</span>
          </div>
        </div>}
      </section>

      <section id="laser-master-live" className={styles.sectionCard}>
        {sectionHeader('live','Quem está online','AO VIVO',(snapshot?.live.external_online??0)+' externos · '+(snapshot?.agents.online??0)+' Agents')}
        {openSections.has('live')&&<div className={styles.sectionBody}>
          <div className={styles.liveSplit}>
            <div>
              <div className={styles.subHead}><b>Navegadores ativos</b><span>{presence.length} incluindo Master · {liveLaser.length} em rotas Laser</span></div>
              <div className={styles.compactList}>
                {presence.length===0&&<div className={styles.empty}>Nenhum navegador com heartbeat dentro da janela de {snapshot?.presence_window_seconds??210}s.</div>}
                {presence.map(row=><article className={styles.liveRow} key={row.session_id}>
                  <span className={styles.liveDot}/>
                  <div className={styles.rowMain}>
                    <b>{row.email||'Visitante anônimo'}</b>
                    <small>{row.path||'/'} · {row.source||'Direto/sem referência'}</small>
                  </div>
                  <div className={styles.rowBadges}>
                    {row.is_master&&<span>MASTER</span>}
                    <span>{row.language||'—'}</span>
                    <span>{row.authenticated?'LOGADO':'ANÔNIMO'}</span>
                    <em>{age(row.age_seconds)}</em>
                  </div>
                </article>)}
              </div>
            </div>
            <div>
              <div className={styles.subHead}><b>Agents / PCs</b><span>{snapshot?.agents.online??0} online de {snapshot?.agents.total??0}</span></div>
              <div className={styles.compactList}>
                {devices.filter(d=>d.online).length===0&&<div className={styles.empty}>Nenhum Agent enviando heartbeat agora.</div>}
                {devices.filter(d=>d.online).map(device=><article className={styles.liveRow} key={device.device_id}>
                  <span className={styles.liveDot}/>
                  <div className={styles.rowMain}><b>{device.display_name}</b><small>{device.owner_email||'—'} · Agent {device.agent_version||'—'}</small></div>
                  <div className={styles.rowBadges}>
                    <span>{device.lightburn_online?'LIGHTBURN':'LB OFF'}</span>
                    <span>{device.machine_connected?'MÁQUINA':'SEM MÁQUINA'}</span>
                    <em>{device.job_state||'—'}</em>
                  </div>
                </article>)}
              </div>
            </div>
          </div>
        </div>}
      </section>

      <section id="laser-master-funnel" className={styles.sectionCard}>
        {sectionHeader('funnel','Funil do Laser Control','CONVERSÃO','últimas '+(snapshot?.funnel.window_hours??24)+'h')}
        {openSections.has('funnel')&&<div className={styles.sectionBody}>
          <div className={styles.funnelGrid}>
            <article><small>VISITANTES LASER</small><b>{snapshot?.funnel.laser_visitors??0}</b><span>presença real</span></article>
            <article><small>LANDING</small><b>{snapshot?.funnel.landing_view??0}</b><span>evento rastreado</span></article>
            <article><small>ABRIRAM VÍDEO</small><b>{snapshot?.funnel.presentation_open??0}</b><span>apresentação</span></article>
            <article><small>DERAM PLAY</small><b>{snapshot?.funnel.presentation_play??0}</b><span>vídeo iniciado</span></article>
            <article><small>CLICARAM ENTRAR</small><b>{snapshot?.funnel.login_click??0}</b><span>acesso/login</span></article>
            <article><small>CLICARAM PLANO</small><b>{planClicks}</b><span>Control {snapshot?.funnel.control_click??0} · Mentor {snapshot?.funnel.mentor_click??0}</span></article>
            <article className={styles.salesMetric}><small>VENDAS</small><b>{snapshot?.funnel.sales??0}</b><span>compras detectadas</span></article>
          </div>
          <div className={styles.languageBox}>
            <div className={styles.subHead}><b>Idiomas vistos no Laser</b><span>janela do funil</span></div>
            <div className={styles.languageList}>
              {(snapshot?.languages||[]).length===0&&<span>Nenhum dado na janela.</span>}
              {(snapshot?.languages||[]).map(item=><span key={item.language}><b>{item.language}</b>{item.sessions}</span>)}
            </div>
          </div>
          <p className={styles.hint}>Os eventos de vídeo e clique começam a ser contabilizados a partir desta versão da Master. “Visitantes Laser” usa o histórico de presença já existente.</p>
        </div>}
      </section>

      <section id="laser-master-sessions" className={styles.sectionCard}>
        {sectionHeader('sessions','Sessões','MENTORIA · REMOTO · CONTROLE',activeSessions.length+' ativas')}
        {openSections.has('sessions')&&<div className={styles.sectionBody}>
          <div className={styles.sessionSummary}>
            <span>Mentor <b>{snapshot?.sessions.mentor_active??0}</b></span>
            <span>Remoto <b>{snapshot?.sessions.remote_active??0}</b></span>
            <span>Controle <b>{snapshot?.sessions.control_active??0}</b></span>
            <span className={(snapshot?.sessions.stale??0)>0?styles.warnText:''}>Expiradas ainda abertas <b>{snapshot?.sessions.stale??0}</b></span>
          </div>
          <div className={styles.compactList}>
            {sessions.length===0&&<div className={styles.empty}>Nenhuma sessão registrada.</div>}
            {[...sessions].sort((a,b)=>Number(b.is_active)-Number(a.is_active)).map(session=><article className={styles.sessionRow} key={session.session_kind+session.session_id}>
              <div className={styles.rowMain}>
                <b>{session.session_kind.toUpperCase()} · {session.device_name||'PC'}</b>
                <small>{session.owner_email||'—'} · início {date(session.started_at)} · expira {date(session.expires_at)}</small>
              </div>
              <div className={styles.rowBadges}>
                <span className={session.is_active?styles.badgeGood:styles.badgeMuted}>{session.is_active?'ATIVA':session.status.toUpperCase()}</span>
                <em>{session.detail}</em>
                {session.is_active&&<button type="button" className={styles.miniDanger} disabled={actionKey==='session:'+session.session_id} onClick={()=>void closeSession(session)}>Encerrar</button>}
              </div>
            </article>)}
          </div>
        </div>}
      </section>

      <section id="laser-master-customers" className={styles.sectionCard}>
        {sectionHeader('customers','Clientes e acessos','CONTROLE ABSOLUTO',customers.length+' registros')}
        {openSections.has('customers')&&<div className={styles.sectionBody}>
          <form className={styles.grant} onSubmit={grant}>
            <div className={styles.sectionTitle}><small>ACESSO MANUAL</small><h4>Conceder por e-mail</h4><p>Funciona mesmo antes da pessoa criar a conta.</p></div>
            <label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="cliente@email.com"/></label>
            <label>Plano<select value={plan} onChange={e=>setPlan(e.target.value as 'control'|'mentor')}><option value="control">Control</option><option value="mentor">Mentor · 10 sessões</option></select></label>
            <label>PCs<input type="number" min={1} max={25} value={maxPcs} onChange={e=>setMaxPcs(Math.max(1,Math.min(25,Number(e.target.value)||1)))}/></label>
            <label>Até<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>
            <label className={styles.note}>Observação<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Cortesia, suporte, teste..."/></label>
            <button className={styles.grantButton} disabled={actionKey!==null}>{actionKey?.startsWith('grant:')?'Aplicando…':'Conceder'}</button>
          </form>

          <div className={styles.usersHead}>
            <div><b>Base Laser</b><span>{summary?.mentor_plans??0} Mentor · {summary?.manual_grants??0} manuais</span></div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar e-mail"/>
          </div>

          <div className={styles.users}>
            {visibleCustomers.length===0&&<div className={styles.empty}>Nenhum cliente encontrado.</div>}
            {visibleCustomers.map(customer=>{
              const expanded=openCustomers.has(customer.email);
              const browserOnline=presence.some(row=>row.email===customer.email);
              const agentOnline=devices.some(device=>device.owner_email===customer.email&&device.online);
              return <article className={styles.user} key={customer.email}>
                <button type="button" className={styles.customerHeader} onClick={()=>toggleCustomer(customer.email)}>
                  <div className={styles.identity}>
                    <strong>{customer.email}</strong>
                    <span>{customer.account_exists?'Conta criada':'Conta ainda não criada'}</span>
                  </div>
                  <div className={styles.badges}>
                    {customer.is_admin&&<b>MASTER</b>}
                    {browserOnline&&<b className={styles.onlineBadge}>● SITE</b>}
                    {agentOnline&&<b className={styles.onlineBadge}>● AGENT</b>}
                    {customer.manual_grant&&<b>MANUAL</b>}
                    <b className={customer.access_status==='active'?styles.active:styles.blocked}>{customer.access_status==='active'?'ATIVO':'BLOQUEADO'}</b>
                    <em>{expanded?'−':'＋'}</em>
                  </div>
                </button>
                {expanded&&<div className={styles.customerBody}>
                  <div className={styles.meta}>
                    <span><small>Plano</small><b>{customer.plan_id||'—'}</b></span>
                    <span><small>Origem</small><b>{customer.access_source||'—'}</b></span>
                    <span><small>Validade</small><b>{date(customer.expires_at)}</b></span>
                    <span><small>PCs</small><b>{customer.device_count}/{customer.max_pcs||0}</b></span>
                    <span><small>Sessões Mentor</small><b>{customer.mentor_credits<0?'∞':customer.mentor_credits}</b></span>
                    <span><small>Mentoria ativa</small><b>{customer.active_mentor_sessions}</b></span>
                    <span><small>Último Agent</small><b>{date(customer.last_seen_at)}</b></span>
                  </div>
                  {!customer.is_admin&&<div className={styles.actions}>
                    {customer.access_status==='active'
                      ?<button type="button" className={styles.danger} disabled={actionKey==='access:'+customer.email} onClick={()=>void setAccess(customer,false)}>Bloquear Laser</button>
                      :<button type="button" disabled={actionKey==='access:'+customer.email} onClick={()=>void setAccess(customer,true)}>Liberar Laser</button>}
                    {customer.manual_grant&&<button type="button" className={styles.secondary} disabled={actionKey==='manual:'+customer.email} onClick={()=>void clearManual(customer)}>Remover manual</button>}
                    {customer.account_exists&&<button type="button" disabled={actionKey==='credits:'+customer.email} onClick={()=>void setMentorCredits(customer)}>Ajustar créditos Mentor</button>}
                    {customer.account_exists&&<button type="button" className={styles.danger} disabled={actionKey==='sessions:'+customer.email} onClick={()=>void closeUserSessions(customer)}>Encerrar sessões</button>}
                  </div>}
                </div>}
              </article>;
            })}
          </div>
        </div>}
      </section>

      <section id="laser-master-devices" className={styles.sectionCard}>
        {sectionHeader('devices','PCs e Agents','DISPOSITIVOS',(snapshot?.agents.online??0)+' online · '+devices.length+' total')}
        {openSections.has('devices')&&<div className={styles.sectionBody}>
          <div className={styles.devices}>
            {devices.length===0&&<div className={styles.empty}>Nenhum PC vinculado.</div>}
            {devices.map(device=><article className={styles.deviceCard} key={device.device_id}>
              <div className={styles.deviceTop}>
                <div><span className={device.online?styles.onlineDot:styles.offlineDot}/><strong>{device.display_name}</strong><small>{device.owner_email||'—'}</small></div>
                <div className={styles.badges}>
                  <b className={device.online?styles.onlineBadge:styles.offlineBadge}>{device.online?'● ONLINE':'OFFLINE'}</b>
                  <b>{device.connection_mode?.toUpperCase()||'—'}</b>
                  <b>{device.device_status.toUpperCase()}</b>
                </div>
              </div>
              <div className={styles.deviceMeta}>
                <span><small>Agent</small><b>{device.agent_version||'—'}</b></span>
                <span><small>LightBurn</small><b>{device.lightburn_online?'Online':'Offline'}</b></span>
                <span><small>Máquina</small><b>{device.machine_connected?(device.machine_name||'Conectada'):'Desconectada'}</b></span>
                <span><small>Job</small><b>{device.job_state||'—'}</b></span>
                <span><small>Último heartbeat</small><b>{date(device.last_seen_at)}</b></span>
                <span><small>Projeto</small><b>{device.project_file||'—'}</b></span>
                <span><small>Preview</small><b>{device.preview_last_frame_at?date(device.preview_last_frame_at):'—'}</b></span>
              </div>
              <div className={styles.actions}>
                <button type="button" className={device.device_status==='revoked'?styles.positive:styles.danger} disabled={actionKey==='device:'+device.device_id} onClick={()=>void deviceAction(device)}>
                  {device.device_status==='revoked'?'Reativar PC':'Revogar PC'}
                </button>
              </div>
            </article>)}
          </div>
        </div>}
      </section>

      <section id="laser-master-health" className={styles.sectionCard}>
        {sectionHeader('health','Saúde do sistema','SUPABASE · REALTIME · FILAS')}
        {openSections.has('health')&&<div className={styles.sectionBody}>
          <div className={styles.healthGrid}>
            <article><small>BANCO SUPABASE</small><b>{snapshot?'RESPONDENDO':'—'}</b><span>{bytes(snapshot?.health.database_size_bytes??0)} usados no banco</span></article>
            <article><small>SCHEMA LASER</small><b>{bytes(snapshot?.health.laser_schema_size_bytes??0)}</b><span>tabelas + índices do Laser</span></article>
            <article><small>CONEXÕES DB</small><b>{snapshot?.health.connections??0}/{snapshot?.health.max_connections??0}</b><span>conexões atuais / limite</span></article>
            <article><small>ÚLTIMO AGENT</small><b>{date(snapshot?.agents.last_heartbeat_at??null)}</b><span>heartbeat mais recente</span></article>
            <article><small>COMANDOS PENDENTES</small><b>{snapshot?.realtime.commands_pending??0}</b><span>fila queued/delivered</span></article>
            <article><small>REJEITADOS 24H</small><b>{snapshot?.realtime.commands_rejected_24h??0}</b><span>comandos rejeitados</span></article>
            <article><small>WEBRTC PENDENTE</small><b>{snapshot?.realtime.webrtc_pending??0}</b><span>sinais ainda válidos</span></article>
            <article><small>PREVIEWS ATIVOS</small><b>{snapshot?.realtime.preview_active??0}</b><span>captura solicitada</span></article>
            <article className={(snapshot?.sessions.stale??0)>0?styles.healthWarn:''}><small>SESSÕES EXPIRADAS</small><b>{snapshot?.sessions.stale??0}</b><span>abertas além do prazo</span></article>
          </div>
          <div className={styles.maintenance}>
            <div><b>Manutenção segura</b><span>Limpa apenas estados já expirados. Não encerra sessão válida.</span></div>
            <button type="button" disabled={actionKey==='cleanup'} onClick={()=>void cleanupExpired()}>{actionKey==='cleanup'?'Limpando…':'Limpar expirados'}</button>
          </div>
        </div>}
      </section>

      <section id="laser-master-security" className={styles.sectionCard}>
        {sectionHeader('security','Segurança','AUDITORIA',(snapshot?.security.rls_disabled_count??0)+' alertas RLS')}
        {openSections.has('security')&&<div className={styles.sectionBody}>
          {(snapshot?.security.rls_disabled_count??0)>0
            ?<div className={styles.securityWarning}>
              <b>⚠ Tabelas privadas do Laser com RLS desativado</b>
              <p>Isso exige auditoria antes de qualquer correção automática. Ativar RLS sem revisar políticas pode derrubar webhooks, Agent, sessões ou WebRTC; por isso a Master apenas sinaliza e não “corrige” às cegas.</p>
              <div>{(snapshot?.security.rls_disabled_tables||[]).map(name=><code key={name}>{name}</code>)}</div>
            </div>
            :<div className={styles.securityOk}><b>✓ Nenhuma tabela do schema Laser apareceu com RLS desativado.</b></div>}
          <div className={styles.securityFacts}>
            <span><small>ADMIN RPC</small><b>Exige Master autenticado</b></span>
            <span><small>CONTROLES CRÍTICOS</small><b>Confirmação antes da ação</b></span>
            <span><small>EXE / AGENT</small><b>Não alterado por esta Master</b></span>
          </div>
        </div>}
      </section>
    </div>}
  </section>;
}

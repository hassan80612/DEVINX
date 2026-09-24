'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';

const SESSION_KEY='devinx-presence-browser-v2';
const SECRET_KEY='devinx-presence-secret-v2';
const SOURCE_KEY='devinx-presence-source-v1';
const PRESENCE_CLIENT_VERSION=2;
const HEARTBEAT_MS=60_000;
const ACTIVE_WINDOW_MS=180_000;
const MASTER_REFRESH_MS=20_000;
const MASTER_REQUEST_TIMEOUT_MS=8_000;
const ONLINE_WINDOW_SECONDS=150;

type LivePresenceRow={
  session_id:string;
  user_id:string|null;
  email:string|null;
  authenticated:boolean;
  path:string;
  source:string;
  language:string;
  last_seen_at:string;
};

function uuid(){
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function randomSecret(){
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

function sessionIdentity(){
  try{
    // localStorage intentionally identifies one browser, not one tab. Multiple open
    // tabs from the same person therefore count as a single online visitor.
    let sessionId=localStorage.getItem(SESSION_KEY);
    let secret=localStorage.getItem(SECRET_KEY);
    if(!sessionId){sessionId=uuid();localStorage.setItem(SESSION_KEY,sessionId)}
    if(!secret){secret=randomSecret();localStorage.setItem(SECRET_KEY,secret)}
    return{sessionId,secret};
  }catch{
    return{sessionId:uuid(),secret:randomSecret()};
  }
}

function sourceLabel(){
  try{
    const saved=sessionStorage.getItem(SOURCE_KEY);
    if(saved)return saved;
    const params=new URLSearchParams(location.search||'');
    const utm=String(params.get('utm_source')||'').trim().toLowerCase();
    const ref=document.referrer?new URL(document.referrer):null;
    const host=String(ref?.hostname||'').toLowerCase();
    let source='Direto/sem referência';
    if(params.get('gclid')||/google|youtube/.test(utm))source='Google Ads / YouTube';
    else if(params.get('fbclid')||/facebook|instagram|meta/.test(utm))source='Meta / Instagram';
    else if(utm)source=`UTM: ${utm}`.slice(0,120);
    else if(/google\./.test(host))source='Google orgânico';
    else if(/facebook\.|instagram\./.test(host))source='Meta orgânico';
    else if(host&&!/devinx\.com\.br|devinx-tau\.vercel\.app|devinx-iguassu-shop\.vercel\.app/.test(host))source=host.slice(0,120);
    sessionStorage.setItem(SOURCE_KEY,source);
    return source;
  }catch{
    return'Direto/sem referência';
  }
}

function languageLabel(){
  try{return String(document.documentElement.lang||navigator.language||'pt-BR').slice(0,20)}
  catch{return'pt-BR'}
}

function ago(value:string){
  const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(value||''))/1000));
  if(!Number.isFinite(seconds)||seconds<5)return'agora';
  if(seconds<60)return`há ${seconds}s`;
  return`há ${Math.max(1,Math.floor(seconds/60))}min`;
}

function isFresh(row:LivePresenceRow){
  const seen=Date.parse(row.last_seen_at||'');
  return Number.isFinite(seen)&&Date.now()-seen<ONLINE_WINDOW_SECONDS*1000;
}

export function PresenceProvider({children}:{children:ReactNode}){
  const pathname=usePathname();
  const pathRef=useRef(pathname||'/');
  const beatRef=useRef<()=>void>(()=>{});
  const lastActivityRef=useRef(Date.now());
  const[status,setStatus]=useState<'idle'|'ok'|'error'>('idle');

  useEffect(()=>{
    pathRef.current=pathname||'/';
    lastActivityRef.current=Date.now();
    beatRef.current();
  },[pathname]);

  useEffect(()=>{
    let active=true;
    let sending=false;
    const client=createClient();
    const{sessionId,secret}=sessionIdentity();
    const source=sourceLabel();

    async function heartbeat(){
      if(!active||sending||document.visibilityState!=='visible')return;
      if(Date.now()-lastActivityRef.current>ACTIVE_WINDOW_MS)return;
      sending=true;
      try{
        const{error}=await client.rpc('touch_devinx_presence',{
          p_session_id:sessionId,
          p_secret:secret,
          p_path:pathRef.current||'/',
          p_source:source,
          p_language:languageLabel(),
          p_client_version:PRESENCE_CLIENT_VERSION
        });
        if(!active)return;
        setStatus(error?'error':'ok');
      }catch{
        if(active)setStatus('error');
      }finally{
        sending=false;
      }
    }

    function markActivity(){
      lastActivityRef.current=Date.now();
    }

    beatRef.current=()=>{void heartbeat()};
    void heartbeat();

    const{data:authSubscription}=client.auth.onAuthStateChange(()=>{
      markActivity();
      void heartbeat();
    });
    const onVisible=()=>{
      if(document.visibilityState==='visible'){
        markActivity();
        void heartbeat();
      }
    };
    const onFocus=()=>{
      markActivity();
      void heartbeat();
    };
    const timer=window.setInterval(()=>{void heartbeat()},HEARTBEAT_MS);

    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('focus',onFocus);
    window.addEventListener('pointerdown',markActivity,{passive:true});
    window.addEventListener('keydown',markActivity);
    window.addEventListener('touchstart',markActivity,{passive:true});
    window.addEventListener('scroll',markActivity,{passive:true});

    return()=>{
      active=false;
      beatRef.current=()=>{};
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('focus',onFocus);
      window.removeEventListener('pointerdown',markActivity);
      window.removeEventListener('keydown',markActivity);
      window.removeEventListener('touchstart',markActivity);
      window.removeEventListener('scroll',markActivity);
      authSubscription.subscription.unsubscribe();
    };
  },[]);

  return <>
    {children}
    <span hidden data-devinx-presence-status={status}/>
  </>;
}

export function MasterLivePresence(){
  const[rows,setRows]=useState<LivePresenceRow[]>([]);
  const[status,setStatus]=useState<'loading'|'ok'|'error'>('loading');
  const busyRef=useRef(false);

  useEffect(()=>{
    let active=true;
    const client=createClient();

    function pruneStale(){
      setRows(current=>current.filter(isFresh));
    }

    async function load(){
      if(!active||busyRef.current||document.visibilityState!=='visible')return;
      busyRef.current=true;
      const controller=new AbortController();
      const timeout=window.setTimeout(()=>controller.abort(),MASTER_REQUEST_TIMEOUT_MS);
      try{
        const{data,error}=await client.rpc('admin_get_devinx_live_presence',{
          p_window_seconds:ONLINE_WINDOW_SECONDS
        }).abortSignal(controller.signal);
        if(!active)return;
        if(error){
          console.error('DEVINX LIVE PRESENCE READ',error);
          pruneStale();
          setStatus('error');
          return;
        }
        setRows(((data||[]) as LivePresenceRow[]).filter(isFresh));
        setStatus('ok');
      }catch(error){
        console.error('DEVINX LIVE PRESENCE READ',error);
        if(active){
          pruneStale();
          setStatus('error');
        }
      }finally{
        window.clearTimeout(timeout);
        busyRef.current=false;
      }
    }

    void load();
    const timer=window.setInterval(()=>{void load()},MASTER_REFRESH_MS);
    const onVisible=()=>{if(document.visibilityState==='visible')void load()};
    window.addEventListener('focus',onVisible);
    document.addEventListener('visibilitychange',onVisible);

    return()=>{
      active=false;
      window.clearInterval(timer);
      window.removeEventListener('focus',onVisible);
      document.removeEventListener('visibilitychange',onVisible);
    };
  },[]);

  const anonymous=rows.filter(row=>!row.authenticated).length;
  const logged=rows.length-anonymous;
  const statusLabel=status==='ok'?'ONLINE':status==='error'?'ERRO':'LENDO';

  return <section className="panel masterSectionCard expanded">
    <div className="sectionTitleRow">
      <div><small>AO VIVO</small><h2>Quem está no site agora</h2></div>
      <div className="sectionActions"><span>{statusLabel}</span></div>
    </div>

    <div className="masterMetrics">
      <article><small>Online agora</small><b>{rows.length}</b></article>
      <article><small>Anônimos</small><b>{anonymous}</b></article>
      <article><small>Logados</small><b>{logged}</b></article>
    </div>

    <p className="sectionLead">Leitura própria do DevinX: um visitante por navegador, heartbeat somente com atividade recente, atualização a cada 10s, presença válida por 75s e conta Master fora da contagem.</p>

    <div className="adminUserList">
      {rows.length===0
        ?<div className="empty"><b>{status==='error'?'Falha ao ler presença do Supabase.':'Nenhuma sessão ativa detectada agora.'}</b></div>
        :rows.map(row=><article key={row.session_id} className="adminUser expanded">
          <div className="collapseHeader customerHeader">
            <div className="adminIdentity">
              <b>{row.authenticated?(row.email||'Conta logada'):'ANÔNIMO'}</b>
              <small>{row.path||'/'} · {row.source||'Direto/sem referência'} · {row.language||'—'} · {ago(row.last_seen_at)}</small>
            </div>
            <div className="customerHeaderBadges">
              <span className="statusBadge">{row.authenticated?'LOGADO':'ANÔNIMO'}</span>
              <span className="statusBadge">ONLINE</span>
            </div>
          </div>
        </article>)}
    </div>
  </section>;
}

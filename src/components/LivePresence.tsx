'use client';

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';

const SESSION_KEY='devinx-presence-session-v1';
const SECRET_KEY='devinx-presence-secret-v1';
const SOURCE_KEY='devinx-presence-source-v1';
const HEARTBEAT_MS=25_000;
const MASTER_REFRESH_MS=10_000;
const ONLINE_WINDOW_SECONDS=75;

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
    let sessionId=sessionStorage.getItem(SESSION_KEY);
    let secret=sessionStorage.getItem(SECRET_KEY);
    if(!sessionId){sessionId=uuid();sessionStorage.setItem(SESSION_KEY,sessionId)}
    if(!secret){secret=randomSecret();sessionStorage.setItem(SECRET_KEY,secret)}
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

export function PresenceProvider({children}:{children:ReactNode}){
  const pathname=usePathname();
  const pathRef=useRef(pathname||'/');
  const beatRef=useRef<()=>void>(()=>{});
  const[status,setStatus]=useState<'idle'|'ok'|'error'>('idle');

  useEffect(()=>{
    pathRef.current=pathname||'/';
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
      sending=true;
      try{
        const{error}=await client.rpc('touch_devinx_presence',{
          p_session_id:sessionId,
          p_secret:secret,
          p_path:pathRef.current||'/',
          p_source:source,
          p_language:languageLabel()
        });
        if(!active)return;
        setStatus(error?'error':'ok');
      }catch{
        if(active)setStatus('error');
      }finally{
        sending=false;
      }
    }

    beatRef.current=()=>{void heartbeat()};
    void heartbeat();

    const{data:authSubscription}=client.auth.onAuthStateChange(()=>{void heartbeat()});
    const onVisible=()=>{if(document.visibilityState==='visible')void heartbeat()};
    const onFocus=()=>{void heartbeat()};
    const timer=window.setInterval(()=>{void heartbeat()},HEARTBEAT_MS);

    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('focus',onFocus);

    return()=>{
      active=false;
      beatRef.current=()=>{};
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('focus',onFocus);
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

    async function load(){
      if(!active||busyRef.current||document.visibilityState!=='visible')return;
      busyRef.current=true;
      try{
        const{data,error}=await client.rpc('admin_get_devinx_live_presence',{
          p_window_seconds:ONLINE_WINDOW_SECONDS
        });
        if(!active)return;
        if(error){
          console.error('DEVINX LIVE PRESENCE READ',error);
          setStatus('error');
          return;
        }
        setRows((data||[]) as LivePresenceRow[]);
        setStatus('ok');
      }catch(error){
        console.error('DEVINX LIVE PRESENCE READ',error);
        if(active)setStatus('error');
      }finally{
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

    <p className="sectionLead">Leitura própria do DevinX: atualização a cada 10s, presença válida por 75s e conta Master fora da contagem. Não usa Function da Vercel para o heartbeat.</p>

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

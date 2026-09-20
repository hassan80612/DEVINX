'use client';

import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';

const CHANNEL_NAME='devinx-live-presence-v1';
const SESSION_KEY='devinx-live-session-v1';

export type LivePresenceRow={
  session_id:string;
  user_hash:string|null;
  authenticated:boolean;
  path:string;
  last_seen_at:string;
};

type PresenceContextValue={
  rows:LivePresenceRow[];
  connected:boolean;
};

type PresenceCustomer={
  email:string;
  user_id:string|null;
  is_admin:boolean;
};

const PresenceContext=createContext<PresenceContextValue>({rows:[],connected:false});

function createSessionId(){
  try{
    const current=sessionStorage.getItem(SESSION_KEY);
    if(current)return current;
    const id=typeof crypto.randomUUID==='function'
      ?crypto.randomUUID()
      :Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
    sessionStorage.setItem(SESSION_KEY,id);
    return id;
  }catch{
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
  }
}

async function hashIdentifier(value:string){
  if(!value||!globalThis.crypto?.subtle)return '';
  const bytes=new TextEncoder().encode(value);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function normalizePresence(state:Record<string,unknown>){
  const bySession=new Map<string,LivePresenceRow>();

  for(const[key,value]of Object.entries(state)){
    const items=Array.isArray(value)?value:[];
    for(const raw of items){
      if(!raw||typeof raw!=='object')continue;
      const item=raw as Record<string,unknown>;
      const sessionId=String(item.session_id||key||'');
      if(!sessionId)continue;
      const next:LivePresenceRow={
        session_id:sessionId,
        user_hash:typeof item.user_hash==='string'&&item.user_hash?item.user_hash:null,
        authenticated:item.authenticated===true,
        path:typeof item.path==='string'&&item.path?item.path:'/',
        last_seen_at:typeof item.last_seen_at==='string'&&item.last_seen_at?item.last_seen_at:new Date().toISOString()
      };
      const previous=bySession.get(sessionId);
      if(!previous||Date.parse(next.last_seen_at)>=Date.parse(previous.last_seen_at))bySession.set(sessionId,next);
    }
  }

  return Array.from(bySession.values()).sort((a,b)=>Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at));
}

export function PresenceProvider({children}:{children:ReactNode}){
  const pathname=usePathname();
  const pathRef=useRef(pathname||'/');
  const trackRef=useRef<()=>void>(()=>{});
  const[rows,setRows]=useState<LivePresenceRow[]>([]);
  const[connected,setConnected]=useState(false);

  useEffect(()=>{
    pathRef.current=pathname||'/';
    trackRef.current();
  },[pathname]);

  useEffect(()=>{
    let active=true;
    const client=createClient();
    const sessionId=createSessionId();
    const channel=client.channel(CHANNEL_NAME,{config:{presence:{key:sessionId}}});

    async function track(){
      if(!active||document.visibilityState!=='visible')return;
      try{
        const{data}=await client.auth.getSession();
        const userId=data.session?.user?.id||'';
        const userHash=userId?await hashIdentifier(userId):'';
        await channel.track({
          session_id:sessionId,
          user_hash:userHash||null,
          authenticated:Boolean(userId),
          path:pathRef.current||'/',
          last_seen_at:new Date().toISOString()
        });
      }catch{
        // Presence is best-effort and must never interfere with the product.
      }
    }

    trackRef.current=()=>{void track()};

    channel
      .on('presence',{event:'sync'},()=>{
        if(!active)return;
        setRows(normalizePresence(channel.presenceState() as Record<string,unknown>));
      })
      .subscribe(status=>{
        if(!active)return;
        if(status==='SUBSCRIBED'){
          setConnected(true);
          void track();
        }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
          setConnected(false);
        }
      });

    const{data:authSubscription}=client.auth.onAuthStateChange(()=>{void track()});
    const onVisibility=()=>{
      if(document.visibilityState==='visible')void track();
      else void channel.untrack();
    };
    const onFocus=()=>{void track()};
    const timer=window.setInterval(()=>{void track()},45000);

    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('focus',onFocus);

    return()=>{
      active=false;
      trackRef.current=()=>{};
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('focus',onFocus);
      authSubscription.subscription.unsubscribe();
      void channel.untrack();
      void client.removeChannel(channel);
    };
  },[]);

  return <PresenceContext.Provider value={{rows,connected}}>{children}</PresenceContext.Provider>;
}

export function useLivePresence(){
  return useContext(PresenceContext);
}

export function MasterLivePresence({customers}:{customers:PresenceCustomer[]}){
  const{rows,connected}=useLivePresence();
  const[identityByHash,setIdentityByHash]=useState<Record<string,{email:string;is_admin:boolean}>>({});

  useEffect(()=>{
    let active=true;
    (async()=>{
      const pairs=await Promise.all(customers.filter(item=>item.user_id).map(async item=>{
        const hash=await hashIdentifier(item.user_id||'');
        return [hash,{email:item.email,is_admin:item.is_admin}] as const;
      }));
      if(!active)return;
      const next:Record<string,{email:string;is_admin:boolean}>={};
      for(const[hash,identity]of pairs)if(hash)next[hash]=identity;
      setIdentityByHash(next);
    })();
    return()=>{active=false};
  },[customers]);

  const visibleRows=useMemo(
    ()=>rows.filter(row=>!(row.user_hash&&identityByHash[row.user_hash]?.is_admin)),
    [rows,identityByHash]
  );
  const anonymous=visibleRows.filter(row=>!row.authenticated).length;
  const logged=visibleRows.length-anonymous;

  return <section className="panel masterSectionCard expanded">
    <div className="sectionTitleRow">
      <div><small>AO VIVO</small><h2>Quem está no site agora</h2></div>
      <div className="sectionActions"><span>{connected?'ONLINE':'CONECTANDO'}</span></div>
    </div>

    <div className="masterMetrics">
      <article><small>Online agora</small><b>{visibleRows.length}</b></article>
      <article><small>Anônimos</small><b>{anonymous}</b></article>
      <article><small>Logados</small><b>{logged}</b></article>
    </div>

    <p className="sectionLead">Atualização em tempo real. E-mails são resolvidos somente dentro da conta master; nenhum e-mail é transmitido no canal público.</p>

    <div className="adminUserList">
      {visibleRows.length===0
        ?<div className="empty"><b>{connected?'Nenhuma sessão ativa agora.':'Conectando ao monitor ao vivo...'}</b></div>
        :visibleRows.map(row=>{
          const identity=row.user_hash?identityByHash[row.user_hash]:null;
          const label=row.authenticated?(identity?.email||'Conta logada'):'ANÔNIMO';
          return <article key={row.session_id} className="adminUser expanded">
            <div className="collapseHeader customerHeader">
              <div className="adminIdentity"><b>{label}</b><small>{row.path||'/'}</small></div>
              <div className="customerHeaderBadges">
                <span className="statusBadge">{row.authenticated?'LOGADO':'ANÔNIMO'}</span>
                <span className="statusBadge">ONLINE</span>
              </div>
            </div>
          </article>;
        })}
    </div>
  </section>;
}

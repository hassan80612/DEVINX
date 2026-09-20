'use client';

import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {createClient as createSupabaseJsClient} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/client';

const CHANNEL_NAME='devinx:live:presence';
const SESSION_KEY='devinx-live-session-v2';

export type LivePresenceRow={
  session_id:string;
  user_hash:string|null;
  authenticated:boolean;
  path:string;
  last_seen_at:string;
};

type PresenceStatus='connecting'|'online'|'retrying'|'error';

type PresenceContextValue={
  rows:LivePresenceRow[];
  status:PresenceStatus;
};

type PresenceCustomer={
  email:string;
  user_id:string|null;
  is_admin:boolean;
};

const PresenceContext=createContext<PresenceContextValue>({rows:[],status:'connecting'});

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
  const channelRef=useRef<any>(null);
  const retryRef=useRef<number|null>(null);
  const activeRef=useRef(true);
  const[rows,setRows]=useState<LivePresenceRow[]>([]);
  const[status,setStatus]=useState<PresenceStatus>('connecting');

  useEffect(()=>{pathRef.current=pathname||'/';void trackNow()},[pathname]);

  useEffect(()=>{
    activeRef.current=true;
    const authClient=createClient();
    const realtimeClient:any=createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
    );
    const sessionId=createSessionId();

    async function track(channel=channelRef.current){
      if(!activeRef.current||!channel||document.visibilityState!=='visible')return;
      try{
        const{data}=await authClient.auth.getSession();
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
        // Telemetria de presença nunca deve interromper o produto.
      }
    }

    function clearRetry(){
      if(retryRef.current!==null){
        window.clearTimeout(retryRef.current);
        retryRef.current=null;
      }
    }

    async function disposeChannel(){
      const channel=channelRef.current;
      channelRef.current=null;
      if(!channel)return;
      try{await channel.untrack()}catch{}
      try{await realtimeClient.removeChannel(channel)}catch{}
    }

    function scheduleRetry(){
      if(!activeRef.current||retryRef.current!==null)return;
      setStatus('retrying');
      retryRef.current=window.setTimeout(async()=>{
        retryRef.current=null;
        await disposeChannel();
        connect();
      },3000);
    }

    function connect(){
      if(!activeRef.current)return;
      clearRetry();
      setStatus('connecting');
      try{realtimeClient.realtime?.connect?.()}catch{}
      const channel:any=realtimeClient.channel(CHANNEL_NAME,{
        config:{private:false,presence:{key:sessionId}}
      });
      channelRef.current=channel;

      channel
        .on('presence',{event:'sync'},()=>{
          if(!activeRef.current)return;
          setRows(normalizePresence(channel.presenceState() as Record<string,unknown>));
        })
        .subscribe((nextStatus:string)=>{
          if(!activeRef.current)return;
          if(nextStatus==='SUBSCRIBED'){
            setStatus('online');
            void track(channel);
            return;
          }
          if(nextStatus==='CHANNEL_ERROR'||nextStatus==='TIMED_OUT'||nextStatus==='CLOSED'){
            setStatus('error');
            scheduleRetry();
          }
        });
    }

    const{data:authSubscription}=authClient.auth.onAuthStateChange(()=>{void track()});
    const onVisibility=()=>{
      const channel=channelRef.current;
      if(document.visibilityState==='visible'){
        if(!channel)connect();
        else void track(channel);
      }else if(channel){
        void channel.untrack();
      }
    };
    const onFocus=()=>{void track()};
    const timer=window.setInterval(()=>{void track()},45000);

    connect();
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('focus',onFocus);

    return()=>{
      activeRef.current=false;
      clearRetry();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('focus',onFocus);
      authSubscription.subscription.unsubscribe();
      void disposeChannel();
    };
  },[]);

  async function trackNow(){
    const channel=channelRef.current;
    if(!channel||document.visibilityState!=='visible')return;
    try{
      const authClient=createClient();
      const{data}=await authClient.auth.getSession();
      const userId=data.session?.user?.id||'';
      const userHash=userId?await hashIdentifier(userId):'';
      await channel.track({
        session_id:createSessionId(),
        user_hash:userHash||null,
        authenticated:Boolean(userId),
        path:pathRef.current||'/',
        last_seen_at:new Date().toISOString()
      });
    }catch{}
  }

  return <PresenceContext.Provider value={{rows,status}}>
    {children}
    <span hidden data-devinx-presence-status={status}/>
  </PresenceContext.Provider>;
}

export function useLivePresence(){
  return useContext(PresenceContext);
}

export function MasterLivePresence({customers}:{customers:PresenceCustomer[]}){
  const{rows,status}=useLivePresence();
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
  const statusLabel=status==='online'?'ONLINE':status==='retrying'?'RECONECTANDO':status==='error'?'ERRO':'CONECTANDO';

  return <section className="panel masterSectionCard expanded">
    <div className="sectionTitleRow">
      <div><small>AO VIVO</small><h2>Quem está no site agora</h2></div>
      <div className="sectionActions"><span>{statusLabel}</span></div>
    </div>

    <div className="masterMetrics">
      <article><small>Online agora</small><b>{visibleRows.length}</b></article>
      <article><small>Anônimos</small><b>{anonymous}</b></article>
      <article><small>Logados</small><b>{logged}</b></article>
    </div>

    <p className="sectionLead">Presença em tempo real. A conta master não entra na contagem; visitantes sem login aparecem como anônimos.</p>

    <div className="adminUserList">
      {visibleRows.length===0
        ?<div className="empty"><b>{status==='online'?'Nenhuma sessão ativa agora.':'Conectando ao monitor ao vivo...'}</b></div>
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

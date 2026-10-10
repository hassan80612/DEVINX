import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-config';

export type SignedAnalystFrame={
  v:number,at:number,seq:number,sig:string,state:string,killSwitch?:boolean,masterFrozen?:boolean,
  lastEvalMs:number,lastResult:{asset:string,analysis:any},
  feed?:{price:number|null,quoteTs:number},liveBroker:{symbol:string,lastQuoteAt:number}
};

const endpoint=SUPABASE_URL.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(SUPABASE_PUBLISHABLE_KEY)+'&vsn=1.0.0';
const validTopic=(s:string)=>/^realtime:sentinel-[a-f0-9]{48}$/.test(s);
const validKey=(s:string)=>/^[a-f0-9]{64}$/.test(s);
const bytes=(hex:string)=>new Uint8Array((hex.match(/../g)||[]).map(c=>parseInt(c,16)));
const hex=(data:ArrayBuffer)=>Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('');

export function watchSignedLiveAnalyst(topic:string,signingKey:string,onMessage:(m:SignedAnalystFrame)=>void){
  if(!validTopic(topic)||!validKey(signingKey)||typeof WebSocket==='undefined'||!globalThis.crypto?.subtle)return()=>{};
  let ws:WebSocket|null=null,joined=false,closed=false,attempt=0,ref=0,sequence=0;
  let retry:ReturnType<typeof setTimeout>|null=null,heartbeat:ReturnType<typeof setInterval>|null=null,viewer:ReturnType<typeof setInterval>|null=null;
  const encoder=new TextEncoder();
  const keyPromise=crypto.subtle.importKey('raw',bytes(signingKey),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']).catch(()=>null);
  const push=(event:string,payload:any,channel=topic)=>{
    if(ws?.readyState!==WebSocket.OPEN)return;
    try{ws.send(JSON.stringify({topic:channel,event,payload,ref:String(++ref),join_ref:channel===topic?'1':null}))}catch{}
  };
  const announce=async()=>{
    if(!joined||document.visibilityState!=='visible')return;
    const k=await keyPromise;if(!k||!joined)return;
    const at=Date.now();
    const sig=hex(await crypto.subtle.sign('HMAC',k,encoder.encode(topic+'|'+at)));
    if(joined)push('broadcast',{type:'broadcast',event:'viewer',payload:{at,sig}});
  };
  const verifyFrame=async(frame:SignedAnalystFrame)=>{
    if(!frame||frame.v!==1||!Number.isSafeInteger(frame.seq)||frame.seq<=sequence||
       !Number.isFinite(frame.at)||Math.abs(Date.now()-frame.at)>8000||
       !frame.liveBroker?.symbol||!frame.lastResult?.asset||!/^[a-f0-9]{64}$/.test(String(frame.sig||'')))return;
    const k=await keyPromise;if(!k||closed||!joined)return;
    const unsigned:any={...frame};delete unsigned.sig;
    const ok=await crypto.subtle.verify('HMAC',k,bytes(frame.sig),encoder.encode(JSON.stringify(unsigned))).catch(()=>false);
    if(!ok||frame.seq<=sequence||closed||!joined)return;
    sequence=frame.seq;onMessage(frame);
  };
  const cleanup=()=>{
    joined=false;
    if(heartbeat){clearInterval(heartbeat);heartbeat=null}
    if(viewer){clearInterval(viewer);viewer=null}
  };
  const schedule=()=>{
    if(closed)return;
    retry=setTimeout(()=>{retry=null;connect()},Math.min(30000,1500*2**Math.min(4,attempt++)));
  };
  const connect=()=>{
    if(closed)return;
    let sock:WebSocket;try{sock=new WebSocket(endpoint)}catch{schedule();return}
    ws=sock;ref=0;
    sock.onopen=()=>{
      push('phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},private:false}});
      heartbeat=setInterval(()=>push('heartbeat',{},'phoenix'),25000);
    };
    sock.onmessage=e=>{
      let msg:any;try{msg=JSON.parse(String(e.data))}catch{return}
      if(msg?.topic!==topic)return;
      if(msg.event==='phx_reply'&&msg.ref==='1'){
        if(msg.payload?.status!=='ok'){try{sock.close()}catch{};return}
        joined=true;attempt=0;void announce();viewer=setInterval(()=>{void announce()},7000);return
      }
      if(joined&&msg.event==='broadcast'&&msg.payload?.event==='analyst')void verifyFrame(msg.payload.payload);
    };
    sock.onerror=()=>{try{sock.close()}catch{}};
    sock.onclose=()=>{if(ws!==sock)return;ws=null;cleanup();schedule()};
  };
  const visibility=()=>{if(document.visibilityState==='visible')void announce()};
  document.addEventListener('visibilitychange',visibility);
  connect();
  return()=>{
    closed=true;if(retry)clearTimeout(retry);document.removeEventListener('visibilitychange',visibility);
    cleanup();try{ws?.close()}catch{}ws=null;
  };
}

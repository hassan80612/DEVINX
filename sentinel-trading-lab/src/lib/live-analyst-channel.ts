// Browser-only realtime transport: small, transient analyst events, no video,
// database change subscription, trade commands, or WebSocket injection.
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-config';

type LiveMessage={v:number,at:number,seq:number,state:string,killSwitch?:boolean,masterFrozen?:boolean,lastEvalMs:number,lastResult:{asset:string,analysis:any},feed?:{price:number|null,quoteTs:number},liveBroker:{symbol:string,lastQuoteAt:number}};
const url=SUPABASE_URL.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(SUPABASE_PUBLISHABLE_KEY)+'&vsn=1.0.0';
const validTopic=(s:string)=>/^realtime:sentinel-[0-9a-f]{48}$/.test(s);

export function watchLiveAnalyst(topic:string,onMessage:(m:LiveMessage)=>void,onConnection?:(online:boolean)=>void){
  if(!validTopic(topic)||typeof WebSocket==='undefined')return()=>{};
  let ws:WebSocket|null=null,joined=false,closed=false,attempt=0,ref=0,sequence=0;
  let retry:ReturnType<typeof setTimeout>|null=null,heartbeat:ReturnType<typeof setInterval>|null=null,viewer:ReturnType<typeof setInterval>|null=null;
  const push=(event:string,payload:any,channel=topic)=>{
    if(ws?.readyState!==WebSocket.OPEN)return;
    try{ws.send(JSON.stringify({topic:channel,event,payload,ref:String(++ref),join_ref:channel===topic?'1':null}))}catch{}
  };
  const announce=()=>{
    if(joined&&document.visibilityState==='visible')push('broadcast',{type:'broadcast',event:'viewer',payload:{at:Date.now()}});
  };
  const cleanup=()=>{
    joined=false;
    if(heartbeat){clearInterval(heartbeat);heartbeat=null}
    if(viewer){clearInterval(viewer);viewer=null}
    onConnection?.(false);
  };
  const connect=()=>{
    if(closed)return;
    let sock:WebSocket;try{sock=new WebSocket(url)}catch{schedule();return}
    ws=sock;ref=0;
    sock.onopen=()=>{
      push('phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},private:false}});
      heartbeat=setInterval(()=>push('heartbeat',{},'phoenix'),25000);
    };
    sock.onmessage=ev=>{
      let msg:any;try{msg=JSON.parse(String(ev.data))}catch{return}
      if(msg?.topic!==topic)return;
      if(msg.event==='phx_reply'&&msg.ref==='1'){
        if(msg.payload?.status!=='ok'){try{sock.close()}catch{};return}
        joined=true;attempt=0;onConnection?.(true);announce();viewer=setInterval(announce,7000);return
      }
      if(msg.event!=='broadcast'||msg.payload?.event!=='analyst'||!joined)return;
      const p:LiveMessage=msg.payload.payload;
      if(!p||p.v!==1||!Number.isFinite(p.seq)||p.seq<=sequence||!Number.isFinite(p.at)||Math.abs(Date.now()-p.at)>8000||!p.liveBroker?.symbol||!p.lastResult?.asset)return;
      sequence=p.seq;onMessage(p);
    };
    sock.onerror=()=>{try{sock.close()}catch{}};
    sock.onclose=()=>{if(ws!==sock)return;ws=null;cleanup();schedule()};
  };
  const schedule=()=>{
    if(closed)return;
    const delay=Math.min(30000,1500*2**Math.min(4,attempt++));
    retry=setTimeout(()=>{retry=null;connect()},delay);
  };
  const visibility=()=>{if(document.visibilityState==='visible')announce()};
  document.addEventListener('visibilitychange',visibility);
  connect();
  return()=>{
    closed=true;if(retry)clearTimeout(retry);document.removeEventListener('visibilitychange',visibility);
    cleanup();try{ws?.close()}catch{}ws=null;
  };
}

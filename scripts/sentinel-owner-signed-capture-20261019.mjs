// One bounded, owner-authorized read-only signed stream. No command endpoint,
// broker request or Postgres write. Capability input is deleted immediately.
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';import {createHmac,timingSafeEqual} from 'node:crypto';
import {analystWireV1} from '../sentinel-trading-lab/src/lib/analyst-wire-v1.mjs';
import {observedExpiryQuote} from '../sentinel-trading-lab/agent/src/core/observed-expiry-quote-20261018.mjs';
const require=createRequire(import.meta.url),WebSocket=require('../sentinel-trading-lab/node_modules/next/dist/compiled/ws/index.js'),ProxyAgent=require('../sentinel-trading-lab/node_modules/next/dist/compiled/https-proxy-agent/index.js');
const capabilityFile=process.argv[2],output=process.argv[3];if(!capabilityFile||!output)throw Error('Private capability and private output paths required');
const cap=JSON.parse(readFileSync(capabilityFile,'utf8'));rmSync(capabilityFile);
if(!/^realtime:sentinel-[a-f0-9]{48}$/.test(cap.topic)||!/^[a-f0-9]{64}$/.test(cap.signature_key))throw Error('Invalid capability');
const startedAt=Date.now(),limitMs=180000,quotes=new Map(),entries=new Map(),mac=text=>createHmac('sha256',Buffer.from(cap.signature_key,'hex')).update(text).digest('hex');
let joined=false,ref=0,sequence=0,frames=0,invalid=0,closed=false,lastFrameAt=0,error=null;
const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;
const socket=new WebSocket('wss://vwczyqvptziyseagettp.supabase.co/realtime/v1/websocket?apikey=sb_publishable_ubJ_fSkmRa68XPdrV_8Q5A_dcYTRWWj&vsn=1.0.0',proxy?{agent:new ProxyAgent(proxy),handshakeTimeout:12000}:{handshakeTimeout:12000});
const send=(event,payload,topic=cap.topic)=>{if(socket.readyState===1)socket.send(JSON.stringify({topic,event,payload,ref:String(++ref),join_ref:topic===cap.topic?'1':null}));};
const announce=()=>{if(joined){const at=Date.now();send('broadcast',{type:'broadcast',event:'viewer',payload:{at,sig:mac(cap.topic+'|'+at)}});}};
const save=()=>{
 const qs=[...quotes.values()].sort((a,b)=>a.ts-b.ts);
 const es=[...entries.values()].map(e=>{const q=observedExpiryQuote({quoteHistory:qs,dueAt:e.exitAt,now:Date.now()});return {...e,observedExit:q,result:!q?'not-observed':q.price===e.entryPrice?'tie':(q.price>e.entryPrice?'CALL':'PUT')===e.side?'win':'loss'};});
 const summary={startedAt,endedAt:Date.now(),frames,invalidSignatures:invalid,quotes:qs.length,entries:es.length,confirmedOwningReasons:es.filter(e=>e.entryReasonConfirmed).length,wins:es.filter(e=>e.result==='win').length,losses:es.filter(e=>e.result==='loss').length,ties:es.filter(e=>e.result==='tie').length,unobserved:es.filter(e=>e.result==='not-observed').length,error};
 writeFileSync(output,JSON.stringify({method:'Owner signed price/analyst stream; read-only, bounded 180s; quote outcomes are not executed broker settlements',asset:cap.asset,engine:cap.engine,durationMs:Number(cap.duration_ms),summary,quotes:qs,entries:es},null,2)+'\n',{mode:0o600});return summary;
};
let timer,viewer,heartbeat,quiet;
const finish=why=>{if(closed)return;closed=true;clearTimeout(timer);clearInterval(viewer);clearInterval(heartbeat);clearInterval(quiet);if(why)error=why;socket.terminate();const summary=save();console.log(JSON.stringify(summary));};
socket.on('open',()=>{send('phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},private:false}});});
socket.on('message',raw=>{
 let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
 if(msg.topic!==cap.topic)return;
 if(msg.event==='phx_reply'&&msg.ref==='1'){if(msg.payload?.status!=='ok'){finish('join-rejected');return;}joined=true;announce();console.log(JSON.stringify({connected:true,readOnly:true,seconds:limitMs/1000}));return;}
 if(msg.event!=='broadcast'||msg.payload?.event!=='analyst')return;
 const f=msg.payload.payload;if(!f||f.seq<=sequence||!/^[a-f0-9]{64}$/.test(f.sig||''))return;
 const expected=Buffer.from(mac(analystWireV1(f)),'hex'),received=Buffer.from(f.sig,'hex');if(!timingSafeEqual(expected,received)){invalid++;return;}
 if(Math.abs(Date.now()-f.at)>15000)return;
 sequence=f.seq;frames++;lastFrameAt=Date.now();const q=f.liveBroker||{};
 if(q.lastQuoteAt>0&&q.quote>0)quotes.set(q.lastQuoteAt,{ts:q.lastQuoteAt,price:q.quote,receivedAt:f.at});
 const v=f.lastResult?.analysis?.vnext||{},a=v.ea;
 if(Array.isArray(a)&&a[9]==='fired'&&a[10]>0&&!entries.has(a[10])){
  const owning=Number(v.nowObservation?.evaluatedAt)===Number(a[10]);
  entries.set(a[10],{entryAt:a[6],triggeredAt:a[10],exitAt:a[7],entryPrice:a[2],side:a[1],firstSeenFrameAt:f.at,entryReasonConfirmed:owning,entryReason:owning?v.nowObservation.reason:null,observationReasonAtFirstSeen:v.nowObservation?.reason??null});
  console.log(JSON.stringify({newEntry:true,side:a[1],owningReasonConfirmed:owning,reason:owning?v.nowObservation.reason:null}));
 }
 if(frames%15===0)save();
});
socket.on('error',()=>finish('socket-error'));socket.on('close',()=>finish(error||'socket-closed'));
viewer=setInterval(announce,7000);heartbeat=setInterval(()=>send('heartbeat',{},'phoenix'),25000);
quiet=setInterval(()=>{if(Date.now()-startedAt>25000&&!lastFrameAt)finish('no-signed-agent-frame');},1000);
timer=setTimeout(()=>finish(null),limitMs);

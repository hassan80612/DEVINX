// Read-only, ephemeral ANALYST snapshots. No broker commands, screen sharing,
// Postgres row updates, journal writes, or replay. Channel access is a random
// capability distributed exclusively through the existing authenticated status.
const SUPABASE_URL=process.env.SENTINEL_SUPABASE_URL||'https://vwczyqvptziyseagettp.supabase.co';
const PUBLIC_KEY='sb_publishable_ubJ_fSkmRa68XPdrV_8Q5A_dcYTRWWj';
const wsUrl=SUPABASE_URL.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(PUBLIC_KEY)+'&vsn=1.0.0';

export function analystSnapshot(runtimeStatus,live){
  const analysis=runtimeStatus?.lastResult?.analysis||{};
  const op=analysis.operationalSignal||{};
  const gc=analysis.generalConsensus||{};
  const horizon=Number(runtimeStatus?.settings?.forecastHorizonSeconds||60);
  const forecast=analysis.entryPlanner?.horizons?.[String(horizon)]||null;
  const take=(obj,keys)=>Object.fromEntries(keys.filter(k=>obj?.[k]!==undefined).map(k=>[k,obj[k]]));
  const allowed=v=>v!=null&&typeof v==='object'?v:{};
  const scenario=take(op.scenario,['side','status','closed','createdAt','deadline','confidence']);
  const sub=take(op.subanalyst,['mode','active','status','checkedAt']);
  if(op.subanalyst?.alert)sub.alert=take(op.subanalyst.alert,['side','trigger','invalidation','target','testing']);
  const operational=take(op,['asset','forecastHorizonSeconds','durationMs','side','state','ready','actionable','activeUntil','entryWindowEndAt','targetAt','createdAt','technicalConfidence','strength','futureSide','entryDecisionHorizonSeconds']);
  operational.scenario=scenario;
  operational.subanalyst=sub;
  if(op.entryAnalyst?.independent===true)operational.entryAnalyst={independent:true,qualification:take(op.entryAnalyst.qualification,['allowed'])};
  const result=runtimeStatus?.lastResult||{};
  const asset=String(live?.validatedSymbol||live?.symbol||runtimeStatus?.settings?.asset||'');
  const liveQuoteAt=Number(live?.lastQuoteAt||0);
  return{
    v:1,at:Date.now(),seq:0,agentVersion:String(runtimeStatus?.agentVersion||''),
    state:runtimeStatus?.state,killSwitch:runtimeStatus?.killSwitch,masterFrozen:runtimeStatus?.masterFrozen,
    lastEvalMs:Number(runtimeStatus?.lastEvalMs||0),
    liveBroker:{symbol:asset,validatedSymbol:live?.validatedSymbol||asset,assetValidated:live?.assetValidated===true,analysisFeedValidated:live?.analysisFeedValidated===true,lastQuoteAt:liveQuoteAt,quote:live?.quote??null},
    feed:{price:live?.quote??null,quoteTs:liveQuoteAt},
    lastResult:{asset:result.asset||asset,analysis:{
      operationalSignal:operational,
      generalConsensus:{
        rapid:take(gc.rapid,['callPct','activeCount']),
        strategies:take(gc.strategies,['callPct','activeCount']),
        displayCallPct:gc.displayCallPct??null,
      },
      entryPlanner:{horizons:forecast?{[String(horizon)]:take(forecast,['asset','horizonSeconds','rawBias','bias','displayBias','outlookReady','directionReady','confidence','modelConfidence','callProbability','putProbability'])}:{}}
    }}
  };
}

export class LiveBridge{
  constructor(topic,{WebSocketClass=globalThis.WebSocket,minIntervalMs=1100,clock=()=>Date.now()}={}){
    this.topic=topic;this.socket=null;this.WebSocketClass=WebSocketClass;this.minIntervalMs=Math.max(1000,minIntervalMs);
    this.clock=clock;this.joined=false;this.viewerAt=0;this.lastSentAt=0;this.lastFingerprint='';this.seq=0;this.timer=null;this.heartbeat=null;this.stopped=false;this.attempt=0;
  }
  send(event,payload,topic=this.topic){
    if(this.socket?.readyState!==1)return false;
    try{this.socket.send(JSON.stringify({topic,event,payload,ref:String(++this.seq),join_ref:topic===this.topic?'1':null}));return true}catch{return false}
  }
  start(){
    if(this.stopped||!this.WebSocketClass||this.socket)return;
    const socket=new this.WebSocketClass(wsUrl);this.socket=socket;this.joined=false;
    socket.addEventListener('open',()=>{
      this.send('phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},private:false}});
      this.heartbeat=setInterval(()=>this.send('heartbeat',{},'phoenix'),25000);
      this.heartbeat.unref?.();
    });
    socket.addEventListener('message',event=>{
      let msg;try{msg=JSON.parse(String(event.data))}catch{return}
      if(msg?.topic!==this.topic)return;
      if(msg.event==='phx_reply'&&msg.ref==='1'){if(msg.payload?.status==='ok'){this.joined=true;this.attempt=0}else{try{socket.close()}catch{}}}
      if(msg.event==='broadcast'&&msg.payload?.event==='viewer'&&this.joined)this.viewerAt=this.clock();
    });
    const done=()=>{
      if(this.socket!==socket)return;
      this.socket=null;this.joined=false;this.viewerAt=0;
      clearInterval(this.heartbeat);this.heartbeat=null;
      if(!this.stopped){
        const delay=Math.min(30000,1500*Math.pow(2,Math.min(4,this.attempt++)));
        this.timer=setTimeout(()=>{this.timer=null;this.start()},delay);this.timer.unref?.();
      }
    };
    socket.addEventListener('error',()=>{try{socket.close()}catch{}});
    socket.addEventListener('close',done);
  }
  hasViewer(){return this.joined&&this.clock()-this.viewerAt<16000}
  publish(snapshot,{urgent=false}={}){
    if(!this.hasViewer()||!snapshot)return false;
    // Only a material decision transition can bypass the routine cadence.
    // Still cap burst delivery to avoid websocket/Supabase overload.
    const now=this.clock();if(now-this.lastSentAt<(urgent?500:this.minIntervalMs))return false;
    // Re-send only when the local analysis, price or scenario actually changed.
    const fingerprint=[snapshot.lastEvalMs,snapshot.liveBroker?.lastQuoteAt,snapshot.liveBroker?.symbol,snapshot.state].join('|');
    if(fingerprint===this.lastFingerprint)return false;
    snapshot.seq=++this.seq;const encoded=JSON.stringify(snapshot);
    // Strict egress budget; huge reports never flow through the live channel.
    if(Buffer.byteLength(encoded,'utf8')>3000)return false;
    if(!this.send('broadcast',{type:'broadcast',event:'analyst',payload:snapshot}))return false;
    this.lastSentAt=now;this.lastFingerprint=fingerprint;return true;
  }
  close(){this.stopped=true;clearTimeout(this.timer);clearInterval(this.heartbeat);try{this.socket?.close()}catch{}this.socket=null}
}

import {createHmac,timingSafeEqual} from 'node:crypto';
import {LiveBridge} from './live-bridge.mjs';

// The public Realtime room only transports data. HMAC capability comes from
// authenticated account status and rotates every Agent restart.
export class SignedLiveBridge extends LiveBridge{
  constructor(topic,secret,options={}){
    super(topic,options);
    if(!/^[a-f0-9]{64}$/.test(secret))throw new Error('live_signing_key_missing');
    this.secret=secret;this.verifiedViewerAt=0;this.lastPublishedQuoteAt=0;this.lastOpportunityKey='';this.onViewer=options.onViewer;
  }
  mac(input){return createHmac('sha256',Buffer.from(this.secret,'hex')).update(input).digest('hex')}
  verifyViewer(payload){
    const at=Number(payload?.at),hex=String(payload?.sig||'');
    // The mobile may have a different device clock. A valid HMAC, not its
    // uncalibrated timestamp, authenticates the first viewer/clock handshake.
    // The clock-sync sample itself still has a short signed RTT and 120s limit.
    if(!Number.isFinite(at)||Math.abs(this.clock()-at)>120000||!/^[a-f0-9]{64}$/.test(hex))return false;
    const a=Buffer.from(this.mac(this.topic+'|'+at),'hex'),b=Buffer.from(hex,'hex');
    return timingSafeEqual(a,b);
  }
  start(){
    if(this.stopped||!this.WebSocketClass||this.socket)return;
    this.verifiedViewerAt=0;
    super.start();
    const socket=this.socket;
    socket?.addEventListener('message',e=>{
      if(this.socket!==socket||this.stopped)return;
      let msg;try{msg=JSON.parse(String(e.data))}catch{return}
      if(msg.topic===this.topic&&msg.event==='broadcast'&&msg.payload?.event==='viewer'&&this.joined&&this.verifyViewer(msg.payload?.payload)){
       this.verifiedViewerAt=this.clock();
        // Signed echo on the SAME live socket: measures phone-vs-PC time
        // without querying the broker or running another prediction.
        const viewerAt=Number(msg.payload.payload.at);
        const pcAt=this.clock();
        this.send('broadcast',{type:'broadcast',event:'clock-sync',
          payload:{viewerAt,pcAt,sig:this.mac(this.topic+'|clock-sync|'+viewerAt+'|'+pcAt)}});
        this.onViewer?.();
      }
    });
  }
  hasViewer(){return this.joined&&this.clock()-this.verifiedViewerAt<16000}
  publish(snapshot,{urgent=false,sourceEvent=false}={}){
    const a=snapshot?.lastResult?.analysis||{},op=a.operationalSignal||{},gc=a.generalConsensus||{};
    const scenario=op.scenario||{},alert=op.subanalyst?.alert||{};
    // A NEW broker quote is actionable information on 30s/60s expiries,
    // even if the forecast is unchanged. Previously the unchanged-decision
    // throttle held price updates for 4s, making mobile appear 5-6s late.
    // The base bridge still limits ordinary broadcasts to >=1100ms,
    // and these broadcasts do not write rows to Postgres.
    const signal=JSON.stringify([
      snapshot?.liveBroker?.symbol,snapshot?.state,
      gc.rapid?.callPct,gc.strategies?.callPct,gc.displayCallPct,
      scenario.side,scenario.status,scenario.closed,scenario.deadline,
      alert.side,alert.trigger,alert.testing,op.subanalyst?.status,
      op.state,op.side,op.ready,op.actionable,op.activeUntil,
      snapshot?.settings?.forecastMode,snapshot?.settings?.engine,snapshot?.settings?.orderDurationMs,
      a.vnext?.engineId,a.vnext?.receipt?.side,
      // Refresh future-entry countdown urgently when the pinned clock rolls.
      a.vnext?.ea?.[4],a.vnext?.ea?.[0],a.vnext?.ea?.[1],
      a.vnext?.ow?.[0],a.vnext?.ow?.[1],a.vnext?.ow?.[2],
      snapshot?.killSwitch,snapshot?.masterFrozen
    ]);
    const changed=signal!==this.lastSignalKey;
    const quoteAt=Number(snapshot?.liveBroker?.lastQuoteAt||snapshot?.feed?.quoteTs||0);
    const newQuote=Number.isFinite(quoteAt)&&quoteAt>this.lastPublishedQuoteAt;
    // An Agent-confirmed new window or one-shot entry must not sit behind the
    // normal 500ms minimum cadence. Unchanged market percentages still do.
    const opportunityKey=JSON.stringify([a.vnext?.ow?.[0]||null,a.vnext?.ow?.[1]||0,
      a.vnext?.ow?.[2]||0,a.vnext?.ea?.[1]||null,a.vnext?.ea?.[10]||0]);
    const criticalTransition=this.lastOpportunityKey!==''&&
      opportunityKey!==this.lastOpportunityKey&&
      ['open','cancelled','fired'].includes(String(a.vnext?.ow?.[0]||''));
    if(!sourceEvent&&!urgent&&!changed&&!newQuote&&this.clock()-this.lastSentAt<4000)return false;
    // Never delay a fresh CALL/PUT, reversal test, cancellation or scenario
    // review behind the four-second unchanged-quote optimization.
    const published=super.publish(snapshot,{urgent:urgent||(changed&&!!this.lastSignalKey),sourceEvent:sourceEvent||criticalTransition});
    if(published){this.lastSignalKey=signal;this.lastOpportunityKey=opportunityKey;this.lastPublishedQuoteAt=Math.max(this.lastPublishedQuoteAt,quoteAt);}
    return published;
  }
  send(event,payload,topic=this.topic){
    if(event==='broadcast'&&payload?.event==='analyst'&&payload.payload){
      const frame=payload.payload;
      delete frame.sig;
      frame.sig=this.mac(JSON.stringify(frame));
    }
    return super.send(event,payload,topic);
  }
}

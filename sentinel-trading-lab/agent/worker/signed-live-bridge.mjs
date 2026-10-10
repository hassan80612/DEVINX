import {createHmac,timingSafeEqual} from 'node:crypto';
import {LiveBridge} from './live-bridge.mjs';

// The public Realtime room only transports data. HMAC capability comes from
// authenticated account status and rotates every Agent restart.
export class SignedLiveBridge extends LiveBridge{
  constructor(topic,secret,options={}){
    super(topic,options);
    if(!/^[a-f0-9]{64}$/.test(secret))throw new Error('live_signing_key_missing');
    this.secret=secret;this.verifiedViewerAt=0;
  }
  mac(input){return createHmac('sha256',Buffer.from(this.secret,'hex')).update(input).digest('hex')}
  verifyViewer(payload){
    const at=Number(payload?.at),hex=String(payload?.sig||'');
    if(!Number.isFinite(at)||Math.abs(this.clock()-at)>12000||!/^[a-f0-9]{64}$/.test(hex))return false;
    const a=Buffer.from(this.mac(this.topic+'|'+at),'hex'),b=Buffer.from(hex,'hex');
    return timingSafeEqual(a,b);
  }
  start(){
    super.start();
    const socket=this.socket;
    socket?.addEventListener('message',e=>{
      let msg;try{msg=JSON.parse(String(e.data))}catch{return}
      if(msg.topic===this.topic&&msg.event==='broadcast'&&msg.payload?.event==='viewer'&&this.joined&&this.verifyViewer(msg.payload?.payload))this.verifiedViewerAt=this.clock();
    });
  }
  hasViewer(){return this.joined&&this.clock()-this.verifiedViewerAt<16000}
  publish(snapshot){
    const a=snapshot?.lastResult?.analysis||{},op=a.operationalSignal||{},gc=a.generalConsensus||{};
    const scenario=op.scenario||{},alert=op.subanalyst?.alert||{};
    // Price timestamps change continuously, but unchanged recommendations do
    // not require a whole broadcast each second. Scenario/side/percent changes
    // still publish at the original fast cadence.
    const signal=JSON.stringify([
      snapshot?.liveBroker?.symbol,snapshot?.state,
      gc.rapid?.callPct,gc.strategies?.callPct,gc.displayCallPct,
      scenario.side,scenario.status,scenario.closed,scenario.deadline,
      alert.side,alert.trigger,op.subanalyst?.status,op.state,op.side,
      snapshot?.killSwitch,snapshot?.masterFrozen
    ]);
    if(signal===this.lastSignalKey&&this.clock()-this.lastSentAt<4000)return false;
    const published=super.publish(snapshot);
    if(published)this.lastSignalKey=signal;
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

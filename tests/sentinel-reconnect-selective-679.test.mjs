import test from 'node:test';
import assert from 'node:assert/strict';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {structureForecast} from '../sentinel-trading-lab/agent/src/core/automatic-structure-forecast.mjs';
import {qualifyStrategyInterval} from '../sentinel-trading-lab/agent/src/core/selective-forward-model.mjs';
class Socket{
 constructor(){this.handlers={};this.sent=[];this.readyState=1;}
 addEventListener(k,f){(this.handlers[k]??=[]).push(f)}
 emit(k,x={}){for(const f of this.handlers[k]||[])f(x)}
 send(x){this.sent.push(JSON.parse(x))}
 close(){this.readyState=3;this.emit('close')}
 message(x){this.emit('message',{data:JSON.stringify(x)})}
}
const now=1800000000000;
test('signed stream resumes after repeated PC reconnects, retaining monotonic frame IDs',()=>{
 let at=now,previousSeq=0;
 const topic='realtime:sentinel-'+'a'.repeat(48),b=new SignedLiveBridge(topic,'b'.repeat(64),{WebSocketClass:Socket,clock:()=>at});
 try{
  for(let i=0;i<3;i++){
   b.start();const s=b.socket;s.emit('open');const join=s.sent[0];
   assert.equal(join.join_ref,join.ref);
   s.message({topic,event:'phx_reply',ref:join.ref,payload:{status:'ok'}});
   assert.equal(b.joined,true);
   assert.equal(b.hasViewer(),false,'fresh connection requires signed viewer');
   s.message({topic,event:'broadcast',payload:{event:'viewer',payload:{at,sig:b.mac(topic+'|'+at)}}});
   assert.equal(b.hasViewer(),true);
   const frame={v:1,at,seq:0,state:'running',lastEvalMs:at,liveBroker:{symbol:'TEST',lastQuoteAt:at},lastResult:{asset:'TEST',analysis:{}}};
   assert.equal(b.publish(frame),true);
   const sent=s.sent.at(-1);assert.equal(sent.join_ref,join.ref);
   assert.ok(sent.payload.payload.seq>previousSeq);previousSeq=sent.payload.payload.seq;
   s.close();clearTimeout(b.timer);at+=2000;
   s.message({topic,event:'phx_reply',ref:join.ref,payload:{status:'ok'}});
   assert.equal(b.joined,false,'closed socket cannot rejoin');
  }
 }finally{b.close()}
});
function meanRevertingHistory(length){
 let seed=12345,value=0;
 return Array.from({length},(_,i)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;value=.8*value+(seed/2**32-.5)*.0001;return {ts:now-(length-1-i)*1000,price:Math.exp(value)};});
}
test('valid 13–20 minute histories do not access negative indices or lose mean-reversion evidence',()=>{
 for(const length of [800,1000,1199,1200,1600]){
  const quoteHistory=meanRevertingHistory(length),r=structureForecast({quoteHistory,asOf:now,selectedSeconds:30});
  assert.ok(r);assert.ok(Number.isFinite(r.meanReversionEvidence.rate));assert.ok(r.meanReversionEvidence.rate>.004);
  assert.ok(r.meanReversionEvidence.tStatistic>3.5);
  const f=qualifyStrategyInterval({forecast:{side:'CALL',holdingSeconds:30,projectedEntryPrice:1,projectedExitPrice:1.01},quoteHistory,asOf:now});
  assert.equal(f.qualification.qualified,true,'valid evidence must reach the unchanged margin gate');
 }
});
test('selective waiting distinguishes short, interrupted and stale history without inventing signals',()=>{
 const forecast={side:'CALL',holdingSeconds:30,projectedEntryPrice:1,projectedExitPrice:1.01};
 const short=qualifyStrategyInterval({forecast,quoteHistory:meanRevertingHistory(180),asOf:now});
 assert.equal(short.side,null);assert.equal(short.qualification.historySeconds,180);assert.equal(short.qualification.requiredSeconds,776);assert.match(short.reason,/Formando histórico|Três velas analisadas/);
 const history=meanRevertingHistory(1600),gap=history.filter(q=>!(q.ts>now-100000&&q.ts<now-90000));
 const interrupted=qualifyStrategyInterval({forecast,quoteHistory:gap,asOf:now});
 assert.equal(interrupted.side,null);assert.ok(interrupted.qualification.historySeconds<100);
 const stale=qualifyStrategyInterval({forecast,quoteHistory:history,asOf:now+5000});
 assert.equal(stale.side,null);assert.equal(stale.qualification.status,'waiting-quote');
});
test('reason for selective waiting survives the signed mobile frame budget',()=>{
 const reason='Formando histórico: 3min 0s de 12min 56s.';
 const frame=analystSnapshot({state:'running',settings:{engine:'automatic',forecastMode:'selective',orderDurationMs:30000},lastResult:{asset:'TEST',analysis:{vnext:{engineId:'automatic',futureEntryForecast:{forecastMode:'selective',reason},projection:{side:'CALL'},cards:[]}}}},{symbol:'TEST',quote:1,lastQuoteAt:now});
 assert.equal(frame.lastResult.analysis.vnext.fq,reason);
 frame.lastResult.analysis.operationalSignal.padding='x'.repeat(4000);
 const fitted=fitAnalystFrame(frame);
 assert.ok(fitted);assert.equal(fitted.lastResult.analysis.vnext.fq,reason);
 assert.ok(Buffer.byteLength(JSON.stringify(fitted))<=2920);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveBridge,analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

class FakeWebSocket{
  static OPEN=1;
  constructor(){this.readyState=0;this.handlers={};this.sent=[];FakeWebSocket.last=this;}
  addEventListener(k,fn){(this.handlers[k]??=[]).push(fn)}
  emit(k,data){for(const f of this.handlers[k]||[])f(data)}
  send(m){this.sent.push(JSON.parse(m))}
  open(){this.readyState=1;this.emit('open',{})}
  close(){this.readyState=3;this.emit('close',{})}
}
test('ephemeral bridge publishes only while a live viewer is present; neither history nor trades',()=>{
  let now=1800000000000;
  const topic='realtime:sentinel-'+'a'.repeat(48);
  const b=new LiveBridge(topic,{WebSocketClass:FakeWebSocket,minIntervalMs:1100,clock:()=>now});
  const runtime={state:'running',agentVersion:'13.4.46',lastEvalMs:now,settings:{asset:'EUR/USD OTC',forecastHorizonSeconds:30},
    lastResult:{asset:'EUR/USD OTC',analysis:{operationalSignal:{asset:'EUR/USD OTC',state:'JANELA ABERTA',forecastHorizonSeconds:30,durationMs:30000,scenario:{side:'CALL',deadline:now+10000},subanalyst:{mode:'reversal-alert'}},
      generalConsensus:{rapid:{callPct:72},strategies:{callPct:66},displayCallPct:69}}}};
  const live={symbol:'EUR/USD OTC',quote:1.11111,lastQuoteAt:now,assetValidated:true,analysisFeedValidated:true};
  const payload=analystSnapshot(runtime,live);
  assert.equal(payload.lastResult.analysis.generalConsensus.rapid.callPct,72);
  assert.equal('recentTrades' in payload,false);
  assert.equal('candles' in payload.liveBroker,false);
  assert.ok(Buffer.byteLength(JSON.stringify(payload))<3000);
  b.start();const w=FakeWebSocket.last;w.open();
  assert.equal(w.sent[0].event,'phx_join');
  assert.equal(b.publish(payload),false,'not broadcasting if nobody is viewing');
  w.emit('message',{data:JSON.stringify({topic,event:'phx_reply',ref:'1',payload:{status:'ok'}})});
  w.emit('message',{data:JSON.stringify({topic,event:'broadcast',payload:{event:'viewer',payload:{}}})});
  assert.equal(b.hasViewer(),true);
  assert.equal(b.publish(payload),true);
  assert.equal(w.sent.at(-1).event,'broadcast');
  assert.equal(w.sent.at(-1).payload.event,'analyst');
  assert.equal(b.publish(payload),false,'duplicate or early broadcast blocked');
  now+=1500;const next=analystSnapshot({...runtime,lastEvalMs:now}, {...live,lastQuoteAt:now});
  assert.equal(b.publish(next),true);
  now+=17000;assert.equal(b.hasViewer(),false);
  assert.equal(b.publish(next),false);
  b.close();
});

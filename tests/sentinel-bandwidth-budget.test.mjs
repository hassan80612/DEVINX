import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {dashboardTransportState} from '../sentinel-trading-lab/agent/worker/remote-status.mjs';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';

test('full price/research buffers never enter Supabase heartbeat',()=>{
  const candles=Array.from({length:600},(_,i)=>({from:i,open:i,close:i+1,history:'x'.repeat(300)}));
  const huge=Array.from({length:400},()=>({metrics:'x'.repeat(200)}));
  const state={
    agentVersion:'13.4.47',liveTopic:'realtime:sentinel-'+'a'.repeat(48),liveSignatureKey:'b'.repeat(64),
    state:'running',lastEvalMs:1800000000000,settings:{asset:'EUR/USD OTC',forecastHorizonSeconds:30,orderDurationMs:30000,strategy:'mean_reversion'},
    liveBroker:{provider:'iq_option',symbol:'EUR/USD OTC',quote:1.1223,lastQuoteAt:1800000000000,assetValidated:true,analysisFeedValidated:true,candles,predictionCandles:candles,quoteHistory:huge},
    brokers:{iq_option:{connected:true,marketData:{candles,predictionCandles:candles,quoteHistory:huge,assets:huge}}},
    lastResult:{asset:'EUR/USD OTC',analysis:{metrics:{rsi:53,heavy:huge},predictionMetrics:{heavy:huge},generalConsensus:{rapid:{callPct:73},strategies:{callPct:61},displayCallPct:67,sourceRows:huge},operationalSignal:{asset:'EUR/USD OTC',forecastHorizonSeconds:30,durationMs:30000,scenario:{side:'CALL',deadline:1800000030000},trace:huge},entryPlanner:{horizons:{30:{asset:'EUR/USD OTC',horizonSeconds:30,directionReady:true,confidence:75,callProbability:71,heavy:huge}}}}},
    recentAnalyses:[{side:'CALL',ts:1800000000000,metrics:huge,reasons:['ok']}],
    incidents:[],recentTrades:[]
  };
  const before=JSON.stringify(state);
  const out=dashboardTransportState(state);
  const json=JSON.stringify(out);
  assert.ok(Buffer.byteLength(json)<12000,'heartbeat cannot include giant research buffers');
  assert.ok(json.length<before.length*0.05);
  assert.equal(out.lastResult.analysis.generalConsensus.rapid.callPct,73);
  assert.equal(out.lastResult.analysis.operationalSignal.scenario.side,'CALL');
  assert.equal(out.liveBroker.quote,1.1223);
  assert.ok(!json.includes('history'));
  assert.equal(out.recentAnalyses[0].metrics,undefined);
  assert.equal(JSON.stringify(state),before,'read-only compaction preserves the local motor');
});

class FakeWebSocket{
  constructor(){this.readyState=0;this.handlers={};this.sent=[];FakeWebSocket.last=this}
  addEventListener(name,cb){(this.handlers[name]??=[]).push(cb)}
  emit(name,body){for(const cb of this.handlers[name]||[])cb(body)}
  send(body){this.sent.push(JSON.parse(body))}
  open(){this.readyState=1;this.emit('open',{})}
  close(){this.readyState=3;this.emit('close',{})}
}
test('spoofed viewers cannot trigger live stream; frames have verifiable HMAC',()=>{
  const topic='realtime:sentinel-'+'c'.repeat(48),key='d'.repeat(64);
  let now=1800000000000;
  const bridge=new SignedLiveBridge(topic,key,{WebSocketClass:FakeWebSocket,clock:()=>now});
  bridge.start();const w=FakeWebSocket.last;w.open();
  w.emit('message',{data:JSON.stringify({topic,event:'phx_reply',ref:'1',payload:{status:'ok'}})});
  w.emit('message',{data:JSON.stringify({topic,event:'broadcast',payload:{event:'viewer',payload:{at:now,sig:'0'.repeat(64)}}})});
  assert.equal(bridge.hasViewer(),false);
  const good=createHmac('sha256',Buffer.from(key,'hex')).update(topic+'|'+now).digest('hex');
  w.emit('message',{data:JSON.stringify({topic,event:'broadcast',payload:{event:'viewer',payload:{at:now,sig:good}}})});
  assert.equal(bridge.hasViewer(),true);
  const frame={lastEvalMs:now,liveBroker:{lastQuoteAt:now,symbol:'EUR/USD OTC'},state:'running'};
  assert.equal(bridge.publish(frame),true);
  const sent=w.sent.at(-1).payload.payload;
  const {sig,...unsigned}=sent;
  assert.equal(sig,createHmac('sha256',Buffer.from(key,'hex')).update(JSON.stringify(unsigned)).digest('hex'));
  now+=500;
  assert.equal(bridge.publish({lastEvalMs:now,liveBroker:{lastQuoteAt:now,symbol:'EUR/USD OTC'},state:'running'}),false,'quotes cannot bypass the minimum cadence');
  now+=1000;
  assert.equal(bridge.publish({lastEvalMs:now,liveBroker:{lastQuoteAt:now,symbol:'EUR/USD OTC'},state:'running'}),true,'new quote is delivered within 1.5s without four-second hold');
  now+=2700;
  assert.equal(bridge.publish({lastEvalMs:now,liveBroker:{lastQuoteAt:now,symbol:'EUR/USD OTC'},state:'running'}),true,'fresh quote is eventually sent');
  now+=1500;
  assert.equal(bridge.publish({lastEvalMs:now,liveBroker:{lastQuoteAt:now,symbol:'EUR/USD OTC'},state:'paused'}),true,'state transition still pushes immediately');
  bridge.close();
});

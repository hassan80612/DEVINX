import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {analystWireV1} from '../sentinel-trading-lab/src/lib/analyst-wire-v1.mjs';

const key='b'.repeat(64),topic='realtime:sentinel-'+'a'.repeat(48);
const mac=s=>createHmac('sha256',Buffer.from(key,'hex')).update(s).digest('hex');
const relay=v=>Array.isArray(v)?v.map(relay):v&&typeof v==='object'?
 Object.fromEntries(Object.keys(v).sort().map(k=>[k,relay(v[k])])):v;
const sign=frame=>({...frame,sig:mac(JSON.stringify(frame))});
const verifies=frame=>mac(analystWireV1(frame))===frame.sig;
function snapshot(engine='breakout',clockMode='current'){
 const t=Date.now(),asset='EUR/GBP OTC';
 const entry={delaySeconds:30,side:'CALL',projectedEntryPrice:0.8452,
  projectedExitPrice:0.8454,issuedAt:t-1000,holdingSeconds:30,
  entryAt:t+20000,exitAt:t+50000,entryReadyNow:false,phase:'open'};
 return analystSnapshot({agentVersion:'13.4.67.24',state:'running',killSwitch:false,
  masterFrozen:false,lastEvalMs:t,settings:{engine,forecastMode:'continuous',clockMode,orderDurationMs:30000,forecastHorizonSeconds:30},
  lastResult:{asset,analysis:{
   operationalSignal:{asset,side:'CALL',state:'ANALISANDO',actionable:false,
    scenario:{side:'CALL',status:'open',closed:false,createdAt:t,deadline:t+30000,confidence:70},
    subanalyst:{mode:'reversal-alert',active:true,status:'watch',checkedAt:t,
     alert:{side:'PUT',trigger:1,invalidation:2,target:3,testing:true}},
    entryAnalyst:{independent:true,qualification:{allowed:true}},
    scenarioProjection:{side:'CALL',status:'open',confirmed:false,actionable:false,horizonSeconds:30,asOf:t,issuedAt:t,targetAt:t+30000,projectedPrice:1,expectedLow:0.9,expectedHigh:1.1,engineId:'breakout'}},
   vnext:{engineId:'breakout',expirySeconds:30,futureEntryAnchor:entry,futureEntryRows:[entry],
    opportunityWindow:{phase:'open',windowStartedAt:t-1000,windowEndsAt:t+29000,entryAt:t+20000,reason:'awaiting-entry'},
    receipt:{engineId:'breakout',asset,side:'CALL',referencePrice:1,quoteReceivedAt:t,issuedAt:t,expirySeconds:30,targetAt:t+30000,projectedPrice:1.1,expectedLow:0.9,expectedHigh:1.2},
    targetAnchor:{engineId:'breakout',asset,side:'CALL',issuedAt:t,expirySeconds:30,targetAt:t+30000,referencePrice:1,projectedPrice:1.1},
    projection:{side:'CALL',callPct:70,putPct:30},targetProjection:{side:'CALL',callPct:60,putPct:40},
    horizonForecasts:[{horizonSeconds:30,side:'CALL',projectedPrice:1.1,issuedAt:t}],
    horizonMeasurements:[{horizonSeconds:30,correct:3,verified:5}],
    lastSettled:{engineId:'breakout',asset,side:'PUT',targetAt:t,referencePrice:1,projectedPrice:0.9,settledPrice:0.9,correct:true,expirySeconds:30},
    cards:[{id:'market-now',side:'CALL',callPct:60,putPct:40}]},
   generalConsensus:{rapid:{callPct:70,activeCount:1},strategies:{callPct:60,activeCount:2},displayCallPct:65},
   entryPlanner:{horizons:{30:{asset,horizonSeconds:30,rawBias:'CALL',bias:'CALL',displayBias:'CALL',outlookReady:true,directionReady:true,confidence:60,modelConfidence:65,callProbability:60,putProbability:40}}}
  }}},{symbol:asset,validatedSymbol:asset,assetValidated:true,analysisFeedValidated:true,lastQuoteAt:t,quote:0.8452,brokerTiming:{capturedAt:t,purchaseWindow:{closesAt:t+15000},instrumentKind:'binary'}});
}

test('actual v1 Agent frames authenticate after Realtime recursively reorders JSON keys',()=>{
 for(const frame of [snapshot(),snapshot(null),snapshot('automatic','broker')]){
  const signed=sign(JSON.parse(JSON.stringify(frame))),received=relay(signed);
  const unsigned={...received};delete unsigned.sig;
  assert.notEqual(mac(JSON.stringify(unsigned)),received.sig,'old verifier rejects the real relay representation');
  assert.equal(verifies(received),true);
  assert.deepEqual(JSON.parse(analystWireV1(received)),JSON.parse(JSON.stringify(frame)));
 }
});

test('full, reduced and minimal frame budgets all preserve authenticated content',()=>{
 const frame=snapshot();
 frame.lastResult.analysis.vnext.computedStatus='x'.repeat(5000);
 const trimmed=fitAnalystFrame(frame,2920);
 assert.ok(trimmed);
 assert.equal('generalConsensus' in trimmed.lastResult.analysis,false);
 assert.equal(verifies(relay(sign(trimmed))),true);
 frame.lastResult.analysis.vnext.er=Array.from({length:500},()=>[30,'CALL',1,1,Date.now(),30]);
 const minimal=fitAnalystFrame(frame,2920);
 assert.ok(minimal);
 assert.deepEqual(minimal.lastResult.analysis.vnext.er,[]);
 assert.equal(verifies(relay(sign(minimal))),true);
});

test('tampering with quotes, signals, timestamps or extra fields still fails HMAC verification',()=>{
 const source=relay(sign(snapshot()));
 for(const mutate of [
  f=>f.liveBroker.quote=12,
  f=>f.lastResult.analysis.vnext.ea[1]='PUT',
  f=>f.lastResult.analysis.vnext.ow[2]+=30000,
  f=>f.lastResult.analysis.operationalSignal.actionable=true,
  f=>f.settings.engine='automatic',
  f=>f.settings.clockMode='broker',
  f=>f.liveBroker.brokerTiming={capturedAt:1,purchaseWindow:{closesAt:2},instrumentKind:'binary'},
  f=>f.seq++,
  f=>f.extra='unsigned',
  f=>f.lastResult.analysis.vnext.extra='unsigned',
  f=>delete f.liveBroker.assetValidated,
 ]){const f=structuredClone(source);mutate(f);assert.equal(verifies(f),false);}
});

test('real mobile socket consumer accepts relayed source frames and rejects forged/replayed messages',async()=>{
 const require=createRequire(new URL('../sentinel-trading-lab/package.json',import.meta.url));
 const ts=require('typescript');
 let code=readFileSync(new URL('../sentinel-trading-lab/src/lib/signed-live-analyst-channel.ts',import.meta.url),'utf8');
 code=code.replace(/import \{SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY\} from '\.\/supabase-config';/,
  "const SUPABASE_URL='https://example.invalid',SUPABASE_PUBLISHABLE_KEY='test';");
 for(const name of ['pc-clock-sync','analyst-wire-v1'])code=code.replace("'./"+name+".mjs'",JSON.stringify(new URL('../sentinel-trading-lab/src/lib/'+name+'.mjs',import.meta.url).href));
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {watchSignedLiveAnalyst}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const originalWs=globalThis.WebSocket,originalDoc=globalThis.document;
 let socket;
 class Socket{
  static OPEN=1;
  constructor(){socket=this;this.readyState=1;}
  send(){}
  close(){this.readyState=3;this.onclose?.();}
 }
 globalThis.WebSocket=Socket;
 globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 const received=[];const stop=watchSignedLiveAnalyst(topic,key,f=>received.push(f));
 try{
  socket.onopen();
  const message=m=>socket.onmessage({data:JSON.stringify(relay(m))});
  message({topic,event:'phx_reply',ref:'1',payload:{status:'ok'}});
  const deliver=f=>message({topic,event:'broadcast',payload:{event:'analyst',payload:f}});
  const first=sign({...snapshot(),seq:10});
  deliver(first);deliver(first);
  const forged=sign({...snapshot(),seq:11});forged.lastResult.analysis.vnext.ea[1]='PUT';deliver(forged);
  const next=sign({...snapshot('automatic','broker'),seq:12});deliver(next);
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.deepEqual(received.map(f=>f.seq),[10,12]);
  assert.equal(received[0].lastResult.analysis.vnext.ea[1],'CALL');
 }finally{stop();globalThis.WebSocket=originalWs;globalThis.document=originalDoc;}
});


test('installed pre-clock Agents and all 67.31 frame sizes retain exact signed bytes',()=>{
 const legacy=snapshot();
 delete legacy.settings.clockMode;delete legacy.liveBroker.brokerTiming;
 for(const mode of ['current','broker','legacy']){
  const full=mode==='legacy'?legacy:snapshot('automatic',mode);
  const reduced=structuredClone(full);
  reduced.lastResult.analysis.vnext.computedStatus='x'.repeat(5000);
  const minimal=structuredClone(reduced);
  minimal.lastResult.analysis.vnext.er=Array.from({length:500},()=>[30,'CALL',1,2]);
  const critical=structuredClone(minimal);
  critical.lastResult.analysis.vnext.cards=[{id:'x'.repeat(5000),side:'CALL'}];
  for(const [tier,input] of Object.entries({full,reduced,minimal,critical})){
   const frame=tier==='full'?input:fitAnalystFrame(input);
   assert.ok(frame,mode+' '+tier);
   const received=relay(sign(JSON.parse(JSON.stringify(frame))));
   assert.equal(verifies(received),true,mode+' '+tier);
   assert.deepEqual(JSON.parse(analystWireV1(received)),JSON.parse(JSON.stringify(frame)));
  }
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {readFile} from 'node:fs/promises';
const start=1800000000000;
function base(state){
 return {state:'running',lastEvalMs:start,settings:{asset:'EUR/USD OTC',forecastHorizonSeconds:60,orderDurationMs:30000},
  lastResult:{asset:'EUR/USD OTC',analysis:{
   operationalSignal:{asset:'EUR/USD OTC',forecastHorizonSeconds:60,durationMs:30000,
    state,side:'CALL',ready:state==='ENTRADA',actionable:state==='ENTRADA',
    activeUntil:start+3000,createdAt:start-1000,entryWindowEndAt:start+5000,
    scenario:{side:'CALL',createdAt:start-1200,deadline:start+40000,status:'OPEN'},
    entryAnalyst:{independent:true,qualification:{allowed:true}}},
   generalConsensus:{rapid:{callPct:61},strategies:{callPct:61},displayCallPct:61}}}};
}
const live={validatedSymbol:'EUR/USD OTC',symbol:'EUR/USD OTC',assetValidated:true,analysisFeedValidated:true,lastQuoteAt:start,quote:1.1234};
test('operational CALL reaches mobile on same quote when it becomes actionable',()=>{
 let now=start,sent=[];
 const bridge=new SignedLiveBridge('realtime:sentinel-'+'c'.repeat(48),'d'.repeat(64),{clock:()=>now});
 bridge.joined=true;bridge.verifiedViewerAt=now;
 bridge.socket={readyState:1,send:v=>sent.push(JSON.parse(v))};
 assert.equal(bridge.publish(analystSnapshot(base('ACOMPANHANDO'),live)),true);
 now+=600;
 const newState=analystSnapshot(base('ENTRADA'),live);
 assert.equal(bridge.publish(newState),true,'same price and analysis ts, but new entry is urgent');
 assert.equal(sent.length,2);
 bridge.close();
});
test('realtime path runs immediately after engine tick without broker status roundtrip',async()=>{
 const worker=await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
 assert.match(worker,/await runtime\.tick\(loopNow,\{skipStatus:true\}\);\s*\/\/ Deliver a confirmed decision/);
 assert.match(worker,/void publishLiveFrame\(\);/);
 const fn=worker.substring(worker.indexOf('async function publishLiveFrame(){'),worker.indexOf('const livePublishTimer='));
 assert.doesNotMatch(fn,/await runtime\.status\(/);
 assert.match(fn,/analystSnapshot\(snapshot,chosen\.m\)/);
});

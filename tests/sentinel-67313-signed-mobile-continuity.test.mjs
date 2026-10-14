import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {reconcileSignedAnalystDisplay,reconcileCloudPcOpportunity,acceptSignedPcFrame,keepSignedViewOverCloud,pcWindowInfo} from '../sentinel-trading-lab/src/lib/signed-pc-window-order.mjs';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';

const baseTime=1800000000000,baseSha='bb41283dd1b76f15b0334156051aed252b7db534';
const asset='EUR/USD OTC';
function status({start=baseTime,phase='open',evalAt=baseTime+1000,quoteAt=baseTime+1000,engine='automatic',duration=30000,compressed=false,online=true,assetName=asset,clockOffset=3500}={}){
 const w=['open',start,start+30000,start+10000,''];
 w[0]=phase;
 const e=[30,'CALL',1.23456,1.23475,start,30,start+10000,start+40000,0,phase,0];
 const v={engineId:engine,expirySeconds:duration/1000,ow:w,ea:e,receipt:null,
   ...(compressed?{hf:[],hm:[],er:[],cards:[]}:{
     computedStatus:'ready',hf:[[30,'CALL',1.23475,start]],
     hm:[[30,7,12]],er:[e],cards:[{id:'market',side:'CALL',callPct:70,putPct:30}]
   })};
 return {
  state:'running',remote:{online},liveTopic:'realtime:sentinel-'+('a'.repeat(48)),
  liveTransport:'push',liveStreamAt:baseTime+1100,liveQuoteAgeAtFrame:50,
  pcClockOffsetMs:clockOffset,pcClockRttMs:100,lastEvalMs:evalAt,
  settings:{engine,orderDurationMs:duration,clockMode:'current'},
  liveBroker:{validatedSymbol:assetName,symbol:assetName,assetValidated:true,analysisFeedValidated:true,lastQuoteAt:quoteAt,quote:1.23456},
  feed:{quoteTs:quoteAt,price:1.23456},
  lastResult:{asset:assetName,analysis:{vnext:v,operationalSignal:{state:'ANALISANDO',side:'WAIT'}}}
 };
}
function event(previous,incoming){
 assert.equal(acceptSignedPcFrame(previous,incoming),true);
 return reconcileSignedAnalystDisplay(previous,incoming);
}

test('small authenticated frames NEVER empty cards or forecasts of same PC opportunity',()=>{
 const a=status(),b=status({compressed:true,quoteAt:baseTime+1700,evalAt:baseTime+2000});
 const merged=event(a,b);
 const v=merged.lastResult.analysis.vnext;
 assert.deepEqual(v.cards,a.lastResult.analysis.vnext.cards);
 assert.deepEqual(v.hf,a.lastResult.analysis.vnext.hf);
 assert.deepEqual(v.hm,a.lastResult.analysis.vnext.hm);
 assert.deepEqual(v.er,a.lastResult.analysis.vnext.er);
 assert.equal(v.ow[1],baseTime);
 assert.equal(merged.liveBroker.lastQuoteAt,baseTime+1700);
});

test('a real new PC window replaces old data, never creates a phantom loop',()=>{
 const a=status(),b=status({start:baseTime+30000,compressed:true,evalAt:baseTime+31000,quoteAt:baseTime+31000});
 const merged=event(a,b),v=merged.lastResult.analysis.vnext;
 assert.deepEqual(v.cards,[]);
 assert.deepEqual(v.hf,[]);
 assert.equal(v.ow[1],baseTime+30000);
 const now=baseTime+31000;
 const clock=pcAuthoritativeWindow({windowStartedAt:v.ow[1],windowEndsAt:v.ow[2],phase:v.ow[0],now});
 assert.equal(clock.remainingSeconds,29);
});

test('explicitly empty NORMAL PC readings replace prior readings (not cached forever)',()=>{
 const a=status(),b=status({evalAt:baseTime+2700,quoteAt:baseTime+2700});
 b.lastResult.analysis.vnext.cards=[];
 b.lastResult.analysis.vnext.hf=[];
 assert.deepEqual(event(a,b).lastResult.analysis.vnext.cards,[]);
 assert.deepEqual(event(a,b).lastResult.analysis.vnext.hf,[]);
});

test('asset, engine or expiry change must discard previous display data',()=>{
 const a=status();
 for(const changed of [
   status({assetName:'GBP/USD OTC',compressed:true,evalAt:baseTime+3000}),
   status({engine:'price_action',compressed:true,evalAt:baseTime+3000}),
   status({duration:60000,compressed:true,evalAt:baseTime+3000})
 ]){
  const v=reconcileSignedAnalystDisplay(a,changed).lastResult.analysis.vnext;
  assert.deepEqual(v.cards,[]);
  assert.deepEqual(v.hf,[]);
 }
});

test('server poll older than signed snapshot must not erase PC state after socket gap',()=>{
 const signed=status({evalAt:baseTime+5000,quoteAt:baseTime+5000});
 const cloud=status({compressed:true,evalAt:baseTime+3000,quoteAt:baseTime+2500});
 delete cloud.liveTransport;delete cloud.liveStreamAt;
 const result=reconcileCloudPcOpportunity(signed,cloud);
 assert.deepEqual(result.lastResult.analysis.vnext.cards,signed.lastResult.analysis.vnext.cards);
 assert.equal(result.lastEvalMs,baseTime+5000);
 assert.equal(result.pcClockOffsetMs,3500);
 assert.equal(result.liveBroker.lastQuoteAt,baseTime+5000);
});

test('cloud with truly NEWER PC evaluation wins, and offline state is never concealed',()=>{
 const previous=status({evalAt:baseTime+3000});
 const fresh=status({evalAt:baseTime+5500,compressed:true});
 assert.equal(reconcileCloudPcOpportunity(previous,fresh).lastEvalMs,baseTime+5500);
 const offline=status({online:false,compressed:true,evalAt:baseTime+2000});
 assert.deepEqual(reconcileCloudPcOpportunity(previous,offline),offline);
});

test('old signed frame cannot rewind phase or new window, and expired entry never persists',()=>{
 const old=status({start:baseTime,phase:'fired',evalAt:baseTime+30000});
 const late=status({start:baseTime,phase:'open',evalAt:baseTime+29000});
 assert.equal(acceptSignedPcFrame(old,late),false);
 const view=pcAuthoritativeWindow({windowStartedAt:baseTime,windowEndsAt:baseTime+30000,
  phase:'fired',side:'CALL',quoteAt:baseTime+29000,entryTriggeredAt:baseTime+29000,now:baseTime+31000});
 assert.equal(view.enterNow,false);
 assert.equal(view.remainingSeconds,0);
});

test('analysis change is client only; physical Agent forecast, broker clock and signed transport remain unmodified',()=>{
 for(const path of [
  'sentinel-trading-lab/agent/src/core/runtime.mjs',
  'sentinel-trading-lab/agent/worker/index.mjs',
  'sentinel-trading-lab/agent/worker/live-bridge.mjs',
  'sentinel-trading-lab/agent/worker/signed-live-bridge.mjs',
  'sentinel-trading-lab/src/lib/signed-live-analyst-channel.ts',
  'sentinel-trading-lab/src/components/LiveScenarioCard.tsx',
  'sentinel-trading-lab/src/lib/pc-authoritative-window.mjs',
  'sentinel-trading-lab/src/lib/pc-clock-sync.mjs'
 ])assert.equal(fs.readFileSync(path,'utf8'),execFileSync('git',['show',baseSha+':'+path],{encoding:'utf8'}),path);
});

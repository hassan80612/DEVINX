// Offline same-tape comparison of the COMPLETE synchronous decision gate.
// A frozen archive isolates every original helper, not only the entry file.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {DemoTradingRuntime as Candidate} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const base='36a7dcca579ff5da33b307c34c9467cfd2d16e44';
const temporary=mkdtempSync(join(tmpdir(),'sentinel-107-decision-'));
const score=entries=>Object.fromEntries(['win','loss','tie','pending'].map(k=>[k,entries.filter(e=>e.outcome===k).length]));
try{
 execFileSync('tar',['-x','-C',temporary],{input:execFileSync('git',['archive',base,'sentinel-trading-lab/agent/src/core'],{cwd:root,maxBuffer:20*1024*1024})});
 const {DemoTradingRuntime:Baseline}=await import(pathToFileURL(join(temporary,'sentinel-trading-lab/agent/src/core/runtime.mjs')));
 const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url)));
 const tape=fixture.quoteHistory;
 const replay=(Runtime,durationMs,engine,latencyMs)=>{
  const rt=new Runtime({enableVNext:true,forecastModel:'short-probability-v1'});
  rt.patchSettings({engine,orderDurationMs:durationMs},'offline-validation');
  let firedAt=0;const entries=[],times=[];
  for(let i=0;i<tape.length;i++){
   const q=tape[i],now=q.ts+latencyMs;
   const snap={provider:'iq_option',price:q.price,quoteTs:q.ts,quoteHistory:tape.slice(0,i+1),
    candles:[],historicalCandlesVerified:false,payout:null};
   const started=performance.now();
   const out=rt._signalValidationGate({analysis:{},snap,settings:rt.settings,now});
   times.push(performance.now()-started);
   const anchor=out.analysis?.vnext?.futureEntryAnchor;
   if(anchor?.phase!=='fired'||anchor.entryTriggeredAt===firedAt)continue;
   firedAt=anchor.entryTriggeredAt;
   // Decision has already been made. Only here may later observations score
   // its expiry. Fill is the last actually observed quote at decision time.
   const exit=tape.find(x=>x.ts>=anchor.exitAt&&x.ts-anchor.exitAt<=1500);
   const delta=exit?exit.price-q.price:null;
   const outcome=delta==null?'pending':delta===0?'tie':(delta>0)===(anchor.side==='CALL')?'win':'loss';
   entries.push({at:firedAt,side:anchor.side,entry:q.price,exitAt:anchor.exitAt,exit:exit?.price??null,
    reason:out.analysis.vnext.nowObservation?.reason,outcome});
  }
  times.sort((a,b)=>a-b);
  return {entries,timing:{medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],p99Ms:times[Math.floor(times.length*.99)]}};
 };
 const cases=[];
 for(const engine of ['automatic','fibonacci_retest','trend','support_resistance','smart_confluence'])
  for(const durationMs of [5000,10000,15000,30000,60000,120000,300000])
   for(const latencyMs of [0,600]){
    if(process.argv[2]&&[engine,durationMs,latencyMs].join(':')!==process.argv[2])continue;
    const before=replay(Baseline,durationMs,engine,latencyMs),after=replay(Candidate,durationMs,engine,latencyMs);
    const key=e=>e.at+'|'+e.side;
    const old=new Set(before.entries.map(key)),fresh=new Set(after.entries.map(key));
    cases.push({engine,durationMs,latencyMs,baseline:score(before.entries),candidate:score(after.entries),
     removed:before.entries.filter(e=>!fresh.has(key(e))),added:after.entries.filter(e=>!old.has(key(e))),
     timing:{baseline:before.timing,candidate:after.timing}});
   }
 console.log(JSON.stringify({base,source:fixture.source,sourceSha256:fixture.sourceSha256,
  scope:'Full decision gate, probability, causal review, selectors, adjudicator, final guards and one-shot lifecycle. No browser, executor or actual broker fill.',
  limitations:['One old video; this is not replay of the recent trade journals or evidence of general accuracy.',
   'Historical candles absent in this recording; opposing historical-wall protection is verified separately with controlled fixtures.',
   '600ms is an assumed evaluation delay, not measured Windows execution latency.',
   'Settings share the same tape and are not independent observations.'],cases},null,2));
}finally{rmSync(temporary,{recursive:true,force:true});}

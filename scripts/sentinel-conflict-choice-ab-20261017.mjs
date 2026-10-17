import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {ContextCompletedConflictChoice} from '../experiments/context-completed-conflict-choice-20261017.mjs';
const T=1792250040000,realNow=Date.now;
const families=process.env.SENTINEL_CONFLICT_FAMILIES?.split(',')??['trend','pullbacks','range','variable-range','sharp-turns','trend-switch',
 'jump-retrace','noisy-range','random-walk','volatility-switch'];
const runLabel=process.env.SENTINEL_CONFLICT_LABEL??'';
if(!/^[a-z-]*$/.test(runLabel))throw Error('Invalid run label');
const spec={version:'research-only-context-completed-choice-v1',baseCommit:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',
 registeredRule:{minimumIndependentCompletedDisagreements:6,priorWins:2,priorLosses:2,minimumPosterior:.7,spacingMs:30000,maxOutcomesPerKind:40},
 seeds:process.env.SENTINEL_CONFLICT_SEEDS?.split(',').map(Number)??[2026101751,2026101752],runLabel,durationMs:30000,sessionSeconds:900,
 caveats:['Known video has already been used in development and is not independent validation.',
 'The two video extractions represent one source video, not two independent sessions.',
 'Synthetic sessions are stress tests, not real accuracy or a financial forecast.',
 'Replay uses released validation and entry lifecycle; no broker orders, Windows scheduling or click latency are modeled.',
 'Only received/closed candles and past quotes enter the runtime; future data is used only by the separate scorer.']};
export function metrics(entries){let streak=0,maxLossStreak=0;
 for(const e of entries){if(e.result==='loss')maxLossStreak=Math.max(maxLossStreak,++streak);else if(e.result==='win')streak=0;}
 const win=entries.filter(e=>e.result==='win').length,loss=entries.filter(e=>e.result==='loss').length;
 return {win,loss,tie:entries.filter(e=>e.result==='tie').length,missing:entries.filter(e=>e.result==='missing').length,
  completed:win+loss,winRate:win+loss?win/(win+loss):null,maxLossStreak};}
export function simulate(data,{Runtime=DemoTradingRuntime,selectors=[null,()=>new ContextCompletedConflictChoice()]}={}){
 const variants=selectors.map(factory=>{const r=new Runtime({enableVNext:true,forecastModel:'now-structural-v1'});if(factory)r.expiryDirectionSelector=factory();return r;});
 const entries=variants.map(()=>[]),timing=variants.map(()=>[]),differences=[],all=data.quotes,targets=data.targets??all;
 let ci=0;const candles=[];
 for(let i=0;i<targets.length;i++){
  const q=targets[i],now=q.ts;Date.now=()=>now;
  while(ci<(data.candles?.length??0)&&data.candles[ci].to*1000<=now)candles.push(data.candles[ci++]);
  const history=all.filter(p=>p.ts<=now&&p.ts>=now-300000);
  for(let n=0;n<variants.length;n++){
   const r=variants[n],settings={...r.settings,engine:'automatic',asset:data.asset??'EUR/USD',orderDurationMs:30000};
   const snap={provider:'iq_option',quoteHistory:history,price:q.price,quoteTs:q.ts,
    candles:candles.slice(-100),historicalCandlesVerified:true};
   const started=performance.now();
   const v=r._signalValidationGate({analysis:{asset:settings.asset},snap,settings,now}).analysis.vnext;
   timing[n].push(performance.now()-started);
   const e=v.futureEntryAnchor;
   if(e?.entryReadyNow){
    // Future outcome is accessed only after the released gate returns.
    const exit=all.find(p=>p.ts>=e.exitAt&&p.ts<=e.exitAt+1000);
    const d=exit?exit.price-e.entryPrice:null;
    entries[n].push({at:e.entryAt,side:e.side,price:e.entryPrice,dueAt:e.exitAt,
     result:d==null?'missing':d===0?'tie':(d>0?'CALL':'PUT')===e.side?'win':'loss'});
   }
  }
  const ev=variants[1].expiryDirectionSelector.lastConflictEvidence;
  if(ev?.overridden)differences.push({...ev});
 }
 const percentile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))];
 const baseMap=new Map(entries[0].map(e=>[e.at,e])),candidateMap=new Map(entries[1].map(e=>[e.at,e]));
 const changed=entries[0].filter(e=>candidateMap.get(e.at)?.side!==e.side);
 const comparisons=entries.slice(1).map(es=>{const map=new Map(es.map(e=>[e.at,e]));return {
  sameEntries:JSON.stringify(entries[0])===JSON.stringify(es),
  corrected:entries[0].filter(e=>e.result==='loss'&&map.get(e.at)?.result==='win').length,
  spoiled:entries[0].filter(e=>e.result==='win'&&map.get(e.at)?.result==='loss').length,
  removedBaseWins:entries[0].filter(e=>e.result==='win'&&!map.has(e.at)).length,
  newCandidateEntries:es.filter(e=>!baseMap.has(e.at)).length};});
 const score={...data.metadata,metrics:entries.map(metrics),comparisons,candidateDiagnostics:variants.slice(1).map(r=>r.expiryDirectionSelector.stabilityCounts),sameEntries:JSON.stringify(entries[0])===JSON.stringify(entries[1]),
  correctedAtSameTime:changed.filter(e=>e.result==='loss'&&candidateMap.get(e.at)?.result==='win').length,
  spoiledAtSameTime:changed.filter(e=>e.result==='win'&&candidateMap.get(e.at)?.result==='loss').length,
  removedBaseWins:entries[0].filter(e=>e.result==='win'&&!candidateMap.has(e.at)).length,
  newCandidateEntries:entries[1].filter(e=>!baseMap.has(e.at)).length,
  arbiter:variants[1].expiryDirectionSelector.researchCounts,overriddenObservations:differences.length,
  timings:timing.map(xs=>({medianMs:percentile(xs,.5),p95Ms:percentile(xs,.95)})),
  overrideExamples:differences.slice(0,8),entries};
 console.log(JSON.stringify({...score,entries:undefined,overrideExamples:undefined}));
 return score;
}
export function synthetic(family,seed){
 let state=seed>>>0;const rand=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
 const sign=seed%2?1:-1,phase0=rand()*Math.PI*2,quotes=[];let phase=phase0,walk=0,ou=0,drift=0;
 for(let t=-6000;t<=900;t++){
  const noise=(rand()+rand()+rand()-1.5)*.000015;
  phase+=1/(19+8*Math.sin(t/130));walk+=noise;ou=.92*ou+noise;
  drift+=.0000012*(Math.floor((t+6000)/150)%2?1:-1);
  let x;
  switch(family){
   case 'trend':x=.0000015*t+.000015*Math.sin(t/6)+noise*.15;break;
   case 'pullbacks':x=.0000014*t+.00012*Math.sin(t/13+phase0)+noise*.25;break;
   case 'range':x=.00035*Math.sin(t/19+phase0)+noise*.2;break;
   case 'variable-range':x=.00035*Math.sin(phase)+.000025*Math.sin(t/3)+noise*.25;break;
   case 'sharp-turns':x=.00035*(2/Math.PI)*Math.asin(Math.sin(t/24+phase0))+noise*.4;break;
   case 'trend-switch':x=drift+.000045*Math.sin(t/8)+noise*.3;break;
   case 'jump-retrace':{const age=(t+6000)%90;const s=Math.floor((t+6000)/90)%2?1:-1;x=s*.0005*Math.exp(-age/18)+.00004*Math.sin(t/9)+noise;break;}
   case 'noisy-range':x=.0002*Math.sin(t/30+phase0)+ou;break;
   case 'random-walk':x=walk;break;
   case 'volatility-switch':x=walk+ou*(Math.floor((t+6000)/120)%2?4:.3)+drift;break;
  }
  quotes.push({ts:T+t*1000,price:1.1*Math.exp(sign*x),receivedAt:T+t*1000});
 }
 const candles=[];
 for(let i=0;i+60<quotes.length;i+=60){const qs=quotes.slice(i,i+61),ps=qs.map(p=>p.price);
  candles.push({from:qs[0].ts/1000,to:qs.at(-1).ts/1000,open:ps[0],close:ps.at(-1),high:Math.max(...ps),low:Math.min(...ps),receivedAt:qs.at(-1).ts});}
 return {quotes,targets:quotes.filter(q=>q.ts>=T),candles,metadata:{kind:'synthetic-stress-not-live',family,seed}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
const results=[];
try{
 for(const file of runLabel==='holdout'?[]:['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  results.push(simulate({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',file}}));
 }
 for(const seed of spec.seeds)for(const family of families)results.push(simulate(synthetic(family,seed)));
}finally{Date.now=realNow;}
const syntheticResults=results.filter(r=>r.kind==='synthetic-stress-not-live');
const report={spec,results,summary:{changedSessions:results.filter(r=>!r.sameEntries).length,
 corrected:results.reduce((s,r)=>s+r.correctedAtSameTime,0),spoiled:results.reduce((s,r)=>s+r.spoiledAtSameTime,0),
 syntheticTotals:[0,1].map(n=>({win:syntheticResults.reduce((s,r)=>s+r.metrics[n].win,0),loss:syntheticResults.reduce((s,r)=>s+r.metrics[n].loss,0),
  worstSessionLossStreak:Math.max(...syntheticResults.map(r=>r.metrics[n].maxLossStreak))})),
 sessionsWithMoreLosses:results.filter(r=>r.metrics[1].loss>r.metrics[0].loss).map(r=>({family:r.family,seed:r.seed,file:r.file})),
 sessionsWithWorseStreak:results.filter(r=>r.metrics[1].maxLossStreak>r.metrics[0].maxLossStreak).map(r=>({family:r.family,seed:r.seed,file:r.file}))}};
mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});
writeFileSync(new URL('../reports/sentinel-conflict-choice-ab-20261017'+(runLabel?'-'+runLabel:'')+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:report.summary}));
}

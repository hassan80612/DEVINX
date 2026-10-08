import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeReplayFrame} from '../sentinel-trading-lab/agent/worker/replay.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';

// Compare immutable published-source code with an opt-in local experiment.
// No broker calls, parameter search, synthetic prices, or future bars in features.
export async function evaluateStability(snapshot,baselineRoot){
 const old=await import(pathToFileURL(baselineRoot+'/sentinel-trading-lab/agent/src/core/runtime.mjs'));
 const oldReplay=await import(pathToFileURL(baselineRoot+'/sentinel-trading-lab/agent/worker/replay.mjs'));
 const oldView=await import(pathToFileURL(baselineRoot+'/sentinel-trading-lab/agent/worker/scenario-view.mjs'));
 const quotes=snapshot.quoteHistory.filter(q=>q.ts<=snapshot.now).sort((a,b)=>a.ts-b.ts);
 const nearest=ts=>quotes.filter(q=>Math.abs(q.ts-ts)<=1500).sort((a,b)=>Math.abs(a.ts-ts)-Math.abs(b.ts-ts))[0];
 const settle=row=>{
  const q=nearest(row.at+row.seconds*1000);
  if(!q)return {...row,won:null,reason:'missing-expiry'};
  const d=q.price-row.price,draw=Math.abs(d)<=Math.abs(row.price)*1e-10;
  return {...row,settledAt:q.ts,settledPrice:q.price,won:draw?null:(row.side==='CALL'?d>0:d<0),reason:draw?'draw':null};
 };
 const score=rows=>{const n=rows.filter(r=>r.won!==null).length,w=rows.filter(r=>r.won===true).length;return {signals:rows.length,samples:n,wins:w,losses:n-w,draws:rows.filter(r=>r.reason==='draw').length,missingExpiry:rows.filter(r=>r.reason==='missing-expiry').length,winRate:n?100*w/n:null};};
 const cases=[];
 for(const strategy of ['trend','smart_confluence'])for(const seconds of [30,60])for(const thresholds of [{label:'default',percent:70,points:74},{label:'exploratory',percent:50,points:55}]){
  const models=[{label:'13.4.19',r:new old.DemoTradingRuntime(),analyze:oldReplay.analyzeReplayFrame,view:oldView.scenarioViewFromRuntime},{label:'local-correction',r:new DemoTradingRuntime({predictionModel:'family-v6-stable'}),analyze:analyzeReplayFrame,view:scenarioViewFromRuntime},{label:'structural-reversals-v1',r:new DemoTradingRuntime({predictionModel:'family-v6-stable',entryPolicy:'structural-reversals-v1'}),analyze:analyzeReplayFrame,view:scenarioViewFromRuntime}];
  for(const m of models){Object.assign(m.r.settings,{asset:'RECORDED',strategy,orderDurationMs:seconds*1000,forecastHorizonSeconds:seconds,futureDisplayThreshold:thresholds.percent});m.r.settings.risk.minConfidence=thresholds.points;Object.assign(m,{entries:[],main:[],fixed:[],frames:[],seen:new Set(),mainSeen:new Set(),headlineFlips:0,rawFlips:0,periodSwitches:0,entryFlips:0,totals:[],blockedReversalFrames:{}});}
  let nextFixed=quotes[0].ts;
  for(let i=0;i<quotes.length;i++){
   const q=quotes[i],snap={candles:snapshot.candles.filter(c=>Number(c.to)*1000<=q.ts),quoteHistory:quotes.slice(0,i+1),quoteTs:q.ts,price:q.price,provider:'recorded',source:'RECORDED'};
   const frame=[];
   for(const m of models){
    const a=m.analyze(m.r,snap,q.ts),op=a.operationalSignal||{},p=a.entryPlanner?.horizons?.[seconds],v=m.view({operational:op,forecast:p,asset:'RECORDED',horizonSeconds:seconds,durationMs:seconds*1000,now:q.ts,displayThreshold:thresholds.percent,minPoints:thresholds.points});
    m.frames.push({ts:q.ts,price:q.price,actionable:op.actionable===true,id:[op.entryAt??op.createdAt,op.side].join('|'),activeUntil:op.activeUntil});
    m.totals.push(JSON.stringify(a.generalConsensus));
    for(const c of op.entryAnalyst?.candidates||[])if(c.reversalEvidence?.blockedBy)m.blockedReversalFrames[c.reversalEvidence.blockedBy]=(m.blockedReversalFrames[c.reversalEvidence.blockedBy]||0)+1;
    const side=v.displaySide;if(side&&m.lastHeadline&&side!==m.lastHeadline)m.headlineFlips++;if(side)m.lastHeadline=side;
    const raw=p?.rawBias;if(['CALL','PUT'].includes(raw)&&m.lastRaw&&raw!==m.lastRaw)m.rawFlips++;if(['CALL','PUT'].includes(raw))m.lastRaw=raw;
    const period=a.predictionInputQuality?.periodSeconds;if(period&&m.lastPeriod&&period!==m.lastPeriod)m.periodSwitches++;if(period)m.lastPeriod=period;
    if(op.scenario&&!m.mainSeen.has(op.scenario.id)){m.mainSeen.add(op.scenario.id);m.main.push({at:q.ts,price:q.price,side:op.scenario.side,seconds:(op.scenario.deadline-q.ts)/1000});}
    if(op.actionable){const id=[op.entryAt??op.createdAt,op.side].join('|');if(!m.seen.has(id)){m.seen.add(id);if(m.lastEntry&&op.side!==m.lastEntry)m.entryFlips++;m.lastEntry=op.side;const at=Number(op.entryAt||q.ts),entryQuote=nearest(at);m.entries.push({id,at,price:entryQuote?.price??q.price,side:op.side,seconds,kind:op.entryKind,policy:m.r.entryPolicy??'local-v2'});}}
    frame.push(p);
   }
   // Shared, nonoverlapping origin grid. Include only jointly available forecasts.
   if(q.ts>=nextFixed){nextFixed+=seconds*1000;if(frame.every(p=>p?.outlookReady)&&q.ts+seconds*1000<=quotes.at(-1).ts){for(let j=0;j<models.length;j++){const p=frame[j];models[j].fixed.push({at:q.ts,price:q.price,side:p.unlearnedCallProbability>=50?'CALL':'PUT',seconds,callProbability:p.unlearnedCallProbability});}}}
  }
  const totalsIdentical=models.slice(1).every(m=>models[0].totals.every((x,i)=>x===m.totals[i]));
  cases.push({strategy,seconds,thresholds,totalsIdentical,models:models.map(m=>{
   const entries=m.entries.map(settle),main=m.main.map(settle),fixed=m.fixed.map(settle);
   const delayedEntries=[1000,2000].map(delayMs=>{
    const filled=[],unfilled=[];
    for(const entry of m.entries){const frame=m.frames.find(f=>f.ts>=entry.at+delayMs);
     if(!frame||frame.ts-entry.at-delayMs>1500||!frame.actionable||frame.id!==entry.id||frame.ts>=frame.activeUntil){unfilled.push(entry.id);continue;}
     filled.push(settle({...entry,signalAt:entry.at,at:frame.ts,price:frame.price}));
    }
    return {delayMs,...score(filled),emittedSignals:m.entries.length,unfilled:unfilled.length,rows:filled};
   });
   return {model:m.label,entry:score(entries),delayedEntries,ownedForecast:score(main),fixedForecast:score(fixed),headlineFlips:m.headlineFlips,rawFlips:m.rawFlips,periodSwitches:m.periodSwitches,entryFlips:m.entryFlips,blockedReversalFrames:m.blockedReversalFrames,entries,main,fixed};
  })});
 }
 return {quotes:quotes.length,coverageSeconds:(quotes.at(-1).ts-quotes[0].ts)/1000,cases,limitations:['Single previously inspected fixture; no unseen holdout or verified market identity.','Overlapping entry results and repeated configurations are not independent samples.','Closed OHLC bars lack arrival timestamps; assumes availability at close.','Delay scenarios use next recorded quote and still-active authorization; no broker execution or settlement simulation.','Corrected model is opt-in, local, and unpublished.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const x=JSON.parse(await readFile('tests/fixtures/sentinel-continuation-prices.json','utf8'));
 const result=await evaluateStability(x,process.argv[2]||'/tmp/sentinel-13419-stability-baseline');
 await writeFile('/tmp/sentinel-stability-evaluation.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,cases:result.cases.map(c=>({...c,models:c.models.map(({entries,main,fixed,...m})=>m)}))},null,2));
}

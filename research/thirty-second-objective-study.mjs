// OFFLINE ONLY: no release change, no order placement, no confidence claims.
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {analyzeNowOpportunity as published,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {thirtySecondCycleForecast} from './thirty-second-cycle-forecast.mjs';
import {candleExpiryDirection} from './candle-expiry-direction.mjs';
import {causalPatternDirection} from '../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {generated} from './diagnostic-markets.mjs';

export const hypothesis=Object.freeze({horizonMs:30000,windowMs:180000,minimumPoints:60,
 gridMs:1000,maximumPastQuoteAgeMs:500,minimumPeriodSeconds:12,maximumPeriodSeconds:90,
 periodStepSeconds:2,minimumObservedCycles:2,criterion:'Gaussian residual BIC plus 2*log(searched-period-count)',
 decision:'Sign of model(t+30s)-model(t), anchored to actual entry price',
 evaluation:'Own non-overlapping cycles and exactly the published entry times; no retuning after results'});
export const modelNames=['published','cycle_direction_same_entries','cycle_forecast_entries','candle_direction_same_entries'];
export function predict(input,name){
 const base=published(input);if(name==='published')return base;
 if(!modelNames.includes(name))throw Error('Unknown model');
 if(['cycle_direction_same_entries','candle_direction_same_entries'].includes(name)&&!base.ready)return base;
 const f=name==='candle_direction_same_entries'?candleExpiryDirection(input):thirtySecondCycleForecast(input);
 return f.ready?{...base,...f}:base;
}
const at=(rows,time)=>rows.find(q=>q.ts>=time&&q.ts<=time+1000);
const result=(entry,exit,side)=>!exit?'unknown':entry===exit.price?'ties':(exit.price>entry?'CALL':'PUT')===side?'wins':'losses';
const inputFor=(rows,i)=>({quoteHistory:rows.slice(0,i+1),price:rows[i].price,quoteAt:rows[i].ts,
 now:rows[i].ts,durationMs:30000,qualityPolicy:'adaptive-market-v17',engineId:'automatic'});
function statistics(entries){
 const r={signals:entries.length,wins:0,losses:0,ties:0,unknown:0,maxLossStreak:0,medianExtraWaitMs:null};
 let streak=0;const waits=[];
 for(let i=0;i<entries.length;i++){
  const e=entries[i];r[e.outcome]++;streak=e.outcome==='losses'?streak+1:0;r.maxLossStreak=Math.max(streak,r.maxLossStreak);
  if(i)waits.push(e.at-entries[i-1].at-30000);
 }
 waits.sort((a,b)=>a-b);r.medianExtraWaitMs=waits.length?waits[Math.floor(waits.length/2)]:null;
 r.rate=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;return r;
}
export function compare(rows,{detailed=true,startAfterMs=0}={}){
 const states={},entries=Object.fromEntries(modelNames.map(n=>[n,[]])),timings=Object.fromEntries(modelNames.map(n=>[n,[]]));
 for(let i=0;i<rows.length;i++){
  const input=inputFor(rows,i);
  for(const name of modelNames){
   const start=performance.now(),choice=predict(input,name);timings[name].push(performance.now()-start);
   const next=advanceNowOpportunity({previous:states[name],candidate:choice,now:input.now,quoteAt:input.quoteAt,
    durationMs:30000,engineId:'automatic',asset:'OBSERVED-30S'});
   if(next.phase==='fired'&&next.entryTriggeredAt!==states[name]?.entryTriggeredAt&&input.now>=rows[0].ts+startAfterMs){
    const exit=at(rows,next.exitAt);
    entries[name].push({at:input.now,side:next.side,entry:next.entryPrice,exit:exit?.price??null,
     outcome:result(next.entryPrice,exit,next.side),reason:choice.reason,predictedPrice:choice.predictedPrice??null,
     fittedPeriodSeconds:choice.fittedPeriodSeconds??null});
   }
   states[name]=next;
  }
 }
 const reports={};
 for(const name of modelNames){
  const times=timings[name].sort((a,b)=>a-b);
  const r={...statistics(entries[name]),computationMs:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)}};
  if(detailed)r.entries=entries[name];reports[name]=r;
 }
 const matched={};
 for(const name of modelNames){
  const decisions=entries.published.map(e=>{
   const i=rows.findIndex(q=>q.ts===e.at),choice=predict(inputFor(rows,i),name),exit=at(rows,e.at+30000);
   return {at:e.at,side:choice.side,entry:e.entry,exit:exit?.price??null,
    outcome:choice.ready?result(e.entry,exit,choice.side):'abstained',reason:choice.reason};
  });
  if(decisions.some(d=>d.outcome==='abstained'))throw Error('Unexpected admission change at published entries');
  matched[name]=statistics(decisions);if(detailed)matched[name].entries=decisions;
 }
 return {reports,matched};
}
export function study(){
 const fixtures=Object.fromEntries(['sentinel-user-video-20261016.json','sentinel-user-video-broker-6dp-20261016.json'].map(file=>{
  const rows=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url))).quoteHistory;
  return [file,{full:compare(rows),after180s:compare(rows,{startAfterMs:180000})}];
 }));
 return {hypothesis,candleHypothesis:{windowMs:180000,horizonMs:30000,observedBarsSeconds:10,
  featureCount:16,target:'Binary sign at actual 30s expiry',ridgePenalty:5,trainingCadenceMs:5000,
  minCompletedSamples:8,admission:'Identical published entry times; structural fallback when unavailable'},
  scope:'Same user video, retrospective research. No independent market validation.',fixtures,ingestion:ingestionStudy()};
}
export function ingestionStudy(){
 const T=Date.UTC(2026,9,16,12),cases=[];
 for(const quotesPerSecond of [2,10,20,40]){
  const rows=Array.from({length:180*quotesPerSecond+1},(_,i)=>({ts:T+i*1000/quotesPerSecond,
   price:Math.exp(i*.000005/quotesPerSecond)})).slice(-6800);
  const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
  const last=rows.at(-1);
  runtime.setExternalMarket({provider:'iq_option',symbol:'EUR/GBP OTC',quoteHistory:rows,quote:last.price,quoteTs:last.ts});
  const kept=runtime.externalMarket.quoteHistory;
  const inspect=qs=>{const r=causalPatternDirection({quoteHistory:qs,quoteAt:last.ts,price:last.price,now:last.ts,durationMs:30000});
   return {quotes:qs.length,spanMs:qs.at(-1).ts-qs[0].ts,ready:r.ready,reason:r.reason,analogues:r.analogues??null};};
  cases.push({quotesPerSecond,browserInput:inspect(rows),runtimeInput:inspect(kept)});
 }
 return {scope:'Generated engineering diagnostic; actual user tick frequency is unknown. This is not a win-rate measurement.',cases};
}
export function clockStudy(){
 const rows=JSON.parse(readFileSync(new URL('../tests/fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
 return {scope:'Same observed prices and intervals, arbitrary time-origin shifts. No rule changes or selection of a favourable clock.',
  cases:[-1000,-500,0,500,1000].map(shiftMs=>({shiftMs,...compare(rows.map(q=>({...q,ts:q.ts+shiftMs,
   receivedAt:(q.receivedAt??q.ts)+shiftMs})),{detailed:false})}))};
}
export function diagnostics(){
 const families={};
 for(const kind of ['up','down','turn','reverse-turn','range','irregular','random-walk']){
  const group=Object.fromEntries(modelNames.map(n=>[n,{wins:0,losses:0,ties:0,unknown:0,signals:0}]));
  for(const seed of [929,937,941]){
   const {reports}=compare(generated(kind,seed,540),{detailed:false,startAfterMs:180000});
   for(const name of modelNames)for(const key of ['wins','losses','ties','unknown','signals'])group[name][key]+=reports[name][key];
  }
  for(const r of Object.values(group))r.rate=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;
  families[kind]=group;
 }
 return {scope:'Generated diagnostic paths only. Do not combine into a market accuracy claim.',seeds:[929,937,941],families};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 console.log(JSON.stringify(process.argv.includes('--diagnostics')?diagnostics():process.argv.includes('--clock')?clockStudy():study(),null,2));

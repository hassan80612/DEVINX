// Offline-only common-base comparison. No Agent imports this file.
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {analyzeNowOpportunity as published,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {analyzeNowOpportunity as original} from '../tests/fixtures/sentinel-video-production-now-engine.mjs';
import {contextualDirection} from './contextual-direction.mjs';
import {causalPatternDirection as intervalLearning} from './interval-balanced-analogue.mjs';
import {currentFlowDirection} from './current-flow-direction.mjs';
import {analyzeNowOpportunity as rollingClock} from './rolling-clock-now-engine.mjs';
import {analyzeNowOpportunity as relativeLearning} from './relative-learning-now-engine.mjs';
import {analyzeNowOpportunity as rollingStructure} from './rolling-structure-now-engine.mjs';
const learned=(input,policy)=>{
 const r=intervalLearning(input,{policy});
 return r.ready&&r.strength>=.4?r:published({...input,qualityPolicy:'baseline',engineId:'automatic'});
};
export const models={
 original:input=>original(input),
 published:input=>published(input),
 rolling_clock:input=>rollingClock(input),
 relative_learning:input=>relativeLearning(input),
 rolling_structure:input=>rollingStructure(input),
 contextual_neighbours:input=>{const r=contextualDirection(input);return r.ready?r:published({...input,qualityPolicy:'baseline',engineId:'automatic'});},
 contextual_ridge:input=>{const r=contextualDirection(input,{method:'ridge'});return r.ready?r:published({...input,qualityPolicy:'baseline',engineId:'automatic'});},
 settlement_exact:input=>learned(input,'settlement_exact'),
 independent_outcomes:input=>learned(input,'independent'),
 recency_weighted:input=>learned(input,'recency'),
 balanced_recent:input=>learned(input,'balanced'),
 horizon_momentum:input=>currentFlowDirection(input),
 fast_slow_flow:input=>currentFlowDirection(input,{method:'fast_slow_flow'}),
 published_entry_flow_direction:input=>{
  const base=published(input);if(!base.ready)return base;
  const flow=currentFlowDirection(input,{method:'fast_slow_flow'});
  return flow.ready?{...base,side:flow.side,reason:'research-published-entry-current-flow'}:base;
 }
};
const percentile=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))]:null;
export function replay(rows,{startAfterMs=180000,modelNames=Object.keys(models)}={}){
 const states={},signals=Object.fromEntries(modelNames.map(n=>[n,[]])),timings=Object.fromEntries(modelNames.map(n=>[n,[]]));
 let prev=-Infinity;
 for(let i=0;i<rows.length;i++){
  const q=rows[i];if(!(q.ts>prev&&q.price>0))throw Error('invalid-ordered-quote');prev=q.ts;
  const history=rows.slice(0,i+1),input={quoteHistory:history,price:q.price,quoteAt:q.ts,now:q.ts,
   engineId:'automatic',durationMs:30000,qualityPolicy:'adaptive-market-v17'};
  for(const name of modelNames){
   const begin=performance.now(),choice=models[name](input);timings[name].push(performance.now()-begin);
   const next=advanceNowOpportunity({previous:states[name],candidate:choice,now:q.ts,quoteAt:q.ts,
    asset:'SAME-OBSERVED-INSTRUMENT',engineId:'automatic',durationMs:30000});
   if(next.phase==='fired'&&next.entryTriggeredAt!==states[name]?.entryTriggeredAt&&q.ts>=rows[0].ts+startAfterMs)
    signals[name].push({...next,reason:choice.reason});
   states[name]=next;
  }
 }
 const report={};
 for(const name of modelNames){
  const result={signals:signals[name].length,wins:0,losses:0,ties:0,unknown:0,maxLossStreak:0,
   medianExtraWaitMs:null,maxExtraWaitMs:null,latencyMs:{p50:percentile(timings[name],.5),p95:percentile(timings[name],.95),max:Math.max(...timings[name])},entries:[]};
  let streak=0;const waits=[];
  for(let i=0;i<signals[name].length;i++){
   const s=signals[name][i],exit=rows.find(q=>q.ts>=s.exitAt&&q.ts<=s.exitAt+1000);
   const outcome=!exit?'unknown':exit.price===s.entryPrice?'ties':
    (exit.price>s.entryPrice?'CALL':'PUT')===s.side?'wins':'losses';
   result[outcome]++;streak=outcome==='losses'?streak+1:0;result.maxLossStreak=Math.max(result.maxLossStreak,streak);
   if(i)waits.push(s.entryAt-signals[name][i-1].exitAt);
   result.entries.push({at:s.entryAt,side:s.side,reason:s.reason,entry:s.entryPrice,exit:exit?.price??null,outcome});
  }
  result.medianExtraWaitMs=percentile(waits,.5);result.maxExtraWaitMs=waits.length?Math.max(...waits):null;
  result.rate=result.wins+result.losses?100*result.wins/(result.wins+result.losses):null;
  report[name]=result;
 }
 return report;
}
export function videoStudy(){
 const files=['sentinel-user-video-20261016.json','sentinel-user-video-broker-6dp-20261016.json'];
 return Object.fromEntries(files.map(file=>{
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  return [file,{source:f.sourceType,quotes:f.quoteHistory.length,
   full:replay(f.quoteHistory,{startAfterMs:0}),afterFullContext:replay(f.quoteHistory)}];
 }));
}
export function matchedEntries(rows,publishedEntries){
 const results={};
 for(const [name,predict]of Object.entries(models)){
  const result={calls:0,wins:0,losses:0,ties:0,unknown:0,abstained:0,decisions:[]};
  for(const s of publishedEntries){
   const q=rows.find(q=>q.ts===s.at),exit=rows.find(q=>q.ts>=s.at+30000&&q.ts<=s.at+31000);
   const input={quoteHistory:rows.filter(q=>q.ts<=s.at),price:q.price,quoteAt:q.ts,now:q.ts,
    engineId:'automatic',durationMs:30000,qualityPolicy:'adaptive-market-v17'};
   const choice=predict(input);
   const outcome=!choice.ready?'abstained':!exit?'unknown':exit.price===q.price?'ties':
    (exit.price>q.price?'CALL':'PUT')===choice.side?'wins':'losses';
   result[outcome]++;if(choice.ready)result.calls++;
   result.decisions.push({at:s.at,side:choice.side,ready:choice.ready,outcome});
  }
  result.rate=result.wins+result.losses?100*result.wins/(result.wins+result.losses):null;
  results[name]=result;
 }
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(videoStudy(),null,2));

import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {analyzeNowOpportunity as published,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {predict as previous} from './thirty-second-objective-study.mjs';
import {guardedCycleDirection,guardHypothesis} from './guarded-cycle-direction.mjs';
import {generated} from './diagnostic-markets.mjs';
import {breakAwareCycleForecast,breakHypothesis} from './break-aware-cycle-forecast.mjs';
export const predictors={published,phase_unguarded:input=>previous(input,'cycle_direction_same_entries'),
 velocity_guard:input=>guardedCycleDirection(input),residual_guard:input=>guardedCycleDirection(input,{guard:'residual'}),
 combined_guard:input=>guardedCycleDirection(input,{guard:'combined'}),
 break_aware:input=>{const base=published(input);if(!base.ready)return base;const f=breakAwareCycleForecast(input);return f.ready?{...base,...f}:base;}};
export function replayGuards(rows,{detailed=true,startAfterMs=0,modelNames=Object.keys(predictors)}={}){
 const reports={};
 for(const name of modelNames){
  const predict=predictors[name];if(!predict)throw Error('Unknown predictor');
  let state=null,streak=0;const timings=[];
  const r={signals:0,wins:0,losses:0,ties:0,unknown:0,maxLossStreak:0,retainedByGuard:0,entries:[]};
  for(let i=0;i<rows.length;i++){
   const q=rows[i],input={quoteHistory:rows.slice(0,i+1),price:q.price,quoteAt:q.ts,now:q.ts,
    durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'};
   const start=performance.now(),choice=predict(input);timings.push(performance.now()-start);
   const next=advanceNowOpportunity({previous:state,candidate:choice,now:q.ts,quoteAt:q.ts,asset:'SAME-OBSERVED-30S',engineId:'automatic',durationMs:30000});
   if(next.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt&&q.ts>=rows[0].ts+startAfterMs){
    const exit=rows.find(q=>q.ts>=next.exitAt&&q.ts<=next.exitAt+1000);
    const outcome=!exit?'unknown':exit.price===next.entryPrice?'ties':(exit.price>next.entryPrice?'CALL':'PUT')===next.side?'wins':'losses';
    r.signals++;r[outcome]++;if(choice.researchGuard)r.retainedByGuard++;
    streak=outcome==='losses'?streak+1:0;r.maxLossStreak=Math.max(streak,r.maxLossStreak);
    r.entries.push({at:q.ts,side:next.side,entry:next.entryPrice,exit:exit?.price??null,outcome,
     reason:choice.reason,guardReason:choice.researchGuard??null,diagnostics:choice.diagnostics??null,
     fittedBreakSecondsAgo:choice.fittedBreakSecondsAgo??null,fittedPeriodSeconds:choice.fittedPeriodSeconds??null});
   }
   state=next;
  }
  r.rate=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;
  timings.sort((a,b)=>a-b);r.computationMs={p50:timings[Math.floor(timings.length*.5)],p95:timings[Math.floor(timings.length*.95)],max:timings.at(-1)};
  if(!detailed)delete r.entries;reports[name]=r;
 }
 return reports;
}
export function video(){
 return {guardHypothesis,breakHypothesis,scope:'Same user video, follow-up exploratory study. Not independent market validation.',
  fixtures:Object.fromEntries(['sentinel-user-video-20261016.json','sentinel-user-video-broker-6dp-20261016.json'].map(file=>{
   const rows=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url))).quoteHistory;
   return [file,{full:replayGuards(rows),after180s:replayGuards(rows,{startAfterMs:180000})}];
  }))};
}
export function diagnostics({modelNames=Object.keys(predictors),seeds=[953,967,971,977,983]}={}){
 const families={};
 for(const kind of ['up','down','turn','reverse-turn','range','irregular','random-walk']){
  const sums=Object.fromEntries(modelNames.map(n=>[n,{wins:0,losses:0,ties:0,unknown:0,signals:0}]));
  for(const seed of seeds){
   const r=replayGuards(generated(kind,seed,540),{detailed:false,startAfterMs:180000,modelNames});
   for(const name of modelNames)for(const key of ['wins','losses','ties','unknown','signals'])sums[name][key]+=r[name][key];
  }
  for(const r of Object.values(sums))r.rate=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;families[kind]=sums;
 }
 return {scope:'New fixed generated diagnostic seeds, not measured market performance. Do not aggregate regimes into advertised accuracy.',seeds,families};
}
export function clock(){
 const rows=JSON.parse(readFileSync(new URL('../tests/fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
 return {scope:'Same price path and intervals, shifts of estimated time origin.',cases:[-1000,-500,0,500,1000].map(shiftMs=>({shiftMs,
  reports:replayGuards(rows.map(q=>({...q,ts:q.ts+shiftMs,receivedAt:(q.receivedAt??q.ts)+shiftMs})),{detailed:false})}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 console.log(JSON.stringify(process.argv.includes('--break-diagnostics')?diagnostics({modelNames:['published','phase_unguarded','break_aware'],seeds:[991,997,1009]}):
  process.argv.includes('--guards-diagnostics')?diagnostics({modelNames:['published','phase_unguarded','velocity_guard','residual_guard','combined_guard']}):
  process.argv.includes('--diagnostics')?diagnostics():process.argv.includes('--clock')?clock():video(),null,2));

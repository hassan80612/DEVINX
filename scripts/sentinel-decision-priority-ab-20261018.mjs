import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
import {decisionPriorityResearchRuntime} from '../experiments/decision-priority-research-runtime-20261018.mjs';
const previous=JSON.parse(readFileSync(new URL('../reports/sentinel-13937-postrelease-origin-benchmark-20261018.json',import.meta.url)));
const base=await decisionPriorityResearchRuntime(),candidate=await decisionPriorityResearchRuntime({preserveConflict:true});
const results=[],realNow=Date.now;
try{
 for(const prior of previous.results){
  const video=prior.kind==='known-video';
  const file=video?prior.name:'external/dukascopy-eurusd-'+prior.name+'.json';
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  const d=video?{quotes:f.quoteHistory,asset:f.asset,metadata:{name:prior.name,kind:prior.kind}}:f;
  base.entries.length=0;candidate.entries.length=0;
  const replay=simulate(d,{Runtime:[base.DemoTradingRuntime,candidate.DemoTradingRuntime],selectors:[null,null]});
  assert.deepEqual(replay.entries[0],prior.entries.map(({reason,naive,...e})=>e),'Instrumentation changed baseline');
  const traces=replay.entries.map((es,n)=>es.map((e,i)=>{
   const trace=[base,candidate][n].entries[i];assert.equal(e.at,trace.at);
   return {...e,...trace};
  }));
  results.push({name:prior.name,kind:prior.kind,metrics:replay.metrics,comparisons:replay.comparisons,timings:replay.timings,entries:traces});
 }
}finally{Date.now=realNow;base.cleanup();candidate.cleanup();}
const summarize=rows=>{
 const score=metrics(rows);delete score.maxLossStreak;
 const matching=field=>{
  const matched=rows.filter(e=>e[field]);
  return {available:matched.length,sameDirection:matched.filter(e=>e[field]===e.side).length,oppositeDirection:matched.filter(e=>e[field]!==e.side).length};
 };
 const bypass=rows.filter(e=>e.bypass),bypassMetrics=metrics(bypass);delete bypassMetrics.maxLossStreak;
 return {metrics:score,bypassedHistoricalVeto:{entries:bypass.length,...bypassMetrics},lastClosedCandle:matching('lastClosedCandle'),formingCandle:matching('formingCandle'),
  withAtLeast50HistoricalCandles:rows.filter(e=>e.historicalCandles>=50).length,
  historyAlternatives:Object.fromEntries([0,1,3,10,20,50].map(n=>[n,{
   sameReadySide:rows.filter(e=>e.historyAlternatives[n].ready&&e.historyAlternatives[n].side===e.side).length,
   oppositeReadySide:rows.filter(e=>e.historyAlternatives[n].ready&&e.historyAlternatives[n].side!==e.side).length,
   notReady:rows.filter(e=>!e.historyAlternatives[n].ready).length
  }])),
  directionChangedAfterSelectedForecast:rows.filter(e=>e.decision.ready&&e.decision.side!==e.side).length};
};
const external=results.filter(r=>r.kind!=='known-video');
const summary={external:[0,1].map(n=>summarize(external.flatMap(r=>r.entries[n]))),video:results.filter(r=>r.kind==='known-video').map(r=>({name:r.name,variants:r.entries.map(summarize)})),
 improvedWindows:external.filter(r=>r.metrics[1].winRate>r.metrics[0].winRate).length,
 regressedWindows:external.filter(r=>r.metrics[1].winRate<r.metrics[0].winRate).length,
 worseLossStreakWindows:external.filter(r=>r.metrics[1].maxLossStreak>r.metrics[0].maxLossStreak).map(r=>r.name)};
const report={spec:{baseCommit:'21f43a9587e2a4f6cdb23933226b4b0f0520e466',
 candidate:'Preserve explicit historical veto when later candle reaction re-admits it, unless observed sequence confirms structural change. No timer or side inversion.',
 limitations:['All replay windows were already inspected; no untouched validation.','Historical Forex does not establish broker OTC accuracy.','Matching candle colour is association, not proof it caused the decision.','A veto changes subsequent entry timestamps; compare whole replays, not retrospective deletion.','No changes to production prediction rules.']},summary,results};
writeFileSync(new URL('../reports/sentinel-decision-priority-ab-20261018.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary},null,2));

import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {ABLATIONS,componentAblationRuntime} from '../experiments/component-ablation-runtime-20261018.mjs';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const spec={baseCommit:'21f43a9587e2a4f6cdb23933226b4b0f0520e466',
 variants:['released',...ABLATIONS],
 development:'All 14 previously inspected 2020-03-30 target windows plus the known fine video. Exclude March 31 from selecting the winner.',
 selectionBeforeOutcomes:{minimumExternalCompletedFraction:.7,maximumMedianGapRatio:1.5,maximumWorstGapRatio:1.5,
  minimumVideoWins:10,maximumVideoLosses:3,minimumExternalRateGain:.02,
  choice:'Among qualifying variants choose greatest external rate gain; tie-break by more completed outcomes then declared variant order. If none qualifies, do not evaluate reserved outcomes or change production.'},
 reservedBeforeOutcomes:[
  {name:'ablation-reserved-03-utc',from:'2020-03-30T03:00:00Z',to:'2020-03-30T03:29:25Z'},
  {name:'ablation-reserved-1735-utc',from:'2020-03-30T17:35:00Z',to:'2020-03-30T17:59:25Z'},
  {name:'ablation-reserved-2035-utc',from:'2020-03-30T20:35:00Z',to:'2020-03-30T20:59:25Z'},
  {name:'ablation-official-20200331-1755-utc',from:'2020-03-31T17:55:00Z',to:'2020-03-31T18:24:25Z'}],
 limits:['All March 30 raw source data were already accessible. Reserved TARGET blocks, not a wholly new source, have not previously been outcome-evaluated.',
 'External Forex, not user broker OTC. One source day for development does not demonstrate general market performance.',
 'Component removals change subsequent entry times; compare complete runtime replays, not only retained historical entries.',
 'No parameter changes after selection or reserved evaluation.']};
writeFileSync(new URL('../reports/sentinel-component-ablation-spec-20261018.json',import.meta.url),JSON.stringify(spec,null,2)+'\n');
const copies=[];for(const mode of ABLATIONS)copies.push(await componentAblationRuntime(mode));
const results=[],realNow=Date.now;
try{
 const previous=JSON.parse(readFileSync(new URL('../reports/sentinel-13937-postrelease-origin-benchmark-20261018.json',import.meta.url)));
 for(const old of previous.results.filter(r=>!r.name.startsWith('available-official-'))){
  const video=old.kind==='known-video',file=video?old.name:'external/dukascopy-eurusd-'+old.name+'.json';
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  const data=video?{quotes:f.quoteHistory,asset:f.asset,metadata:{kind:old.kind,name:old.name}}:f;
  const replay=simulate(data,{Runtime:[DemoTradingRuntime,...copies.map(c=>c.DemoTradingRuntime)],selectors:spec.variants.map(()=>null)});
  assert.deepEqual(replay.entries[0],old.entries.map(({reason,naive,...e})=>e),'Baseline differs from published result');
  const selection=replay.entries.map(entries=>{const gaps=entries.slice(1).map((e,i)=>(e.at-entries[i].at)/1000).sort((a,b)=>a-b);
   return {entries:entries.length,medianGapSeconds:gaps[Math.floor(gaps.length/2)]??null,maxGapSeconds:gaps.at(-1)??null};});
  results.push({...replay,selection});
 }
}finally{Date.now=realNow;for(const c of copies)c.cleanup();}
const external=results.filter(r=>r.kind!=='known-video'),video=results.find(r=>r.kind==='known-video');
const scores=spec.variants.map((name,n)=>{const m=metrics(external.flatMap(r=>r.entries[n]));delete m.maxLossStreak;return {name,index:n,...m};});
const base=scores[0],criteria=spec.selectionBeforeOutcomes;
const checked=scores.slice(1).map(score=>{
 const n=score.index,coverage=score.completed/base.completed;
 const medianRatio=Math.max(...external.map(r=>r.selection[n].medianGapSeconds/(r.selection[0].medianGapSeconds||1)));
 const maxRatio=Math.max(...external.map(r=>r.selection[n].maxGapSeconds/(r.selection[0].maxGapSeconds||1)));
 const v=video.metrics[n],gain=score.winRate-base.winRate;
 return {...score,coverage,medianGapRatio:medianRatio,worstGapRatio:maxRatio,video:v,gain,
  qualifies:coverage>=criteria.minimumExternalCompletedFraction&&medianRatio<=criteria.maximumMedianGapRatio&&
   maxRatio<=criteria.maximumWorstGapRatio&&v.win>=criteria.minimumVideoWins&&v.loss<=criteria.maximumVideoLosses&&gain>=criteria.minimumExternalRateGain};
});
const winner=checked.filter(s=>s.qualifies).sort((a,b)=>b.gain-a.gain||b.completed-a.completed||a.index-b.index)[0]??null;
writeFileSync(new URL('../reports/sentinel-component-ablation-20261018-development.json',import.meta.url),JSON.stringify({spec,scores,checked,winner,results},null,2)+'\n');
console.log(JSON.stringify({scores,checked,winner},null,2));

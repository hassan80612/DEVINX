import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {rejectionRoomResearchRuntime} from '../experiments/rejection-room-research-runtime-20261018.mjs';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const set=process.env.SENTINEL_ROOM_SET??'development';
if(!['development','reserved'].includes(set))throw Error('Unknown evaluation set');
const specification={baseCommit:'21f43a9587e2a4f6cdb23933226b4b0f0520e466',
 rule:'Only historical-level-rejection and multiscale-candle-rejection: compare distance to nearest confirmed opposing level with median absolute movement from six completed nonoverlapping 30s blocks in existing 180s quotes. Need at least 3 observed blocks; if room<=median movement+tolerance, abstain until current price/structure provides room. Preserve all other routes and immutable entries. No new timer or history.',
 reservedBeforeEvaluation:['2020-03-30T02:00:00Z/02:30:00Z','2020-03-30T05:00:00Z/05:30:00Z','2020-03-30T23:00:00Z/23:30:00Z'],
 limitations:['Development windows are already inspected.','Reserved time blocks share an already-inspected Forex day; they are not independent broker sessions.','No live trade, click latency, profit or broker OTC accuracy modeled.','No tuning of the rule after outcome inspection.']};
// This file is written before any outcome evaluation in this run.
writeFileSync(new URL('../reports/sentinel-rejection-room-spec-20261018.json',import.meta.url),JSON.stringify(specification,null,2)+'\n');
const candidate=await rejectionRoomResearchRuntime(),realNow=Date.now,results=[];
try{
 const prior=JSON.parse(readFileSync(new URL('../reports/sentinel-13937-postrelease-origin-benchmark-20261018.json',import.meta.url)));
 const selected=set==='development'?prior.results.filter(r=>r.kind==='known-video'||['development-08-utc','validation-14-utc','reserved-19-utc'].includes(r.name)):
 [2,5,23].map(hour=>({name:'sixth-validation-'+String(hour).padStart(2,'0')+'-utc',kind:'external-market-replay-not-user-session'}));
 for(const old of selected){
  const video=old.kind==='known-video',file=video?old.name:'external/dukascopy-eurusd-'+old.name+'.json';
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  const data=video?{quotes:f.quoteHistory,asset:f.asset,metadata:{kind:old.kind,name:old.name}}:f;
  const replay=simulate(data,{Runtime:[DemoTradingRuntime,candidate.DemoTradingRuntime],selectors:[null,null]});
  if(old.entries)assert.deepEqual(replay.entries[0],old.entries.map(({reason,naive,...e})=>e),'Changed baseline');
  const selection=replay.entries.map(entries=>{
   const gaps=entries.slice(1).map((e,i)=>(e.at-entries[i].at)/1000).sort((a,b)=>a-b);
   return {entries:entries.length,medianGapSeconds:gaps[Math.floor(gaps.length/2)]??null,maxGapSeconds:gaps.at(-1)??null};
  });
  results.push({...replay,selection});
 }
}finally{Date.now=realNow;candidate.cleanup();}
const external=results.filter(r=>r.kind!=='known-video');
const summary={external:[0,1].map(n=>{const m=metrics(external.flatMap(r=>r.entries[n]));delete m.maxLossStreak;return m;}),
 windows:results.map(r=>({name:r.name,metrics:r.metrics,selection:r.selection,comparisons:r.comparisons})),
 improvedExternalWindows:external.filter(r=>r.metrics[1].winRate>r.metrics[0].winRate).length,
 regressedExternalWindows:external.filter(r=>r.metrics[1].winRate<r.metrics[0].winRate).length};
writeFileSync(new URL('../reports/sentinel-rejection-room-ab-20261018-'+set+'.json',import.meta.url),JSON.stringify({specification,set,summary,results},null,2)+'\n');
console.log(JSON.stringify({summary},null,2));

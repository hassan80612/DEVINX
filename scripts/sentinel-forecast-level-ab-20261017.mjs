import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
import {forecastLevelResearchRuntime} from '../experiments/forecast-level-research-runtime-20261017.mjs';
const realNow=Date.now,level=await forecastLevelResearchRuntime('level'),residual=await forecastLevelResearchRuntime('residual');
const spec={baseCommit:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',variants:['released-anchored-increment','fitted-future-level','fitted-future-plus-estimated-residual'],
 seed:2026101781,families:['trend','pullbacks','range','variable-range','sharp-turns','trend-switch','jump-retrace','noisy-range','random-walk','volatility-switch'],
 rule:'Level: compare fitted future level with actual spot. Residual: carry only the past-fitted residual persistence at the expiry lag, bounded to [0,1]. No changed admission, extra collection or fixed timer.',
 caveats:['Known video is development data and two extracts are one source.','Generated trajectories are stress cases, not real accuracy.','Full released entry lifecycle runs; no broker orders, Windows scheduling or click latency modeled.']};
const results=[],Runtime=[Released,level.DemoTradingRuntime,residual.DemoTradingRuntime],selectors=[null,null,null];
try{
 for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  results.push(simulate({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',file}},{Runtime,selectors}));
 }
 const eligible=[1,2].filter(n=>results.every(r=>r.metrics[n].win>=r.metrics[0].win&&r.metrics[n].loss<=r.metrics[0].loss));
 // Do not spend more tests on a candidate that already loses retained wins.
 if(eligible.length)for(const family of spec.families)results.push(simulate(synthetic(family,spec.seed),{Runtime,selectors}));
}finally{Date.now=realNow;level.cleanup();residual.cleanup();}
const stress=results.filter(r=>r.kind==='synthetic-stress-not-live');
const summary=spec.variants.map((name,n)=>({name,win:stress.reduce((s,r)=>s+r.metrics[n].win,0),loss:stress.reduce((s,r)=>s+r.metrics[n].loss,0),
 regressions:results.filter(r=>r.metrics[n].win<r.metrics[0].win||r.metrics[n].loss>r.metrics[0].loss||r.metrics[n].maxLossStreak>r.metrics[0].maxLossStreak).map(r=>r.family??r.file)}));
writeFileSync(new URL('../reports/sentinel-forecast-level-ab-20261017.json',import.meta.url),JSON.stringify({spec,results,summary},null,2)+'\n');
console.log(JSON.stringify({summary}));

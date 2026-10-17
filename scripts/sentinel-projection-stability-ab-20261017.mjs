import {readFileSync,writeFileSync} from 'node:fs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
import {ProjectionWindowStability,ProjectionWindowCache} from '../experiments/projection-window-stability-20261017.mjs';
import {stabilityResearchRuntime} from '../experiments/stability-research-runtime-20261017.mjs';
const realNow=Date.now;
const spec={baseCommit:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',
 variants:['released','median-90-120-180','suspend-unstable-projection'],
 rule:'Only when both shorter-window forecasts are ready and oppose the selected released forecast. Median chooses their median move; gate removes only the projection and retains independent confirmed level reactions.',
 seed:2026101761,families:['trend','range','variable-range','sharp-turns','trend-switch','jump-retrace','random-walk','volatility-switch'],
 caveats:['The video is already used in development, not independent validation.','Both video extractions represent the same source.',
 'Generated trajectories are stress tests, not real accuracy.','Runtime gate and actual entry/expiry lifecycle run; no broker orders or Windows scheduling modeled.']};
const {DemoTradingRuntime:Runtime,cleanup}=await stabilityResearchRuntime(),results=[];
function run(data){
 const cache=new ProjectionWindowCache();
 return simulate(data,{Runtime,selectors:[null,()=>new ProjectionWindowStability({mode:'median',cache}),()=>new ProjectionWindowStability({mode:'gate',cache})]});
}
try{
 for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  results.push(run({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',file}}));
 }
 for(const family of spec.families)results.push(run(synthetic(family,spec.seed)));
}finally{Date.now=realNow;cleanup();}
const stress=results.filter(r=>r.kind==='synthetic-stress-not-live');
const summary=spec.variants.map((name,n)=>({name,
 win:stress.reduce((s,r)=>s+r.metrics[n].win,0),loss:stress.reduce((s,r)=>s+r.metrics[n].loss,0),
 worstLossStreak:Math.max(...stress.map(r=>r.metrics[n].maxLossStreak)),
 regressions:stress.filter(r=>r.metrics[n].loss>r.metrics[0].loss||r.metrics[n].maxLossStreak>r.metrics[0].maxLossStreak).map(r=>r.family)}));
writeFileSync(new URL('../reports/sentinel-projection-stability-ab-20261017.json',import.meta.url),JSON.stringify({spec,results,summary},null,2)+'\n');
console.log(JSON.stringify({summary}));

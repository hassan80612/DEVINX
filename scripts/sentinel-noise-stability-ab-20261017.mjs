import {readFileSync,writeFileSync} from 'node:fs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
import {ProjectionWindowStability} from '../experiments/projection-window-stability-20261017.mjs';
import {stabilityResearchRuntime} from '../experiments/stability-research-runtime-20261017.mjs';
const realNow=Date.now;
const spec={baseCommit:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',mode:'noise-gate',
 rule:'Suppress an unstable projection only when the past 90s path length at 1s resolution is >=2 times the path length at 5s resolution. Otherwise preserve the released direction. No fixed wait.',
 development:'Rule motivated by the previous synthetic random-walk benefit and structured-path regressions. Previous seed 2026101761 is development data.',
 seed:Number(process.env.SENTINEL_NOISE_SEED??2026101762),
 families:process.env.SENTINEL_NOISE_FAMILIES?.split(',')??['trend','range','variable-range','sharp-turns','trend-switch','jump-retrace','random-walk','volatility-switch'],
 label:process.env.SENTINEL_NOISE_LABEL??'',
 caveats:['Video is development data.','Two video extracts are one source.','Synthetic trajectories do not measure real trading accuracy.','No broker settlement, manual click or Windows scheduling modeled.']};
if(!/^[a-z-]*$/.test(spec.label))throw Error('Invalid label');
const {DemoTradingRuntime:Runtime,cleanup}=await stabilityResearchRuntime(),results=[];let stoppedEarly=false;
const run=data=>simulate(data,{Runtime,selectors:[null,()=>new ProjectionWindowStability({mode:'noise-gate'})]});
try{
 if(spec.label!=='holdout')for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  const r=run({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',file}});results.push(r);
  if(r.metrics[1].loss>r.metrics[0].loss||r.metrics[1].win<r.metrics[0].win){stoppedEarly=true;break;}
 }
 if(!stoppedEarly)for(const family of spec.families)results.push(run(synthetic(family,spec.seed)));
}finally{Date.now=realNow;cleanup();}
const stress=results.filter(r=>r.kind==='synthetic-stress-not-live');
const summary={stoppedEarly,changedSessions:results.filter(r=>!r.sameEntries).length,
 totals:[0,1].map(n=>({win:stress.reduce((s,r)=>s+r.metrics[n].win,0),loss:stress.reduce((s,r)=>s+r.metrics[n].loss,0)})),
 regressions:results.filter(r=>r.metrics[1].loss>r.metrics[0].loss||r.metrics[1].maxLossStreak>r.metrics[0].maxLossStreak).map(r=>r.family??r.file)};
writeFileSync(new URL('../reports/sentinel-noise-stability-ab-20261017'+(spec.label?'-'+spec.label:'')+'.json',import.meta.url),JSON.stringify({spec,results,summary},null,2)+'\n');
console.log(JSON.stringify({summary}));

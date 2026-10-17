import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
import {observedSamplingResearchRuntime} from '../experiments/observed-sampling-research-runtime-20261017.mjs';
const realNow=Date.now,one=await observedSamplingResearchRuntime({mode:'one-second'}),bucket=await observedSamplingResearchRuntime(),moment=await observedSamplingResearchRuntime({moment:true});
const mode=process.env.SENTINEL_SAMPLING_SET??'development',results=[];
const spec={baseCommit:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',mode,
 variants:['released','historical-grid-tolerance-under-1s','one-actual-observation-per-second','actual-second-buckets-plus-forecast-backed-candle-moment'],
 hypotheses:['Historical 500ms alignment can reject a valid 1Hz history solely due to the latest quote millisecond phase.',
 'Bucket sampling keeps actual observed timestamps and never fills missing buckets.',
 'Forecast-backed moments require an actual 30s projection agreeing with the existing direction, plus a fresh candle event.'],
 scoring:'External complete bid streams use the last published bid at or before expiry; sparse video fixtures keep their approximate after-expiry policy.',
 caveats:['External prices are not the user broker or OTC session.','Old quote-only video fixtures cannot validate candle-moment gating.',
 'First external windows were already inspected; second-validation windows are reserved before these new model results.']};
const Runtime=[Released,one.DemoTradingRuntime,bucket.DemoTradingRuntime,moment.DemoTradingRuntime],selectors=[null,null,null,null];
const run=data=>simulate(data,{Runtime,selectors});
try{
 if(mode==='development')for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  results.push(run({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',file}}));
 }
 const windows=mode==='validation'?['second-validation-10-utc','second-validation-16-utc','second-validation-21-utc']:['development-08-utc','validation-14-utc','reserved-19-utc'];
 for(const name of windows)results.push(run(JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+name+'.json',import.meta.url)))));
 if(mode==='stress')for(const family of ['trend','range','variable-range','sharp-turns','trend-switch','jump-retrace','random-walk','volatility-switch'])results.push(run(synthetic(family,2026101791)));
}finally{Date.now=realNow;one.cleanup();bucket.cleanup();moment.cleanup();}
for(const r of results)r.selection=r.entries.map((es,n)=>{const gaps=es.slice(1).map((e,i)=>(e.at-es[i].at)/1000).sort((a,b)=>a-b);
 return {completedCoverage:r.metrics[0].completed?r.metrics[n].completed/r.metrics[0].completed:null,medianGapSeconds:gaps.length?gaps[Math.floor(gaps.length/2)]:null,maxGapSeconds:gaps.at(-1)??null};});
const summary=results.map(r=>({name:r.name??r.family??r.file,metrics:r.metrics,selection:r.selection}));
writeFileSync(new URL('../reports/sentinel-observed-sampling-ab-20261017-'+mode+'.json',import.meta.url),JSON.stringify({spec,results,summary},null,2)+'\n');
console.log(JSON.stringify({summary}));

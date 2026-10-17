import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
import {candleMomentResearchRuntime} from '../experiments/candle-moment-research-runtime-20261017.mjs';
import {observedSamplingResearchRuntime} from '../experiments/observed-sampling-research-runtime-20261017.mjs';
const realNow=Date.now,moment=await candleMomentResearchRuntime(),combined=await observedSamplingResearchRuntime({moment:true,requireForecast:false});
const mode=process.env.SENTINEL_COMBINED_SET??'external',results=[];
const spec={baseCommit:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',mode,
 variants:['released','native-candle-moment','native-candle-moment-plus-observed-buckets'],
 rule:'Existing direction qualified by a fresh price event around the previous closed candle; combined variant also samples one actual price per second bucket with actual timestamps.',
 scoring:'Last published bid at/before expiry on complete external streams; no fill-forward model inputs.',
 caveats:['External Forex from one day, not the user broker, OTC session or real trade settlement.',
 'The first three windows were previously inspected. The last three were reserved before sampling results, but are now known.',
 'No retuning of candle thresholds by observed validation outcomes. Zero-entry windows do not demonstrate accuracy.']};
try{
 const names=mode==='stress'?[]:['development-08-utc','validation-14-utc','reserved-19-utc','second-validation-10-utc','second-validation-16-utc','second-validation-21-utc'];
 const run=data=>simulate(data,{Runtime:[Released,moment.DemoTradingRuntime,combined.DemoTradingRuntime],selectors:[null,null,null]});
 for(const name of names)results.push(run(JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+name+'.json',import.meta.url)))));
 if(mode==='stress')for(const family of ['trend','range','variable-range','sharp-turns','trend-switch','jump-retrace','random-walk','volatility-switch'])results.push(run(synthetic(family,2026101791)));
}finally{Date.now=realNow;moment.cleanup();combined.cleanup();}
for(const r of results)r.selection=r.entries.map((es,n)=>{
 const gaps=es.slice(1).map((e,i)=>(e.at-es[i].at)/1000).sort((a,b)=>a-b);
 return {completedCoverage:r.metrics[0].completed?r.metrics[n].completed/r.metrics[0].completed:null,
  medianGapSeconds:gaps.length?gaps[Math.floor(gaps.length/2)]:null,maxGapSeconds:gaps.at(-1)??null};
});
const summary=results.map(r=>({name:r.name??r.family,metrics:r.metrics,selection:r.selection}));
writeFileSync(new URL('../reports/sentinel-candle-sampling-combined-ab-20261017-'+mode+'.json',import.meta.url),JSON.stringify({spec,results,summary},null,2)+'\n');
console.log(JSON.stringify({summary}));

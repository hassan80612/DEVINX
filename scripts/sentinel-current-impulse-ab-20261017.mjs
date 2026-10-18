import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {currentImpulseResearchRuntime} from '../experiments/current-impulse-research-runtime-20261017.mjs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
const realNow=Date.now,final=await currentImpulseResearchRuntime(),base=await currentImpulseResearchRuntime({stage:'base'});
const mode=process.env.SENTINEL_IMPULSE_SET??'development',results=[];
const spec={productionCommit:'a6e810400ecf1d909293d80818aa6282f5e81569',mode,
 variants:['released-13.9.36','confirm-final-impulse-only','confirm-original-impulse-before-forecast-and-other-routes'],
 rule:'Require 3s net movement and the latest quote step to agree with continuation. Equality on the latest step is permitted; zero 3s net move is not. No fixed wait or new timer. Existing 3s/2500ms range-turn constants are reused, not outcome fitted.',
 selection:'Only the final-origin impulse reason is gated in the narrow variant. The base variant changes the original continuation admission; other routes still use their existing evidence.',
 holdout:'09/12/15/18 UTC windows registered before implementation and before their baseline/candidate results were inspected; all are on the same external trading day.',
 caveats:['Public external Forex ticks are not the user broker/OTC session or settlements.','Known video has no native OHLC and is already used in development.','Synthetic paths are behavior stress tests, not accuracy estimates.']};
const names=mode==='holdout'?['third-validation-09-utc','third-validation-12-utc','third-validation-15-utc','third-validation-18-utc']:
 mode==='stress'?[]:['development-08-utc','validation-14-utc','reserved-19-utc','second-validation-10-utc','second-validation-16-utc','second-validation-21-utc'];
const run=d=>simulate(d,{Runtime:[Released,final.DemoTradingRuntime,base.DemoTradingRuntime],selectors:[null,null,null]});
try{
 if(mode==='development')for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));results.push(run({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',name:file}}));
 }
 for(const name of names)results.push(run(JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+name+'.json',import.meta.url)))));
 if(mode==='stress')for(const family of ['trend','range','variable-range','sharp-turns','trend-switch','jump-retrace','random-walk','volatility-switch'])results.push(run(synthetic(family,2026101801)));
}finally{Date.now=realNow;final.cleanup();base.cleanup();}
for(const r of results)r.selection=r.entries.map((es,n)=>{
 const gaps=es.slice(1).map((e,i)=>(e.at-es[i].at)/1000).sort((a,b)=>a-b);
 return {completedCoverage:r.metrics[0].completed?r.metrics[n].completed/r.metrics[0].completed:null,
  medianGapSeconds:gaps.length?gaps[Math.floor(gaps.length/2)]:null,maxGapSeconds:gaps.at(-1)??null};
});
const summary=results.map(r=>({name:r.name??r.family,metrics:r.metrics,selection:r.selection}));
writeFileSync(new URL('../reports/sentinel-current-impulse-ab-20261017-'+mode+'.json',import.meta.url),JSON.stringify({spec,results,summary},null,2)+'\n');
console.log(JSON.stringify({summary}));

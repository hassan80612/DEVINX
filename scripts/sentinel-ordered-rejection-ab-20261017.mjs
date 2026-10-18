import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {orderedRejectionResearchRuntime} from '../experiments/ordered-rejection-research-runtime-20261017.mjs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
const realNow=Date.now,c=await orderedRejectionResearchRuntime(),mode=process.env.SENTINEL_REJECTION_SET??'development',results=[];
const spec={productionCommit:'a6e810400ecf1d909293d80818aa6282f5e81569',mode,
 rule:'Restrict rejection extrema to observations since the actual 6-second approach-origin quote. Do not reuse an older touch from the broader 12-second context. Historical and candle-route implementations share this ordering. Breakout logic and existing tolerances remain unchanged.',
 holdout:'11/13/17/20 UTC windows registered before this implementation and before inspecting baseline/candidate results.',
 caveats:['Already inspected development windows are exploratory.','All external windows are from one Forex day, not broker OTC or settlements.','Known video has no native OHLC.','Synthetic outcomes are stress behavior, not real accuracy.']};
const names=mode==='holdout'?['fourth-validation-11-utc','fourth-validation-13-utc','fourth-validation-17-utc','fourth-validation-20-utc']:
 mode==='stress'?[]:['development-08-utc','validation-14-utc','reserved-19-utc','second-validation-10-utc','second-validation-16-utc','second-validation-21-utc','third-validation-09-utc','third-validation-12-utc','third-validation-15-utc','third-validation-18-utc'];
const run=d=>simulate(d,{Runtime:[Released,c.DemoTradingRuntime],selectors:[null,null]});
try{
 if(mode==='development')for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));results.push(run({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',name:file}}));
 }
 for(const name of names)results.push(run(JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+name+'.json',import.meta.url)))));
 if(mode==='stress')for(const family of ['trend','range','variable-range','sharp-turns','trend-switch','jump-retrace','random-walk','volatility-switch'])results.push(run(synthetic(family,2026101802)));
}finally{Date.now=realNow;c.cleanup();}
for(const r of results)r.selection=r.entries.map((es,n)=>{const gaps=es.slice(1).map((e,i)=>(e.at-es[i].at)/1000).sort((a,b)=>a-b);return {
 completedCoverage:r.metrics[0].completed?r.metrics[n].completed/r.metrics[0].completed:null,
 medianGapSeconds:gaps.length?gaps[Math.floor(gaps.length/2)]:null,maxGapSeconds:gaps.at(-1)??null};});
const summary=results.map(r=>({name:r.name??r.family,metrics:r.metrics,selection:r.selection}));
writeFileSync(new URL('../reports/sentinel-ordered-rejection-ab-20261017-'+mode+'.json',import.meta.url),JSON.stringify({spec,results,summary},null,2)+'\n');
console.log(JSON.stringify({summary}));

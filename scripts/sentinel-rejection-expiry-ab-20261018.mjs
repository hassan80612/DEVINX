import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {rejectionExpiryResearchRuntime} from '../experiments/rejection-expiry-research-runtime-20261018.mjs';
import {simulate} from './sentinel-conflict-choice-ab-20261017.mjs';
const realNow=Date.now,mode=process.env.SENTINEL_REJECTION_EXPIRY_SET??'development';
if(!['development','holdout'].includes(mode))throw Error('Invalid mode');
const a=await rejectionExpiryResearchRuntime(),b=await rejectionExpiryResearchRuntime({mode:'sequence-only'});
const names=mode==='holdout'?['fifth-validation-04-utc','fifth-validation-06-utc','fifth-validation-07-utc','fifth-validation-22-utc']:
 ['development-08-utc','validation-14-utc','reserved-19-utc','second-validation-10-utc','second-validation-16-utc'];
const spec={productionReference:'a6e810400ecf1d909293d80818aa6282f5e81569',mode,
 variants:['released-13.9.36','rejection-requires-expiry-agreement','rejection-requires-observed-sequence'],
 rule:'Qualify only ready standalone historical-level-rejection and multiscale-candle-rejection routes at 30s. Agreement variant requires the original v1 expiry direction ready and aligned and any ready selected projection aligned. Sequence-only variant does not admit those standalone micro-reactions; it preserves existing separately recognized structural sequence changes and retests. Other routes, training, quote inputs, immutable held windows and expiry remain unchanged. No fixed delay or new history.',
 holdout:'04/06/07/22 UTC windows registered before this candidate or baseline outcomes were evaluated. Same external day as known data; not independent days.',
 caveats:['External Forex data is not user broker OTC, actual orders, current-account accuracy or a profitability test.',
 'Development and known-video data are already inspected; video extractions describe one source and must not be summed.',
 'Filtering alters entry times; compare full actual runtime replays, not removed-entry subgroup rates.']};
const results=[];
const run=d=>simulate(d,{Runtime:[Released,a.DemoTradingRuntime,b.DemoTradingRuntime],selectors:[null,null,null]});
try{
 if(mode==='development')for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  results.push(run({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',name:file}}));
 }
 for(const name of names)results.push(run(JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+name+'.json',import.meta.url)))));
}finally{Date.now=realNow;a.cleanup();b.cleanup();}
for(const r of results)r.selection=r.entries.map((entries,i)=>{
 const gaps=entries.slice(1).map((e,j)=>(e.at-entries[j].at)/1000).sort((a,b)=>a-b);
 return {completedCoverage:r.metrics[0].completed?r.metrics[i].completed/r.metrics[0].completed:null,
  medianGapSeconds:gaps.length?gaps[Math.floor(gaps.length/2)]:null,maxGapSeconds:gaps.at(-1)??null};
});
const summary=results.map(({name,metrics,selection,sameEntries})=>({name,metrics,selection,sameEntries}));
writeFileSync(new URL('../reports/sentinel-rejection-expiry-ab-20261018-'+mode+'.json',import.meta.url),JSON.stringify({spec,summary,results},null,2)+'\n');
console.log(JSON.stringify({summary}));

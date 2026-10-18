import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {independentExpiryRuntime} from '../experiments/independent-expiry-samples-20261018.mjs';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const spec=JSON.parse(readFileSync(new URL('../reports/independent-expiry-preregistration-20261018.json',import.meta.url))),candidate=await independentExpiryRuntime(),realNow=Date.now,results=[],unavailable=[];
const mode=process.argv[2]||'development';assert.ok(['development','validation'].includes(mode));
const names=mode==='development'?spec.knownDevelopment:spec.newValidation.days.map(day=>'independent-'+day+'-14-utc');
try{
 for(const name of names){
  const path=new URL('../tests/fixtures/external/dukascopy-eurusd-'+name+'.json',import.meta.url);
  if(!existsSync(path)){unavailable.push(name);continue;}
  const data=JSON.parse(readFileSync(path)),result=simulate(data,{Runtime:[DemoTradingRuntime,candidate.DemoTradingRuntime],selectors:[null,null]});
  for(const entries of result.entries)for(let i=1;i<entries.length;i++)assert.ok(entries[i].at>=entries[i-1].dueAt,'Actual signal holding periods changed or overlapped');
  results.push(result);
 }
}finally{Date.now=realNow;candidate.cleanup();}
const aggregate=[0,1].map(n=>{const values=metrics(results.flatMap(r=>r.entries[n]));delete values.maxLossStreak;return values;});
const report={spec,mode,unavailable,results,aggregate,summary:results.map(r=>({name:r.name,metrics:r.metrics,comparisons:r.comparisons,timings:r.timings})),published:false,actualUserSession:false};
writeFileSync(new URL('../reports/sentinel-independent-expiry-ab-20261018-'+mode+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode,aggregate,unavailable,summary:report.summary}));

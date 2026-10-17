import {readFileSync,writeFileSync} from 'node:fs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
import {ConfirmedBinaryExpiry} from '../experiments/confirmed-binary-expiry-20261017.mjs';
const realNow=Date.now,results=[];
const spec={baseCommit:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',
 rule:'Replace an opposed projection only when historical completed 30s weighted-median direction has >=0.4 weighted vote imbalance, actual 5s/10s/20s returns all agree, and 20s net/5s-step path efficiency >=0.25. Existing historical level validations and entry/expiry lifecycle remain active.',
 seed:2026101783,externalValidation:process.env.SENTINEL_BINARY_EXTERNAL??'development',
 caveats:['Video is development data.','Public Dukascopy ticks are genuine external historical FX, not the user broker or OTC session.','Synthetic stress results are not real accuracy.']};
const run=data=>simulate(data,{selectors:[null,()=>new ConfirmedBinaryExpiry()]});
try{
 if(spec.externalValidation!=='holdout')for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  results.push(run({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',file}}));
 }
 const files=spec.externalValidation==='holdout'?['dukascopy-eurusd-validation-14-utc.json','dukascopy-eurusd-reserved-19-utc.json']:['dukascopy-eurusd-development-08-utc.json'];
 for(const file of files)results.push(run(JSON.parse(readFileSync(new URL('../tests/fixtures/external/'+file,import.meta.url)))));
 if(spec.externalValidation==='stress')for(const family of ['trend','range','variable-range','sharp-turns','trend-switch','jump-retrace','random-walk','volatility-switch'])results.push(run(synthetic(family,spec.seed)));
}finally{Date.now=realNow;}
const summary={regressions:results.filter(r=>r.metrics[1].win<r.metrics[0].win||r.metrics[1].loss>r.metrics[0].loss||r.metrics[1].maxLossStreak>r.metrics[0].maxLossStreak).map(r=>r.file??r.family??r.name),
 metrics:results.map(r=>({source:r.file??r.family??r.name,metrics:r.metrics,sameEntries:r.sameEntries}))};
writeFileSync(new URL('../reports/sentinel-confirmed-binary-ab-20261017-'+spec.externalValidation+'.json',import.meta.url),JSON.stringify({spec,results,summary},null,2)+'\n');
console.log(JSON.stringify({summary}));

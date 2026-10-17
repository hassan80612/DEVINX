import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
import {candleMomentResearchRuntime} from '../experiments/candle-moment-research-runtime-20261017.mjs';
const realNow=Date.now,{DemoTradingRuntime:Candidate,cleanup}=await candleMomentResearchRuntime();
const mode=process.env.SENTINEL_MOMENT_SET??'development',results=[];
const spec={version:'candle-moment-v1-native-required',baseCommit:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',mode,
 rule:'Qualify existing direction on a fresh price crossing after native-candle breakout/retest, wick rejection/body reclaim, body pullback/resumption or opposite-body reclaim. No fixed second or wait; held calls and full 30s expiry remain unchanged.',
 constants:{relativeTolerance:.03,minimumBodyFraction:.4,minimumWickFraction:.45,minimumPullbackFraction:.15,maxEventAgeMs:1450},
 caveats:['No native OHLC in the old video makes this policy unavailable there; zero entries cannot validate its efficacy.','External Dukascopy prices differ from IQ Option/Exnova OTC and from user settlements.','Synthetic scenarios are stress tests, not accuracy estimates.']};
const run=data=>simulate(data,{Runtime:[Released,Candidate],selectors:[null,null]});
try{
 if(mode==='development')for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
  results.push(run({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video-no-native-OHLC',file}}));
 }
 const files=mode==='holdout'?['dukascopy-eurusd-validation-14-utc.json','dukascopy-eurusd-reserved-19-utc.json']:['dukascopy-eurusd-development-08-utc.json'];
 for(const file of files)results.push(run(JSON.parse(readFileSync(new URL('../tests/fixtures/external/'+file,import.meta.url)))));
 if(mode==='stress')for(const family of ['trend','range','variable-range','sharp-turns','trend-switch','jump-retrace','random-walk','volatility-switch'])results.push(run(synthetic(family,2026101785)));
}finally{Date.now=realNow;cleanup();}
for(const r of results){r.selection=r.metrics.map((m,n)=>{
 const es=r.entries[n],gaps=es.slice(1).map((e,i)=>(e.at-es[i].at)/1000).sort((a,b)=>a-b);
 return {completedCoverage:r.metrics[0].completed?m.completed/r.metrics[0].completed:null,
  medianEntryGapSeconds:gaps.length?gaps[Math.floor(gaps.length/2)]:null,maxEntryGapSeconds:gaps.at(-1)??null};
 });}
const summary=results.map(r=>({name:r.name??r.family??r.file,metrics:r.metrics,selection:r.selection}));
writeFileSync(new URL('../reports/sentinel-candle-moment-ab-20261017-'+mode+'.json',import.meta.url),JSON.stringify({spec,results,summary},null,2)+'\n');
console.log(JSON.stringify({summary}));

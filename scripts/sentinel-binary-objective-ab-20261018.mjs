import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {binaryObjectiveResearchRuntime} from '../experiments/binary-objective-research-runtime-20261018.mjs';
import {simulate,synthetic} from './sentinel-conflict-choice-ab-20261017.mjs';
const mode=process.env.SENTINEL_BINARY_SET??'development';
if(!['development','holdout','available-holdout','stress'].includes(mode))throw Error('Invalid mode');
const candidate=await binaryObjectiveResearchRuntime(),asof=await binaryObjectiveResearchRuntime({vote:false,expiryScoring:'asof'}),
 both=await binaryObjectiveResearchRuntime({expiryScoring:'asof'}),realNow=Date.now,results=[];
const spec={mode,productionReference:'a6e810400ecf1d909293d80818aa6282f5e81569',
 variants:['released-13.9.36','binary-class-vote-only','expiry-asof-grading-only','both-objective-and-expiry-consistent'],
 rule:'Binary variant changes only local-analogue side from weighted mean return sign to weighted CALL minus PUT class-vote sign. Expiry variant grades already-matured selector samples and displayed observed outcomes using the last actually received source quote at/before the immutable deadline (<=1000ms stale), instead of a quote after expiry. Both combines these two independent consistency fixes. Same causal inputs, weights, thresholds, holding lifecycle, remaining forecasts and level routes. Independent replay scorer is unchanged for every variant.',
 holdoutRegisteredBeforeEvaluation:{dates:['2020-03-31','2020-04-01'],hoursUTC:[8,14,19],minutes:30,source:'Dukascopy official EURUSD hourly tick archives',priceSide:'bid'},
 caveats:['External Forex quotes, not user broker OTC, executed orders or a current-account accuracy claim.',
 'Known development windows and video are not independent validation. Video extractions are the same source.',
 'Class votes are correlated local analogues; strength is not a calibrated win probability.',
 'Even a consistent mathematical correction does not itself establish an accuracy improvement.']};
const run=data=>simulate(data,{Runtime:[Released,candidate.DemoTradingRuntime,asof.DemoTradingRuntime,both.DemoTradingRuntime],selectors:[null,null,null,null]});
try{
 if(mode==='development'){
  for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
   const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
   results.push(run({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'known-video',name:file}}));
  }
  const previous=JSON.parse(readFileSync(new URL('../reports/sentinel-inverse-signal-audit-20261018.json',import.meta.url)));
  for(const r of previous.results.filter(r=>r.kind==='external-market-replay-not-user-session')){
   const f=JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+r.name+'.json',import.meta.url)));
   const replay=run(f);assert.deepEqual(replay.metrics[0],r.original);results.push(replay);
  }
 }
 if(mode==='holdout')for(const date of spec.holdoutRegisteredBeforeEvaluation.dates)for(const hour of spec.holdoutRegisteredBeforeEvaluation.hoursUTC){
  const name='official-'+date+'-'+String(hour).padStart(2,'0')+'-utc';
  results.push(run(JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+name+'.json',import.meta.url)))));
 }
 if(mode==='available-holdout'){
  spec.fallbackBeforeEvaluation={name:'available-official-2020-03-31-1829-utc',
   reason:'Original six-window archive retrieval failed with timeouts/HTTP 502; choose the complete consecutive newly available 17/18 UTC blocks, without evaluating outcomes first.',
   from:'2020-03-31T18:29:00Z',to:'2020-03-31T18:59:00Z',initialClosedCandles:89};
  results.push(run(JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+spec.fallbackBeforeEvaluation.name+'.json',import.meta.url)))));
 }
 if(mode==='stress')for(const family of ['trend','range','variable-range','sharp-turns','trend-switch','jump-retrace','random-walk','volatility-switch'])results.push(run(synthetic(family,2026101811)));
}finally{Date.now=realNow;candidate.cleanup();asof.cleanup();both.cleanup();}
for(const r of results)r.selection=r.entries.map((entries,i)=>{
 const gaps=entries.slice(1).map((e,j)=>(e.at-entries[j].at)/1000).sort((a,b)=>a-b);
 return {completedCoverage:r.metrics[0].completed?r.metrics[i].completed/r.metrics[0].completed:null,
  medianGapSeconds:gaps.length?gaps[Math.floor(gaps.length/2)]:null,maxGapSeconds:gaps.at(-1)??null};
});
const summary=results.map(({name,family,metrics,selection,comparisons,timings})=>({name:name??family,metrics,selection,comparisons,timings}));
writeFileSync(new URL('../reports/sentinel-binary-objective-ab-20261018-'+mode+'.json',import.meta.url),JSON.stringify({spec,summary,results},null,2)+'\n');
console.log(JSON.stringify({summary}));

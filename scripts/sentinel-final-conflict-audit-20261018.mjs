// Exact current analyst, offline only. Future prices are read by scorer after decision.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {DemoTradingRuntime as Published} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {terminalConflictRuntime} from '../experiments/terminal-conflict-runtime-20261018.mjs';
import {expiryQuote} from '../experiments/replay-expiry-quote-20261017.mjs';
import {metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const mode=process.env.SENTINEL_FINAL_CONFLICT_SET??'development';
assert.ok(['development','known'].includes(mode));
const root=new URL('../',import.meta.url);
const reference=JSON.parse(readFileSync(new URL('reports/sentinel-13937-postrelease-origin-benchmark-20261018.json',root)));
const samples=reference.results.filter(r=>r.kind!=='known-video'&&(mode==='known'||['development-08-utc','validation-14-utc','available-official-2020-03-31-1829-utc'].includes(r.name)));
const spec={version:'current-13.9.43-final-conflict-audit',baseCommit:'32ba17004713a085ac8f0e16adc28da739896634',mode,
 hypothesis:'Keep only explicit historical conflict rejections terminal instead of permitting later candle/sequence writers to reactivate. No general forecast agreement gate, no indicator or threshold tuning. Research only; not presumed better.',
 samples:samples.map(r=>r.name),durationMs:30000,payoutIllustration:86,
 limits:['All external windows were previously inspected; no untouched validation or user broker OTC session.', 'Scoring exact observed prices does not model execution, broker settlement, spread, latency or profit.', 'No access to the user live trial signals, assets or recorded outcomes. Reported account loss is not an observed win-rate sample.', 'Full runtime streams are compared; withholding a signal may change later entry timestamps.']};
writeFileSync(new URL('../reports/sentinel-final-conflict-spec-20261018.json',import.meta.url),JSON.stringify(spec,null,2)+'\n');
const trace=await terminalConflictRuntime(),candidate=await terminalConflictRuntime({terminal:true}),realNow=Date.now,results=[];
const aggregate=entries=>{const m=metrics(entries);delete m.maxLossStreak;return m;};
try{
 for(const sample of samples){
  const file=new URL('tests/fixtures/external/dukascopy-eurusd-'+sample.name+'.json',root),bytes=readFileSync(file),d=JSON.parse(bytes);
  const variants=[new Published({enableVNext:true,forecastModel:'now-structural-v1'}),new trace.DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'}),new candidate.DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'})];
  const entries=variants.map(()=>[]),observations=variants.map(()=>({rejected:0,reactivated:0}));let ci=0,end=0,start=0;const candles=[];
  for(const q of d.targets??d.quotes){
   const now=q.ts;Date.now=()=>now;
   while(ci<d.candles.length&&d.candles[ci].to*1000<=now)candles.push(d.candles[ci++]);
   while(end<d.quotes.length&&d.quotes[end].ts<=now)end++;
   while(start<end&&d.quotes[start].ts<now-300000)start++;
   const snap={provider:'iq_option',quoteHistory:d.quotes.slice(start,end),price:q.price,quoteTs:q.ts,candles:candles.slice(-100),historicalCandlesVerified:true};
   for(let i=0;i<variants.length;i++){
    const r=variants[i],settings={...r.settings,engine:'automatic',asset:d.asset,orderDurationMs:30000};
    const v=r._signalValidationGate({analysis:{asset:d.asset},snap,settings,now}).analysis.vnext,tr=r.researchObservation?.researchTrace;
    if(tr?.rejectedForConflict)observations[i].rejected++;if(tr?.conflictReactivated)observations[i].reactivated++;
    const e=v.futureEntryAnchor;if(!e?.entryReadyNow)continue;
    const exit=expiryQuote(d.quotes,e.exitAt,d.metadata.expiryQuotePolicy),delta=exit?exit.price-e.entryPrice:null;
    const result=delta===null?'missing':delta===0?'tie':(delta>0?'CALL':'PUT')===e.side?'win':'loss';
    const opposite=tr?.finalOpposesForecast?(result==='win'?'loss':result==='loss'?'win':result):null;
    entries[i].push({at:e.entryAt,side:e.side,price:e.entryPrice,dueAt:e.exitAt,result,reason:v.nowObservation.reason,...(i?{trace:tr,forecastCounterfactualResult:opposite}: {})});
   }
  }
  assert.deepEqual(entries[0],entries[1].map(({trace,forecastCounterfactualResult,...e})=>e),'Instrumentation altered production entry');
  const baseline=entries[1],reactivated=baseline.filter(e=>e.trace.conflictReactivated),opposed=baseline.filter(e=>e.trace.finalOpposesForecast);
  const group=predicate=>aggregate(baseline.filter(predicate));
  const out={name:sample.name,sourceSha256:createHash('sha256').update(bytes).digest('hex'),source:d.metadata,metrics:entries.map(metrics),observations,
   reactivated:aggregate(reactivated),withoutReactivation:group(e=>!e.trace.conflictReactivated),opposedToForecast:aggregate(opposed),
   forecastAtSameOpposedEntries:aggregate(opposed.map(e=>({...e,result:e.forecastCounterfactualResult}))),
   byFinalReason:Object.fromEntries([...new Set(baseline.map(e=>e.reason))].map(reason=>[reason,group(e=>e.reason===reason)])),
   exactTraceControl:true,entries:[entries[1],entries[2]]};
  results.push(out);console.log(JSON.stringify({...out,entries:undefined,source:undefined}));
 }
}finally{Date.now=realNow;trace.cleanup();candidate.cleanup();}
for(const r of results){
 const [a,b]=r.entries,ma=new Map(a.map(e=>[e.at,e])),mb=new Map(b.map(e=>[e.at,e]));
 r.entryComparison={identicalEntries:JSON.stringify(a)===JSON.stringify(b),baselineEntries:a.length,candidateEntries:b.length,
 removedEntryTimestamps:a.filter(e=>!mb.has(e.at)).length,newEntryTimestamps:b.filter(e=>!ma.has(e.at)).length,
 changedSideAtSameTimestamp:a.filter(e=>mb.has(e.at)&&e.side!==mb.get(e.at).side).length};
 for(const [rows,label] of [[a,'baseline'],[b,'candidate']]){const gaps=rows.slice(1).map((e,i)=>(e.at-rows[i].at)/1000).sort((x,y)=>x-y);r.entryComparison[label+'MedianGapSeconds']=gaps[Math.floor(gaps.length/2)]??null;r.entryComparison[label+'MaxGapSeconds']=gaps.at(-1)??null;}
}
const all=results.flatMap(r=>r.entries[0]),re=all.filter(e=>e.trace.conflictReactivated),opp=all.filter(e=>e.trace.finalOpposesForecast);
const summary={baseline:aggregate(all),terminalConflict:aggregate(results.flatMap(r=>r.entries[1])),reactivated:aggregate(re),withoutReactivation:aggregate(all.filter(e=>!e.trace.conflictReactivated)),
 opposedToForecast:aggregate(opp),forecastAtSameOpposedEntries:aggregate(opp.map(e=>({...e,result:e.forecastCounterfactualResult}))),
 windowsImproved:results.filter(r=>r.metrics[2].winRate>r.metrics[0].winRate).length,windowsWorsened:results.filter(r=>r.metrics[2].winRate<r.metrics[0].winRate).length,
 examples:re.slice(0,5),byFinalReason:Object.fromEntries([...new Set(all.map(e=>e.reason))].map(reason=>[reason,aggregate(all.filter(e=>e.reason===reason))]))};
summary.changedEntryWindows=results.filter(r=>!r.entryComparison.identicalEntries).length;summary.removedEntryTimestamps=results.reduce((s,r)=>s+r.entryComparison.removedEntryTimestamps,0);summary.newEntryTimestamps=results.reduce((s,r)=>s+r.entryComparison.newEntryTimestamps,0);
writeFileSync(new URL('../reports/sentinel-final-conflict-audit-20261018-'+mode+'.json',import.meta.url),JSON.stringify({spec,summary,results},null,2)+'\n');console.log(JSON.stringify({summary}));

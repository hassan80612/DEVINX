import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DemoTradingRuntime as Base} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {thirtySecondCycleForecast as releasedForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
import {actualEntryReferenceRuntime} from '../experiments/actual-entry-reference-runtime-20261018.mjs';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const mode=process.env.SENTINEL_REFERENCE_SET??'known';
if(!['known','crypto','validation'].includes(mode))throw Error('unknown set');
const root=new URL('../',import.meta.url),read=path=>JSON.parse(readFileSync(new URL(path,root)));
const spec=read('reports/sentinel-actual-entry-reference-spec-20261018.json');
const names=mode==='known'?read('reports/sentinel-13937-postrelease-origin-benchmark-20261018.json').results.filter(r=>r.kind!=='known-video').map(r=>r.name):
 read('reports/sentinel-'+(mode==='crypto'?'accuracy-repair-binance-data':'actual-entry-reference-data')+'-20261018.json').windows.map(r=>r.name);
const c=await actualEntryReferenceRuntime(),realNow=Date.now,results=[];
try {
 for(const name of names){
  const bytes=readFileSync(new URL('tests/fixtures/external/'+(name.startsWith('binance-')?'':'dukascopy-eurusd-')+name+'.json',root)),data=JSON.parse(bytes);
  const r=simulate(data,{Runtime:[Base,c.DemoTradingRuntime],selectors:[null,null]});
  r.name=name;r.fixtureSha256=createHash('sha256').update(bytes).digest('hex');
  // Diagnostics at CURRENT original entry instants, not a hindsight signal search.
  // Future quotes enter only after both forecast calls have returned.
  r.forecastAtBaseEntries=[];
  for(const e of r.entries[0]){
   const qs=data.quotes.filter(q=>q.ts<=e.at&&q.ts>=e.at-180000),q=qs.at(-1);
   const args={quoteHistory:qs,quoteAt:q.ts,price:q.price,now:e.at,durationMs:30000};
   const forecasts=[releasedForecast(args),c.thirtySecondCycleForecast(args)];
   const direction=e.result==='win'?e.side:e.result==='loss'?(e.side==='CALL'?'PUT':'CALL'):null;
   r.forecastAtBaseEntries.push({at:e.at,route:r.entryReasons[0].find(x=>x.at===e.at)?.reason,
    outcomes:forecasts.map(f=>!f.ready?'unavailable':!direction?e.result:f.side===direction?'win':'loss'),
    sides:forecasts.map(f=>f.side)});
  }
  results.push(r);
 }
}finally{Date.now=realNow;c.cleanup();}
const sum=index=>{const m=metrics(results.flatMap(r=>r.entries[index]));delete m.maxLossStreak;
 return {...m,worstWindowLossStreak:Math.max(0,...results.map(r=>r.metrics[index].maxLossStreak))};};
const summary={totals:[sum(0),sum(1)],improved:results.filter(r=>r.metrics[1].winRate>r.metrics[0].winRate).length,
 worsened:results.filter(r=>r.metrics[1].winRate<r.metrics[0].winRate).length,
 pairedCorrected:results.reduce((s,r)=>s+r.correctedAtSameTime,0),pairedSpoiled:results.reduce((s,r)=>s+r.spoiledAtSameTime,0),
 removedBaseWins:results.reduce((s,r)=>s+r.removedBaseWins,0),newEntries:results.reduce((s,r)=>s+r.newCandidateEntries,0),
 forecastOnly:[0,1].map(i=>{const es=results.flatMap(r=>r.forecastAtBaseEntries).map(x=>({result:x.outcomes[i]}));return metrics(es);}),
 windows:results.map(r=>({name:r.name,metrics:r.metrics,timings:r.timings,comparison:r.comparisons[0]}))};
writeFileSync(new URL('reports/sentinel-actual-entry-reference-ab-20261018-'+mode+'.json',root),JSON.stringify({spec,mode,summary,results},null,2)+'\n');
console.log(JSON.stringify({summary},null,2));

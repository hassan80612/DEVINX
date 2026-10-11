/**
 * Chronological offline comparison of approved 13.4.67 vs SHADOW 13.4.68.
 * Reads local opt-in quote-only MarketJournal .jsonl. Never brokers, orders,
 * network, Supabase, and NEVER rewrites a past forecast using its outcome.
 *
 * Usage:
 * node worker/compare-future-entries.mjs --engine automatic --horizon 30 /path/to/*.jsonl
 * Use 6+ distinct dates and a separate later (held-out) interval before
 * making any accuracy claim. No journals = NO evidence, not a fake score.
 */
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {futureEntrySchedule} from '../src/core/future-entry-schedule.mjs';
import {SCENARIO_ENGINES} from '../src/core/scenario-engine-catalog.mjs';

const valid=(n)=>Number.isFinite(Number(n))&&Number(n)>0;
const findAt=(quotes,t,ms=1000)=>{
 let a=0,b=quotes.length-1,idx=-1;
 while(a<=b){const m=(a+b)>>1;
  if(quotes[m].ts>=t){idx=m;b=m-1}else a=m+1
 }
 return idx>=0&&quotes[idx].ts<=t+ms?quotes[idx]:null;
};
const splitAt=(rows)=>Math.floor(rows.length*.65);
function score(rows){
 const verified=rows.filter(r=>r.outcome!==null);
 const draws=verified.filter(r=>r.outcome==='DRAW').length;
 const baseWins=verified.filter(r=>r.outcome!=='DRAW'&&r.baselineSide===r.outcome).length;
 const candidateWins=verified.filter(r=>r.outcome!=='DRAW'&&r.candidateSide===r.outcome).length;
 const n=verified.length-draws;
 return {predictions:rows.length,verified:n,draws,
  baselineWins:baseWins,shadowWins:candidateWins,
  baselineAccuracy:n?Number((100*baseWins/n).toFixed(2)):null,
  shadowAccuracy:n?Number((100*candidateWins/n).toFixed(2)):null,
  deltaWins:candidateWins-baseWins,skipped:rows.length-verified.length};
}
function grouping(rows,key){
 return Object.fromEntries([...new Set(rows.map(x=>x[key]))].sort().map(k=>
   [k,score(rows.filter(x=>x[key]===k))]));
}
export function evaluateFutureEntryJournal({
 events=[],engineId='automatic',horizonSeconds=30,stepSeconds=30
}={}){
 const h=Number(horizonSeconds);
 if(!(h>0&&h<=3600)||!(stepSeconds>0))throw Error('invalid_time_horizon');
 if(!SCENARIO_ENGINES.some(x=>x.id===engineId))throw Error('unknown_selected_engine');
 const grouped=new Map();
 for(const ev of events){
  if(ev?.type!=='market'||!(Number(ev.ts)>0))continue;
  const key=String(ev.provider||'')+'|'+String(ev.asset||'').toUpperCase();
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(ev);
 }
 const results=[];
 for(const [key,records] of grouped){
  records.sort((a,b)=>Number(a.ts)-Number(b.ts));
  const seen=new Map(),forecasts=[],asset=key.split('|').at(-1);
  let lastForecastAt=0,latestTs=0;
  for(const ev of records){
   const at=Number(ev.ts);
   for(const q of ev.quotes||[]){
    const ts=Number(q.ts),price=Number(q.price);
    if(valid(price)&&ts>0&&ts<=at)seen.set(ts,price);
   }
   const quoteTs=Number(ev.quoteTs||0);
   if(valid(ev.quote)&&quoteTs>0&&quoteTs<=at)seen.set(quoteTs,Number(ev.quote));
   const lastTick=Math.max(0,...[...seen.keys()].slice(-2));
   // New market information only. Overlapping 1s analyses are not independent.
   if(at-lastForecastAt<stepSeconds*1000||at-lastTick>2500)continue;
   lastForecastAt=at;
   const quotes=[...seen].sort((a,b)=>a[0]-b[0]).slice(-2400)
     .map(([ts,price])=>({ts,price}));
   const plan=futureEntrySchedule({
    settings:{engine:engineId,asset,orderDurationMs:h*1000},
    snap:{quoteHistory:quotes,quoteTs:lastTick,provider:key.split('|')[0]},
    now:at,delays:[h],focusDelaySeconds:h
   })[0];
   if(!plan?.side||!plan.candidateSide||!plan.entryAt||!plan.exitAt)continue;
   forecasts.push({
    engineId,asset,provider:key.split('|')[0],issuedAt:at,
    entryAt:plan.entryAt,exitAt:plan.exitAt,baselineSide:plan.baselineSide,
    candidateSide:plan.candidateSide,regime:plan.researchRegime,
    pairCases:plan.historicalPairCases,independentCases:plan.independentHistoricalCases
   });
   // Bounded research memory; candidates use up to 2400 preceding quotes.
   if(seen.size>3000){
    const tail=[...seen].slice(-2500);seen.clear();for(const [ts,p] of tail)seen.set(ts,p);
   }
   latestTs=at;
  }
  const allQuotes=[...new Map(records.flatMap(ev=>
    (ev.quotes||[]).concat(valid(ev.quote)&&valid(ev.quoteTs)?
      [{ts:ev.quoteTs,price:ev.quote}]:[])
     .filter(q=>Number(q.ts)<=Number(ev.ts)&&valid(q.price))
     .map(q=>[Number(q.ts),Number(q.price)])))].sort((a,b)=>a[0]-b[0])
    .map(([ts,price])=>({ts,price}));
  for(const f of forecasts){
   const entry=findAt(allQuotes,f.entryAt),exit=findAt(allQuotes,f.exitAt);
   f.outcome=entry&&exit?
    exit.price>entry.price?'CALL':exit.price<entry.price?'PUT':'DRAW':null;
   f.day=new Date(f.issuedAt).toISOString().slice(0,10);
  }
  results.push(...forecasts);
 }
 results.sort((a,b)=>a.issuedAt-b.issuedAt);
 const hold=results.slice(splitAt(results));
 const days=[...new Set(results.map(r=>r.day))];
 return {engineId,horizonSeconds:h,comparison:'registered-future-entry-to-actual-future-expiry',
  sources:grouped.size,predictions:results.length,days:days.length,
  all:score(results),heldOut:score(hold),
  byRegime:grouping(results,'regime'),
  heldOutByRegime:grouping(hold,'regime'),
  enoughEvidence:days.length>=6&&hold.filter(x=>x.outcome&&x.outcome!=='DRAW').length>=100,
  warning:'SHADOW is not promoted. Local journal quotes are not broker settlements; no automatic live trade authorization.'};
}
export async function compareFutureEntryFiles(paths,options={}){
 const events=[];
 for(const path of paths){
  const lines=createInterface({input:createReadStream(path),crlfDelay:Infinity});
  for await(const line of lines){
   if(!line.trim())continue;
   const event=JSON.parse(line);
   if(event.type==='market')events.push(event);
  }
 }
 return evaluateFutureEntryJournal({events,...options});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 const setting=(flag,otherwise)=>{const i=args.indexOf(flag);if(i<0)return otherwise;
  const v=args[i+1];args.splice(i,2);return v};
 const engineId=setting('--engine','automatic');
 const horizonSeconds=Number(setting('--horizon','30'));
 const stepSeconds=Number(setting('--step','30'));
 if(!args.length)throw Error('Provide local .jsonl quote journal files; no trading account, no secrets');
 console.log(JSON.stringify(await compareFutureEntryFiles(args,{engineId,horizonSeconds,stepSeconds}),null,2));
}

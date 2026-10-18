import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {levelEntryPoints} from '../experiments/level-entry-points-20261018.mjs';
import {HistoricalPriceStructureCache} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {expiryQuote} from '../experiments/replay-expiry-quote-20261017.mjs';
import {metrics} from './sentinel-conflict-choice-ab-20261017.mjs';

const kinds=['slowing-approach-to-level','detected-level-rejection','detected-level-breakout'];
const prior=JSON.parse(readFileSync(new URL('../reports/sentinel-inverse-signal-audit-20261018.json',import.meta.url)));
const results=[];
for(const previous of prior.results.filter(r=>r.kind==='external-market-replay-not-user-session')){
 const file='external/dukascopy-eurusd-'+previous.name+'.json';
 const data=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
 const all=data.quotes,targets=data.targets??all,cache=new HistoricalPriceStructureCache();
 const streams=Object.fromEntries([...kinds,'combined-priority-reaction'].map(k=>[k,{dueAt:0,entries:[]}]));
 let ci=0,end=0,start=0;const candles=[];
 for(const q of targets){
  const now=q.ts;
  while(ci<(data.candles?.length??0)&&data.candles[ci].to*1000<=now)candles.push(data.candles[ci++]);
  while(end<all.length&&all[end].ts<=now)end++;
  while(start<end&&all[start].ts<now-300000)start++;
  const history=all.slice(start,end),structure=cache.get({candles:candles.slice(-100),now,context:previous.name});
  const events=levelEntryPoints({structure,quoteHistory:history,quoteAt:now,now,price:q.price});
  const preferred=events.find(e=>e.kind!=='slowing-approach-to-level')??events[0];
  for(const key of Object.keys(streams)){
   const stream=streams[key],event=key==='combined-priority-reaction'?preferred:events.find(e=>e.kind===key);
   if(!event||now<=stream.dueAt)continue;
   // Insert a research-only immutable 30s entry; outcomes are read only AFTER
   // entry selection. Paired directions share every time, price and expiry.
   const dueAt=now+30000,inverseSide=event.side==='CALL'?'PUT':'CALL';
   const exit=expiryQuote(all,dueAt,data.metadata.expiryQuotePolicy);
   const score=side=>!exit?'missing':exit.price===q.price?'tie':(exit.price>q.price?'CALL':'PUT')===side?'win':'loss';
   const entry={at:now,price:q.price,dueAt,...event,inverseSide,
    exitAt:exit?.ts??null,exitPrice:exit?.price??null,result:score(event.side),inverseResult:score(inverseSide)};
   assert.equal(entry.inverseResult,entry.result==='win'?'loss':entry.result==='loss'?'win':entry.result);
   assert.ok(!stream.entries.length||entry.at>stream.entries.at(-1).dueAt);
   stream.entries.push(entry);stream.dueAt=dueAt;
  }
 }
 const by=Object.fromEntries(Object.entries(streams).map(([key,{entries}])=>[key,{
  normal:metrics(entries),inverse:metrics(entries.map(e=>({...e,result:e.inverseResult}))),entries}]));
 results.push({name:previous.name,by});
 console.log(JSON.stringify({window:previous.name,counts:Object.fromEntries(Object.entries(by).map(([k,v])=>[k,[v.normal.win,v.normal.loss,v.inverse.win,v.inverse.loss]]))}));
}
const totals=Object.fromEntries([...kinds,'combined-priority-reaction'].map(kind=>{
 const sum=which=>{const t={win:0,loss:0,tie:0,missing:0};
  for(const r of results)for(const k of Object.keys(t))t[k]+=r.by[kind][which][k];
  return {...t,completed:t.win+t.loss,winRate:t.win+t.loss?t.win/(t.win+t.loss):null};};
 const entries=results.flatMap(r=>r.by[kind].entries);
 return [kind,{normal:sum('normal'),inverse:sum('inverse'),
  rejectionTouches:{current:entries.filter(e=>e.currentApproachTouch===true).length,olderOnly:entries.filter(e=>e.currentApproachTouch===false).length}}];
}));
const report={spec:{productionReference:prior.spec.productionReference,
 rule:'Research insertion at causally detected level points. Slowing approach uses the released near-wall slowdown threshold and reaction floor; rejection/breakout use the released historical reaction detector with no forecast or admission veto. Compare the detector side against its opposite at identical times, prices and 30s deadlines. Each independent stream has one immutable 30s entry and requires a later quote after expiry. Combined stream prioritizes a reaction over a slowing approach.',
 caveats:[...prior.spec.caveats,'All 14 source windows were already inspected: exploratory event study, not an independent validation set.',
 'This deliberately inserts hypothetical signals at detected points and bypasses production forecast/admission conflicts. It is not a full replacement-runtime A/B or a demonstrated gain over production.',
 'Each category is an independent series and can overlap other categories. Do not sum category results; the separately scored combined stream prevents overlap.',
 'The known-video quote-only extractions lack verified historical candles for these level detectors and are excluded. Screenshots cannot reconstruct their pre-entry stream.',
 'Paired opposite directions are alternative predeclared hypotheses. Selecting whichever won afterwards is not a usable strategy. No thresholds were fitted to these outcomes.']},totals,results};
writeFileSync(new URL('../reports/sentinel-level-entry-insertion-20261018.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({totals},null,2));

// Chronological, read-only diagnosis on observed VIDEO prices. Not broker orders.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {analyzeNowOpportunity as baseline} from '../tests/fixtures/sentinel-video-production-now-engine.mjs';
import {analyzeNowOpportunity as candidate,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const names={baseline,candidate};
const durationMs=30000;
export function compareRows(rows,{startAfterMs=0,slipMs=0}={}){
 const states={},signals={baseline:[],candidate:[]};
 let previous=-Infinity;
 for(let i=0;i<rows.length;i++){
  const q=rows[i];
  if(!(q.ts>previous&&Number.isFinite(q.price)&&q.price>0))throw Error('invalid-chronological-observation');
  previous=q.ts;
  const input={quoteHistory:rows.slice(0,i+1),quoteAt:q.ts,price:q.price,now:q.ts,
   engineId:'fibonacci_retest',durationMs,qualityPolicy:'adaptive-market-v17'};
  for(const [name,analyze] of Object.entries(names)){
   const choice=analyze(input);
   const next=advanceNowOpportunity({previous:states[name],candidate:choice,
    now:q.ts,quoteAt:q.ts,asset:'VIDEO-EURGBP-OTC',engineId:input.engineId,durationMs});
   if(next.phase==='fired'&&next.entryTriggeredAt!==states[name]?.entryTriggeredAt&&
      q.ts>=rows[0].ts+startAfterMs)signals[name].push({...next,reason:choice.reason});
   states[name]=next;
  }
 }
 const result={};
 for(const name of Object.keys(names)){
  const stats={signals:signals[name].length,wins:0,losses:0,ties:0,unknown:0,longestLossStreak:0,entries:[]};
  let streak=0;
  for(const s of signals[name]){
   const entry=rows.find(q=>q.ts>=s.entryAt+slipMs&&q.ts<=s.entryAt+slipMs+1000);
   const exit=rows.find(q=>q.ts>=s.exitAt+slipMs&&q.ts<=s.exitAt+slipMs+1000);
   const outcome=!entry||!exit?'unknown':exit.price===entry.price?'ties':
    (exit.price>entry.price?'CALL':'PUT')===s.side?'wins':'losses';
   stats[outcome]++;
   streak=outcome==='losses'?streak+1:0;stats.longestLossStreak=Math.max(streak,stats.longestLossStreak);
   stats.entries.push({at:s.entryAt,side:s.side,reason:s.reason,entry:entry?.price??null,exit:exit?.price??null,outcome});
  }
  result[name]=stats;
 }
 return result;
}
export function compareVisibleEntries(fixture){
 const rows=fixture.quoteHistory;
 return fixture.visibleSignals.map(s=>{
  const t=Date.parse('2026-10-16T'+s.time+'-03:00');
  const q=rows.find(q=>q.ts===t),exit=rows.find(q=>q.ts===t+durationMs);
  if(!q||!exit)return {...s,unknown:true};
  const input={quoteHistory:rows.filter(q=>q.ts<=t),quoteAt:t,price:q.price,now:t,
   engineId:'fibonacci_retest',durationMs,qualityPolicy:'adaptive-market-v17'};
  const decisions=Object.fromEntries(Object.entries(names).map(([name,fn])=>{
   const v=fn(input);return [name,{side:v.side,ready:v.ready,reason:v.reason}];
  }));
  return {...s,entry:q.price,exit:exit.price,observed:exit.price===q.price?'TIE':exit.price>q.price?'CALL':'PUT',...decisions};
 });
}
export function report(){
 const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/sentinel-user-video-20261016.json',import.meta.url)));
 return {source:fixture.source,sourceSha256:fixture.sourceSha256,baselineCommit:fixture.productionCommit,
  observedQuotes:fixture.quoteHistory.length,limitations:fixture.limitations,
  full:compareRows(fixture.quoteHistory),
  afterFullContext:compareRows(fixture.quoteHistory,{startAfterMs:180000}),
  oneSecondEntryDelay:compareRows(fixture.quoteHistory,{startAfterMs:180000,slipMs:1000}),
  twoSecondEntryDelay:compareRows(fixture.quoteHistory,{startAfterMs:180000,slipMs:2000}),
  fixedVideoEntries:compareVisibleEntries(fixture),realMarketWinRateEstablished:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(report(),null,2));

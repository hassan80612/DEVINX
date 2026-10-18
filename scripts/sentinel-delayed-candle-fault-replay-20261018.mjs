// Fault injection on an external recorded tick path. This measures source
// integrity and decision parity, NOT an improvement in market win probability.
import {readFileSync,writeFileSync,cpSync,mkdtempSync,rmSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
// Copy local dependency files, replacing only the driver with the frozen 13.9.37 source.
const baselineDir=mkdtempSync(join(tmpdir(),'sentinel-13937-fault-baseline-'));
cpSync(new URL('../sentinel-trading-lab/agent/worker/',import.meta.url),join(baselineDir,'worker'),{recursive:true});
cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),join(baselineDir,'src/core'),{recursive:true});
writeFileSync(join(baselineDir,'worker/local-playwright-driver.mjs'),gunzipSync(readFileSync(new URL('../tests/fixtures/sentinel-13937-local-playwright-driver.mjs.gz',import.meta.url))));
const {LocalPlaywrightDriver:Before}=await import(pathToFileURL(join(baselineDir,'worker/local-playwright-driver.mjs')));
import {LocalPlaywrightDriver as After} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const data=JSON.parse(readFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-reserved-19-utc.json',import.meta.url)));
const realNow=Date.now,results=[];
try{
 for(const provider of ['iq_option','exnova']){
  const modes=['before-clean','after-clean','before-delayed','after-delayed'];
  const runs=modes.map((name,i)=>({name,driver:new (i%2?After:Before)({dataDir:'ignored'}),runtime:new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'}),entries:[],wrongLivePrices:0}));
  const start=data.targets[0].ts,initial=data.candles.filter(c=>c.to*1000<=start).slice(-100);
  for(const r of runs){const s=r.driver.state(provider);Object.assign(s,{activeId:76,candleActiveId:76,candleSize:60,symbol:data.asset,uiSymbol:data.asset,candles:initial});}
  let cursor=0,lastClosed=initial.at(-1).to,injections=0;
  for(const q of data.targets){
   const received=q.ts+200;Date.now=()=>received;
   while(cursor<data.quotes.length&&data.quotes[cursor].ts<=q.ts){
    const tick=data.quotes[cursor++];if(tick.ts<start-180000)continue;
    Date.now=()=>tick.ts+200;
    for(const r of runs)r.driver.ingest(provider,{name:'quote-generated',msg:{active_id:76,time:tick.ts/1000,price:tick.price}},'page-in');
   }
   Date.now=()=>received;
   const closed=data.candles.filter(c=>c.to*1000<=q.ts).at(-1);
   if(closed&&closed.to>lastClosed){
    lastClosed=closed.to;
    for(const r of runs)r.driver.ingest(provider,{name:'candles',msg:{active_id:76,candles:[closed]}},'page-in');
    // The old closed candle and its original event time are delivered late.
    // Every price comes from recorded data; only delivery order is controlled.
    const frame={name:'candle-generated',msg:{...closed,active_id:76,size:60,at:closed.to*1000000}};
    for(const r of runs.slice(2))r.driver.ingest(provider,frame,'page-in');
    injections++;
    for(const r of runs){const s=r.driver.state(provider);if(s.quote!==q.price||s.lastQuoteAt!==q.ts)r.wrongLivePrices++;}
   }
   for(const r of runs){
    const s=r.driver.state(provider),settings={...r.runtime.settings,engine:'automatic',asset:data.asset,orderDurationMs:30000};
    const v=r.runtime._signalValidationGate({analysis:{asset:data.asset},settings,now:received,
     snap:{provider,price:s.quote,quoteTs:s.lastQuoteAt,quoteHistory:s.quoteHistory,candles:s.candles,historicalCandlesVerified:true}}).analysis.vnext;
    const e=v.futureEntryAnchor;if(e?.entryReadyNow)r.entries.push({at:e.entryAt,side:e.side,price:e.entryPrice,dueAt:e.exitAt});
   }
  }
  assert.deepEqual(runs[0].entries,runs[1].entries,'Clean quote-only operation changed');
  assert.deepEqual(runs[0].entries,runs[3].entries,'Fixed delayed-input run differs from its clean reference');
  const baseline=new Map(runs[0].entries.map(e=>[e.at,e]));
  results.push({provider,injections,variants:runs.map(r=>({name:r.name,wrongLivePrices:r.wrongLivePrices,entries:r.entries,
   sameAsClean:JSON.stringify(r.entries)===JSON.stringify(runs[0].entries),
   nonmatchingEntries:r.entries.filter(e=>JSON.stringify(baseline.get(e.at))!==JSON.stringify(e)).length}))});
 }
}finally{Date.now=realNow;rmSync(baselineDir,{recursive:true,force:true});}
const report={spec:{source:data.metadata,injectedFault:'Delivery of each newly closed minute candle after a more recent real quote, 200ms receive latency. Exact prices and original candle timestamps retained.',
 limitations:['Controlled fault injection, not a capture of the user session or a claim that every loss has this cause.','Same engine and actual bid path for all variants. No synthetic price or future model input.','Decision parity and price provenance are the outcomes; no claim of 90% market accuracy.']},results};
writeFileSync(new URL('../reports/sentinel-delayed-candle-fault-replay-20261018.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({...r,variants:r.variants.map(({entries,...v})=>({...v,entries:entries.length}))})),null,2));

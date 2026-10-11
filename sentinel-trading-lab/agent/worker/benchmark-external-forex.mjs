/**
 * External spot EURUSD research: no OTC broker feed, trade or credentials.
 *
 * Source: public fx_EUR_USD_tick monthly sampled bid/ask pairs (~1Hz);
 * https://github.com/zcbmlijygrdwa/fx_EUR_USD_tick
 * File has NO UTC timestamps. Labels use its stated one-second sampling
 * order in contained windows; closure/session gaps cannot be proven.
 * Results therefore are a diagnostic, NOT a valid live-broker hit rate.
 *
 * Simulated 4Hz refresh duplicates each actual mid-price only, adding NO
 * future-price information. Tests quote-density sensitivity of original 67.
 * Compare with normalized multiresolution quotes (same underlying prices).
 *
 * Only report selected-forecaster future-entry direction t+H->t+2H.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {futureEntrySchedule}
 from '../src/core/future-entry-schedule.mjs';
import {SCENARIO_ENGINES}
 from '../src/core/scenario-engine-catalog.mjs';
import {compressTemporalQuotes}
 from '../src/core/vnext-temporal-evidence-research.mjs';
const path=process.argv[2];
if(!path)throw Error('usage: node benchmark-external-forex.mjs <external_1Hz_EURUSD_bid_ask_file>');
const bytes=readFileSync(path),digest=createHash('sha256').update(bytes).digest('hex');
const input=bytes.toString('utf8'),records=[];
for(const line of input.split(/\r?\n/)){
 if(records.length>=115000)break;
 const bits=line.trim().split(/\s+/),sell=Number(bits[0]),buy=Number(bits[1]);
 if(bits.length<2||!(sell>0&&buy>0&&Math.abs(buy-sell)<.01))continue;
 records.push((sell+buy)/2);
}
if(records.length<40000)throw Error('not enough valid observed bid/ask pairs');
const origin=1600000000000;
const quotes=records.map((price,i)=>({ts:origin+i*1000,price}));
const H=[5,10,30,60,120,300];
const outcome=(x,y)=>x>y?'CALL':x<y?'PUT':null;
const scores=[];
let evaluated=0;
const start=Date.now();
for(let i=7200;i<records.length-600;i+=1650){
 // Avoid crossing a pseudo one-hour block. Monthly source has no explicit
 // session timestamps, so this mitigates but does not eliminate ambiguity.
 if(i%3600>2800||i%3600<700)continue;
 const now=origin+i*1000;
 const last=quotes.slice(i-6200,i+1);
 const frequent=last.flatMap(q=>[0,250,500,750].map(ms=>({ts:q.ts+ms,price:q.price})))
   .filter(q=>q.ts<=now);
 const truncated=frequent.slice(-2400);
 const normalized=compressTemporalQuotes({
  quoteHistory:frequent,asOf:now,maxPoints:4096,maxAgeSeconds:7200
 });
 for(const h of H){
  if(i%3600+2*h>3598)continue;
  const trueDirection=outcome(records[i+2*h],records[i+h]);
  if(!trueDirection)continue;
  for(const e of SCENARIO_ENGINES){
   const settings={engine:e.id,asset:'EUR/USD',orderDurationMs:h*1000};
   const snap={provider:'external-spot-EURUSD',quoteTs:now,
    quoteHistory:truncated};
   const b=futureEntrySchedule({settings,snap,now,delays:[h]})[0];
   const n=futureEntrySchedule({
    settings,snap:{...snap,quoteHistory:normalized},now,delays:[h]
   })[0];
   if(!b?.side||!n?.side)continue;
   scores.push({engine:e.id,h,orig:b.side===trueDirection,
    normalized:n.side===trueDirection,changed:b.side!==n.side});
  }
 }
 evaluated++;
}
const tally=a=>({n:a.length,original:a.filter(x=>x.orig).length,
 temporal:a.filter(x=>x.normalized).length,
 helped:a.filter(x=>!x.orig&&x.normalized).length,
 harmed:a.filter(x=>x.orig&&!x.normalized).length,
 changed:a.filter(x=>x.changed).length
});
const result={
 source:'zcbmlijygrdwa/fx_EUR_USD_tick:EURUSD-2018-01_converted.txt',
 sha256:digest,priceSamples:records.length,windows:evaluated,
 oneSecondSamplingAccordingToSource:true,realUtcTimestamps:false,
 brokerQuoteCompatibility:false,brokerProfitEvidence:false,
 simulatedFourHzRefresh:true,sameUnderlayingObservedPrices:true,
 description:'external spot quotes (not OTC), source lacks timestamps; this cannot validate live broker win rate',
 total:tally(scores),
 byH:Object.fromEntries(H.map(h=>[h,tally(scores.filter(x=>x.h===h))])),
 byEngine:Object.fromEntries(SCENARIO_ENGINES.map(e=>
  [e.id,tally(scores.filter(x=>x.engine===e.id))]))
};
if(result.total.n<100)throw Error('too few compared forecasts');
console.log('SENTINEL_EXTERNAL_SPOT_TEMPORAL_DIAGNOSTIC='+JSON.stringify(result));
console.log('elapsedMs='+String(Date.now()-start));

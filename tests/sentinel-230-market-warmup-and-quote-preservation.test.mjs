import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marketWarmup230} from '../sentinel-trading-lab/agent/src/core/verified-market-warmup-230.mjs';
import {preserveLiveQuotesOnCandleFailure230} from '../sentinel-trading-lab/agent/worker/same-asset-quote-preservation-230.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const now=Date.now(),price=1.1064,base=now-5200;
const ticks=Array.from({length:6},(_,i)=>({ts:base+i*1000,price:price-i*.00001,receivedAt:base+i*1000}));
const candles=Array.from({length:55},(_,i)=>({
 from:Math.round((now-(55-i)*60000)/1000),
 to:Math.round((now-(54-i)*60000)/1000),
 open:1.10,close:1.101,high:1.102,low:1.099
}));
const broker={provider:'exnova',source:'EXNOVA LIVE',symbol:'EUR/USD',uiSymbol:'EUR/USD',
 validatedSymbol:'EUR/USD',assetValidated:true,quoteFeedValidated:true,
 historicalCandlesVerified:true,screenCandidateSymbol:null,
 quote:price,quoteTs:ticks.at(-1).ts,lastQuoteAt:ticks.at(-1).ts,candles,quoteHistory:ticks};
const out=(changes={},quotes=ticks)=>marketWarmup230({broker:{...broker,...changes},quoteHistory:quotes,now});
test('230: six real current ticks with validated 50+ same-asset candles initiate analysis without 14-second second warmup',()=>{
 const read=out();assert.equal(read.ready,true,JSON.stringify(read));
 assert.equal(read.path,'verified-history-plus-real-ticks');
 const runtime=new DemoTradingRuntime({enableVNext:true});
 runtime.settings.asset='EUR/USD';
 runtime.setExternalMarket({...broker});
 const snap=runtime._marketSnapshot();
 assert.equal(snap.waitingLive,false,'real broker market reaches actual analyst');
 assert.equal(snap.quoteHistory.length,6);
 assert.equal(snap.candles.length,55);
});
test('230: stale, mismatched asset, bogus or absent historical candles never start fast trade analysis',()=>{
 for(const [tag,change] of [
  ['stale',{quoteTs:now-5000,lastQuoteAt:now-5000}],
  ['unverified price',{quoteFeedValidated:false}],
  ['unverified asset',{assetValidated:false}],
  ['wrong visible asset',{screenCandidateSymbol:'GBP/USD'}],
  ['unverified bars',{historicalCandlesVerified:false}],
  ['too few bars',{candles:candles.slice(-15)}],
  ['unknown raw price',{quote:0}]
 ])assert.equal(out(change).ready,false,tag);
 assert.equal(out({},ticks.slice(0,4)).ready,false,'no shortcut with only 4 quotes');
 const holes=ticks.map(x=>({...x}));
 holes[3].ts=holes[2].ts+4100;
 assert.equal(out({},holes).ready,false,'no multi-second missing gap masquerades as continuous feed');
});
test('230: short recent window is not an arbitrary 15/14s fixed wait',()=>{
 const sparse=ticks.map((q,i)=>({...q,ts:now-15000+i*3000,receivedAt:now-15000+i*3000}));
 assert.equal(out({},sparse).ready,false,'short sample cannot override large missing quote gaps');
 const two=ticks.map(q=>({...q,ts:q.ts-15000,receivedAt:q.receivedAt-15000}));
 assert.equal(out({},two).ready,false,'stale observed quotes cannot be treated as new quote');
});
test('230: keep authenticated quotes on malformed same active-id candles without mixing broker assets',()=>{
 const st={symbol:'EUR/USD',uiSymbol:'EUR/USD',activeId:17,candleActiveId:17,
  quote:price,lastQuoteAt:now,quoteHistory:[{ts:now,price}]};
 const pairKey=s=>String(s).toUpperCase().replace(/[^A-Z]/g,'');
 const keep=(changes={},integrity={ok:false})=>
  preserveLiveQuotesOnCandleFailure230({st:{...st,...changes},integrity,now,pairKey});
 assert.equal(keep(),true);
 assert.equal(keep({candleActiveId:18}),false);
 assert.equal(keep({activeId:null}),false);
 assert.equal(keep({screenCandidateSymbol:'EUR/GBP'}),false);
 assert.equal(keep({uiSymbol:'GBP/USD'}),false);
 assert.equal(keep({lastQuoteAt:now-8000}),false);
 assert.equal(keep({quoteHistory:[]}),false);
 assert.equal(keep({}, {ok:true}),false);
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.match(driver,/preserveLiveQuotesOnCandleFailure230/);
 assert.match(driver,/if\(!safeToKeepLivePrices\)\{/);
 assert.match(driver,/st\.quote=null;st\.quoteHistory=\[\];st\.lastQuoteAt=null/);
});
test('230: native expiry and broker trade execution modules have not gained warmup shortcuts',()=>{
 const root=new URL('../sentinel-trading-lab/agent/',import.meta.url);
 for(const p of ['worker/index.mjs','worker/broker-native-expiry-keeper.mjs','worker/signal-executor.mjs',
  'worker/broker-ui-executor.mjs']){
  const s=readFileSync(new URL(p,root),'utf8');
  assert.doesNotMatch(s,/marketWarmup230|preserveLiveQuotesOnCandleFailure230/,p);
 }
});

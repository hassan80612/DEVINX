import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const T=1792887000000;
const candles=()=>Array.from({length:100},(_,i)=>({
 from:T-(100-i)*60000,to:T-(99-i)*60000,
 open:1.1009,close:1.1009,high:1.1014,
 low:i===89?1.1:1.1006
}));
const levels=[1.10030,1.10023,1.10014,1.10003,1.10000,1.10002,1.10008];
const rows=(times=levels.map((_,i)=>T-6000+i*1000))=>
 levels.map((price,i)=>({ts:times[i],receivedAt:times[i],price}));
const ctx=(quotes=rows(),verified=true,bars=candles())=>{
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.stateName='running';runtime.settings.asset='EUR/USD';runtime.settings.engine='automatic';
 runtime.setExternalMarket({provider:'exnova',symbol:'EUR/USD',
  quote:quotes.at(-1).price,quoteTs:T,lastQuoteAt:T,quoteHistory:quotes,
  candles:bars,quoteFeedValidated:true,analysisFeedValidated:true,
  historicalCandlesVerified:verified,assetValidated:true});
 return runtime;
};
test('reuses already verified 1–20 closed-candle levels and 6s genuine quotes at current bar start',()=>{
 const r=ctx();
 const snap=r._marketSnapshot();
 assert.equal(snap.feedValidated,true,'must not wait another 14 seconds for new asset');
 assert.equal(snap.quoteHistory.length,7);
 const signal=analyzeNowOpportunity({quoteHistory:snap.quoteHistory,
  candles:snap.candles,price:snap.price,quoteAt:snap.quoteTs,now:T,
  durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'});
 assert.equal(signal.ready,true,signal.reason);
 assert.equal(signal.side,'CALL','genuine earlier support reaction should not be mistaken for PUT');
 assert.equal(signal.reason,'historical-level-rejection');
});
test('unverified previous candles cannot bypass the original 14-second readiness protection',()=>{
 const r=ctx(rows(),false);
 assert.equal(r._marketSnapshot().feedValidated,false);
});
test('isolated two-tick spike cannot substitute six seconds of real observations',()=>{
 const r=ctx(rows([T-6000,T-2000,T-1900,T-1800,T-1700,T-1600,T]));
 assert.equal(r._marketSnapshot().feedValidated,false);
});
test('missing closed historical candles cannot bypass 14s readiness',()=>{
 const r=ctx(rows(),true,candles().slice(-8));
 assert.equal(r._marketSnapshot().feedValidated,false);
});
test('the original well-established 15-tick warm path is unchanged',()=>{
 const q=Array.from({length:15},(_,i)=>({ts:T-14000+i*1000,
  receivedAt:T-14000+i*1000,price:1.1+(i%2)*.0001}));
 const r=ctx(q,false,[]);
 assert.equal(r._marketSnapshot().feedValidated,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {reviewOneMinuteRejectionProof} from '../sentinel-trading-lab/agent/src/core/one-minute-rejection-admission.mjs';
import {reviewPreEntryRisk} from '../sentinel-trading-lab/agent/src/core/pre-entry-risk-review.mjs';
import {reviewH207UnifiedAdmission} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';

const AT=1800000000000,LEVEL=1.10038;
const prices=[1.10000,1.10001,1.100025,1.10003,1.10005,1.10007,1.10008,
 1.10010,1.10012,1.10020,1.10029,LEVEL,1.100365,1.10034];
const quotes=prices.map((price,i)=>{
 const ts=AT-(prices.length-1-i)*1000;
 return{ts,receivedAt:ts,price};
});
// All levels are derived from actual CLOSED 1-minute historical OHLC,
// not hand-written maps. Four independent old resistance tests, each
// followed by a closed candle on the other side.
const candles=Array.from({length:65},(_,i)=>{
 const to=AT-(65-i)*60000,from=to-60000;
 const resistance=[10,25,40,55].includes(i);
 const open=1.10001+(i%4)*.000006,close=1.09999+(i%5)*.000005;
 const high=resistance?LEVEL:1.100105+(i%3)*.000005;
 const low=1.09980-(i%2)*.000004;
 return{from,to,receivedAt:to,open,close,high,low};
});
const structure=historicalPriceStructure({candles,now:AT});
const map=structure.candleLevelMap;
const resistance=map.levels.filter(z=>z.resistancePivots>=1&&z.resistanceRejections>=2&&z.independentTests>=2);
test('240: real completed candles establish old resistance needed for early 1m reversal',()=>{
 assert.equal(structure.candles,65);
 assert.ok(map.observedCandles>=20);
 assert.ok(resistance.length>0,JSON.stringify(map.levels.map(z=>({
  low:z.low,high:z.high,pivots:z.resistancePivots,rejections:z.resistanceRejections,
  tests:z.independentTests
 }))));
 assert.ok(resistance.some(z=>quotes[11].price>=z.low-map.tolerance*.55&&
  quotes[11].price<=z.high+map.tolerance*.55));
});
test('240: a green current candle can produce an actual PUT through the shared 1m engine',()=>{
 assert.ok(quotes.at(-1).price>quotes[0].price,'current forming leg remains green');
 const decision=analyzeNowOpportunity({quoteHistory:quotes,quoteAt:AT,now:AT,
  price:quotes.at(-1).price,durationMs:60000,engineId:'automatic',
  qualityPolicy:'adaptive-market-v17',entryFamily:'automatic',candles,
  structureCache:{get:()=>structure}});
 assert.equal(decision.ready,true,JSON.stringify(decision));
 assert.equal(decision.side,'PUT',JSON.stringify(decision));
 assert.ok(['confirmed-level-structure-reversal','multiscale-candle-rejection',
  'historical-level-rejection'].includes(decision.reason),
  'an earlier independently observed rejection may legitimately outrank the first-wave route');
 const context={quoteHistory:quotes,quoteAt:AT,now:AT,price:quotes.at(-1).price,
  durationMs:60000};
 const afterRisk=reviewPreEntryRisk({candidate:decision,original:decision,
  candles,structure,...context});
 assert.equal(afterRisk.ready,true,JSON.stringify(afterRisk));
 const afterOneMinute=reviewOneMinuteRejectionProof({candidate:afterRisk,
  original:decision,...context});
 assert.equal(afterOneMinute.ready,true,JSON.stringify(afterOneMinute));
 const final=reviewH207UnifiedAdmission({candidate:afterOneMinute,
  allowVerifiedEarlyReversal:true,...context});
 assert.equal(final.ready,true,JSON.stringify(final));
 assert.equal(final.side,'PUT');
 assert.match(marketReading({phase:'reversal-confirmed',candidate:final}),/REVERSÃO CONFIRMADA.*PUT/);
});
test('240: full 30s route also permits a confirmed contrary first turn without modifying expiry',()=>{
 const decision=analyzeNowOpportunity({quoteHistory:quotes,quoteAt:AT,now:AT,
  price:quotes.at(-1).price,durationMs:30000,engineId:'automatic',
  qualityPolicy:'adaptive-market-v17',entryFamily:'automatic',candles,
  structureCache:{get:()=>structure}});
 assert.equal(decision.ready,true,JSON.stringify(decision));
 assert.equal(decision.side,'PUT',JSON.stringify(decision));
});

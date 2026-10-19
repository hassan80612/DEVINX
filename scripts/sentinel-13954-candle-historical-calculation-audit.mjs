// Structural forensics on Sentinel production 13.9.54. Pure simulation;
 // never modifies broker or production. Illustrates the exact invariants
 // that a historical detector should satisfy using controlled price paths.
import {historicalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {currentStrategyEvidence} from '../sentinel-trading-lab/agent/src/core/now-strategy-evidence.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const NOW=1792400000000;

const candle=(from,period,open,close= open,high=Math.max(open,close)+.001,low=Math.min(open,close)-.001)=>
 ({from,to:from+period,open,close,high,low,receivedAt:from+period});
const oldest=NOW-3600000;
const slow=Array.from({length:40},(_,i)=>candle(oldest+i*60000,60000,1.10+i*.000002));
const fresh=Array.from({length:12},(_,i)=>candle(NOW-(12-i)*5000,5000,1.18+i*.000004));
const mixed=historicalPriceStructure({candles:[...slow,...fresh],now:NOW});
const freshOnly=historicalPriceStructure({candles:fresh,now:NOW});
const oldOnly=historicalPriceStructure({candles:slow,now:NOW});
const staggered=Array.from({length:8},(_,i)=>candle(NOW-(8-i)*60000,60000,1.12+i*.0001));
staggered[7]={...staggered[7],high:1.99};
const terminal=historicalPriceStructure({candles:staggered,now:NOW});
const lastZone=terminal.zones.find(z=>Math.abs(z.level-1.99)<.0000001);

// The close/price in the very last 1-second candle can be based on a
// single observed tick. Count those candles as though final to measure
// whether 2-of-3 direction confirmations could be contributed by it.
const quotes=[];
for(let i=0;i<19;i++){
 const price=i<16?1.2-i*.00001:1.19980+(i-16)*.00001;
 quotes.push({ts:NOW-(19-i)*1000,price,receivedAt:NOW-(19-i)*1000});
}
const beforeCurrentMicrobar=currentStrategyEvidence({quotes,quoteAt:quotes.at(-1).ts,
 price:quotes.at(-1).price,engineId:'trend'});
quotes.push({ts:NOW+100,price:1.2003,receivedAt:NOW+100});
const afterCurrentMicrobar=currentStrategyEvidence({quotes,quoteAt:quotes.at(-1).ts,
 price:quotes.at(-1).price,engineId:'trend'});
const lastCandleReceivedTicks=quotes.filter(x=>Math.floor(x.ts/1000)===Math.floor(quotes.at(-1).ts/1000)).length;
const output={
 historicalTimeframeChoice:{
  recentSeriesPeriodMs:freshOnly.periodMs,recentSeriesLastAt:freshOnly.asOf,
  mixedChosenPeriodMs:mixed.periodMs,mixedChosenAsOf:mixed.asOf,
  olderSeriesPeriodMs:oldOnly.periodMs,olderSeriesLastAt:oldOnly.asOf,
  mixedMatchesOlderRatherThanMostRecent:mixed.periodMs===oldOnly.periodMs&&mixed.asOf===oldOnly.asOf,
  staleByMs:NOW-mixed.asOf
 },
 terminalPivot:{
  candleNumber:8,latestHigh:1.99,
  zonePivots:lastZone?.pivots??null,
  actualConfirmedPivots:lastZone?.confirmedPivots??null,
  isTerminus:terminal.asOf===NOW,
  noForwardClosedCandleToConfirm:true
 },
 technicalInference:{
  beforeCurrentOneTick:{side:beforeCurrentMicrobar.side,ready:beforeCurrentMicrobar.ready,reason:beforeCurrentMicrobar.reason},
  afterCurrentOneTick:{side:afterCurrentMicrobar.side,ready:afterCurrentMicrobar.ready,reason:afterCurrentMicrobar.reason},
  oneTickLastSecondCandle:lastCandleReceivedTicks===1,
  lastSecondBarComplete:false,
  interpretation:'Manual trend strategy can count an observed single tick from the still-forming current 1-second candle in its 4-bar confirmation.'
 },
 constraints:'Controlled synthetic inputs, not real broker signal outcomes. No production changes.'
};
console.log('SENTINEL_CANDLE_AUDIT='+JSON.stringify(output));

import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {HistoricalPriceStructureCache} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
import {structuralCandleInput} from '../experiments/verified-candle-source-20261017.mjs';
import {nativeCandleFixture,CANDLE_T,candlePrice} from '../tests/fixtures/sentinel-native-candle-collision-20261017.mjs';
const fixture=nativeCandleFixture(),cases=[{name:'100-native-1m-plus-20-native-5m',snap:{candles:fixture.live.candles,predictionCandles:fixture.live.predictionCandles,historicalCandlesVerified:true}}];
const preserved=[];
for(const period of [60,120,180,300,600,900,1800,3600])for(let i=240;i>0;i--){
 const from=CANDLE_T/1000-i*period,to=from+period,open=candlePrice(from-CANDLE_T/1000),close=candlePrice(to-CANDLE_T/1000);
 preserved.push({from,to,open,close,low:Math.min(open,close)-.00001,high:Math.max(open,close)+.00001});
}
const merged=new Map(preserved.map(c=>[c.from,c]));
cases.push({name:'bounded-eight-period-pool',snap:{candles:[...merged.values()].sort((a,b)=>a.from-b.from).slice(-400),predictionCandles:preserved,historicalCandlesVerified:true}});
const results=[];
for(const {name,snap} of cases){
 const caches=[new HistoricalPriceStructureCache(),new HistoricalPriceStructureCache()],times=[[],[]];
 for(let i=0;i<220;i++)for(const n of i%2?[1,0]:[0,1]){
  const start=performance.now();const candles=n?structuralCandleInput(snap):snap.candles;
  caches[n].get({candles,now:CANDLE_T,context:'iq_option|EUR/USD|30000'});
  if(i>=20)times[n].push(performance.now()-start);
 }
 const percentile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length*p)];
 results.push({name,currentRows:snap.candles.length,preservedRows:snap.predictionCandles.length,
  timings:times.map(xs=>({medianMs:percentile(xs,.5),p95Ms:percentile(xs,.95)}))});
}
const report={purpose:'Interleaved component-only cached structural-context cost; not Windows/browser latency, FPS or entry timing.',results};
writeFileSync(new URL('../reports/sentinel-candle-source-cost-20261017.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));

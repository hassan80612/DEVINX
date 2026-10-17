import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {runtimeMarketFromLive} from '../sentinel-trading-lab/agent/worker/runtime-market.mjs';
import {synthetic,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
import {candleSourceResearchRuntime} from '../experiments/candle-source-research-runtime-20261017.mjs';
import {nativeCandleFixture,CANDLE_T} from '../tests/fixtures/sentinel-native-candle-collision-20261017.mjs';
const {DemoTradingRuntime:Candidate,cleanup}=await candleSourceResearchRuntime(),realNow=Date.now;
const results=[];
const make=Runtime=>new Runtime({enableVNext:true,forecastModel:'now-structural-v1'});
function entry(v,quotes){const e=v.futureEntryAnchor;if(!e?.entryReadyNow)return null;
 const exit=quotes.find(q=>q.ts>=e.exitAt&&q.ts<=e.exitAt+1000),d=exit?exit.price-e.entryPrice:null;
 return {at:e.entryAt,side:e.side,price:e.entryPrice,dueAt:e.exitAt,
  result:d==null?'missing':d===0?'tie':(d>0?'CALL':'PUT')===e.side?'win':'loss'};
}
try{
 for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url))),rs=[make(Released),make(Candidate)],entries=[[],[]];let mismatches=0;
  for(let i=0;i<f.quoteHistory.length;i++){
   const q=f.quoteHistory[i],quoteHistory=f.quoteHistory.slice(0,i+1);Date.now=()=>q.ts;const seen=[];
   for(let n=0;n<2;n++){
    const r=rs[n],settings={...r.settings,asset:f.asset},snap={provider:'iq_option',quoteHistory,quoteTs:q.ts,price:q.price};
    const v=r._signalValidationGate({analysis:{asset:f.asset},snap,settings,now:q.ts}).analysis.vnext;
    seen.push([v.nowObservation.ready,v.nowObservation.side,v.nowObservation.reason]);
    const e=entry(v,f.quoteHistory);if(e)entries[n].push(e);
   }
   if(JSON.stringify(seen[0])!==JSON.stringify(seen[1]))mismatches++;
  }
  const result={kind:'known-video-no-native-OHLC',file,mismatches,sameEntries:JSON.stringify(entries[0])===JSON.stringify(entries[1]),metrics:entries.map(metrics),entries};results.push(result);
  console.log(JSON.stringify({...result,entries:undefined}));
 }
 for(const family of ['variable-range','sharp-turns','trend-switch']){
  const data=synthetic(family,2026101771),candles=data.candles,T=data.targets[0].ts;
  const large=[];
  for(let i=0;i+4<candles.length;i+=5){const cs=candles.slice(i,i+5);large.push({from:cs[0].from,to:cs.at(-1).to,open:cs[0].open,close:cs.at(-1).close,high:Math.max(...cs.map(c=>c.high)),low:Math.min(...cs.map(c=>c.low))});}
  const driver=new LocalPlaywrightDriver(),s=driver.state('iq_option');s.activeId=1;s.candleActiveId=1;s.symbol='EUR/USD';
  s.quote=data.targets[0].price;s.lastQuoteAt=T;s.quoteHistory=data.quotes.filter(q=>q.ts>=T-180000&&q.ts<=T);
  Date.now=()=>T;
  driver.ingest('iq_option',{name:'candles',msg:{active_id:1,candles:candles.filter(c=>c.to*1000<=T)}},'direct-in');
  driver.ingest('iq_option',{name:'candles',msg:{active_id:1,candles:large.filter(c=>c.to*1000<=T)}},'direct-in');
  const rs=[make(Released),make(Released),make(Candidate)],entries=rs.map(()=>[]),snapshots=[];let oracleMismatches=0,cacheMismatches=0;
  for(const q of data.targets){
   Date.now=()=>q.ts;
   driver.ingest('iq_option',{name:'quote-generated',msg:{active_id:1,price:q.price,time:q.ts/1000}},'direct-in');
   if(q.ts>T){
    for(const list of [candles,large]){const closed=list.find(c=>c.to*1000===q.ts);if(closed)driver.ingest('iq_option',{name:'candles',msg:{active_id:1,candles:[closed]}},'direct-in');}
   }
   const market=runtimeMarketFromLive('iq_option',driver.liveStatus('iq_option'),'EUR/USD'),seen=[];
   const native=candles.filter(c=>c.to*1000<=q.ts).slice(-100);
   for(let n=0;n<rs.length;n++){
    const r=rs[n];r.setExternalMarket(n===1?{...market,candles:native}:market);
    const v=r._signalValidationGate({analysis:{asset:'EUR/USD'},snap:r._marketSnapshot(),settings:r.settings,now:q.ts}).analysis.vnext;
    seen.push([v.nowObservation.ready,v.nowObservation.side,v.nowObservation.reason]);
    const e=entry(v,data.quotes);if(e)entries[n].push(e);
   }
   if(JSON.stringify(seen[1])!==JSON.stringify(seen[2]))oracleMismatches++;
   if(JSON.stringify(rs[1].structureCache.value)!==JSON.stringify(rs[2].structureCache.value))cacheMismatches++;
   if((q.ts-T)%300000===0)snapshots.push({at:q.ts,legacyCount:rs[0].structureCache.value?.candles,referenceCount:rs[1].structureCache.value?.candles,candidateCount:rs[2].structureCache.value?.candles});
  }
  const result={kind:'synthetic-protocol-integrity-not-live-accuracy',family,seed:2026101771,
   variants:['released-collided-input','released-native-single-period-reference','candidate-preserved-input'],
   oracleMismatches,cacheMismatches,candidateMatchesReferenceEntries:JSON.stringify(entries[1])===JSON.stringify(entries[2]),
   metrics:entries.map(metrics),snapshots,entries};results.push(result);console.log(JSON.stringify({...result,entries:undefined}));
 }
 const f=nativeCandleFixture();
 results.push({kind:'static-protocol-collision',receivedOneMinute:f.small.length,receivedFiveMinute:f.large.length,
  legacyOneMinute:f.live.candles.filter(c=>c.to-c.from===60).length,preservedOneMinute:f.live.predictionCandles.filter(c=>c.to-c.from===60).length});
}finally{Date.now=realNow;cleanup();}
const report={baseCommit:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',
 purpose:'Restore the already received native candle base without new requests, extra collection or a direction heuristic. Correct data source does not prove higher live accuracy.',
 results};
writeFileSync(new URL('../reports/sentinel-candle-source-audit-20261017.json',import.meta.url),JSON.stringify(report,null,2)+'\n');

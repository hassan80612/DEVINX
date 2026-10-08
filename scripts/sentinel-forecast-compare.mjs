import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeReplayFrame} from '../sentinel-trading-lab/agent/worker/replay.mjs';
// No parameter search: compare the two implementations on the same received
// prices, freeze each forecast, then score its own expiration. Never trades.
export function compareForecastSnapshot(snapshot,{horizons=[30,60]}={}){
 const end=Number(snapshot.now),quotes=snapshot.quoteHistory.filter(q=>q.ts<=end).sort((a,b)=>a.ts-b.ts),start=quotes[0]?.ts;
 const result={},durations=[];
 for(const seconds of horizons){
  const before=new DemoTradingRuntime({predictionModel:'legacy'}),after=new DemoTradingRuntime();
  for(const r of [before,after])Object.assign(r.settings,{asset:'RECORDED',strategy:'trend',orderDurationMs:seconds*1000,forecastHorizonSeconds:seconds});
  const rows=[];
  for(let ts=start;ts+seconds*1000<=end;ts+=seconds*1000){
   const received=quotes.filter(q=>q.ts<=ts),q=received.at(-1),settlement=quotes.filter(q=>Math.abs(q.ts-ts-seconds*1000)<=1500).sort((a,b)=>Math.abs(a.ts-ts-seconds*1000)-Math.abs(b.ts-ts-seconds*1000))[0];
   if(!q||!settlement||ts-q.ts>1500)continue;
   // Every included OHLC bar had closed before this prediction.
   const snap={candles:snapshot.candles.filter(c=>Number(c.to)*1000<=ts),quoteHistory:received,quoteTs:q.ts,price:q.price,provider:'recorded',source:'RECORDED'};
   const t=performance.now(),a=analyzeReplayFrame(before,snap,ts),b=analyzeReplayFrame(after,snap,ts);durations.push(performance.now()-t);
   const old=a.entryPlanner?.horizons?.[seconds],next=b.entryPlanner?.horizons?.[seconds];
   if(!old?.outlookReady||!next?.outlookReady)continue;
   const delta=settlement.price-q.price;if(Math.abs(delta)<=q.price*1e-10)continue;
   const y=delta>0?1:0,control=old.unlearnedCallProbability/100,trial=next.unlearnedCallProbability/100;
   rows.push({at:ts,settledAt:settlement.ts,y,control,trial,controlWon:(control>=.5)===(y===1),trialWon:(trial>=.5)===(y===1)});
  }
  const score=prefix=>({wins:rows.filter(r=>r[prefix+'Won']).length,brier:rows.length?rows.reduce((v,r)=>v+(r[prefix]-r.y)**2,0)/rows.length:null});
  result[seconds]={samples:rows.length,control:score('control'),trial:score('trial'),rows};
 }
 return {horizons:result,frameMs:{max:Math.max(0,...durations),count:durations.length},note:'Comparação técnica de previsões em preços gravados. Amostra curta; não comprova melhora de acerto em operações e não ajusta os pesos.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const path=process.argv[2]||'tests/fixtures/sentinel-continuation-prices.json';
 console.log(JSON.stringify(compareForecastSnapshot(JSON.parse(await readFile(path,'utf8'))),null,2));
}

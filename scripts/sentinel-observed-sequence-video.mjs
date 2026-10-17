// Same video, current-entry replay; no manufactured pre-video OHLC history.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {DemoTradingRuntime as CandidateRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
if(!process.argv[2])throw Error('Pass absolute production core directory');
const {DemoTradingRuntime:ProductionRuntime}=await import(pathToFileURL(process.argv[2]+'/runtime.mjs'));
const results=[];
for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
 const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url))),rows=fixture.quoteHistory;
 const output=[];
 for(const [name,Runtime] of [['production33',ProductionRuntime],['candidate',CandidateRuntime]]){
  const runtime=new Runtime({enableVNext:true,forecastModel:'now-structural-v1'}),entries=[];
  const settings={...runtime.settings,engine:'fibonacci_retest',asset:'EUR/GBP OTC',orderDurationMs:30000};
  for(let i=0;i<rows.length;i++){
   const q=rows[i],v=runtime._signalValidationGate({analysis:{asset:settings.asset},settings,now:q.ts,
    snap:{provider:'iq_option',quoteHistory:rows.slice(0,i+1),price:q.price,quoteTs:q.ts}}).analysis.vnext;
   const entry=v.futureEntryAnchor;if(!entry?.entryReadyNow)continue;
   const exit=rows.find(x=>x.ts>=entry.exitAt&&x.ts<=entry.exitAt+1000),delta=exit?exit.price-entry.entryPrice:null;
   entries.push({at:entry.entryAt,side:entry.side,price:entry.entryPrice,exitAt:entry.exitAt,
    result:delta==null?'missing':delta===0?'tie':(delta>0?'CALL':'PUT')===entry.side?'win':'loss'});
  }
  output.push({name,counts:Object.fromEntries(['win','loss','tie','missing'].map(k=>[k,entries.filter(e=>e.result===k).length])),entries});
 }
 const same=JSON.stringify(output[0].entries)===JSON.stringify(output[1].entries);
 results.push({file,sourceSha256:fixture.sourceSha256,historicalCandlesAvailable:false,identicalEntries:same,output});
 console.log(file,JSON.stringify({same,counts:output.map(o=>[o.name,o.counts])}));
}
writeFileSync(new URL('../reports/sentinel-sustainability-video-20261017.json',import.meta.url),JSON.stringify({
 purpose:'Retrospective comparison on the same previously used video; no unseen pre-video candles reconstructed.',results},null,2)+'\n');

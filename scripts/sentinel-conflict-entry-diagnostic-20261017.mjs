import {readFileSync,writeFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const f=JSON.parse(readFileSync(new URL('../tests/fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url)));
const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'}),results=[];
const settings={...r.settings,engine:'automatic',asset:f.asset,orderDurationMs:30000};
for(let i=0;i<f.quoteHistory.length;i++){
 const q=f.quoteHistory[i],quoteHistory=f.quoteHistory.slice(0,i+1);
 const input={quoteHistory,quoteAt:q.ts,price:q.price,now:q.ts,durationMs:30000,engineId:'automatic'};
 const v=r._signalValidationGate({analysis:{asset:f.asset},settings,now:q.ts,
  snap:{provider:'iq_option',quoteHistory,quoteTs:q.ts,price:q.price}}).analysis.vnext;
 const e=v.futureEntryAnchor;
 if(!e?.entryReadyNow)continue;
 const structural=analyzeNowOpportunity({...input,qualityPolicy:'adaptive-market-v1'});
 const exit=f.quoteHistory.find(p=>p.ts>=e.exitAt&&p.ts<=e.exitAt+1000);
 const actual=!exit?null:exit.price===e.entryPrice?'tie':exit.price>e.entryPrice?'CALL':'PUT';
 results.push({at:q.ts,videoSecond:(q.ts-f.quoteHistory[0].ts)/1000,
  selected:e.side,selectedCorrect:actual&&actual!=='tie'?e.side===actual:null,
  structural:{side:structural.side,ready:structural.ready,reason:structural.reason,strength:structural.strength},
  structuralCorrect:actual&&actual!=='tie'&&structural.ready?structural.side===actual:null});
}
const report={purpose:'Counterfactual at exactly the baseline entry timestamps; not a changed-policy replay or live accuracy.',results};
writeFileSync(new URL('../reports/sentinel-conflict-entry-diagnostic-20261017.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));

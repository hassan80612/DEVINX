import {readFileSync,writeFileSync} from 'node:fs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {CompletedOutcomeSelector} from './completed-outcome-selector.mjs';
import {wideBandCycleForecast} from './wide-band-expiry-direction.mjs';
const result={scope:'Two OCR readings of the SAME user video; not independent market validation. No quotes interpolated.',fixtures:{}};
for(const file of ['sentinel-user-video-20261016.json','sentinel-user-video-broker-6dp-20261016.json']){
 const rows=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url))).quoteHistory;
 const selector=new CompletedOutcomeSelector(),bandSelector=new CompletedOutcomeSelector(),states={},entries={published_13928:[],completed_selector:[],wide_band:[],wide_selector:[]};
 for(let i=0;i<rows.length;i++){
  const q=rows[i],history=rows.slice(0,i+1),base=analyzeNowOpportunity({quoteHistory:history,quoteAt:q.ts,
   price:q.price,now:q.ts,durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'});
  const choice=selector.observe({rows:history,now:q.ts,price:q.price,base});
  const wide=base.ready?wideBandCycleForecast({quoteHistory:history,quoteAt:q.ts,price:q.price,now:q.ts,durationMs:30000}):null;
  const wideChoice=wide?.ready?{...base,...wide}:base;
  const bandChoice=bandSelector.observe({rows:history,now:q.ts,price:q.price,base,alternative:wideChoice});
  for(const [name,candidate]of [['published_13928',base],['completed_selector',choice],['wide_band',wideChoice],['wide_selector',bandChoice]]){
   const next=advanceNowOpportunity({previous:states[name],candidate,now:q.ts,quoteAt:q.ts,asset:'OBSERVED',engineId:'automatic',durationMs:30000});
   if(next.phase==='fired'&&next.entryTriggeredAt!==states[name]?.entryTriggeredAt){
    const exit=rows.find(x=>x.ts>=next.exitAt&&x.ts<=next.exitAt+1000);
    const outcome=!exit?'unknown':exit.price===next.entryPrice?'ties':(exit.price>next.entryPrice?'CALL':'PUT')===next.side?'wins':'losses';
    entries[name].push({at:q.ts,side:next.side,outcome,selected:candidate.researchSelected||'base'});
   }
   states[name]=next;
  }
 }
 const models={};
 for(const [name,values]of Object.entries(entries)){
  const r={signals:values.length,wins:0,losses:0,ties:0,unknown:0,maxLossStreak:0};let streak=0;
  for(const e of values){r[e.outcome]++;streak=e.outcome==='losses'?streak+1:0;r.maxLossStreak=Math.max(r.maxLossStreak,streak);}
  r.rate=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;models[name]={...r,entries:values};
 }
 for(const [name,values]of Object.entries(entries))if(JSON.stringify(entries.published_13928.map(e=>e.at))!==JSON.stringify(values.map(e=>e.at)))throw Error('Changed entry admission: '+name);
 result.fixtures[file]=models;
}
writeFileSync('reports/sentinel-fast-model-video-20261016.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));

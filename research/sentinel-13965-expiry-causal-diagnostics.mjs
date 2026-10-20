// Causal forensic replay of a previously observed broker-price video.
// This is NOT a test of actual executed orders or the user's lost account.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {DirectionDisagreementEvidence} from '../sentinel-trading-lab/agent/src/core/direction-disagreement-evidence.mjs';

const outcome=(at,until,side)=>!at||!until?'UNKNOWN':at.price===until.price?'TIE':
 ((until.price>at.price?'CALL':'PUT')===side?'WIN':'LOSS');
const percent=(p,q)=>!p||!q?null:+((q.price/p.price-1)*100).toFixed(5);
function replay(data,label,engine='automatic'){
 const rows=data.quoteHistory.map(r=>({ts:Number(r.ts),price:Number(r.price),receivedAt:Number(r.receivedAt??r.ts)}));
 const selector=new CompletedExpiryDirection(),arbiter=new DirectionDisagreementEvidence();
 let prev=null,entries=[];
 const tickAt=(time,max=1500)=>rows.find(q=>q.ts>=time&&q.ts<=time+max)??null;
 const before=(time,max=2500)=>{for(let j=rows.length-1;j>=0;j--)if(rows[j].ts<=time&&time-rows[j].ts<=max)return rows[j];return null;};
 for(let i=0;i<rows.length;i++){
  const q=rows[i],history=rows.slice(0,i+1);
  const args={quoteHistory:history,price:q.price,quoteAt:q.ts,now:q.ts,
    durationMs:30000,engineId:engine,qualityPolicy:'adaptive-market-v17',
    expiryDirectionSelector:selector,directionDisagreement:arbiter,
    expiryDirectionContext:'iq_option|EUR/GBP OTC|30000'};
  const current=analyzeNowOpportunity(args);
  const next=advanceNowOpportunity({previous:prev,candidate:current,now:q.ts,quoteAt:q.ts,
   asset:'EUR/GBP OTC',provider:'iq_option',engineId:engine,durationMs:30000});
  if(next.phase==='fired'&&next.entryTriggeredAt!==prev?.entryTriggeredAt){
   const early=analyzeNowOpportunity({...args,qualityPolicy:'adaptive-market-v1',
    expiryDirectionSelector:null,directionDisagreement:null});
   const start=before(q.ts-30000),medium=before(q.ts-10000),veryRecent=before(q.ts-3000);
   const priorMove=percent(start,q);
   const shortMove=percent(veryRecent,q);
   const trend30=priorMove==null?null:priorMove>0?'CALL':priorMove<0?'PUT':null;
   const momentum3=shortMove==null?null:shortMove>0?'CALL':shortMove<0?'PUT':null;
   const lagResults={};
   for(const lag of [0,500,1000,2000,3000,5000]){
    const startQuote=lag===0?q:tickAt(q.ts+lag);
    const expiryQuote=startQuote?tickAt(startQuote.ts+30000):null;
    const result=outcome(startQuote,expiryQuote,next.side);
    lagResults[lag]={result,entryDeltaMs:startQuote?startQuote.ts-q.ts:null,entryPrice:startQuote?.price??null,
     exitDeltaMs:expiryQuote?expiryQuote.ts-(startQuote.ts+30000):null};
   }
   const exit=lagResults[0].result;
   entries.push({time:new Date(q.ts).toISOString(),at:q.ts,side:next.side,
    reason:current.reason,structuralReady:early.ready,structuralSide:early.side,
    selectedAgainstStructure:early.ready&&early.side!==next.side,
    trend30,momentum3,priorMove,shortMove,
    price:q.price,expiryPrice:tickAt(q.ts+30000)?.price??null,
    result:exit,lags:lagResults});
  }
  prev=next;
 }
 const report={dataset:label,engine,signals:entries.length,trainedOutcomes:selector.completed,
  disagreementOutcomes:arbiter.scored.length,
  byLatency:{},byDirection:{},byReason:{},byMomentum:{},byTrend:{},byStructure:{},details:entries};
 const aggregate=values=>{const s={WIN:0,LOSS:0,TIE:0,UNKNOWN:0};
  values.forEach(v=>{s[v]=(s[v]||0)+1});const n=s.WIN+s.LOSS;
  return {...s,rate:n?+(100*s.WIN/n).toFixed(1):null,netAt80:s.WIN*.8-s.LOSS};};
 for(const lag of [0,500,1000,2000,3000,5000])
  report.byLatency[lag]=aggregate(entries.map(e=>e.lags[lag].result));
 const group=(key,labelFn)=>{
  const m={};for(const e of entries){const k=String(labelFn(e)??'unknown');(m[k]??=[]).push(e.result);}
  report[key]=Object.fromEntries(Object.entries(m).map(([k,v])=>[k,aggregate(v)]));
 };
 group('byDirection',e=>e.side);group('byReason',e=>e.reason);
 group('byMomentum',e=>e.momentum3==null?'no-history':e.momentum3===e.side?'aligned':'contrary');
 group('byTrend',e=>e.trend30==null?'no-history':e.trend30===e.side?'aligned':'contrary');
 group('byStructure',e=>!e.structuralReady?'structural-wait':e.selectedAgainstStructure?'opposite':'aligned');
 return report;
}
for(const name of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
 const data=JSON.parse(readFileSync(new URL('../tests/fixtures/'+name,import.meta.url),'utf8'));
 for(const engine of [...new Set(['automatic',data.engineId,'trend','mean_reversion','support_resistance','smart_confluence'])].filter(Boolean)){
 const r=replay(data,name,engine);
 console.log('DIAG_SUMMARY '+JSON.stringify({...r,details:undefined}));
 const n=r.details.length;for(const [label,entries] of [['firstHalf',r.details.slice(0,Math.floor(n/2))],['secondHalf',r.details.slice(Math.floor(n/2))]]){let wins=0,losses=0,ties=0,unknown=0;for(const e of entries){if(e.result==='WIN')wins++;else if(e.result==='LOSS')losses++;else if(e.result==='TIE')ties++;else unknown++;}console.log('DIAG_SPLIT '+JSON.stringify({dataset:name,engine,segment:label,n:entries.length,wins,losses,ties,unknown,netAt80:+(wins*.8-losses).toFixed(2)}));}
 if(engine!=='automatic'&&engine!==data.engineId)continue;
 for(const e of r.details)console.log('DIAG_TRADE '+JSON.stringify({
  dataset:name,time:e.time,side:e.side,reason:e.reason,structuralReady:e.structuralReady,
  structuralSide:e.structuralSide,trend30:e.trend30,momentum3:e.momentum3,priorMove:e.priorMove,
  shortMove:e.shortMove,price:e.price,expiryPrice:e.expiryPrice,
  result:e.result,lag1s:e.lags[1000].result,lag2s:e.lags[2000].result,lag3s:e.lags[3000].result}));
 }
}

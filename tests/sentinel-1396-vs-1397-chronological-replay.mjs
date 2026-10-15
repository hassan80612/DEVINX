// Compare the EXACT historical 13.9.6 runtime with the 13.9.7 runtime.
// No live broker trade is placed; this measures quote-based simulated outcomes.
// GitHub Actions checks out 13.9.6 source in baseline1396.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DemoTradingRuntime as Runtime1397} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

const basePath=resolve('baseline1396/sentinel-trading-lab/agent/src/core/runtime.mjs');
const {DemoTradingRuntime:Runtime1396}=await import(pathToFileURL(basePath));
const RECORDED=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url),'utf8'));
const DAY=Date.UTC(2026,9,1,0,0,0,0);
const ASSET='REPLAY/TEST';
const kinds=['rise','fall','range','reversal','choppy'];
const durationList=[30000,60000];
const sign=s=>s==='CALL'?1:s==='PUT'?-1:0;

function series(kind,length=540,stepMs=1000){
 const data=[];
 let base=Math.log(1.082);
 for(let i=0;i<length;i++){
  const time=i*stepMs;
  const drift=kind==='rise'?i*.000011:kind==='fall'?-i*.000011:
    kind==='reversal'?(i<270?i*.000011:270*.000011-(i-270)*.000020):0;
  const periodic=kind==='range'?.00068*Math.sin(i*2*Math.PI/48):
    kind==='choppy'?.00064*(Math.sin(i*2*Math.PI/37)+.35*Math.sin(i*2*Math.PI/17)):0;
  const micro=.000009*Math.sin(i*1.73)+.000006*Math.cos(i*.45);
  const ts=DAY+time;
  data.push({ts,receivedAt:ts,price:Number(Math.exp(base+drift+periodic+micro).toPrecision(12))});
 }
 return data;
}
function outcomeAt(quotes,signal){
 // The first real (historical or simulated) source quote within 1000ms of
 // the recorded expiry, never a model projected price.
 const point=quotes.find(x=>x.ts>=signal.exitAt&&x.ts<=signal.exitAt+1000);
 if(!point)return {status:'missing'};
 const movement=sign(signal.side)*(point.price-signal.entryPrice);
 return {status:movement>0?'win':movement<0?'loss':'tie',exitPrice:point.price};
}
function snapshot(history){
 const q=history.at(-1);
 return {
  quoteTs:q.ts,price:q.price,quoteHistory:history,candles:[],
  provider:'iq_option',instrument:'digital',asset:ASSET,
  balance:1000,feedValidated:true,brokerExpirationConfidence:0,
  brokerExpirationDurationMs:null,brokerTiming:null,
  mode:'demo'
 };
}
function make(Runtime,model,durationMs){
 const runtime=new Runtime({enableVNext:true,forecastModel:model});
 runtime.settings.engine='automatic';
 runtime.settings.asset=ASSET;
 runtime.settings.forecastMode='continuous';
 runtime.settings.orderDurationMs=durationMs;
 runtime.settings.forecastHorizonSeconds=durationMs/1000;
 return runtime;
}
async function replay(Runtime,model,quotes,durationMs){
 const runtime=make(Runtime,model,durationMs);
 const signals=[],phaseCounts={};
 let firstForecastAt=null,lastError=null;
 for(let i=0;i<quotes.length;i++){
  // Historical information is strictly bounded at observation i.
  const history=quotes.slice(0,i+1),now=history.at(-1).ts;
  const snap=snapshot(history);
  try{
   const r=runtime._signalValidationGate({analysis:{asset:ASSET},snap,settings:runtime.settings,now});
   const forecast=r?.analysis?.vnext;
   if(forecast?.receipt&&firstForecastAt===null)firstForecastAt=now;
   const opportunity=runtime.vnextWindowState;
   const phase=opportunity?.phase||'none';
   phaseCounts[phase]=(phaseCounts[phase]||0)+1;
   if(phase==='fired'&&Number(opportunity.entryTriggeredAt)>0&&
       !signals.some(s=>s.at===opportunity.entryTriggeredAt)){
    const at=Number(opportunity.entryTriggeredAt);
    // A signal must have a known, actually observed market price at decision.
    // Use the exact source quote for BOTH models, never a projected entry price.
    signals.push({at,side:opportunity.side,entryPrice:
      Number(snap.price),
      exitAt:Number(opportunity.exitAt),plannedEntryAt:Number(opportunity.plannedEntryAt||at)});
   }
  }catch(e){
   lastError=String(e?.stack||e);
   break;
  }
 }
 const scored=signals.map(s=>({...s,...outcomeAt(quotes,s)}));
 const completed=scored.filter(s=>s.status==='win'||s.status==='loss');
 const wins=completed.filter(s=>s.status==='win').length;
 const losses=completed.length-wins;
 const untimed=scored.filter(s=>s.status==='missing').length;
 const ties=scored.filter(s=>s.status==='tie').length;
 const overlapping=signals.filter((s,i)=>i>0&&s.at<signals[i-1].exitAt).length;
 return {model,signals:signals.length,completed:completed.length,wins,losses,ties,unverified:untimed,
  winRate:completed.length?Number((100*wins/completed.length).toFixed(1)):null,
  overlaps:overlapping,phaseCounts,firstForecastAt,
  firstSignalAt:signals[0]?.at||null,signalExamples:scored.slice(0,5),
  error:lastError};
}
const cases=[{kind:'recorded-180sec-down',series:RECORDED.quoteHistory,durationMs:30000}];
for(const kind of kinds)for(const durationMs of durationList)
 cases.push({kind:'synthetic-'+kind,series:series(kind),durationMs});
const results=[];
for(const c of cases){
 const old=await replay(Runtime1396,'causal-closed-structure-1379',c.series,c.durationMs);
 const current=await replay(Runtime1397,'now-structural-v1',c.series,c.durationMs);
 const row={
  case:c.kind,source:c.kind.startsWith('synthetic-')?'synthetic-deterministic':'recorded-quote-fixture',
  quotes:c.series.length,spanSeconds:Number(((c.series.at(-1).ts-c.series[0].ts)/1000).toFixed(2)),
  expirySeconds:c.durationMs/1000,v1396:old,v1397:current
 };
 console.log('COMPARE_CASE '+JSON.stringify(row));
 results.push(row);
}
const total=(key,scope)=>results.filter(r=>scope==='all'||r.source===scope).reduce((z,r)=>{
 const a=r[key];for(const k of ['signals','completed','wins','losses','ties','unverified','overlaps'])z[k]+=a[k];
 z.errors+=!!a.error;return z;
},{signals:0,completed:0,wins:0,losses:0,ties:0,unverified:0,overlaps:0,errors:0});
for(const scope of ['recorded-quote-fixture','synthetic-deterministic']){
 const old=total('v1396',scope),cur=total('v1397',scope);
 console.log('COMPARE_TOTAL '+JSON.stringify({scope,baseline:old,candidate:cur,
  baselineRate:old.completed?Number((old.wins/old.completed*100).toFixed(1)):null,
  candidateRate:cur.completed?Number((cur.wins/cur.completed*100).toFixed(1)):null}));
}
console.log('COMPARE_METHOD quote-based prices only; synthetic patterns are not real market data; 180s historical snippet is too short for win-rate claims; no live broker receipts');
if(results.some(r=>r.v1396.error||r.v1397.error))
 process.exitCode=1;

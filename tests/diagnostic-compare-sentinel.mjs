// Offline A/B diagnostic ONLY. Reads a short recorded quote fixture.
// Never opens the broker, connects to Supabase, or changes production signals.
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url),'utf8'));
const quotes=fixture.quoteHistory.filter(q=>Number.isFinite(q.ts)&&Number.isFinite(q.price)).sort((a,b)=>a.ts-b.ts);
const start=quotes[0].ts,stop=quotes.at(-1).ts;
const base=fixture.candles.filter(c=>c.to*1000<=start).sort((a,b)=>a.from-b.from).slice(-120);

function makeCandles(rows,now){
 const out=base.map(b=>({...b}));
 // Never copy future highs/lows of the recorded forming candle.
 const anchor=Math.floor(start/60000)*60000;
 for(let bucket=anchor;bucket<=now;bucket+=60000){
  const xs=rows.filter(q=>q.ts>=bucket&&q.ts<=now&&q.ts<bucket+60000);
  if(!xs.length)continue;
  const prices=xs.map(q=>q.price);
  out.push({from:bucket/1000,to:bucket/1000+60,open:prices[0],high:Math.max(...prices),low:Math.min(...prices),close:prices.at(-1),volume:0});
 }
 return out;
}
const baseline={};
async function runBaseline(durationSec,subanalystPolicy='persistent-reversal-alert-v1'){
 const r=new DemoTradingRuntime({predictionModel:'family-v6-verified-input',entryPolicy:'structural-reversals-v1',scenarioPolicy:'own-review-v1',subanalystPolicy});
 r.settings.mode='real';
 r.settings.orderDurationMs=durationSec*1000;
 r.settings.forecastHorizonSeconds=durationSec;
 r.settings.futureDisplayThreshold=70;
 r.settings.risk.minConfidence=70;
 r.settings.schedule.intervalMs=400;
 r.settings.requireLiveBroker=true;
 r.stateName='running';r.state.sessionStartedAt=start;
 const events=[];const stateCounts={};const statusCounts={};let firstError=null,readyFrames=0,analyses=0,positiveForecastFrames=0,lastSignalKey='',consensusSamples=[];
 for(let i=0;i<quotes.length;i++){
  const q=quotes[i],hist=quotes.slice(0,i+1),candles=makeCandles(hist,q.ts);
  r.setExternalMarket({provider:'iq_option',symbol:'TEST RECORDED',validatedSymbol:'TEST RECORDED',uiSymbol:'TEST RECORDED',mode:'real',analysisFeedValidated:true,feedValidated:true,assetValidated:true,quote:q.price,quoteTs:q.ts,candles,predictionCandles:candles,quoteHistory:hist.slice(-900),balance:10000});
  r.requestImmediateEvaluation();
  const result=await r.tick(q.ts);
  const a=result?.lastResult?.analysis||r.lastResult?.analysis||{},op=a.operationalSignal||{},co=a.generalConsensus||{};
  const state=String(op.state||'NO_STATE');stateCounts[state]=(stateCounts[state]||0)+1;
  const status=String(op.reason||a.quality?.blockCode||'NO_REASON').slice(0,100);statusCounts[status]=(statusCounts[status]||0)+1;
  if(r.stateName==='error'&&!firstError)firstError=String(r.incidents?.[0]?.message||'unknown');
  if(r.lastEvalMs===q.ts)analyses++;
  if(op.ready===true)readyFrames++;
  if(co.displayCallPct>=70||co.displayPutPct>=70)positiveForecastFrames++;
  if(Number.isFinite(co.displayCallPct))consensusSamples.push(co.displayCallPct);
  const key=[op.createdAt,op.side,op.kind].join('|');
  if(op.actionable===true&&['CALL','PUT'].includes(op.side)&&key!==lastSignalKey){
   lastSignalKey=key;
   events.push({at:q.ts,side:op.side,price:q.price,kind:op.kind,state:op.state,confidence:op.strength});
  }
 }
 return {durationSec,subanalystPolicy,events,readyFrames,analyses,firstError,stateCounts,topReasons:Object.entries(statusCounts).sort((a,b)=>b[1]-a[1]).slice(0,7),consensusAbove70:positiveForecastFrames,consensusRange:consensusSamples.length?[Math.min(...consensusSamples),Math.max(...consensusSamples)]:null};
}
function earlyTurnAlerts(){
 const alerts=[];let lastAlertAt=0,lastSide='';
 for(let i=20;i<quotes.length;i++){
  const row=quotes[i],lookback=quotes.slice(0,i+1).filter(q=>q.ts>=row.ts-35000);
  const recent=quotes.slice(Math.max(0,i-3),i+1);
  if(lookback.length<20||recent.length<4)continue;
  const hi=Math.max(...lookback.map(x=>x.price)),lo=Math.min(...lookback.map(x=>x.price)),width=hi-lo;
  if(width<=0)continue;
  const close=row.price,slant=close-recent[0].price;
  const last5=quotes.slice(0,i+1).filter(q=>q.ts>=row.ts-5000);
  const nearLow=last5.some(q=>q.price<=lo+width*.05);
  const nearHigh=last5.some(q=>q.price>=hi-width*.05);
  const side=nearLow&&close<=lo+width*.40&&slant>=width*.08?'CALL':nearHigh&&close>=hi-width*.40&&slant<=-width*.08?'PUT':null;
  if(!side)continue;
  if(row.ts-lastAlertAt<8000&&side===lastSide)continue;
  lastAlertAt=row.ts;lastSide=side;
  alerts.push({at:row.ts,side,price:row.price,kind:'early-micro-turn-shadow'});
 }
 return alerts;
}
function evaluate(events){
 const res={signals:events.length};
 for(const horizon of [5,15,30]){
  let win=0,loss=0,draw=0,unsettled=0;
  for(const e of events){
   const target=e.at+horizon*1000;
   const future=quotes.filter(q=>q.ts>=target&&q.ts<=target+1500)[0];
   if(!future){unsettled++;continue}
   const delta=future.price-e.price;
   if(Math.abs(delta)<1e-10)draw++;
   else if(e.side==='CALL'?delta>0:delta<0)win++;
   else loss++;
  }
  res[horizon+'s']={wins:win,losses:loss,draws:draw,unsettled,winRate:win+loss?Number((100*win/(win+loss)).toFixed(1)):null};
 }
 return res;
}
for(const sec of [30,60])baseline[sec]=await runBaseline(sec);
const independent={};
for(const sec of [30,60])independent[sec]=await runBaseline(sec,'entry');
const candidate=earlyTurnAlerts();
const result={
 dataset:{date:new Date(start).toISOString().slice(0,10),recordedQuotes:quotes.length,durationSeconds:Number(((stop-start)/1000).toFixed(1)),backgroundCandles:base.length,source:'recorded repo fixture, not verified IQ Option execution history',warning:'No actual trades. 3-minute sample cannot demonstrate profitability or claim 10:2 hit rate.'},
 baseline:{
  '30s':{...baseline[30],outcomes:evaluate(baseline[30].events)},
  '60s':{...baseline[60],outcomes:evaluate(baseline[60].events)}
 },
 independentEntryMode:{'30s':{...independent[30],outcomes:evaluate(independent[30].events)},'60s':{...independent[60],outcomes:evaluate(independent[60].events)}},
 experimentalShadow:{description:'Early micro-turn advisory built ONLY from past/current prices; no order, no promise of profit',firstSignals:candidate.slice(0,12),outcomes:evaluate(candidate)},
 safeguards:{lookAhead:false,realMoney:false,productionUnchanged:true}
};
console.log('DIAGNOSTIC_RESULT_BEGIN');
console.log(JSON.stringify(result,null,2));
console.log('DIAGNOSTIC_RESULT_END');

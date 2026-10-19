// Read-only forensic attribution of REAL 13.9.54 source layers on recorded
// visual broker prices; never imports the click executor or places orders.
// The 1Hz and 2Hz fixtures come from the SAME video, not independent tests.
// Decisions use only quotes received <= their timestamp. Expiry prices are
// consulted afterwards exclusively for scoring, never while deciding.
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';

const input=(fixture,rows,now,selector)=>({
 quoteHistory:rows,price:rows.at(-1).price,quoteAt:rows.at(-1).ts,
 now,durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17',
 expiryDirectionSelector:selector,expiryDirectionContext:'exnova|EUR/GBP OTC|30000',
 candles:[]
});
const score=(entry,side,exit)=>{
 if(!['CALL','PUT'].includes(side))return 'none';
 if(!exit)return 'unknown';
 if(exit.price===entry.price)return 'tie';
 return (exit.price>entry.price?'CALL':'PUT')===side?'win':'loss';
};
function stats(rows){
 const wins=rows.filter(x=>x==='win').length,losses=rows.filter(x=>x==='loss').length;
 return {wins,losses,ties:rows.filter(x=>x==='tie').length,unknown:rows.filter(x=>x==='unknown').length,decisive:wins+losses,accuracy:wins+losses?Number((100*wins/(wins+losses)).toFixed(1)):null};
}
// Fixed, purely descriptive regime labels chosen before inspecting outcomes:
// agreement of the observed 5s/15s/30s/60s price moves. No training, tuning,
// modified signals or hindsight allowed for this grouping.
function observedMarketPhase(rows,at){
 const p=rows.at(-1)?.price;
 const prices=[5,15,30,60].map(sec=>{
  const before=at-sec*1000;
  for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=before&&before-rows[i].ts<=1500)return rows[i].price;
  return null;
 });
 const dirs=prices.map(v=>v>0?(p>v?'CALL':p<v?'PUT':'FLAT'):null);
 const ready=dirs.every(x=>x==='CALL'||x==='PUT');
 const aligned=ready&&dirs.every(d=>d===dirs[0]);
 const persistent=dirs[2]&&dirs[3]&&dirs[2]===dirs[3];
 const nearVsLong=dirs[0]&&dirs[3]&&dirs[0]!==dirs[3];
 return {phase:!ready?'insufficient-context':aligned?'all-four-horizons-agree':persistent&&nearVsLong?'short-move-against-long-trend':'mixed-or-turning',
  dirs,previousFive:dirs[0],previousFifteen:dirs[1],previousThirty:dirs[2],previousSixty:dirs[3]};
}
function byReason(rows,prop){
 return Object.fromEntries([...new Set(rows.map(r=>r[prop]))].map(k=>[k,stats(rows.filter(r=>r[prop]===k).map(r=>r.outcome))]));
}
function replay(filename){
 const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+filename,import.meta.url)));
 const prices=f.quoteHistory.filter(q=>Number(q.ts)>0&&Number(q.price)>0).sort((a,b)=>a.ts-b.ts);
 const selector=new CompletedExpiryDirection(),signals=[];
 let held=null;
 for(let i=0;i<prices.length;i++){
  const q=prices[i],history=prices.slice(0,i+1).filter(x=>x.ts<=q.ts&&Number(x.receivedAt??x.ts)<=Number(q.receivedAt??q.ts));
  const raw={quoteHistory:history,price:q.price,quoteAt:q.ts,now:Number(q.receivedAt??q.ts),durationMs:30000,engineId:'automatic'};
  const structural=analyzeNowOpportunity(raw);
  const analog=analyzeNowOpportunity({...raw,qualityPolicy:'adaptive-market-v1'});
  const cycle=thirtySecondCycleForecast({...raw,projectionTargetAt:raw.now+30000});
  const result=analyzeNowOpportunity(input(f,history,raw.now,selector));
  const next=advanceNowOpportunity({previous:held,candidate:result,now:raw.now,quoteAt:q.ts,
   asset:'EUR/GBP OTC',provider:'exnova',engineId:'automatic',durationMs:30000});
  const issued=next?.phase==='fired'&&held?.entryTriggeredAt!==next.entryTriggeredAt;
  if(issued)signals.push({ts:next.entryAt,side:next.side,reason:result.reason,stage:result.signalOwner,
    market:observedMarketPhase(history,q.ts),
    structureSide:structural?.ready?structural.side:null,
    structureReason:structural?.reason,
    analogueSide:analog?.ready?analog.side:null,analogueReason:analog?.reason,
    cycleSide:cycle?.ready?cycle.side:null,cyclePeriod:cycle?.fittedPeriodSeconds??null,
    contextStrategy:result.contextStrategy});
  held=next;
 }
 const detailed=signals.map(s=>{
  const entry=prices.find(q=>q.ts>=s.ts&&q.ts<=s.ts+1000);
  const exit=prices.find(q=>q.ts>=s.ts+30000&&q.ts<=s.ts+31000);
  if(!entry)return {...s,outcome:'unknown'};
  return {...s,entryPrice:entry.price,exitPrice:exit?.price??null,
   outcome:score(entry,s.side,exit),
   invertedOutcome:score(entry,s.side==='CALL'?'PUT':'CALL',exit),
   analogueOutcome:score(entry,s.analogueSide,exit),
   structureOutcome:score(entry,s.structureSide,exit),
   cycleOutcome:score(entry,s.cycleSide,exit)};
 });
 const marketTypes=[...new Set(detailed.map(x=>x.market.phase))];
 const byMarketPhase=Object.fromEntries(marketTypes.map(key=>[key,{
  ...stats(detailed.filter(x=>x.market.phase===key).map(x=>x.outcome)),
  directionalAgreementWithLast5:detailed.filter(x=>x.market.phase===key&&x.side===x.market.previousFive).length,
  directionalOppositionToLast5:detailed.filter(x=>x.market.phase===key&&x.market.previousFive&&x.side!==x.market.previousFive).length,
  signals:detailed.filter(x=>x.market.phase===key).map(x=>({at:x.ts,side:x.side,phase:x.market.phase,last5:x.market.previousFive,
   last60:x.market.previousSixty,outcome:x.outcome,reason:x.reason}))
 }]));
 const comparisons=detailed.filter(x=>x.analogueSide&&x.cycleSide&&x.analogueSide!==x.cycleSide);
 return {
  source:f.source,frequency:f.samplingMs||1000,sameVideo:true,observedQuotes:prices.length,
  actualTrades:false,signals:detailed.length,
  emitted:stats(detailed.map(x=>x.outcome)),invertedAtIdenticalTimes:stats(detailed.map(x=>x.invertedOutcome)),
  atIdenticalEmittedTimes:{
   structural:stats(detailed.map(x=>x.structureOutcome)),analog:stats(detailed.map(x=>x.analogueOutcome)),
   pureCycle:stats(detailed.map(x=>x.cycleOutcome))},
  layerDisagreements:{analogVsCycle:comparisons.length,
   analogBetter:comparisons.filter(x=>x.analogueOutcome==='win'&&x.cycleOutcome==='loss').length,
   cycleBetter:comparisons.filter(x=>x.cycleOutcome==='win'&&x.analogueOutcome==='loss').length,
   disagreements:comparisons.map(x=>({at:x.ts,analog:x.analogueSide,cycle:x.cycleSide,
    emitted:x.side,actual:x.outcome,analogOutcome:x.analogueOutcome,cycleOutcome:x.cycleOutcome}))},
  byDecisionReason:byReason(detailed,'reason'),
  byCausalMarketPhase:byMarketPhase,
  decisions:detailed.map(({ts,side,reason,structureSide,analogueSide,cycleSide,outcome,invertedOutcome,contextStrategy})=>({
    at:ts,side,reason,structureSide,analogueSide,cycleSide,outcome,invertedOutcome,contextStrategy
  })),
  limitations:['One video only, observed plot quotes not authenticated broker market stream',
   'No pre-video live history or broker historical candles, so original live signal times may differ',
   '2Hz and 1Hz sources are TWO READINGS OF THE SAME CLIP',
   'Independent live trading accuracy and payoff are not established']
 };
}
const outputs=[
 replay('sentinel-user-video-broker-6dp-20261016.json'),
 replay('sentinel-user-video-20261016.json')
];
console.log('SENTINEL_13954_DIRECTION_ATTRIBUTION='+JSON.stringify(outputs));

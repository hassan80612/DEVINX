// Passive, causal calibration and reversal audit: recorded actual broker
// QUOTES at each selected expiry. These are not broker settlements.
// This never reads the browser, schedules entry, or authorizes CALL/PUT.
import {observedExpiryQuote} from './observed-expiry-quote-20261018.mjs';
const durations=new Set([30000,60000,120000,300000]);
const SIDE=new Set(['CALL','PUT']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=(a)=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const brier=(rows,probability)=>mean(rows.map(x=>(probability(x)-(x.actualCall?1:0))**2));
const reasonClass=reason=>{
 const s=String(reason||'').toLowerCase();
 if(s==='rejection-followthrough-clear-room'||/continuation|followthrough/.test(s))return 'continuation';
 if(/reversal|range-turn|rejection|structure-change|retest|failed-breakout|multiscale-candle/.test(s))return 'reversal';
 return 'directional';
};
const trainEstimate=(train,p)=>{
 // Stable local reliability adjustment from *already settled* observations.
 // Shrink each bucket toward the original probability so sparse regions
 // cannot abruptly reverse a CALL/PUT decision (display/research only).
 const key=Math.min(9,Math.floor(clamp(p,0,.999999)*10));
 const bin=train.filter(x=>Math.min(9,Math.floor(x.pCall*10))===key);
 const positive=bin.filter(x=>x.actualCall).length;
 return (positive+12*p)/(bin.length+12);
};
export class ContinuousExpiryCalibration{
 constructor({maxContexts=12,maxSettled=80,minTrain=24,minHoldout=12}={}){
  this.contexts=new Map();this.maxContexts=maxContexts;
  this.maxSettled=maxSettled;this.minTrain=minTrain;this.minHoldout=minHoldout;
 }
 _state(key){
  if(this.contexts.has(key))return this.contexts.get(key);
  if(this.contexts.size>=this.maxContexts)this.contexts.delete(this.contexts.keys().next().value);
  const state={pending:null,settled:[],expiryMs:0};this.contexts.set(key,state);
  return state;
 }
 _report(state){
  const rows=state?.settled||[],n=rows.length;
  const enough=n>=this.minTrain+this.minHoldout;
  const train=enough?rows.slice(0,-this.minHoldout):[];
  const holdout=enough?rows.slice(-this.minHoldout):[];
  const rawHoldoutBrier=enough?brier(holdout,x=>x.pCall):null;
  const adjustedHoldoutBrier=enough?brier(holdout,x=>trainEstimate(train,x.pCall)):null;
  // Even after the sample requirement is met, reliability cannot be
  // asserted if independent forward outcomes do not support the fit.
  const validated=enough&&adjustedHoldoutBrier!==null&&
    adjustedHoldoutBrier<=rawHoldoutBrier-.002;
  const classified=(type,field)=>rows.filter(x=>x.reasonClass===type&&SIDE.has(x[field]));
  const winCount=(items,field)=>items.filter(x=>x[field]===(x.actualCall?'CALL':'PUT')).length;
  const reversal=classified('reversal','structuralSide');
  const continuation=classified('continuation','structuralSide');
  const directional=classified('directional','structuralSide');
  const final=rows.filter(x=>SIDE.has(x.finalSide));
  const forecast=rows.filter(x=>SIDE.has(x.estimateSide));
  let consecutiveFinalLosses=0;
  for(let i=rows.length-1;i>=0;i--){
   if(!SIDE.has(rows[i].finalSide))continue;
   if(rows[i].finalSide===(rows[i].actualCall?'CALL':'PUT'))break;
   consecutiveFinalLosses++;
  }
  return {
   samples:n,pending:!!state?.pending,requiredMin:this.minTrain+this.minHoldout,
   calibrated:!!validated,status:n===0?'collecting':!enough?'collecting':
     validated?'validated':'evaluated-without-calibration-advantage',
   // Percentages below are OBSERVED QUOTE-direction statistics, not payout.
   estimateCorrect:winCount(forecast,'estimateSide'),estimateCount:forecast.length,
   observedCallRate:n?rows.filter(x=>x.actualCall).length/n:null,
   rawBrier:brier(rows,x=>x.pCall),rawHoldoutBrier,adjustedHoldoutBrier,
   reversals:{total:reversal.length,correct:winCount(reversal,'structuralSide')},
   continuations:{total:continuation.length,correct:winCount(continuation,'structuralSide')},
   directional:{total:directional.length,correct:winCount(directional,'structuralSide')},
   finalSignals:{total:final.length,correct:winCount(final,'finalSide'),consecutiveLosses:consecutiveFinalLosses},
   source:'observed-broker-quotes-not-broker-settlements'
  };
 }
 observe({context,now,quoteAt,price,quoteHistory=[],expiryMs,estimate,
   structuralSide=null,finalSide=null,structuralReason=null,marketValid=false}={}){
  if(typeof context!=='string'||!context||!durations.has(Number(expiryMs)))
   return this._report(null);
  const state=this._state(context),dueNow=Number(now),at=Number(quoteAt),p=Number(price);
  state.expiryMs=Number(expiryMs);
  if(state.pending&&dueNow>=state.pending.dueAt){
   const prior=state.pending;
   const exit=observedExpiryQuote({quoteHistory,
    currentQuote:{ts:at,price:p,receivedAt:dueNow},
    dueAt:prior.dueAt,now:dueNow,maxAgeMs:1000});
   if(exit&&exit.price!==prior.price){
    state.settled.push({...prior,actualCall:exit.price>prior.price,exitAt:exit.ts});
    if(state.settled.length>this.maxSettled)state.settled.splice(0,state.settled.length-this.maxSettled);
   }
   state.pending=null; // Do not fabricate an expiry label for a missing quote.
  }
  const a=Number(estimate?.pCall),b=Number(estimate?.pPut);
  if(!state.pending&&marketValid===true&&Number.isFinite(at)&&at>0&&
     Number.isFinite(dueNow)&&dueNow>=at&&dueNow-at<=1500&&p>0&&
     Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>=0&&
     Math.abs(a+b-1)<=.005){
   // One non-overlapping, independently verifiable horizon per context.
   state.pending={at,dueAt:at+Number(expiryMs),price:p,pCall:a,
    estimateSide:a>b?'CALL':a<b?'PUT':null,
    structuralSide:SIDE.has(structuralSide)?structuralSide:null,
    finalSide:SIDE.has(finalSide)?finalSide:null,
    reasonClass:reasonClass(structuralReason)};
  }
  return this._report(state);
 }
 snapshot(){
  // Bounded local state survives ordinary Agent restarts. No external DB.
  return [...this.contexts].map(([k,v])=>({key:k,expiryMs:v.expiryMs,
   // Do not restore an in-flight observation after restart: its source
   // quotation continuity is no longer guaranteed.
   settled:v.settled.slice(-this.maxSettled)}));
 }
 restore(value){
  this.contexts=new Map();
  if(!Array.isArray(value))return this;
  for(const row of value.slice(-this.maxContexts)){
   if(typeof row?.key!=='string'||!durations.has(Number(row?.expiryMs)))continue;
   const clean=(Array.isArray(row.settled)?row.settled:[]).slice(-this.maxSettled)
    .filter(x=>Number.isFinite(x?.pCall)&&x.pCall>=0&&x.pCall<=1&&
      typeof x.actualCall==='boolean'&&Number.isFinite(x.at)&&
      Number.isFinite(x.dueAt)&&x.dueAt>x.at&&
      ['directional','continuation','reversal'].includes(x.reasonClass));
   this.contexts.set(row.key,{pending:null,settled:clean,expiryMs:Number(row.expiryMs)});
  }
  return this;
 }
}

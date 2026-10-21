// Quote-only, synchronous pre-entry disagreement check. Dashboard indices are
// price-pressure observations, not calibrated probabilities or win rates.
// A snapshot SIX seconds before expiry must never be used as entry evidence.
import {observedExpiryQuote} from './observed-expiry-quote-20261018.mjs';

const flip=s=>s==='CALL'?'PUT':'CALL';
const sideOk=s=>s==='CALL'||s==='PUT';
function lowerBound(wins,n){
 if(!n)return 0;
 const z=1.645,p=wins/n,z2=z*z;
 return Math.max(0,(p+z2/(2*n)-z*Math.sqrt((p*(1-p)+z2/(4*n))/n))/(1+z2/n));
}
export function currentMarketConflict({original,estimate,cards=[],durationMs}={}){
 if(original?.ready!==true||!sideOk(original.side)||![30000,60000].includes(Number(durationMs)))
  return {conflict:false,reason:'no-current-entry'};
 // Preserve genuinely observed level/reversal entries: pressure indices are
 // mostly momentum and would tend to veto good extreme-point turns.
 if(/rejection|reversal|retest|structure-change|level/.test(String(original.reason||'')))
  return {conflict:false,reason:'protected-confirmed-structure'};
 const opposite=flip(original.side);
 const other=opposite==='CALL'?'callPct':'putPct';
 const now=cards.find(x=>x.id==='market-now');
 const prior=cards.find(x=>x.id==='prior-structure');
 const total=cards.find(x=>x.id==='total-of-totals');
 const valid=cards.length>=3&&[now,prior,total].every(x=>x&&
  x.callPct!=null&&x.putPct!=null&&Number.isFinite(Number(x[other])));
 if(!valid)return {conflict:false,reason:'missing-market-pressure'};
 const p=opposite==='CALL'?estimate?.pCall:estimate?.pPut;
 if(!Number.isFinite(p))return {conflict:false,reason:'missing-probability-evidence'};
 const nowOpp=Number(now[other]),priorOpp=Number(prior[other]),totalOpp=Number(total[other]);
 // Scores are pressure indices on the already-received 8s and 60s quotes.
 // Requiring a third source avoids treating one bearish candle as a forecast.
 const conflict=nowOpp>=65&&totalOpp>=54&&p>=.52;
 return {conflict,originalSide:original.side,oppositeSide:opposite,
  nowOpp,priorOpp,totalOpp,probabilityOpp:p,
  reason:conflict?'current-quote-and-history-contradict-entry':'pressure-not-conclusive'};
}
export class MarketPressureEvidence{
 constructor({minSamples=16,maxContexts=16,maxSettled=60}={}){
  this.minSamples=minSamples;this.maxContexts=maxContexts;this.maxSettled=maxSettled;
  this.contexts=new Map();
 }
 state(context){
  if(this.contexts.has(context))return this.contexts.get(context);
  if(this.contexts.size>=this.maxContexts)this.contexts.delete(this.contexts.keys().next().value);
  const state={pending:null,settled:[]};this.contexts.set(context,state);return state;
 }
 summary(context){
  const state=this.contexts.get(context),rows=state?.settled||[];
  const n=rows.length,losses=rows.filter(x=>x.originalWrong).length,lower=lowerBound(losses,n);
  // Require validated opposite-side advantage rather than a fixed technical
  // percentage threshold; video replay showed broad unvalidated vetoes
  // rejecting more winning trades than losing ones.
  return {n,originalLosses:losses,originalWins:n-losses,
   lossRate:n?losses/n:null,lowerBound:lower,
   approved:n>=this.minSamples&&losses/n>=.75&&lower>.58,
   source:'actual-received-quote-at-expiry-not-trade-settlement'};
 }
 observe({context,now,quoteAt,price,quoteHistory=[],expiryMs,
   original,pressure,marketValid=false}={}){
  if(typeof context!=='string'||!context||![30000,60000].includes(Number(expiryMs)))return {n:0,approved:false};
  const state=this.state(context),t=Number(now),ts=Number(quoteAt),p=Number(price);
  if(state.pending&&t>=state.pending.dueAt){
   const due=state.pending;
   const exit=observedExpiryQuote({quoteHistory,
    currentQuote:{ts,price:p,receivedAt:t},dueAt:due.dueAt,now:t,maxAgeMs:1000});
   if(exit&&exit.price!==due.price){
    const actual=exit.price>due.price?'CALL':'PUT';
    state.settled.push({dueAt:due.dueAt,originalWrong:actual!==due.side});
    if(state.settled.length>this.maxSettled)state.settled=state.settled.slice(-this.maxSettled);
   }
   state.pending=null;
  }
  const evidence=this.summary(context);
  if(!state.pending&&pressure?.conflict===true&&original?.ready===true&&
    sideOk(original.side)&&marketValid===true&&Number.isFinite(p)&&p>0&&
    Number.isFinite(t)&&Number.isFinite(ts)&&ts>0&&ts<=t&&t-ts<=1500){
   state.pending={at:ts,dueAt:ts+Number(expiryMs),price:p,side:original.side};
  }
  return evidence;
 }
}
export function applyMarketPressureGuard(observation,original,pressure,proof){
 if(!observation||observation.ready!==true||!sideOk(observation.side)||
   pressure?.conflict!==true||observation.side!==original?.side)return observation;
 const strength=original.strength;
 const weak=strength!=null&&Number.isFinite(Number(strength))&&Number(strength)>=0&&Number(strength)<55;
 if(!weak||proof?.approved!==true||!(Number(proof.n)>=16))return {
   ...observation,marketPressureConflict:true,marketPressureBlocked:false};
 return {...observation,ready:false,side:null,provisionalSide:original.side,
  reason:'historically-verified-market-pressure-conflict',
  marketPressureConflict:true,marketPressureBlocked:true,marketPressureSamples:proof.n};
}

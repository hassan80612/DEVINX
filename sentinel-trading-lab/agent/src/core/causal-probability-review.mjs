// Local, causal shadow comparison of the original 66 direction and its opposite.
// Uses real received broker quotes at the exact selected expiry, not user balance,
// guessed settlements, past videos, Supabase, Vercel storage, or future prices.
import {observedExpiryQuote} from './observed-expiry-quote-20261018.mjs';

const SIDES=new Set(['CALL','PUT']);
const opposite=s=>s==='CALL'?'PUT':'CALL';
const clamp01=n=>Math.max(0,Math.min(1,n));
function wilsonLower(wins,total,z=1.645){
 if(total===0)return 0;
 const p=wins/total,zz=z*z;
 return clamp01((p+zz/(2*total)-z*Math.sqrt(p*(1-p)/total+zz/(4*total*total)))/(1+zz/total));
}
export class CausalProbabilityReview{
 constructor({minSamples=16,maxContexts=16,maxSettled=80}={}){
  this.minSamples=minSamples;this.maxContexts=maxContexts;this.maxSettled=maxSettled;
  this.contexts=new Map();
 }
 _state(context){
  if(this.contexts.has(context))return this.contexts.get(context);
  if(this.contexts.size>=this.maxContexts)this.contexts.delete(this.contexts.keys().next().value);
  const state={pending:null,settled:[],expiryMs:null};this.contexts.set(context,state);return state;
 }
 summary(context,payout){
  const state=this.contexts.get(context),rows=state?.settled||[];
  const n=rows.length,wins=rows.filter(x=>x.oppositeCorrect).length;
  const raw=Number(payout),fraction=raw>1&&raw<=100?raw/100:raw;
  const payoutOk=Number.isFinite(fraction)&&fraction>=.5&&fraction<=1;
  const required=payoutOk?1/(1+fraction):null;
  const lower=wilsonLower(wins,n);
  const expiryMs=Number(state?.expiryMs||0);
  const minHorizonSamples=expiryMs>=300000?50:expiryMs>=120000?30:this.minSamples;
  // A broker may omit payout from its passive quote feed. In that case we
  // can measure *directional* evidence, never profitability. Require the
  // stricter directional confidence threshold, regardless of account mode.
  const requiredLower=payoutOk?Math.max(.60,required+.02):.65;
  // A past advantage cannot remain authoritative after the market changes.
  // Require the LAST eight independent, already-settled expiries to support
  // the same direction. This only affects permission to INVERT a weak 66
  // signal; the original qualified CALL/PUT continues without extra waiting.
  const recent=rows.slice(-8);
  const recentOppositeWins=recent.filter(x=>x.oppositeCorrect).length;
  const recentValidated=recent.length===8&&recentOppositeWins>=6;
  const approved=n>=Math.max(this.minSamples,minHorizonSamples)&&wins/n>=.78&&
    lower>requiredLower&&recentValidated;
  return {n,oppositeWins:wins,originalWins:n-wins,
   observedOppositeRate:n?wins/n:null,lowerBound:lower,
   approved:!!approved,payoutVerified:!!payoutOk,
   directionalOnly:!payoutOk,threshold:required,
   source:'observed-broker-quotes-not-broker-trade-settlement'};
 }
 observe({context,now,quoteAt,price,quoteHistory,expiryMs,
   original,estimate,marketValid=false,payout}={}){
  if(typeof context!=='string'||!context||![30000,60000,120000,300000].includes(Number(expiryMs)))return {approved:false,n:0};
  const state=this._state(context),ts=Number(quoteAt),t=Number(now),p=Number(price);
  state.expiryMs=Number(expiryMs);
  if(state.pending&&t>=state.pending.dueAt){
   const old=state.pending;
   const exit=observedExpiryQuote({quoteHistory,currentQuote:{ts,price:p,receivedAt:t},
    dueAt:old.dueAt,now:t,maxAgeMs:1000});
   // If the exact expiry quote was missed, never guess its result from future prices.
   if(exit&&exit.price!==old.price){
    const actual=exit.price>old.price?'CALL':'PUT';
    state.settled.push({observedAt:old.at,dueAt:old.dueAt,originalSide:old.side,
     oppositeCorrect:actual===opposite(old.side),expiryMs:Number(expiryMs)});
    if(state.settled.length>this.maxSettled)state.settled=state.settled.slice(-this.maxSettled);
   }
   state.pending=null;
  }
  const proof=this.summary(context,payout);
  const strength=Number(original?.strength);
  // Number(null) === 0, so require a genuinely PRESENT motor score.
  const weak=original?.strength!==null&&original?.strength!==undefined&&
   Number.isFinite(strength)&&strength>=0&&strength<62;
  const protectedTurn=/rejection|reversal|retest|structure-change|level/.test(String(original?.reason||''));
  const pOpp=original?.side==='CALL'?estimate?.pPut:estimate?.pCall;
  const fresh=marketValid===true&&Number.isFinite(t)&&Number.isFinite(ts)&&ts>0&&
   ts<=t&&t-ts<=1500&&Number.isFinite(p)&&p>0;
  if(!state.pending&&fresh&&weak&&!protectedTurn&&
    original?.ready===true&&SIDES.has(original.side)&&
    Number.isFinite(pOpp)&&pOpp>=.58&&
    t>=ts){
   // One candidate per selected expiry, never overlapping across the same context.
   state.pending={at:ts,dueAt:ts+Number(expiryMs),price:p,side:original.side};
  }
  return proof;
 }
}

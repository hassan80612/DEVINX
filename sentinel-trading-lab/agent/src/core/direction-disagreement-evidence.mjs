// Stage-4 direction arbitration using actual, previously completed 30s
// outcomes for DISAGREEMENTS only. No broker orders, no artificial labels,
// no lookahead and no change to the entry clock or held signal.
import {observedExpiryQuote} from './observed-expiry-quote-20261018.mjs';
const side=s=>s==='CALL'||s==='PUT';
export class DirectionDisagreementEvidence {
 constructor(){this.reset(null);}
 reset(context){
  this.context=context;this.pending=[];this.scored=[];this.lastIssued=-Infinity;
  this.lastQuoteAt=-Infinity;
 }
 observe({context,quoteHistory=[],quoteAt,price,now,structural,projected,projectionTargetAt}={}){
  if(context!==this.context)this.reset(context);
  const ts=Number(quoteAt),p=Number(price),receipt=Number(now);
  if(!(ts>0&&ts<=receipt&&receipt-ts<=1450&&p>0)||ts<this.lastQuoteAt)return projected;
  if(ts>this.lastQuoteAt){
   const waiting=[];
   for(const trial of this.pending){
    if(ts<trial.dueAt){waiting.push(trial);continue;}
    const outcome=observedExpiryQuote({quoteHistory,
     currentQuote:{ts,price:p,receivedAt:receipt},dueAt:trial.dueAt,now:receipt});
    if(!outcome||outcome.price===trial.price)continue;
    const actual=outcome.price>trial.price?'CALL':'PUT';
    this.scored.push({at:trial.at,structural:trial.structural===actual,
     projected:trial.projected===actual});
   }
   this.scored=this.scored.slice(-18);
   this.pending=waiting;
   this.lastQuoteAt=ts;
  }
  if(!structural?.ready||!projected?.ready||
    !side(structural.side)||!side(projected.side)||
    structural.side===projected.side)return projected;
  const due=Number(projectionTargetAt??receipt+30000);
  // Unlike existing 5s cycle tracking, this comparison collects at MOST
  // one sample per 30-second expiry, so 6 correlated observations from one
  // price move never masquerade as six independent model wins.
  if(due>ts&&due-ts<=60000&&ts-this.lastIssued>=30000){
   this.lastIssued=ts;this.pending.push({at:ts,dueAt:due,price:p,
    structural:structural.side,projected:projected.side});
  }
  // The current published authority remains until enough NON-OVERLAPPING
  // measured disagreements show a strong advantage to the structural model.
  // Thresholds are conservative evidence requirements, not win probabilities.
  const samples=this.scored.slice(-12);
  const n=samples.length;
  const structureWins=samples.filter(x=>x.structural).length;
  const projectionWins=samples.filter(x=>x.projected).length;
  if(n>=6&&structureWins>=Math.ceil(n*.75)&&structureWins>=projectionWins+3&&
    samples.slice(-3).filter(x=>x.structural).length>=2){
   return {...structural,reason:'validated-structure-over-cycle'};
  }
  return projected;
 }
}

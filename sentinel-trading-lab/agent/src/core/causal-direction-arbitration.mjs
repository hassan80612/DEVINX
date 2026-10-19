// Compare disagreement between structural and expiry-cycle directions only
// AFTER their independent, actual 30-second price outcome is observable.
// Never read future quotes, never place trades or alter an existing window.
import {observedExpiryQuote} from './observed-expiry-quote-20261018.mjs';
const validSide=s=>s==='CALL'||s==='PUT';
export class CausalDirectionArbitration {
 constructor(){this.reset(null);}
 reset(context){
  this.context=context;this.pending=[];this.completed=[];this.lastRecordedAt=-Infinity;
  this.lastQuoteAt=-Infinity;this.completedCount=0;
 }
 decide({context,quoteHistory=[],quoteAt,price,now,structural,selected,projectionTargetAt=null}={}){
  if(context!==this.context)this.reset(context);
  const ts=Number(quoteAt),spot=Number(price),receipt=Number(now);
  if(!(ts>0&&ts<=receipt&&receipt-ts<=1450&&Number.isFinite(spot)&&spot>0)||
    ts<this.lastQuoteAt)return selected;
  if(ts>this.lastQuoteAt){
   const outstanding=[];
   for(const trial of this.pending){
    if(ts<trial.dueAt){outstanding.push(trial);continue;}
    const observed=observedExpiryQuote({quoteHistory,
     currentQuote:{ts,price:spot,receivedAt:receipt},dueAt:trial.dueAt,now:receipt});
    if(!observed||observed.price===trial.entryPrice)continue;
    const correctSide=observed.price>trial.entryPrice?'CALL':'PUT';
    this.completed.push({at:trial.at,
     structuralWon:trial.structural===correctSide,
     projectionWon:trial.projection===correctSide});
    this.completed=this.completed.slice(-24);
    this.completedCount++;
   }
   this.pending=outstanding;this.lastQuoteAt=ts;
  }
  // The reliability question is ONLY meaningful when both models propose
  // opposite, independently ready sides for the same entry and expiry.
  if(!structural?.ready||!selected?.ready||
   !validSide(structural.side)||!validSide(selected.side)||
   structural.side===selected.side)return selected;
  const dueAt=projectionTargetAt==null?receipt+30000:Number(projectionTargetAt);
  if(dueAt>ts&&dueAt-ts<=60000&&
   ts-this.lastRecordedAt>=30000){
   this.pending.push({at:ts,dueAt,entryPrice:spot,
    structural:structural.side,projection:selected.side});
   this.lastRecordedAt=ts;
  }
  const sample=this.completed.slice(-12),n=sample.length;
  const projectionWins=sample.filter(x=>x.projectionWon).length;
  const structureWins=sample.filter(x=>x.structuralWon).length;
  const limit=Math.ceil(n*.70);
  // Small/contradictory or freshly changing samples do not justify
  // overriding *either* side. A BIC-style in-sample fit is not proof.
  if(n>=6&&projectionWins>=limit&&sample.slice(-3).filter(x=>x.projectionWon).length>=2)
   return {...selected,reason:'measured-expiry-cycle-advantage'};
  if(n>=6&&structureWins>=limit&&sample.slice(-3).filter(x=>x.structuralWon).length>=2)
   return {...structural,reason:'measured-structural-advantage'};
  return {...structural,side:null,ready:false,entryPrice:null,
   reason:'unverified-direction-conflict'};
 }
}

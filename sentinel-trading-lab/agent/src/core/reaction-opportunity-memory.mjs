// Read-only memory of a qualified reaction missed during the previous operation.
// A new touch resets only that reaction; no timer, queued order or market request.
export class ReactionOpportunityMemory{
 constructor(){this.context=null;this.operation=null;this.states=[];this.lastQuoteAt=0;}
 beginOperation(context,id){if(this.context!==context||this.operation!==id){this.context=context;this.operation=id;this.states=[];this.lastQuoteAt=0;}}
 observe({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,tolerance,held=false}){
  if(!(quoteAt>0&&quoteAt<=now&&price>0&&tolerance>0))return null;
  const rows=[];
  for(let i=quoteHistory.length-1;i>=0;i--){const q=quoteHistory[i];if(q.ts<=this.lastQuoteAt)break;if(q.ts<=quoteAt&&(q.receivedAt??q.ts)<=now&&q.price>0)rows.push(q);}
  rows.reverse();
  for(const q of rows){this.states=this.states.filter(s=>(s.side==='CALL'?1:-1)*(q.price-s.level)>s.tolerance);this.lastQuoteAt=q.ts;}
  if(!candidate?.ready||!['CALL','PUT'].includes(candidate.side)||!(candidate.level>0))return null;
  const sign=candidate.side==='CALL'?1:-1;
  const old=this.states.find(s=>s.side===candidate.side&&Math.abs(s.level-candidate.level)<=Math.max(tolerance,s.tolerance));
  if(old&&!held&&['confirmed-level-structure-reversal','confirmed-fast-level-reversal','failed-breakout-structure-change','historical-level-rejection'].includes(candidate.reason)&&sign*(price-old.firstPrice)>=Math.max(tolerance,old.tolerance))
   return {kind:'same-reaction-after-better-missed-price',firstAt:old.firstAt,firstPrice:old.firstPrice,level:old.level};
  if(held&&!old)this.states.push({side:candidate.side,level:candidate.level,tolerance,firstAt:quoteAt,firstPrice:price});
  return null;
 }
}

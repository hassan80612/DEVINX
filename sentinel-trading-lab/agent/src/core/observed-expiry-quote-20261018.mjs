// Use the last received quoted price AT the deadline, never
// a later market move. A stale/missing reference cannot grade either model.
export function observedExpiryQuote({quoteHistory=[],currentQuote=null,dueAt,now,maxAgeMs=1000}={}){
 const due=Number(dueAt),receivedNow=Number(now);
 if(!(due>0&&receivedNow>=due))return null;
 let best=null;
 const consider=q=>{
  const ts=Number(q.ts),received=Number(q.receivedAt??q.ts),price=Number(q.price);
  if(!(ts>0&&ts<=due&&due-ts<=maxAgeMs&&received<=receivedNow&&Number.isFinite(price)&&price>0))return;
  if(!best||ts>best.ts||(ts===best.ts&&received<best.receivedAt))best={ts,price,receivedAt:received};
 };
 for(const q of quoteHistory)consider(q);
 // The explicit current feed quote is an observed source too. It may be
 // at the exact deadline before a caller appends it to its retained array.
 if(currentQuote)consider(currentQuote);
 return best;
}

// One structural timeline for two independent analysts. A confirmed reversal
// in CLOSED bars must be considered before following the opposite direction.
// Do not ban trend entries at highs/lows: a newly accepted counter-break can
// invalidate that reversal, regardless of candle size, RSI, or price stretch.
const positive=n=>n!=null&&Number.isFinite(Number(n))&&Number(n)>0;
export function reconcileEntryWithConfirmedReversal(candidate,monitor,snap,now){
  const alert=monitor?.active===true?monitor.alert:null;
  if(!candidate?.allowed||!alert||alert.testing===true||
     alert.evidence?.source!=='closed-5s-break-and-follow-through'||
     !['CALL','PUT'].includes(alert.side)||candidate.side===alert.side||
     !positive(alert.createdAt)||!positive(alert.invalidation))
    return candidate;
  const lastPrice=Number(snap?.price),lastQuoteTs=Number(snap?.quoteTs);
  if(!positive(lastPrice)||!positive(lastQuoteTs)||lastQuoteTs>now||lastQuoteTs<Number(alert.createdAt))
    return candidate;
  const sign=candidate.side==='CALL'?1:-1,level=Number(alert.invalidation);
  // The alert's OWN invalidation level (not an invented moving threshold).
  // It is superseded only by two NEW quotes progressing beyond that level,
  // after its completed reversal structure was confirmed.
  const rows=(snap.quoteHistory||[]).filter(q=>
    positive(q?.ts)&&positive(q?.price)&&Number(q.ts)>=Number(alert.createdAt)&&Number(q.ts)<=lastQuoteTs
  ).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
  if(!rows.some(q=>q.ts===lastQuoteTs))rows.push({ts:lastQuoteTs,price:lastPrice});
  const beyond=rows.filter(q=>sign*(q.price-level)>0);
  const first=beyond[0],second=first?beyond.find(q=>q.ts>first.ts&&sign*(q.price-first.price)>0):null;
  const accepted=!!second&&sign*(lastPrice-level)>0&&sign*(lastPrice-second.price)>=0;
  if(accepted)return {...candidate,reversalArbitration:'new-continuation-confirmed'};
  return {...candidate,allowed:false,blockedBy:'opposite-reversal-evidence',
    reason:'Reversão contrária confirmada em barras fechadas; aguardando nova estrutura de continuação ou virada.' ,
    reversalArbitration:'opposite-structure-newer'};
}

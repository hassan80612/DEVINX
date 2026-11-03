// Preserve the real live quote stream only when a same-asset CANDLE is
// malformed. An unknown/mismatched broker active ID MUST reset everything.
export function preserveLiveQuotesOnCandleFailure230({st,integrity,now=Date.now(),pairKey}={}){
 if(!st||integrity?.ok===true||typeof pairKey!=='function')return false;
 if(st.activeId==null||st.candleActiveId==null||
  Number(st.activeId)!==Number(st.candleActiveId))return false;
 if(!st.symbol||st.screenCandidateSymbol||
  pairKey(st.symbol)!==pairKey(st.uiSymbol||st.symbol))return false;
 const quoteAt=Number(st.lastQuoteAt),last=st.quoteHistory?.at(-1),
  lastAt=Number(last?.ts),price=Number(st.quote);
 return price>0&&Number(last?.price)>0&&quoteAt>0&&lastAt>0&&
  Number(now)>=quoteAt&&Number(now)-quoteAt<=2500&&
  lastAt<=Number(now)+300&&Math.abs(lastAt-quoteAt)<=2000;
}

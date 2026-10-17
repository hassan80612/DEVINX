// Evaluation helper, not agent code. A complete quoted-price stream defines
// its bid at an instant by the last update at or before that instant.
export function expiryQuote(quotes,at,policy='first-after-within-1s'){
 if(!quotes.length||at>quotes.at(-1).ts)return null;
 let lo=0,hi=quotes.length;
 if(policy==='asof-complete-bid-stream'){
  while(lo<hi){const mid=(lo+hi)>>>1;if(quotes[mid].ts<=at)lo=mid+1;else hi=mid;}
  return lo?quotes[lo-1]:null;
 }
 while(lo<hi){const mid=(lo+hi)>>>1;if(quotes[mid].ts<at)lo=mid+1;else hi=mid;}
 return quotes[lo]?.ts<=at+1000?quotes[lo]:null;
}

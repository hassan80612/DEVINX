// Bound memory by elapsed market time, retaining observed OHLC samples in each
// 250ms bucket. Never interpolate prices or move their observation timestamps.
// The latest genuine tick is always retained; this introduces no collection wait.
export function compactObservedQuoteHistory(rows,{windowMs=300000,bucketMs=250}={}){
 if(!Array.isArray(rows)||!rows.length)return [];
 let ordered=rows.filter(q=>Number.isFinite(Number(q?.ts))&&Number.isFinite(Number(q?.price))&&Number(q.price)>0);
 if(ordered.some((q,i)=>i&&Number(q.ts)<Number(ordered[i-1].ts)))
  ordered=ordered.slice().sort((a,b)=>Number(a.ts)-Number(b.ts));
 if(!ordered.length)return [];
 const cutoff=Number(ordered.at(-1).ts)-windowMs,result=[];
 let bucket=null,first=null,low=null,high=null,last=null;
 const flush=()=>{
  if(!first)return;
  const selected=[...new Set([first,low,high,last])].sort((a,b)=>Number(a.ts)-Number(b.ts));
  result.push(...selected);
 };
 for(const q of ordered){
  if(Number(q.ts)<cutoff)continue;
  const key=Math.floor(Number(q.ts)/bucketMs);
  if(key!==bucket){flush();bucket=key;first=low=high=last=q;}
  else{
   if(Number(q.price)<Number(low.price))low=q;
   if(Number(q.price)>Number(high.price))high=q;
   last=q;
  }
 }
 flush();return result;
}

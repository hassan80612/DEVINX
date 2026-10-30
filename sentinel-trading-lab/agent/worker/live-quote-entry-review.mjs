// Last-mile market verification using the EXISTING broker feed.
// No new broker IO, polling, artificial waiting or direction prediction.
const sign=side=>side==='CALL'?1:side==='PUT'?-1:0;
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]||0;};
export function liveEntryQuoteReview({signal,context,now=Date.now()}={}){
 if(signal?.independent)return {ok:true,reason:'independent-mode'};
 const at=Number(context?.quoteAt),spot=Number(context?.quote),entry=Number(signal?.entryPrice),
  issued=Number(signal?.at),sourceAt=Number(signal?.sourceQuoteAt||0),duration=Number(signal?.durationMs);
 const d=sign(signal?.side);
 if(!d||!(at>0&&spot>0&&entry>0&&issued>0&&now>=at&&at>=0&&at<=now))
  return {ok:false,reason:'missing-current-quote'};
 // Timestamped broker snapshots are second-resolution. This is a bound on
 // evidence age, not a fixed delay or a guess about the next candle.
 const maxQuoteAgeMs=duration<=30000?1450:duration<=60000?1600:2500;
 if(now-at>maxQuoteAgeMs)return {ok:false,reason:'quote-aged-before-click',quoteAgeMs:now-at};
 if(sourceAt&&at<sourceAt)return {ok:false,reason:'broker-quote-behind-decision'};
 if(spot===entry)return {ok:true,reason:'unchanged-current-price',quoteAgeMs:now-at};
 const rows=(Array.isArray(context?.quoteHistory)?context.quoteHistory:[]).slice(-26)
  .filter(q=>Number(q?.ts)<=at&&Number(q?.receivedAt??q?.ts)<=now&&
   Number.isFinite(Number(q?.price))&&Number(q.price)>0);
 const last=rows.at(-1);
 if(rows.length<3||Number(last?.ts)!==at||Number(last?.price)!==spot)
  return {ok:false,reason:'changed-price-without-current-tape'};
 const diffs=[];
 for(let i=1;i<rows.length;i++){
  if(Number(rows[i].ts)<=Number(rows[i-1].ts))continue;
  const delta=Math.abs(Number(rows[i].price)-Number(rows[i-1].price));
  if(delta>0)diffs.push(delta);
 }
 if(!diffs.length)return {ok:false,reason:'changed-price-without-noise-scale'};
 const typical=Math.max(median(diffs),entry*1e-8);
 const displacement=d*(spot-entry);
 // A reversal that already turned back is stale; an extended favorable
 // impulse has also lost its original entry price. Neither is chased.
 if(displacement< -Math.max(typical*1.5,entry*1e-7))
  return {ok:false,reason:'current-price-opposes-entry',displacement,typical};
 if(displacement>Math.max(typical*3.5,entry*2e-7))
  return {ok:false,reason:'current-price-already-extended',displacement,typical};
 return {ok:true,reason:'current-price-still-compatible',displacement,typical,quoteAgeMs:now-at};
}

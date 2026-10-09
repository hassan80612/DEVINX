const BAR_MS=5000,MAX_GAP=2500,HISTORY_MS=180000;
const valid=n=>n!=null&&Number.isFinite(Number(n));

// Quote-derived closed bars only. A chart candle in progress, duplicated
// timestamp, sparse close or future sample cannot confirm a structural turn.
export function closedPriceBars(snap,now){
  const end=Math.min(now,Number(snap.quoteTs)),unique=new Map();
  for(const q of snap.quoteHistory||[]){
    const ts=Number(q.ts),price=Number(q.price);
    if(valid(q.ts)&&valid(q.price)&&price>0&&ts<=end&&ts>=end-HISTORY_MS&&!unique.has(ts))unique.set(ts,{ts,price});
  }
  const bars=new Map();
  for(const q of [...unique.values()].sort((a,b)=>a.ts-b.ts)){
    const from=Math.floor(q.ts/BAR_MS)*BAR_MS,to=from+BAR_MS;
    if(to>end)continue;
    let b=bars.get(from);
    if(!b){b={from,to,open:q.price,high:q.price,low:q.price,close:q.price,count:0,firstTs:q.ts,lastTs:q.ts,maxGap:0};bars.set(from,b);}
    b.high=Math.max(b.high,q.price);b.low=Math.min(b.low,q.price);b.close=q.price;
    b.maxGap=Math.max(b.maxGap,q.ts-b.lastTs);b.lastTs=q.ts;b.count++;
  }
  return [...bars.values()].filter(b=>b.count>=2&&b.firstTs<=b.from+MAX_GAP&&b.lastTs>=b.to-MAX_GAP&&b.maxGap<=MAX_GAP);
}

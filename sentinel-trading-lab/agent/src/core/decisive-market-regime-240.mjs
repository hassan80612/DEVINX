// Sentinel 240: decisive, causal chart regime for 30s/1m ONLY.
// The key describes the market; it never opens an order, picks an expiry,
// or overrides a verified reversal. It uses completed five-second receipts,
// avoiding one-second micro-noise incorrectly marking a trend as sideways.
const finite=x=>Number.isFinite(Number(x))&&Number(x)>0;
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);
 return sorted.length?sorted[Math.floor(sorted.length/2)]:0;};
export function decisiveMarketRegime240({
 quoteHistory=[],quoteAt,now=quoteAt,price,durationMs
}={}){
 const duration=Number(durationMs),at=Number(quoteAt),clock=Number(now),spot=Number(price);
 const unknown=reason=>({kind:'unconfirmed',side:null,reason});
 if(![30000,60000].includes(duration)||!(at>0&&clock>=at&&
    clock-at<=(duration===30000?1450:1950)&&finite(spot)))return unknown('unsupported-or-stale');
 const cutoff=at-95000,rows=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const r=quoteHistory[i],ts=Number(r?.ts),received=Number(r?.receivedAt??ts),
   p=Number(r?.price);
  if(ts<cutoff)break;
  if(ts>at||received>clock)continue;
  if(!finite(p))return unknown('invalid-quote');
  rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.length<45||rows.at(-1).ts!==at||rows.at(-1).price!==spot)
  return unknown('missing-current-history');
 // Do not infer an unobserved 5s candle from an interpolated price.
 const end=Math.floor(at/5000)*5000,bins=new Map();
 for(const q of rows){
  if(q.ts<end-65000||q.ts>=end)continue;
  const start=Math.floor(q.ts/5000)*5000;
  if(!bins.has(start))bins.set(start,[]);
  bins.get(start).push(q);
 }
 const bars=[];
 for(let start=end-60000;start<end;start+=5000){
  const ticks=bins.get(start)||[];
  if(ticks.length<2||ticks[0].ts-start>2200||
    start+5000-ticks.at(-1).ts>2400||
    ticks.some((t,i)=>i>0&&(t.ts<=ticks[i-1].ts||t.ts-ticks[i-1].ts>2600)))
   return unknown('unverified-closed-bars');
  bars.push({open:ticks[0].price,close:ticks.at(-1).price,
   high:Math.max(...ticks.map(x=>x.price)),
   low:Math.min(...ticks.map(x=>x.price))});
 }
 const n=bars.length,closes=bars.map(x=>Math.log(x.close)),
  ranges=bars.map(x=>Math.log(x.high/x.low)).filter(x=>x>0);
 const medianRange=median(ranges),net=closes.at(-1)-Math.log(bars[0].open);
 let xx=0,yy=0,xy=0;const meanY=closes.reduce((a,b)=>a+b,0)/n,meanX=(n-1)/2;
 for(let i=0;i<n;i++){
  const x=i-meanX,y=closes[i]-meanY;
  xx+=x*x;yy+=y*y;xy+=x*y;
 }
 const fit=xx>0&&yy>0?Math.max(0,Math.min(1,xy*xy/(xx*yy))):0;
 const slope=xx>0?xy/xx:0;
 let path=0;
 for(let i=1;i<n;i++)path+=Math.abs(closes[i]-closes[i-1]);
 const efficiency=path>0?Math.abs(net)/path:0;
 const side=net>0?'CALL':net<0?'PUT':null,sign=net>0?1:-1;
 const parts=[bars.slice(0,4),bars.slice(4,8),bars.slice(8,12)];
 const highs=parts.map(b=>Math.max(...b.map(x=>x.high))),
  lows=parts.map(b=>Math.min(...b.map(x=>x.low)));
 const margin=Math.max(medianRange*.08,Math.abs(net)*.012,1e-12);
 const progressive=side!=null&&
  sign*(highs[1]-highs[0])>highs[0]*margin&&
  sign*(highs[2]-highs[1])>highs[1]*margin&&
  sign*(lows[1]-lows[0])>lows[0]*margin&&
  sign*(lows[2]-lows[1])>lows[1]*margin;
 const latest=Math.log(bars.at(-1).close/bars.at(-4).close);
 const directional=side!=null&&medianRange>0&&
  Math.abs(net)>=medianRange*2.5&&sign*slope>0&&
  (fit>=.66||(progressive&&fit>=.42))&&
  sign*latest>=-Math.abs(net)*.38;
 if(directional)return {kind:'trend',side,fit,efficiency,
  progressive,reason:'confirmed-directional-five-second-bars',observedBars:n};
 // Range needs repeated reversals, not just weak net/path efficiency.
 const pivots=[];
 for(let i=1;i<closes.length-1;i++){
  if(closes[i]>closes[i-1]&&closes[i]>closes[i+1])pivots.push('HIGH');
  else if(closes[i]<closes[i-1]&&closes[i]<closes[i+1])pivots.push('LOW');
 }
 const alternations=pivots.slice(1).filter((x,i)=>x!==pivots[i]).length;
 const width=Math.max(...closes)-Math.min(...closes);
 const range=medianRange>0&&fit<.42&&efficiency<.38&&
  alternations>=3&&width>=medianRange*2.5&&
  Math.abs(net)<=width*.42;
 if(range)return {kind:'range',side:null,fit,efficiency,
  reason:'repeated-confirmed-two-sided-swings',observedBars:n};
 return {kind:'unconfirmed',side:null,fit,efficiency,
  reason:'no-decisive-trend-or-range',observedBars:n};
}

const ms=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?(n<1e12?n*1000:n):null;};
const clamp=v=>Math.max(-15,Math.min(15,v));

// Broker bars carry explicit starts/ends; trade expiry NEVER sets chart period.
// receivedAt is mandatory: a backfilled bar was not known at its historical close.
export function prepareClosedCandles(candles=[],candleSeconds){
 const period=Number(candleSeconds)*1000;
 if(!Number.isInteger(period)||period<1000)return [];
 const known=new Map();
 for(const c of candles){
  const from=ms(c.from),to=ms(c.to),receivedAt=ms(c.receivedAt);
  const [open,high,low,close]=['open','high','low','close'].map(k=>Number(c[k]));
  if(from===null||to===null||receivedAt===null||to-from!==period||
   ![open,high,low,close].every(n=>Number.isFinite(n)&&n>0)||
   low>Math.min(open,close)||high<Math.max(open,close)||high<low)continue;
  const readyAt=Math.max(to,receivedAt),key=from;
  if(!known.has(key)||readyAt<known.get(key).readyAt)
   known.set(key,{from,to,readyAt,open,high,low,close});
 }
 return [...known.values()].sort((a,b)=>a.to-b.to);
}

export function contextFromClosedCandles(prepared,asOf,candleSeconds,holdingSeconds){
 const now=Number(asOf),period=Number(candleSeconds)*1000;
 let lo=0,hi=prepared.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(prepared[mid].to<=now)lo=mid+1;else hi=mid;}
 // The newest closed bar must itself have arrived; do not skip a delayed bar
 // and disguise an older trio as the current three-bar structure.
 const bars=prepared.slice(Math.max(0,lo-3),lo);
 if(bars.length!==3||bars.some(c=>c.readyAt>now)||now-bars[2].to>=period||
  bars[1].from!==bars[0].to||bars[2].from!==bars[1].to)return null;
 const logs=bars.map(c=>Object.fromEntries(['open','high','low','close'].map(k=>[k,Math.log(c[k])])));
 const ranges=logs.map(c=>c.high-c.low);
 const scale=Math.max(1e-8,Math.sqrt(ranges.reduce((s,r)=>s+r*r,0)/3));
 const x=[1];
 for(const c of logs){
  const range=c.high-c.low;
  x.push(clamp((c.close-c.open)/scale),clamp(range/scale),
   clamp((c.high-Math.max(c.open,c.close))/scale),
   clamp((Math.min(c.open,c.close)-c.low)/scale),
   range>1e-12?2*(c.close-c.low)/range-1:0);
 }
 for(let i=1;i<3;i++){
  x.push(clamp((logs[i].high-logs[i-1].high)/scale),
   clamp((logs[i].low-logs[i-1].low)/scale),
   clamp((logs[i].open-logs[i-1].close)/scale));
 }
 x.push(clamp((logs[2].close-logs[0].open)/scale),
  clamp(((logs[2].close-logs[2].open)-(logs[1].close-logs[1].open))/scale),
  clamp(Math.log((ranges[2]+1e-8)/(ranges[0]+1e-8))));
 return {x,scale:scale*Math.sqrt(Number(holdingSeconds)/Number(candleSeconds)),
  bars:bars.map(c=>({from:c.from,to:c.to,readyAt:c.readyAt})),
  candleSeconds:Number(candleSeconds),latestClosedAt:bars[2].to};
}

export function closedCandleContext({candles=[],asOf=Date.now(),candleSeconds,holdingSeconds=30}={}){
 return contextFromClosedCandles(prepareClosedCandles(candles,candleSeconds),asOf,candleSeconds,holdingSeconds);
}

// Live adapter: freeze the FIRST closed observation and its actual arrival.
// Asset, provider or chart-period changes invalidate all prior candle memory.
export function retainClosedCandleHistory({previous=null,candles=[],now=Date.now(),asset,provider,candleSeconds}={}){
 const key=JSON.stringify([String(provider),String(asset).toUpperCase(),Number(candleSeconds)]);
 const rows=previous?.key===key?previous.candles:[];
 const fresh=candles.map(c=>({...c,receivedAt:now}));
 const closed=prepareClosedCandles([...rows,...fresh],candleSeconds).filter(c=>c.to<=now);
 return {key,candles:closed.slice(-600).map(c=>({...c,receivedAt:c.readyAt}))};
}

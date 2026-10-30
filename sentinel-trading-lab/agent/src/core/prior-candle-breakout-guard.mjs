// A wick through the PREVIOUS closed candle is not a confirmed breakout.
// Observe the already buffered quotes to distinguish a sustained breach from
// a liquidity sweep/reclaim; do not predict or manufacture opposite entries.
const tick=(x)=>Number(x),sign=side=>side==='CALL'?1:side==='PUT'?-1:0;
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]||0;};
export function reviewPriorCandleBreakout({candidate,candles=[],quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 if(candidate?.ready!==true||![30000,60000].includes(Number(durationMs)))return candidate;
 const dir=sign(candidate.side),at=tick(quoteAt),clock=tick(now),spot=tick(price);
 if(!dir||!(at>0&&clock>=at&&clock-at<=2500&&spot>0))return candidate;
 if(!Array.isArray(candles)||!Array.isArray(quoteHistory))return candidate;
 // Match only a real, FINISHED broker candle; never derive a level from
 // the current unfinished candle, an older instrument, or future data.
 const completed=candles.map(c=>{
  const from=tick(c?.from),to=tick(c?.to);
  return {from:from<1e12?from*1000:from,to:to<1e12?to*1000:to,
   high:tick(c?.high??c?.max),low:tick(c?.low??c?.min)};
 }).filter(c=>Number.isFinite(c.from)&&Number.isFinite(c.to)&&c.to>c.from&&
  c.high>c.low&&c.low>0&&c.to<=at&&at-c.to<=Math.min(90000,1.5*(c.to-c.from)))
 .sort((a,b)=>b.to-a.to);
 const previous=completed[0];
 if(!previous)return candidate;
 const edge=dir===1?previous.high:previous.low,range=previous.high-previous.low;
 const tape=quoteHistory.filter(q=>{
  const ts=tick(q?.ts),p=tick(q?.price),received=tick(q?.receivedAt??ts);
  return ts>=previous.to&&ts<=at&&received<=clock&&p>0&&Number.isFinite(p);
 }).slice(-100).map(q=>({ts:tick(q.ts),price:tick(q.price)}))
  .sort((a,b)=>a.ts-b.ts);
 if(tape.length<3||tape.at(-1).ts!==at||tape.at(-1).price!==spot||
  tape.some((q,i)=>i>0&&(q.ts<=tape[i-1].ts||q.ts-tape[i-1].ts>3000)))return candidate;
 const changes=tape.slice(1).map((q,i)=>Math.abs(q.price-tape[i].price)).filter(x=>x>0);
 if(changes.length<2)return candidate;
 const tolerance=Math.max(median(changes)*.65,spot*1e-7,range*.003);
 // The crossing must be observed, not merely inferred from the latest wick.
 if(dir*(tape[0].price-edge)>-tolerance)return candidate;
 // Detect the first actual poke even when its depth is smaller than the
 // recent noisy tick size. That first poke is NOT proof of acceptance.
 const first=tape.findIndex(q=>dir*(q.price-edge)>Math.max(spot*1e-7,range*.003));
 if(first<0)return candidate;
 const after=tape.slice(first),extreme=Math.max(...after.map(q=>dir*(q.price-edge)));
 const lastStep=dir*(spot-tape.at(-2).price);
 const recentAgainst=after.slice(-3).filter((q,i,a)=>i>0&&dir*(q.price-a[i-1].price)<-tolerance*.25).length;
 const inside=dir*(spot-edge)<-tolerance;
 const retreat=extreme-dir*(spot-edge);
 const evidence={kind:inside?'prior-candle-sweep-reclaimed':'prior-candle-breakout-unconfirmed',
  level:edge,observedAt:at,breachDirection:candidate.side,retreat,tolerance};
 const decline=recentAgainst>=1&&lastStep< -tolerance*.25&&
  retreat>Math.max(tolerance*1.5,range*.008);
 // Reclaim or real fading momentum means the previous candle's edge
 // opposed the proposed CONTINUATION. Wait for its own verified reversal.
 if(inside||decline)return {...candidate,ready:false,side:null,
  provisionalSide:candidate.side,reason:'prior-candle-failed-breakout',entryRisk:evidence};
 // True breakouts need actual OUTSIDE participation, not one tick.
 // Strong movement may qualify immediately; no fixed post-breach sleep.
 const positive=after.slice(1).filter((q,i)=>dir*(q.price-after[i].price)>tolerance*.25).length;
 const advance=dir*(spot-edge);
 const accepted=after.length>=3&&positive>=2&&
  advance>Math.max(tolerance*2,range*.008)&&lastStep>=-tolerance*.25;
 if(accepted)return candidate;
 return {...candidate,ready:false,side:null,
  provisionalSide:candidate.side,reason:'prior-candle-breakout-unproven',entryRisk:evidence};
}

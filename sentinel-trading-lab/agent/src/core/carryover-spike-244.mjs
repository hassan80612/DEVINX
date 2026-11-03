// A large, terminally extended PREVIOUS candle can be a better contrarian
// opportunity at the first live quotes of the next candle. No counter-tick,
// bar close wait, order execution or expiry mutation. Observations are causal.
const median=a=>{const q=[...a].sort((x,y)=>x-y);return q[Math.floor(q.length/2)]||0};
export function assessCarryoverSpike244({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 const none={kind:'none'},at=Number(quoteAt),clock=Number(now),spot=Number(price),ms=Number(durationMs);
 if(![30000,60000].includes(ms)||candidate?.ready!==true||
    !['CALL','PUT'].includes(candidate?.side)||!(at>0&&clock>=at&&clock-at<=1950&&spot>0))
  return none;
 const activeStart=Math.floor(at/ms)*ms,elapsed=at-activeStart;
 if(!(elapsed>=1000&&elapsed<=(ms===60000?9500:6500)))return none;
 const start=activeStart-ms*4,sign=candidate.side==='CALL'?1:-1;
 const q=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(v=>{
  const ts=Number(v?.ts),rec=Number(v?.receivedAt??ts),p=Number(v?.price);
  return ts>=start&&ts<=at&&rec<=clock&&p>0;
 }).map(v=>({ts:Number(v.ts),price:Number(v.price)})).sort((a,b)=>a.ts-b.ts);
 if(q.length<ms/1000*2.5||q.at(-1)?.ts!==at||q.at(-1)?.price!==spot||
    q.some((v,i)=>i>0&&(v.ts<=q[i-1].ts||v.ts-q[i-1].ts>2550)))return none;
 const bars=[];
 for(let b=activeStart-3*ms;b<activeStart;b+=ms){
  const seg=q.filter(v=>v.ts>=b&&v.ts<b+ms);
  if(seg.length<ms/1000*.55||seg[0].ts>b+2000||
     seg.at(-1).ts<b+ms-2500)return none;
  const prices=seg.map(v=>v.price);
  bars.push({open:seg[0].price,close:seg.at(-1).price,
   high:Math.max(...prices),low:Math.min(...prices)});
 }
 const prev=bars[2],older=bars.slice(0,2),range=prev.high-prev.low,
  body=sign*(prev.close-prev.open),oldRange=median(older.map(v=>v.high-v.low)),
  oldBody=median(older.map(v=>Math.abs(v.close-v.open)));
 if(!(range>0&&body>0&&oldRange>0&&
   body>=Math.max(oldBody*2.15,oldRange*1.20)&&
   range>=oldRange*1.75))return none;
 // The last completed candle must close at its own impulse extreme.
 if(sign===1?prev.high-prev.close>range*.13:prev.close-prev.low>range*.13)return none;
 const nowRows=q.filter(v=>v.ts>=activeStart);
 if(nowRows.length<2)return none;
 const step=q.slice(1).filter((v,i)=>q[i].ts>=activeStart-ms&&q[i].ts<activeStart)
  .map((v,i)=>Math.abs(v.price-q[q.indexOf(v)-1]?.price))
  .filter(x=>x>0);
 const typical=median(step)||spot*1e-8;
 const proceed=sign*(spot-prev.close);
 // The next candle is currently MOVING WITH the prior spike, not correcting it.
 if(!(proceed>=Math.max(typical*.8,range*.012)&&proceed<=range*.23))return none;
 const latest=nowRows.slice(-2);
 if(sign*(latest.at(-1).price-latest[0].price)< -typical*.10)return none;
 return {kind:'flip',side:candidate.side==='CALL'?'PUT':'CALL',
  impulseSide:candidate.side,activeClimax:true,carryoverClimax:true,at,
  previousBodyRatio:Number((body/Math.max(oldBody,spot*1e-8)).toFixed(2)),
  previousRangeRatio:Number((range/oldRange).toFixed(2)),
  candleElapsedMs:elapsed,reason:'prior-candle-exhaustion-at-new-open-244'};
}

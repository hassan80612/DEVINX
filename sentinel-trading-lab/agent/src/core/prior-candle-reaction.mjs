// Observe a reaction to the PREVIOUS completed chart candle, not its colour.
// No timers, order permissions, independent CALL/PUT votes or invented prices.
export function priorCandleReaction({candles=[],quoteHistory=[],asOf=Date.now(),sigma=0}={}){
 const now=Number(asOf),v=Number(sigma);
 if(!(v>0))return null;
 const closed=(Array.isArray(candles)?candles:[]).map(c=>({
  from:Number(c.from)*1000,to:Number(c.to)*1000,
  high:Number(c.high??c.max),low:Number(c.low??c.min)
 })).filter(c=>c.to<=now&&c.to>c.from&&c.high>c.low&&c.low>0)
  .sort((a,b)=>b.to-a.to||b.from-a.from);
 const bar=closed[0];
 if(!bar||now-bar.to>bar.to-bar.from)return null;
 const known=new Map();
 for(const q of quoteHistory||[]){
  const ts=Number(q.ts),p=Number(q.price);
  if(ts<Math.max(bar.to,now-15000)||ts>now||Number(q.receivedAt??ts)>now||!(p>0))continue;
  if(!known.has(ts))known.set(ts,{ts,lp:Math.log(p)});
 }
 const rows=[...known.values()].sort((a,b)=>a.ts-b.ts);
 if(rows.length<3||now-rows.at(-1).ts>2500)return null;
 const high=Math.log(bar.high),low=Math.log(bar.low);
 const band=Math.max(v*.35,(high-low)*.02);
 const last=rows.at(-1);
 for(const [edge,sign,label] of [[high,1,'previous-high'],[low,-1,'previous-low']]){
  let pivot=0;
  for(let i=1;i<rows.length;i++)if(sign*rows[i].lp>sign*rows[pivot].lp)pivot=i;
  const touch=rows[pivot],tail=rows.slice(pivot);
  if(sign*(touch.lp-edge)<-band||tail.length<3)continue;
  const dt=(last.ts-touch.ts)/1000;
  if(!(dt>0&&dt<=15)||tail.some((q,i)=>i&&q.ts-tail[i-1].ts>2500))continue;
  const legs=tail.slice(1).map((q,i)=>sign*(q.lp-tail[i].lp));
  const retreat=sign*(touch.lp-last.lp),noise=v*Math.sqrt(Math.max(1,dt));
  const lowerProgress=legs.filter(d=>d<0).length>=2&&legs.at(-1)<0;
  // An actual return inside the old range distinguishes rejection from
  // acceptance above/below the prior candle. One opposite tick is insufficient.
  if(lowerProgress&&retreat>noise*.75&&sign*(last.lp-edge)<-band){
   return {kind:'prior-candle-rejection',level:Math.exp(edge),edge:label,
    rate:(last.lp-touch.lp)/dt,pivotAt:touch.ts,observedAt:last.ts,
    normalizedRetreat:retreat/noise};
  }
 }
 return null;
}

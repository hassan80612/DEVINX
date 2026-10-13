// Causal quote-only review of a developing reversal. Advisory evidence for
// BOTH forecast modes, never an independent trade direction or a timer.
const neutral=(reason)=>({blocked:false,phase:'neutral',reason});
export function oppositeTurnPressure({quoteHistory=[],now=Date.now(),quoteTs=now,side}={}){
  if(side!=='CALL'&&side!=='PUT')return neutral('no-side');
  const cutoff=Math.min(Number(now),Number(quoteTs));
  if(!Number.isFinite(cutoff)||Number(now)-cutoff>2500)return neutral('stale-quote');
  const rows=[...new Map((Array.isArray(quoteHistory)?quoteHistory:[])
    .filter(q=>Number.isFinite(Number(q?.ts))&&Number(q.ts)<=cutoff&&Number(q.ts)>=now-30000&&
      Number.isFinite(Number(q?.price))&&Number(q.price)>0&&
      Number(q.receivedAt??q.ts)<=now)
    .map(q=>[Number(q.ts),{ts:Number(q.ts),price:Number(q.price)}])).values()]
    .sort((a,b)=>a.ts-b.ts);
  if(rows.length<12||cutoff-rows.at(-1).ts>2500)return neutral('insufficient-quotes');
  const at=seconds=>{
    const target=cutoff-seconds*1000;
    let lo=0,hi=rows.length-1,index=-1;
    while(lo<=hi){const m=(lo+hi)>>1;if(rows[m].ts<=target){index=m;lo=m+1}else hi=m-1}
    return index>=0&&target-rows[index].ts<=2000?rows[index].price:null;
  };
  const values=[20,10,6,3,1,0].map(at);
  if(values.some(p=>!(p>0)))return neutral('insufficient-observed-history');
  let squared=0,seconds=0;
  for(let i=1;i<rows.length;i++){
    const dt=(rows[i].ts-rows[i-1].ts)/1000;
    if(!(dt>0&&dt<=3))continue;
    squared+=Math.log(rows[i].price/rows[i-1].price)**2;seconds+=dt;
  }
  if(seconds<12||!(squared>0))return neutral('insufficient-volatility');
  const sign=side==='CALL'?1:-1;
  const move=(a,b)=>sign*Math.log(b/a);
  const advance=move(values[0],values[2]);
  const setback=-move(values[2],values[5]);
  const legs=[move(values[2],values[3]),move(values[3],values[4]),move(values[4],values[5])];
  const volatility=Math.sqrt(squared/seconds);
  const reversalMagnitude=setback/(volatility*Math.sqrt(6));
  const retreat=advance>0?setback/advance:0;
  const persistent=legs.filter(v=>v<0).length>=2&&legs[0]<0&&legs[1]+legs[2]<0;
  const blocked=advance>volatility*Math.sqrt(14)*.75&&
    setback>volatility*Math.sqrt(6)*1.35&&retreat>=.36&&persistent;
  return {blocked,phase:blocked?'counterpressure-confirmed':
      setback>volatility*Math.sqrt(6)*.75&&persistent?'turn-in-test':'trend-or-range',
    reason:blocked?'persistent-opposite-move-before-entry':'no-confirmed-opposite-break',
    retreatRatio:Number(retreat.toFixed(3)),normalizedSetback:Number(reversalMagnitude.toFixed(3))};
}

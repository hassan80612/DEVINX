// Research only: do not issue a trend-following entry while an observed,
// material 6s pullback still opposes an already established 90s trend.
// No direction inversion, order, new admission, cooldown or broker read.
const median=xs=>{const s=[...xs].sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:0;};
export function trendPullbackContext({quoteHistory=[],quoteAt,price,now=quoteAt}={}){
 const ts=Number(quoteAt),spot=Number(price),none=reason=>({identified:false,reason});
 if(!(ts>0&&ts<=now&&now-ts<=1450&&Number.isFinite(spot)&&spot>0))return none('invalid-entry-quote');
 const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>q.ts>=ts-90000&&q.ts<=ts&&
  (q.receivedAt??q.ts)<=now&&Number.isFinite(q.price)&&q.price>0).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==ts||rows.at(-1).price!==spot)return none('unverified-entry-quote');
 const seconds=new Map();for(const q of rows)if(q.ts<=ts-6000)seconds.set(Math.floor(q.ts/1000),q);
 const prior=[...seconds.values()];
 if(prior.length<40||prior.at(-1).ts-prior[0].ts<60000||
  prior.some((q,i)=>i&&q.ts-prior[i-1].ts>3000)||ts-6000-prior.at(-1).ts>1500)
  return none('insufficient-contiguous-prior-trend');
 const tx=prior.map(q=>(q.ts-ts)/1000),ys=prior.map(q=>Math.log(q.price));
 const mx=tx.reduce((a,b)=>a+b,0)/tx.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;
 let xx=0,yy=0,xy=0;
 for(let i=0;i<tx.length;i++){const x=tx[i]-mx,y=ys[i]-my;xx+=x*x;yy+=y*y;xy+=x*y;}
 const fit=xx>0&&yy>0?xy*xy/(xx*yy):0;
 // Same strong-direction fit boundary already used by the released range detector.
 if(fit<.70||!xy)return none('no-strong-prior-trend');
 const changes=prior.slice(1).map((q,i)=>Math.abs(Math.log(q.price/prior[i].price))).filter(x=>x>0);
 const amplitude=median(changes)*2;
 if(!(amplitude>0))return none('no-observed-change-scale');
 const trend=xy>0?1:-1,recentMove=Math.log(spot/prior.at(-1).price);
 return {identified:true,trendSide:trend>0?'CALL':'PUT',fit,recentMove,amplitude,
  pullback:trend*recentMove< -amplitude,observedPoints:prior.length,
  trendStartAt:prior[0].ts,trendEndAt:prior.at(-1).ts};
}
export function qualifyTrendPullback({candidate,durationMs=30000,...input}={}){
 if(Number(durationMs)!==30000||candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side))return candidate;
 const context=trendPullbackContext(input);
 if(!context.identified||!context.pullback||context.trendSide!==candidate.side)return candidate;
 return {...candidate,ready:false,side:null,provisionalSide:candidate.side,entryPrice:null,
  reason:'research-trend-pullback-not-resumed',
  pullbackEntryEvidence:{...context,originalSide:candidate.side,originalReason:candidate.reason}};
}

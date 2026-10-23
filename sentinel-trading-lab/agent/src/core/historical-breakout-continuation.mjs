// Read-only final evidence review shared by all strategies and durations.
// An old confirmed pivot, including 16 closed candles ago, is still a
// relevant price barrier. A rising last candle is NOT proof of a breakout.
// No broker requests, independent timers, inverted trades or future prices.
const valid=n=>Number.isFinite(Number(n))&&Number(n)>0;
const sideSign=side=>side==='CALL'?1:side==='PUT'?-1:0;
export function reviewHistoricalBreakoutContinuation({
 candidate,structure,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs
}={}){
 if(candidate?.ready!==true||!sideSign(candidate.side)||
   !(structure?.candles>=5)||!Array.isArray(structure.zones))return candidate;
 const spot=Number(price),ts=Number(quoteAt),sign=sideSign(candidate.side);
 if(!valid(spot)||!(ts>0&&ts<=now&&now-ts<=1450))return candidate;
 // Work only with closed candle pivots/rejections. A lone wick in the
 // current candle must not manufacture a level or stop a real trend.
 const levels=structure.zones.filter(z=>
   (Number(z.confirmedPivots)||0)>0||(Number(z.independentRejections)||0)>=2);
 if(!levels.length)return candidate;
 const atr=Number(structure.atr),tol=Number(structure.tolerance);
 if(!(atr>0&&tol>0))return candidate;
 const map=new Map();
 for(const q of quoteHistory){
  const t=Number(q?.ts),p=Number(q?.price),received=Number(q?.receivedAt??t);
  if(!(t>=ts-16000&&t<=ts&&received<=now&&valid(p)))continue;
  if(!map.has(t)||received<map.get(t).receivedAt)map.set(t,{ts:t,price:p,receivedAt:received});
 }
 const q=[...map.values()].sort((a,b)=>a.ts-b.ts);
 if(q.length<5||q.at(-1).ts!==ts||Math.abs(q.at(-1).price-spot)>spot*1e-10)
  return candidate;
 const before=at=>{
  for(let i=q.length-1;i>=0;i--)if(q[i].ts<=at)
   return at-q[i].ts<=2500?q[i].price:null;
  return null;
 };
 const origin=before(ts-6500),previous=q.at(-2)?.price;
 if(!(valid(origin)&&valid(previous)))return candidate;
 const impulse=sign*(spot-origin),step=sign*(spot-previous);
 // No arbitrary fixed-pip wall: use the already-observed impulse and
 // closed-candle volatility to decide whether expiry-scale continuation
 // is heading directly into a meaningful level.
 const reach=Math.max(atr*.36,Math.abs(impulse)*1.3,tol*3);
 const ahead=levels
  .map(z=>({zone:z,dist:sign*(Number(z.level)-spot)}))
  .filter(x=>x.dist>=-Math.max(tol*2,atr*.11)&&x.dist<=reach)
  .sort((a,b)=>Math.abs(a.dist)-Math.abs(b.dist));
 for(const {zone:z,dist} of ahead){
  // A genuine breach must clear the FULL zone, then remain beyond it in
  // several already received quotes (not the single latest candle).
  const recent=q.filter(x=>x.ts>=ts-4500);
  const coverage=recent.length>=3&&recent[0].ts<=ts-2500;
  const beyond=x=>sign>0?x.price>z.high+tol:x.price<z.low-tol;
  const held=coverage&&recent.every(beyond);
  const cleared=sign>0?spot>z.high+tol:spot<z.low-tol;
  const departure=sign>0?spot-z.high:z.low-spot;
  const followthrough=impulse>Math.max(atr*.12,tol)&&
    departure>tol&&step>=0;
  if(held&&cleared&&followthrough)continue;
  // An actual level rejection can qualify its OWN opposite-side setup,
  // but a mere touch or weak breakout is not a validated continuation.
  return {...candidate,ready:false,side:null,
    reason:sign>0?'resistance-breakout-strength-unconfirmed':
                   'support-breakout-strength-unconfirmed',
    historicalBarrier:{
      level:Number(z.level),zoneLow:Number(z.low),zoneHigh:Number(z.high),
      oldestBarsAgo:Math.max(...(z.ages||[0])),
      newestBarsAgo:Math.min(...(z.ages||[0])),
      confirmedPivots:Number(z.confirmedPivots)||0,
      independentRejections:Number(z.independentRejections)||0,
      distance:dist,observedImpulse:impulse,
      breakoutHeld:held,expirySeconds:Number(durationMs)/1000
    }};
 }
 return candidate;
}

// Sentinel candidate: market-causal admission; never add clocks, broker calls or fixed thresholds.
// Last completed 1m/30s/5m and native broker expiry remain independently owned.
const sign=side=>side==="CALL"?1:side==="PUT"?-1:0;
const atOrBefore=function atOrBefore(rows, target){
  for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=target)
    return target-rows[i].ts<=2500?rows[i].price:null;
  return null;
};
export function reviewCausalEntry215({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs,structure=null}={}){
  if(candidate?.ready!==true||!["CALL","PUT"].includes(candidate.side)||
     Number(durationMs)!==60000||
     !["closed-structure-and-live-impulse","confirmed-level-structure-reversal"].includes(candidate.reason))
    return candidate;
  const at=Number(quoteAt),clock=Number(now),spot=Number(price),d=sign(candidate.side);
  if(!(at>0&&clock>=at&&clock-at<=1950&&spot>0&&
       Number(candidate.observedAt)===at&&Number(candidate.entryPrice)===spot))
    return candidate;
  const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>{
    const t=Number(q?.ts),v=Number(q?.price),r=Number(q?.receivedAt??t);
    return Number.isFinite(t)&&t>=at-120000&&t<=at&&r<=clock&&Number.isFinite(v)&&v>0;
  }).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
  if(rows.length<45||rows.at(-1).ts!==at||rows.at(-1).price!==spot)return candidate;
  const p5=atOrBefore(rows,at-5000),p20=atOrBefore(rows,at-20000),
        p60=atOrBefore(rows,at-60000);
  if(p5===null||p20===null||p60===null)return candidate;
  const blocked=(reason,details)=>({...candidate,ready:false,side:null,
    provisionalSide:candidate.side,reason,
    entryRisk:{kind:"causal-entry-quality-215",blocked:true,reasons:[reason],details}});
  if(candidate.reason==="closed-structure-and-live-impulse"){
    // The 207 impulse has already qualified. Reject only a price surge that is
    // exceptional for THIS quote stream and now at its directional extreme.
    // Never forbid a trade because an absolute pip amount or a clock expired.
    const window=rows.filter(q=>q.ts>=at-60000&&q.ts<=at);
    if(window.length<45)return candidate;
    let lo=Infinity,hi=-Infinity;
    for(const q of window){lo=Math.min(lo,q.price);hi=Math.max(hi,q.price);}
    const range=hi-lo,move5=d*(spot-p5),move60=d*(spot-p60);
    if(!(range>0&&move5>0&&move60>0))return candidate;
    const baseline=[];
    for(let i=0;i<window.length;i++){
      const q=window[i];
      if(q.ts>at-5000)break;
      const old=atOrBefore(window,q.ts-5000);
      if(old!==null)baseline.push(Math.abs(q.price-old));
    }
    if(baseline.length<25)return candidate;
    baseline.sort((a,b)=>a-b);
    const median=baseline[Math.floor(baseline.length/2)];
    const p90=baseline[Math.floor((baseline.length-1)*.90)];
    if(!(median>0&&p90>0))return candidate;
    const edge=d>0?(hi-spot)/range:(spot-lo)/range;
    const exceptional=move5>median*2.8&&move5>p90*1.45;
    const spent=move5/range>=.22&&edge>=0&&edge<=.10;
    return exceptional&&spent?
      blocked("impulse-exhausted-relative-to-live-volatility",{
        move5,baselineMedian5:median,baselineP90_5:p90,edgeFraction:edge}):
      candidate;
  }
  // Do not reject a confirmed reversal merely because the previous closed
  // minute still opposes it. Invalidate only if a VERIFIED original level has
  // already failed AND the current short tape has moved further against it.
  const p=candidate.priceStructure||{};
  const level=Number(p.confirmedReversal?.level?.level);
  const tol=Number(structure?.candleLevelMap?.tolerance??
    p.candleLevelMap?.tolerance??structure?.tolerance);
  if(!(level>0&&tol>0&&Number.isFinite(level)&&Number.isFinite(tol)))return candidate;
  const p2=atOrBefore(rows,at-2000);
  if(p2===null)return candidate;
  const levelFailed=d*(spot-level)<-tol;
  const freshOpposite=d*(spot-p5)<0&&d*(spot-p2)<0;
  const broaderOpposite=d*(spot-p20)<0;
  return levelFailed&&freshOpposite&&broaderOpposite?
    blocked("confirmed-structural-level-invalidated-before-entry",{
      level,tolerance:tol,price:spot,move5:d*(spot-p5),move20:d*(spot-p20)}):
    candidate;
}

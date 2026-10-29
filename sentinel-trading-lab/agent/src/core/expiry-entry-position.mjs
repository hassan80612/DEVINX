// Last-mile expiry-aligned price POSITION, not a new trading strategy.
// Inspect only received quotes already in memory; never alter order expiry,
// selected chart interval, broker connection, clocks or execution mechanics.
// No stored waiting state or "re-arm"; each newly qualified tick stands alone.
const signOf=side=>side==='CALL'?1:side==='PUT'?-1:0;
const lookup=(rows,target)=>{
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=target)
  return target-rows[i].ts<=2000?rows[i]:null;
 return null;
};
export function expiryPositionRisk({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 const expiry=Number(durationMs),d=signOf(candidate?.side);
 // Keep the established 5m reversal-only policy and all validated
 // structural reversals/rejections/breakouts untouched.
 if(![30000,60000].includes(expiry)||candidate?.ready!==true||!d||
    candidate.reason!=='closed-structure-and-live-impulse')return null;
 if(candidate.priceStructure?.confirmedReversal?.side===candidate.side||
    candidate.priceStructure?.reactionProof?.confirmed===true||
    candidate.priceStructure?.observedSequence?.continuation?.confirmedAt>0)return null;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(!(at>0&&clock>=at&&clock-at<=1450&&spot>0&&
    candidate.observedAt===at&&candidate.entryPrice===spot))return null;
 const longWindow=Math.round(expiry*2.5),referenceEnd=at-expiry*.5;
 const rows=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const q=quoteHistory[i],ts=Number(q?.ts),p=Number(q?.price);
  if(ts<at-longWindow)break;
  if(ts>at||Number(q?.receivedAt??ts)>clock)continue;
  if(!(ts>0&&p>0&&Number.isFinite(ts)&&Number.isFinite(p)))return null;
  rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.length<30||at-rows[0].ts<longWindow*.8||
    rows.at(-1)?.ts!==at||rows.at(-1)?.price!==spot||
    rows.some((q,i)=>i>0&&(q.ts<=rows[i-1].ts||q.ts-rows[i-1].ts>2500)))return null;
 const reference=rows.filter(q=>q.ts<=referenceEnd);
 const local=rows.filter(q=>q.ts>=at-expiry*1.5);
 if(reference.length<12||local.length<12)return null;
 let high=-Infinity,low=Infinity,priorEdge=-Infinity;
 for(const q of local){high=Math.max(high,q.price);low=Math.min(low,q.price);}
 for(const q of reference)priorEdge=Math.max(priorEdge,d*q.price);
 const width=high-low;
 if(!(width>spot*1e-7))return null;
 // The proposed entry is already in the outer 8% of the move in its own
 // direction. This is NOT independently a veto (fresh breakouts can win).
 const position=d===1?(spot-low)/width:(high-spot)/width;
 if(position<.92)return null;
 const crosses=rows.filter(q=>q.ts>referenceEnd&&d*q.price>priorEdge);
 if(!crosses.length)return null;
 const firstCross=crosses[0];
 const crossingAge=at-firstCross.ts;
 if(crossingAge<expiry*.2||crossingAge>expiry*.5)return null;
 const q2=lookup(rows,at-2000),q5=lookup(rows,at-5000),
  q20=lookup(rows,at-20000),q40=lookup(rows,at-40000);
 if(!q2||!q5||!q20||!q40)return null;
 const move2=d*(spot-q2.price),move5=d*(spot-q5.price),
  move20=d*(spot-q20.price),move40=d*(spot-q40.price);
 // Causal two-shape test: the fresh short push stalled OR the last
 // 20-second advance contributed little relative to the prior 40s AND
 // the recent 5s is also fading. Do not infer a reversal from a single tick.
 const briefStall=move2<=Math.max(width*.015,spot*1e-8)&&move5>0;
 const fadingLeg=move40>width*.2&&move20<move40*.25&&move5<move40*.22;
 if(!briefStall&&!fadingLeg)return null;
 return {kind:'expiry-entry-price-late-after-confirmed-move',side:candidate.side,
  durationMs:expiry,position,firstCrossAt:firstCross.ts,crossingAgeMs:crossingAge,
  move2,move5,move20,move40,evidence:briefStall?'short-push-stalled':'long-leg-fading'};
}
export function reviewExpiryEntryPosition(input={}){
 const risk=expiryPositionRisk(input),candidate=input.candidate;
 if(!risk)return candidate;
 return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:'expiry-entry-too-late-for-current-price',entryTiming:risk};
}

// Final causal entry evidence, not a second strategy or waiting timer.
// The 189 direction and the 191 verified level guards remain authoritative.
// This only declines demonstrably exhausted continuation or tiny unproven
// micro-turns. Insufficient evidence leaves the existing guards in control.
import {entryFamilyOf} from './entry-family.mjs';
const dir=side=>side==='CALL'?1:side==='PUT'?-1:0;
const median=values=>{
 const sorted=values.filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);
 return sorted.length?sorted[Math.floor(sorted.length/2)]:null;
};
function causalTape(history,at,now,spot){
 if(!(at>0&&now>=at&&now-at<=2500&&spot>0))return null;
 const rows=(Array.isArray(history)?history:[]).filter(q=>{
  const ts=Number(q?.ts),price=Number(q?.price),received=Number(q?.receivedAt??ts);
  return ts>=at-22000&&ts<=at&&received<=now&&price>0&&Number.isFinite(ts);
 }).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(rows.length<12||rows.at(-1).ts!==at||rows.at(-1).price!==spot||
  rows.some((q,i)=>i>0&&(q.ts<=rows[i-1].ts||q.ts-rows[i-1].ts>2500)))return null;
 return rows;
}
const before=(rows,ts,allow=1600)=>{
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=ts)
  return ts-rows[i].ts<=allow?rows[i]:null;
 return null;
};
export function reviewDynamicEntryQuality({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 if(candidate?.ready!==true||![30000,60000].includes(Number(durationMs))||
  !dir(candidate.side))return candidate;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),side=candidate.side,d=dir(side);
 if(Number(candidate.observedAt)!==at||Number(candidate.entryPrice)!==spot)return candidate;
 const rows=causalTape(quoteHistory,at,clock,spot);
 if(!rows)return candidate;
 const recent=before(rows,at-3000),earlier=before(rows,at-10000);
 if(!recent||!earlier)return candidate;
 const prior=rows.filter(q=>q.ts>=earlier.ts&&q.ts<=recent.ts);
 const typical=median(prior.slice(1).map((q,i)=>Math.abs(q.price-prior[i].price)));
 if(!(typical>0&&prior.length>=5))return candidate;
 const tail=rows.slice(-3);
 const steps=[d*(tail[1].price-tail[0].price),d*(tail[2].price-tail[1].price)];
 const family=entryFamilyOf(candidate);
 if(family==='reversal'&&
  ['closed-range-extreme-reversal-confirmed','multiscale-candle-rejection'].includes(candidate.reason)){
  // These two paths can qualify on two tiny last quotes. Compare the
  // actual two-move return against the asset's own preceding tick noise.
  // Never infer an opposite trade or wait for a fixed number of seconds.
  const departure=steps[0]+steps[1];
  const minimum=typical*(Number(durationMs)===60000?1.35:1.15);
  if(steps[0]<=0||steps[1]<=0||departure<minimum)
   return {...candidate,ready:false,side:null,provisionalSide:side,
    reason:'dynamic-reversal-below-observed-noise',
    entryQuality:{kind:'small-unproven-turn',observedDeparture:departure,observedTypicalMove:typical}};
  return candidate;
 }
 if(family!=='continuation')return candidate;
 const first=d*(recent.price-earlier.price);
 const last=d*(spot-recent.price);
 const prices=rows.filter(q=>q.ts>=earlier.ts).map(q=>q.price);
 const extreme=d>0?spot>=Math.max(...prices)-typical*.35:
  spot<=Math.min(...prices)+typical*.35;
 const lateStall=extreme&&first>=typical*4.5&&
  last>=-typical*.25&&last<=Math.max(typical*.6,first*.10)&&
  steps[1]<=typical*.30;
 if(!lateStall)return candidate;
 // A genuine level breakthrough needs the existing structural proof; the
 // name "breakout" alone is not permission to chase a stalled impulse.
 return {...candidate,ready:false,side:null,provisionalSide:side,
  reason:'dynamic-extended-impulse-lost-momentum',
  entryQuality:{kind:'stalled-after-strong-leg',initialMove:first,currentMove:last,observedTypicalMove:typical}};
}

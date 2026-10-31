import {structuralQuoteMaxAgeMs} from './structure-quote-freshness.mjs';
// Causal, price-first qualification of continuation approaching an OPPOSING
// independently rejected historic wall. Does not decide a direction, create a
// trade, change an expiry or wait for an arbitrary number of seconds.
import {levelRoleEvidence} from './level-role-evidence.mjs';
const usable=v=>Number.isFinite(Number(v))&&Number(v)>0;
const qualifyingReasons=new Set([
 'closed-structure-and-live-impulse',
 'historical-level-breakout',
 'historical-trend-and-live-forecast',
 'break-retest-continuation',
 'rejection-followthrough-clear-room',
 'observed-multi-interval-trend-correction',
 'locally-verified-opposite-direction'
]);
export function continuationRoomRisk({candidate,structure,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 const shortHorizonNearWallEntry=[30000,60000].includes(Number(durationMs))&&
  ['confirmed-level-structure-reversal','break-retest-continuation',
   'failed-breakout-structure-change','confirmed-fast-level-reversal','historical-level-rejection'].includes(candidate?.reason);
 const shortHorizonBreakout=[30000,60000].includes(Number(durationMs))&&
  candidate?.reason==='historical-level-breakout';
 const directionalNearWallEntry=shortHorizonNearWallEntry||shortHorizonBreakout;
 if(candidate?.ready!==true||
   (!qualifyingReasons.has(candidate.reason)&&!shortHorizonNearWallEntry)||
   !['CALL','PUT'].includes(candidate.side))return null;
 // The final reason owns this check. Inherited reversal metadata cannot
 // exempt a proposal. Short historical breakouts use the same existing
 // opposing-wall evidence without requiring deceleration first. Impulses,
 // range reversals and five-minute admission keep their own rules.
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),sign=candidate.side==='CALL'?1:-1;
 if(!(usable(spot)&&at>0&&at<=clock&&clock-at<=structuralQuoteMaxAgeMs(durationMs)&&
   Number(candidate.observedAt)===at&&Number(candidate.entryPrice)===spot))return null;
 const map=structure?.candleLevelMap;
 const tol=Math.max(Number(map?.tolerance)||0,Number(structure?.tolerance)||0);
 if(!(map?.observedCandles>=10&&map.asOf<=clock&&tol>0&&Array.isArray(map.levels)))return null;
 // Only ACTUALLY RECEIVED live ticks. Missing, stale, unordered or future
 // observations cannot manufacture the evidence needed for a veto.
 const q=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
   const row=quoteHistory[i],ts=Number(row?.ts);
   if(!Number.isFinite(ts)||ts>at||Number(row?.receivedAt??ts)>clock)continue;
   if(ts<at-9000)break;
   if(!usable(row.price))return null;
   q.push({ts,price:Number(row.price)});
 }
 q.reverse();
 if(q.length<4||q.at(-1).ts!==at||q.at(-1).price!==spot||
   q.some((p,i)=>i&&(p.ts<=q[i-1].ts||p.ts-q[i-1].ts>2500)))return null;
 const observed=(target)=>{
   for(let i=q.length-1;i>=0;i--)if(q[i].ts<=target)
     return target-q[i].ts<=1600?q[i].price:null;
   return null;
 };
 const earlier=observed(at-6000),recent=observed(at-2000);
 if(earlier==null||recent==null)return null;
 const first=sign*(recent-earlier),last=sign*(spot-recent),total=sign*(spot-earlier);
 // A short-horizon structural entry may not buy/sell directly into a verified
 // opposing wall with too little room; it must first clear the wall.
 const fadingApproach=first>=tol*.8&&total>=tol*.4&&last<=first*.35;
 const shortHorizonDirectionalApproach=total>=tol*.4&&last>0;
 if(!fadingApproach&&!(directionalNearWallEntry&&shortHorizonDirectionalApproach))return null;
 const roomNeeded=Math.max(tol*1.25,total*.6);
 const barriers=map.levels.filter(z=>{
   const opposite=levelRoleEvidence(z,sign===1?'PUT':'CALL');
   if(!(opposite.pivots>=1&&opposite.rejections>=2))return false;
   const low=Number(z.low),high=Number(z.high);
   if(!(usable(low)&&usable(high)&&high>=low))return false;
   // Passed a resistance (support) already? Do not retroactively re-label
   // that historical wall as an opposing obstacle to a valid breakout.
   const gap=sign===1?low-spot:spot-high;
   return gap>=-tol*.35&&gap<=roomNeeded;
 }).sort((a,b)=>Math.abs(Number(a.level)-spot)-Math.abs(Number(b.level)-spot));
 const wall=barriers[0];if(!wall)return null;
 const gap=sign===1?Number(wall.low)-spot:spot-Number(wall.high);
 const role=levelRoleEvidence(wall,sign===1?'PUT':'CALL');
 if(directionalNearWallEntry&&gap>=0&&gap<=roomNeeded)
  return {kind:'short-horizon-entry-without-clearance-to-opposing-wall',
   level:Number(wall.level),gap,roomNeeded,
   historicalPivots:role.pivots,historicalRejections:role.rejections};
 if(!fadingApproach)return null;
 return {kind:'fading-continuation-into-opposing-wall',
   level:Number(wall.level),gap,initialMove:first,finalMove:last,roomNeeded,
   historicalPivots:role.pivots,historicalRejections:role.rejections};
}

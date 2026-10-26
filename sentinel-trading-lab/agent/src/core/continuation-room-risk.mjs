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
export function continuationRoomRisk({candidate,structure,quoteHistory=[],quoteAt,now=quoteAt,price}={}){
 if(candidate?.ready!==true||!qualifyingReasons.has(candidate.reason)||
   !['CALL','PUT'].includes(candidate.side))return null;
 // The final reason owns this check. Inherited reversal metadata must not
 // exempt a proposal that has since become a continuation. Actual reversal
 // reasons are already excluded by qualifyingReasons above.
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),sign=candidate.side==='CALL'?1:-1;
 if(!(usable(spot)&&at>0&&at<=clock&&clock-at<=1450&&
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
 // A positive but fading approach can no longer be treated as a healthy
 // continuation merely because earlier closed bars were directional.
 if(!(first>=tol*.8&&total>=tol*.4&&last<=first*.35))return null;
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
 return {kind:'fading-continuation-into-opposing-wall',
   level:Number(wall.level),gap:sign===1?Number(wall.low)-spot:spot-Number(wall.high),
   initialMove:first,finalMove:last,roomNeeded,
   historicalPivots:levelRoleEvidence(wall,sign===1?'PUT':'CALL').pivots,
   historicalRejections:levelRoleEvidence(wall,sign===1?'PUT':'CALL').rejections};
}

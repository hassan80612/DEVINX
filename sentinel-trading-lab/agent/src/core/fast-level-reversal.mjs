// A fast V-shaped rejection of an ALREADY established directional level.
// Only received prices qualify it. No timer, projected price, or extra candle.
import {levelRoleEvidence} from './level-role-evidence.mjs';
const median=a=>{const v=[...a].sort((x,y)=>x-y);return v[Math.floor(v.length/2)]||0;};
const copyLevel=z=>Object.fromEntries(['low','high','level','confirmedPivots','independentRejections',
 'supportPivots','resistancePivots','supportRejections','resistanceRejections'].map(k=>[k,z[k]]));
export function confirmedFastLevelReversal({map,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs=30000}={}){
 const expiry=Number(durationMs);
 const shortExpiry=expiry===30000||expiry===60000;
 // Two advancing received quotes confirm a short-horizon rejection. The
 // established level, two independent reactions and minimum rebound remain
 // mandatory, so speed comes from removing dwell, not from accepting noise.
 // 5m retains its existing two-quote confirmation and movement threshold.
 const confirmationSteps=2;
 const minTouchToCurrentMs=0;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),tol=Number(map?.tolerance);
 if(!(map?.observedCandles>=10&&map.asOf<=clock&&tol>0&&at>0&&at<=clock&&
   clock-at<=1450&&spot>0&&Array.isArray(map.levels)))return null;
 const rows=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const q=quoteHistory[i],ts=Number(q?.ts),p=Number(q?.price);
  if(ts<at-8000)break;
  if(ts>at||Number(q?.receivedAt??ts)>clock)continue;
  if(!(p>0&&Number.isFinite(p)))return null;
  rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.length<5||rows.at(-1).ts!==at||rows.at(-1).price!==spot||
   rows.some((q,i)=>i&&(q.ts<=rows[i-1].ts||q.ts-rows[i-1].ts>1500)))return null;
 for(const side of ['CALL','PUT']){
  const sign=side==='CALL'?1:-1;
  let touchIndex=0;
  for(let i=1;i<rows.length;i++)if(sign*(rows[i].price-rows[touchIndex].price)<=0)touchIndex=i;
  if(touchIndex<2||touchIndex>rows.length-3)continue;
  const touch=rows[touchIndex];
  if(!(Number(map.asOf)<=touch.ts)||clock-touch.ts<minTouchToCurrentMs)continue;
  const approach=rows.slice(1,touchIndex+1).map((q,i)=>Math.abs(q.price-rows[i].price)).filter(x=>x>0);
  const minRejection=Math.max(tol*.75,median(approach)*2);
   const minConfirmedMove=shortExpiry?Math.max(tol*.4,median(approach)*1.5):tol*.4;
  for(const zone of map.levels){
   const role=levelRoleEvidence(zone,side);
   if(!(role.known&&role.pivots>=1&&role.rejections>=2&&
     touch.price>=Number(zone.low)-tol*.5&&touch.price<=Number(zone.high)+tol*.5))continue;
   const boundary=Number(sign>0?zone.high:zone.low);
   if(!(sign*(rows[0].price-boundary)>=tol&&sign*(rows[0].price-touch.price)>=tol*1.5))continue;
   const qualifies=i=>{
    if(i<touchIndex+confirmationSteps)return false;
    let confirmedMove=0;
    for(let step=0;step<confirmationSteps;step++){
     const move=sign*(rows[i-step].price-rows[i-step-1].price);
     if(!(move>0))return false;
     confirmedMove+=move;
    }
    const q=rows[i];
    return confirmedMove>=minConfirmedMove&&
     sign*(q.price-touch.price)>=minRejection&&sign*(q.price-boundary)>=tol*.5;
   };
   const first=rows.findIndex((_,i)=>qualifies(i));
   if(first<0||!qualifies(rows.length-1)||clock-rows[first].ts>1450||
     sign*(spot-boundary)>tol*3)continue;
   const next=map.levels.filter(z=>{
    const r=levelRoleEvidence(z,side==='CALL'?'PUT':'CALL');
    return r.known&&r.confirmed&&sign*(Number(sign>0?z.low:z.high)-spot)>0;
   }).sort((a,b)=>sign*(Number(a.level)-Number(b.level)))[0];
   const room=next?sign*(Number(sign>0?next.low:next.high)-spot):0;
   if(!(room>=Math.max(tol*2,sign*(spot-touch.price)*1.5)))continue;
   return {kind:'confirmed-fast-level-reversal',side,confirmedAt:rows[first].ts,
    touchAt:touch.ts,touchPrice:touch.price,invalidation:touch.price-sign*tol*.1,
    level:copyLevel(zone),nextLevel:copyLevel(next),tolerance:tol,
    observedCandles:map.observedCandles,asOf:map.asOf,room,quoteConfirmations:confirmationSteps};
  }
 }
 return null;
}
export function verifiedFastLevelReversal({reversalEvidence,quoteHistory,quoteAt,now,price,side,durationMs=30000}={}){
 const e=reversalEvidence;
 if(e?.kind!=='confirmed-fast-level-reversal'||e.side!==side)return false;
 const proof=confirmedFastLevelReversal({map:{observedCandles:e.observedCandles,asOf:e.asOf,
  tolerance:e.tolerance,levels:[e.level,e.nextLevel]},quoteHistory,quoteAt,now,price,durationMs});
 return !!proof&&proof.side===side&&proof.confirmedAt===e.confirmedAt&&proof.touchAt===e.touchAt;
}

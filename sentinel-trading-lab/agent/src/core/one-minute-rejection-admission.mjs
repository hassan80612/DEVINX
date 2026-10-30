// Reversal admission for the three supported horizons: 30s, 1m and 5m.
// Only REAL, already-observed negative evidence may veto a candidate.
// No timers, quote polling, synthetic opposite signals or broker UI writes.
import {proveLevelRejectionAtExpiry} from './causal-level-rejection-proof.mjs';
const HORIZONS=new Set([30000,60000,300000]);
const SIDES=new Set(['CALL','PUT']);
const REVERSALS=new Set([
 'multiscale-candle-rejection',
 'closed-range-extreme-reversal-confirmed',
 'historical-level-rejection',
 'confirmed-level-structure-reversal',
 'confirmed-fast-level-reversal',
 'failed-breakout-structure-change'
]);
// A missing price window is NOT a negative price movement. Do not freeze
// legitimate operations while recovering charts, quotes or asset context.
const REAL_CONTRADICTIONS=new Set([
 'not-away-from-confirmed-level','last-move-not-supporting',
 'medium-path-not-supporting','holding-path-not-supporting'
]);
const signed=side=>side==='CALL'?1:side==='PUT'?-1:0;
const veto=(candidate,ms,reason,proof)=>({...candidate,ready:false,side:null,
 provisionalSide:candidate.side,reason:'reversal-not-confirmed-for-selected-expiry',
 entryRisk:{kind:'reversal-live-price-contradiction',durationMs:ms,failedProof:reason,
  ...(proof?{proofWindows:proof.windows}:{} )}});
function liveContradiction({side,quoteHistory,quoteAt,now,price,durationMs}){
 const sign=signed(side),at=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(!sign||!Array.isArray(quoteHistory)||!(at>0&&clock>=at&&clock-at<=1950&&spot>0))return false;
 const span=durationMs===30000?12000:durationMs===60000?20000:20000;
 const rows=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const row=quoteHistory[i],ts=Number(row?.ts);
  if(ts<at-span-2500)break;
  if(ts<=at&&Number(row?.receivedAt??ts)<=clock&&Number(row?.price)>0)
   rows.push({ts,price:Number(row.price)});
 }
 rows.reverse();
 if(rows.length<5||rows.at(-1)?.ts!==at||rows.at(-1)?.price!==spot||
  rows.some((r,i)=>i>0&&(r.ts<=rows[i-1].ts||r.ts-rows[i-1].ts>3500)))return false;
 const atOrBefore=(seconds)=>{
  const t=at-seconds*1000;
  for(let i=rows.length-1;i>=0;i--)
   if(rows[i].ts<=t)return t-rows[i].ts<=2400?rows[i].price:null;
  return null;
 };
 const periods=durationMs===30000?[3,6,12]:durationMs===60000?[4,10,20]:[3,10,20];
 const anchors=periods.map(atOrBefore);
 if(anchors.some(v=>v==null))return false;
 const moves=anchors.map(v=>sign*(spot-v));
 const steps=rows.slice(-3).map((r,i,tail)=>i?sign*(r.price-tail[i-1].price):0);
 const values=rows.slice(1).map((q,i)=>Math.abs(q.price-rows[i].price)).filter(v=>v>0);
 values.sort((a,b)=>a-b);
 const tick=Math.max(values[Math.floor(values.length/2)]||0,spot*1e-8);
 // Requires a current negative change AND a longer opposing movement.
 // A single counter-tick cannot invalidate a real level reversal.
 return moves[0]<=-tick*1.5&&moves[1]<=-tick*2.5&&
   steps.slice(1).some(v=>v<0)&&moves[2]<=-tick*2;
}
export function reviewOneMinuteRejectionProof({
 candidate,original,durationMs,quoteAt,now=quoteAt,price,quoteHistory=[]
}={}){
 const ms=Number(durationMs),at=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(!HORIZONS.has(ms)||candidate?.ready!==true||!SIDES.has(candidate.side)||
  !REVERSALS.has(candidate.reason)||!(at>0&&clock>=at&&clock-at<=2500&&spot>0&&
   Number(candidate.observedAt)===at&&Number(candidate.entryPrice)===spot))
  return candidate;
 // Long confirmed 5m reversals retain the existing independent 5m gate.
 // Their negative CURRENT quote route still has veto authority here.
 const matching=original?.reason===candidate.reason&&original?.side===candidate.side;
 const proof=candidate.priceStructure?.reactionProof||
  (matching?original.priceStructure?.reactionProof:null);
 if(proof?.confirmed===false&&Number(proof.durationMs)===ms&&
    REAL_CONTRADICTIONS.has(proof.reason)&&
    // A 30s V can still be close to its old level at the FIRST valid
    // break. Spatial proximity alone is not a failed price turn.
    !(ms===30000&&proof.reason==='not-away-from-confirmed-level')&&
    (candidate.reason==='multiscale-candle-rejection'||
     candidate.reason==='closed-range-extreme-reversal-confirmed'||
     candidate.reason==='historical-level-rejection'))
  return veto(candidate,ms,proof.reason,proof);
 // A short 30s rejection may have an observed closed-candle level but no
 // previously computed horizon proof. Evaluate the SAME causal proof using
 // the current quote tape; never require another candle or wait.
 if(ms===30000&&candidate.reason==='multiscale-candle-rejection'&&
    !proof&&candidate.priceStructure?.candleRoute?.event?.candleBacked===true){
  const event=candidate.priceStructure.candleRoute.event;
  const tol=Number(candidate.priceStructure?.historicalTolerance)||
    Math.abs(Number(event.zone?.level)||0)*1e-7;
  const independent=Number(event.zone?.confirmedPivots)>0||
    Number(event.zone?.independentRejections)>=2;
  if(independent&&tol>0){
   const checked=proveLevelRejectionAtExpiry({quoteHistory,quoteAt:at,now:clock,
    price:spot,durationMs:ms,side:candidate.side,zone:event.zone,
    tolerance:tol,atr:tol*10});
   if(checked.confirmed===false&&REAL_CONTRADICTIONS.has(checked.reason)&&
     checked.reason!=='not-away-from-confirmed-level')
    return veto(candidate,ms,checked.reason,checked);
  }
 }
 // Already-qualified independent fast/structural 30s reversals are not
 // blocked for missing horizon proof; only explicit fresh opposing price.
 if(liveContradiction({side:candidate.side,quoteHistory,quoteAt:at,now:clock,price:spot,durationMs:ms}))
  return veto(candidate,ms,'current-price-opposes-reversal',null);
 return candidate;
}

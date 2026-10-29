// Research: chronological level events and price-confirmed swing changes.
// No timer, future candle, broker request, or permission to alter a held signal.
import {levelRoleEvidence,observedRoleRetest} from './level-role-evidence.mjs';
import {confirmedFastLevelReversal} from './fast-level-reversal.mjs';
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0;};
export function observedSwings(rows,amplitude){
 if(!rows.length||!(amplitude>0))return [];
 let trend=0,extreme=rows[0];const turns=[];
 for(const q of rows.slice(1)){
  if(!trend){
   if(Math.abs(q.price-extreme.price)>=amplitude){trend=q.price>extreme.price?1:-1;extreme=q;}
   continue;
  }
  if(trend>=0){
   if(q.price>=extreme.price)extreme=q;
   else if(extreme.price-q.price>=amplitude){
    turns.push({kind:'high',price:extreme.price,at:extreme.ts,confirmedAt:q.ts});
    trend=-1;extreme=q;
   }
  }else if(q.price<=extreme.price)extreme=q;
  else if(q.price-extreme.price>=amplitude){
   turns.push({kind:'low',price:extreme.price,at:extreme.ts,confirmedAt:q.ts});
   trend=1;extreme=q;
  }
 }
 return turns;
}
function receivedQuotes(history,ts,now){
 const times=new Map();
 for(const q of history){
  if(!(q.ts>=ts-180000&&q.ts<=ts&&(q.receivedAt??q.ts)<=now&&q.price>0))continue;
  const old=times.get(q.ts);
  if(!old||(q.receivedAt??q.ts)<(old.receivedAt??old.ts))times.set(q.ts,q);
 }
 return [...times.values()].sort((a,b)=>a.ts-b.ts);
}
// A real local structure change can precede the next completed chart candle.
// CALL: a confirmed higher low, then break of its intervening high; mirrored
// for PUT. A first bounce / a single opposite tick is never enough.
export function currentQuoteStructureTurn({quoteHistory=[],quoteAt,now=quoteAt,price,side}={}){
 const ts=Number(quoteAt),spot=Number(price),sign=side==='CALL'?1:side==='PUT'?-1:0;
 if(!sign||!(ts>0&&ts<=now&&now-ts<=1450&&spot>0))return null;
 let rows=receivedQuotes(quoteHistory,ts,now),start=0;
 for(let i=1;i<rows.length;i++)if(rows[i].ts-rows[i-1].ts>2500)start=i;
 rows=rows.slice(start);
 if(rows.at(-1)?.ts!==ts||rows.at(-1)?.price!==spot||rows.length<5)return null;
 const changes=rows.slice(1).map((q,i)=>Math.abs(q.price-rows[i].price)).filter(v=>v>0);
 const amplitude=Math.max(spot*1e-8,median(changes)*2);
 const turns=observedSwings(rows,amplitude),last=turns.at(-1),pivot=turns.at(-2),prior=turns.at(-3);
 if(!last||!pivot||!prior||last.kind!==(sign>0?'low':'high')||prior.kind!==last.kind)return null;
 if(!(sign*(last.price-prior.price)>0&&sign*(spot-pivot.price)>amplitude&&
   sign*(spot-rows.at(-2).price)>=0))return null;
 return {side,pivotPrice:pivot.price,pivotAt:pivot.at,turnPrice:last.price,turnAt:last.at,
  priorTurnPrice:prior.price,priorTurnAt:prior.at,confirmedAt:ts,amplitude};
}
export function confirmedLevelReversal({map,quoteHistory=[],quoteAt,now=quoteAt,price}={}){
 if(!map?.observedCandles||!(map.asOf<=now&&map.tolerance>0))return null;
 for(const side of ['CALL','PUT']){
  const proof=currentQuoteStructureTurn({quoteHistory,quoteAt,now,price,side});if(!proof)continue;
  const sign=side==='CALL'?1:-1;
  const anchor=map.levels.filter(z=>{
   const role=levelRoleEvidence(z,side);
   return role.known&&role.confirmed&&proof.priorTurnPrice>=z.low-map.tolerance&&
    proof.priorTurnPrice<=z.high+map.tolerance;
  }).sort((a,b)=>Math.abs(a.level-proof.priorTurnPrice)-Math.abs(b.level-proof.priorTurnPrice))[0];
  if(!anchor)continue;
  // The FIRST current price break owns this reversal. Never keep stamping
  // a past reaction as new after the movement has already travelled away.
  const crossed=receivedQuotes(quoteHistory,Number(quoteAt),now).find(q=>
   q.ts>proof.turnAt&&sign*(q.price-proof.pivotPrice)>proof.amplitude);
  if(!crossed||now-crossed.ts>1450)continue;
  return {kind:'confirmed-level-structure-reversal',side,
   level:{level:anchor.level,confirmedPivots:anchor.confirmedPivots,
    independentRejections:anchor.independentRejections},
   pivotPrice:proof.pivotPrice,turnPrice:proof.turnPrice,confirmedAt:crossed.ts};
 }
 return null;
}
export function observedLevelSequence({map,quoteHistory=[],price,quoteAt,now=quoteAt}={}){
 const spot=Number(price),ts=Number(quoteAt);
 if(!(spot>0&&ts>0&&ts<=now&&now-ts<=1450)||!map?.observedCandles||map.asOf>now)return null;
 let rows=receivedQuotes(quoteHistory,ts,now);
 if(rows.at(-1)?.ts!==ts||rows.at(-1)?.price!==spot)return null;
 let contiguous=0;
 for(let i=1;i<rows.length;i++)if(rows[i].ts-rows[i-1].ts>2500)contiguous=i;
 rows=rows.slice(contiguous);
 const changes=rows.slice(1).map((q,i)=>Math.abs(q.price-rows[i].price)).filter(x=>x>0);
 const amplitude=Math.max(spot*1e-8,median(changes)*2),turns=observedSwings(rows,amplitude);
 const previousTurn=new Map(turns.map((turn,i)=>[turn,turns[i-1]??null]));
 let cursor=0,high=null,low=null;
 const timeline=rows.map(q=>{
  while(cursor<turns.length&&turns[cursor].confirmedAt<=q.ts){
   const turn=turns[cursor++];
   if(turn.kind==='high')high=turn;else low=turn;
  }
  return {q,high,low};
 });
 const tolerance=map.tolerance;
 const levels=map.levels.filter(z=>z.confirmedPivots>0||
  (z.independentRejections??z.independentTests)>=2);
 const last=rows.at(-2),step=last?spot-last.price:0;
 const recent=rows.filter(q=>q.ts>=ts-12000);
 let travelled=0;for(let i=1;i<recent.length;i++)travelled+=Math.abs(recent[i].price-recent[i-1].price);
 const net=spot-(recent[0]?.price??spot),efficiency=travelled>0?Math.abs(net)/travelled:0;
 const seconds=recent.length>1?(ts-recent[0].ts)/1000:0;
 const velocity=seconds>0?net/seconds:0;
 const events=[],seenEvents=new Set();
 // A reclaim reversal belongs to its FIRST confirming quote. Later ticks
 // beyond the same pivot cannot renew the age of an already observed turn.
 const recordEvent=(key,event)=>{
  if(seenEvents.has(key))return;
  seenEvents.add(key);events.push(event);
 };
 const describe=z=>({level:z.level,windows:z.windows,independentTests:z.independentTests,
  confirmedPivots:z.confirmedPivots});
 for(const z of levels){
  let initial=0,brokenAt=null,reclaimedAt=null,retestAt=null,breakExtreme=null,breakAmplitude=null,reclaimRoleAllowed=null;
  for(const {q,high,low} of timeline){
   const position=q.price>z.high+tolerance?1:q.price<z.low-tolerance?-1:0;
   if(!initial){if(position)initial=position;continue;}
   if(!brokenAt&&position===-initial){
    brokenAt=q.ts;breakExtreme=q.price;
    // Freeze this break's noise scale at the actual break. Later volatility
    // must not move its historical first confirmation forward or backward.
    const prefix=rows.filter(x=>x.ts<=q.ts);
    const steps=prefix.slice(1).map((x,i)=>Math.abs(x.price-prefix[i].price)).filter(x=>x>0);
    breakAmplitude=Math.max(q.price*1e-8,median(steps)*2);
    continue;
   }
   if(!brokenAt)continue;
   if(!retestAt){
    breakExtreme=initial>0?Math.min(breakExtreme,q.price):Math.max(breakExtreme,q.price);
    if(position===0)retestAt=q.ts;
   }
   if(position===initial&&!reclaimedAt)reclaimedAt=q.ts;
   if(reclaimedAt){
    // A zone's opposite-side pivots cannot authorize this direction. A
    // genuine observed crossing/retest may establish the new role. Compute
    // once per zone, using only the already received current tape.
    if(reclaimRoleAllowed===null){
     const side=initial>0?'CALL':'PUT',role=levelRoleEvidence(z,side);
     reclaimRoleAllowed=!role.known||role.confirmed||observedRoleRetest({
      quoteHistory:rows,quoteAt,now,price,side,zone:z,tolerance});
    }
    const currentExtreme=initial>0?low:high;
    const extreme=currentExtreme&&currentExtreme.at>=brokenAt?currentExtreme:null;
    const pivot=extreme&&previousTurn.get(extreme);
    const priorExtreme=pivot&&previousTurn.get(pivot);
    // Reclaim alone is not a higher-low / lower-high structure change.
    // Both legs must belong to this break, with an improving second extreme.
    if(reclaimRoleAllowed&&pivot&&priorExtreme&&pivot.at>=brokenAt&&priorExtreme.at>=brokenAt&&
     priorExtreme.kind===extreme.kind&&initial*(extreme.price-priorExtreme.price)>0&&
     initial*(q.price-pivot.price)>amplitude&&position===initial)
     // One break/reclaim owns one confirming event. Later unrelated
     // pivot pairs cannot renew that event's time or entry permission.
     recordEvent(['reclaim',z.level,brokenAt].join('|'),{kind:'failed-breakout-structure-change',side:initial>0?'CALL':'PUT',
      level:describe(z),brokenAt,reclaimedAt,pivotPrice:pivot.price,confirmedAt:q.ts});
   }else if(retestAt&&q.ts>retestAt&&position===-initial&&
    -initial*(q.price-breakExtreme)>breakAmplitude)
    recordEvent(['continuation',z.level,brokenAt,retestAt].join('|'),{kind:'break-retest-continuation',side:initial>0?'PUT':'CALL',
     level:describe(z),brokenAt,retestAt,pivotPrice:breakExtreme,confirmedAt:q.ts});
  }
 }
 const valid=events.filter(e=>{
  const sign=e.side==='CALL'?1:-1;
  return sign*step>=0&&sign*net>amplitude&&sign*(spot-e.pivotPrice)>0&&
   sign*(spot-e.level.level)>tolerance;
 });
 valid.sort((a,b)=>b.confirmedAt-a.confirmedAt);
 const structureChange=valid[0]??null;
 // A directional move away from a confirmed historical rejection may have
 // room for another 30s BEFORE its next barrier. This estimates distance;
 // it is not a countdown, a guaranteed path, or a hidden future order book.
 let continuation=null;
 const turn=turns.at(-1),sign=turn?.kind==='high'?-1:turn?.kind==='low'?1:0;
 const anchor=turn&&levels.filter(z=>Math.abs(turn.price-z.level)<=tolerance*2&&
  (levelRoleEvidence(z,sign>0?'CALL':'PUT').confirmed||observedRoleRetest({
    quoteHistory,quoteAt,now,price,side:sign>0?'CALL':'PUT',zone:z,tolerance})))
  .sort((a,b)=>Math.abs(turn.price-a.level)-Math.abs(turn.price-b.level))[0];
 const next=sign?levels.filter(z=>sign*(z.level-spot)>tolerance)
  .sort((a,b)=>sign*(a.level-b.level))[0]:null;
 if(anchor&&next&&seconds>=6&&efficiency>=.85&&sign*net>amplitude&&sign*step>=0){
  const distance=sign*(next.level-spot),projectedMove=sign*velocity*30;
  if(projectedMove>0&&distance>projectedMove+tolerance*2)
   continuation={kind:'rejection-followthrough-clear-room',side:sign>0?'CALL':'PUT',
    level:describe(anchor),nextLevel:describe(next),pivotPrice:turn.price,
    confirmedAt:turn.confirmedAt,room:distance,projectedMove,efficiency};
 }
 return {amplitude,turns:turns.slice(-4),structureChange,continuation};
}
export function applyObservedLevelSequence({candidate,map,durationMs,...input}={}){
 if(!candidate||![5000,10000,15000,30000,60000,120000,300000].includes(Number(durationMs)))return candidate;
 const sequence=observedLevelSequence({map,...input});
 if(!sequence)return candidate;
 // A two-tick V at a level is useful for short expiries. For five minutes,
 // let the independently observed pivot break/reclaim establish the turn.
 const fastReversal=Number(durationMs)===300000?null:confirmedFastLevelReversal({map,...input});
 const structureChange=sequence.structureChange&&
  (!['failed-breakout-structure-change','break-retest-continuation'].includes(sequence.structureChange.kind)||
   Number(input.now??input.quoteAt)-sequence.structureChange.confirmedAt<=1450)?
  sequence.structureChange:null;
 // Reclaim + break/retest geometry is independent of expiry. The distance
 // projection below remains scoped to the 30s holding time it measures.
 // A continuation sequence must not prevent evaluation of a verified
 // opposite structural turn on the current quote. Preserve reclaim priority.
 const reversal=structureChange?.kind==='failed-breakout-structure-change'?null:
  confirmedLevelReversal({map,...input});
 const event=fastReversal??reversal??structureChange??(Number(durationMs)===30000?sequence.continuation:null);
 const priceStructure={...candidate.priceStructure,observedSequence:sequence,
  ...(fastReversal?{confirmedReversal:fastReversal}:reversal?{confirmedReversal:reversal}:{})};
 if(!event)return {...candidate,priceStructure};
 // Keep existing admission for continuation; structural reclaim can release
 // an actually confirmed reversal. Issued windows remain owned by runtime.
 const independentReclaim=structureChange?.kind==='failed-breakout-structure-change';
 if(!candidate.ready&&!independentReclaim&&!reversal&&!fastReversal)return {...candidate,priceStructure};
 if(event.kind==='break-retest-continuation'&&candidate.side!==event.side)
  return {...candidate,ready:false,side:null,reason:'retest-versus-horizon-direction-conflict',priceStructure};
 return {...candidate,ready:true,side:event.side,observedAt:Number(input.quoteAt),
  entryPrice:Number(input.price),predictedPrice:null,expectedLogMove:null,
  reason:event.kind,priceStructure};
}

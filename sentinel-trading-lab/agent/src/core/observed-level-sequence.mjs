// Research: chronological level events and price-confirmed swing changes.
// No timer, future candle, broker request, or permission to alter a held signal.
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
 const tolerance=map.tolerance;
 const levels=map.levels.filter(z=>z.confirmedPivots>0||
  (z.independentRejections??z.independentTests)>=2);
 const last=rows.at(-2),step=last?spot-last.price:0;
 const recent=rows.filter(q=>q.ts>=ts-12000);
 let travelled=0;for(let i=1;i<recent.length;i++)travelled+=Math.abs(recent[i].price-recent[i-1].price);
 const net=spot-(recent[0]?.price??spot),efficiency=travelled>0?Math.abs(net)/travelled:0;
 const seconds=recent.length>1?(ts-recent[0].ts)/1000:0;
 const velocity=seconds>0?net/seconds:0;
 const events=[];
 const describe=z=>({level:z.level,windows:z.windows,independentTests:z.independentTests,
  confirmedPivots:z.confirmedPivots});
 for(const z of levels){
  let initial=0,brokenAt=null,reclaimedAt=null,retestAt=null,breakExtreme=null;
  for(const q of rows){
   const position=q.price>z.high+tolerance?1:q.price<z.low-tolerance?-1:0;
   if(!initial){if(position)initial=position;continue;}
   if(!brokenAt&&position===-initial){brokenAt=q.ts;breakExtreme=q.price;continue;}
   if(!brokenAt)continue;
   if(!retestAt){
    breakExtreme=initial>0?Math.min(breakExtreme,q.price):Math.max(breakExtreme,q.price);
    if(position===0)retestAt=q.ts;
   }
   if(position===initial&&!reclaimedAt)reclaimedAt=q.ts;
   if(reclaimedAt){
    const extremeKind=initial>0?'low':'high';
    const extreme=turns.filter(p=>p.kind===extremeKind&&p.at>=brokenAt&&p.confirmedAt<=q.ts).at(-1);
    const pivot=extreme&&turns.filter(p=>p.kind!==extremeKind&&p.at<extreme.at&&p.confirmedAt<=q.ts).at(-1);
    if(pivot&&initial*(q.price-pivot.price)>amplitude&&position===initial)
     events.push({kind:'failed-breakout-structure-change',side:initial>0?'CALL':'PUT',
      level:describe(z),brokenAt,reclaimedAt,pivotPrice:pivot.price,confirmedAt:q.ts});
   }else if(retestAt&&q.ts>retestAt&&position===-initial&&
    -initial*(q.price-breakExtreme)>amplitude)
    events.push({kind:'break-retest-continuation',side:initial>0?'PUT':'CALL',
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
 const anchor=turn&&levels.filter(z=>Math.abs(turn.price-z.level)<=tolerance*2)
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
 if(!candidate||Number(durationMs)!==30000)return candidate;
 const sequence=observedLevelSequence({map,...input});
 if(!sequence)return candidate;
 const event=sequence.structureChange??sequence.continuation;
 const priceStructure={...candidate.priceStructure,observedSequence:sequence};
 if(!event)return {...candidate,priceStructure};
 // Keep existing admission for continuation; structural reclaim can release
 // an actually confirmed reversal. Issued windows remain owned by runtime.
 if(!candidate.ready&&!sequence.structureChange)return {...candidate,priceStructure};
 return {...candidate,ready:true,side:event.side,observedAt:Number(input.quoteAt),
  entryPrice:Number(input.price),predictedPrice:null,expectedLogMove:null,
  reason:event.kind,priceStructure};
}

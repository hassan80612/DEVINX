// Observe a NEW micro swing against an OLD, proven price level.
// This is an alternative to the 3-of-4 CLOSED candle continuation gate,
// NOT a relaxation of that gate or permission to predict unobserved turns.
// No timers, broker access, side flip without evidence, or expiry changes.
import {entryFamilyOf} from './entry-family.mjs';
import {levelRoleEvidence} from './level-role-evidence.mjs';
const sign=side=>side==='CALL'?1:side==='PUT'?-1:0;
function liveTape(history,at,clock,spot){
 const rows=(Array.isArray(history)?history:[]).filter(q=>{
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),p=Number(q?.price);
  return ts>=at-13000&&ts<=at&&received<=clock&&p>0&&Number.isFinite(p);
 }).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(rows.length<11||rows.at(-1).ts!==at||rows.at(-1).price!==spot||
    rows.some((r,i)=>i>0&&(r.ts<=rows[i-1].ts||r.ts-rows[i-1].ts>2000)))return null;
 return rows;
}
const uniqueHighLow=(rows,d,from,to)=>{
 let idx=from;
 for(let i=from+1;i<=to;i++)if(d*rows[i].price>d*rows[idx].price)idx=i;
 return idx;
};
export function reviewEarlyVerifiedTurn({candidate,map,quoteHistory=[],quoteAt,
 now=quoteAt,price,durationMs}={}){
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),ms=Number(durationMs);
 if(!candidate||![30000,60000].includes(ms)||!(at>0&&at<=clock&&clock-at<=(ms===30000?1450:1950)&&spot>0)||
    !(map?.observedCandles>=20&&map.asOf<=at&&at-map.asOf<=180000&&Number(map.tolerance)>0))
  return candidate;
 // Keep already-qualified reversals untouched, including failed breakouts.
 if(candidate.ready===true&&entryFamilyOf(candidate)!=='continuation')return candidate;
 const rows=liveTape(quoteHistory,at,clock,spot),tol=Number(map.tolerance);
 if(!rows||!Array.isArray(map.levels))return candidate;
 const proofs=[];
 for(const side of ['CALL','PUT']){
  const d=sign(side),opp=-d;
  // At a PUT resistance / CALL support, the prior approach was opposite.
  // The first peak or trough must predate a pullback and a smaller retest.
  const extremeIndex=uniqueHighLow(rows,opp,0,rows.length-5);
  const extreme=rows[extremeIndex],start=rows[0];
  if(!(extremeIndex>=2&&extremeIndex>=rows.length-10))continue;
  if(!(opp*(extreme.price-start.price)>=tol*.8))continue;
  // Micro 3-step pattern: turn away -> retest lower high/higher low ->
  // break the initial counter-swing. No third CLOSED candle is required.
  for(let first=extremeIndex+1;first<rows.length-3;first++){
   const move=d*(rows[first].price-extreme.price);
   if(!(move>=tol*.45))continue;
   const retestIndex=uniqueHighLow(rows,opp,first+1,rows.length-3);
   const retest=rows[retestIndex];
   const retrace=opp*(retest.price-rows[first].price);
   if(!(retrace>=tol*.12&&retrace<=move*.75&&retestIndex>=first+1&&
       retestIndex<=rows.length-3))continue;
   const last=rows.at(-1),prev=rows.at(-2),prev2=rows.at(-3);
   if(!(d*(last.price-prev.price)>0&&d*(prev.price-prev2.price)>0&&
       d*(last.price-rows[first].price)>=tol*.18&&
       d*(last.price-retest.price)>=tol*.35))continue;
   if(!(last.ts-retest.ts<=3500&&last.ts-extreme.ts<=8000))continue;
   for(const zone of map.levels){
    const role=levelRoleEvidence(zone,side);
    if(!(role.known&&role.pivots>=1&&
         (role.pivots>=2||role.rejections>=1)&&
         Number(zone.independentTests)>=2&&
         zone.tests?.some(t=>Number(t.age)>=10)))continue;
    const level=Number(zone.level),low=Number(zone.low),high=Number(zone.high);
    if(!(level>0&&Number.isFinite(low)&&Number.isFinite(high)&&low<=level&&high>=level))continue;
    if(!(extreme.price>=low-tol*.55&&extreme.price<=high+tol*.55))continue;
    // Reject a breakout through the old support/resistance; a re-test
    // cannot magically turn that old level into reliable opposite proof.
    if(side==='PUT'&&rows.slice(extremeIndex).some(q=>q.price>=high+tol*.49))continue;
    if(side==='CALL'&&rows.slice(extremeIndex).some(q=>q.price<=low-tol*.49))continue;
    const departure=d*(spot-level);
    if(!(departure>=-tol*.35&&departure<=tol*1.7))continue;
    proofs.push({side,level,extreme:extreme.price,first:rows[first].price,
      retest:retest.price,at,departure,tol});
   }
  }
 }
 // Two possible signals / conflicting zones are insufficient evidence.
 const uniq=new Map(proofs.map(p=>[p.side+'|'+p.level,p]));
 if(uniq.size!==1)return candidate;
 const proof=[...uniq.values()][0];
 if(candidate.ready===true&&candidate.side===proof.side)return candidate;
 // The original lifecycle still vets this against actual quotes, price
 // structure, 30s/1m expiry, and the broker before any physical click.
 return {...candidate,ready:true,side:proof.side,observedAt:at,entryPrice:spot,
   predictedPrice:null,expectedLogMove:null,
   reason:'confirmed-level-structure-reversal',
   priceStructure:{...(candidate.priceStructure||{}),confirmedReversal:{
     kind:'confirmed-level-structure-reversal',side:proof.side,confirmedAt:at,
     level:{level:proof.level},microTurn:{
      extreme:proof.extreme,firstBreak:proof.first,retest:proof.retest,
      observedAt:at,departure:proof.departure}}},
   earlyTurnEvidence:{kind:'level-microstructure-first-turn',withoutThreeClosedBars:true}};
}

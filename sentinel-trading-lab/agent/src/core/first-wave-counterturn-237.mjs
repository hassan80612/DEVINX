// Sentinel 237: the first observed counter-wave at an established historical
// wall gets an independent vote over a mature continuation. No new timer,
// broker call, expiry mutation, forecast or direct order execution.
import {levelRoleEvidence} from './level-role-evidence.mjs';
import {entryFamilyOf} from './entry-family.mjs';
const direction=x=>x==='CALL'?1:x==='PUT'?-1:0;
const median=values=>{const a=[...values].sort((x,y)=>x-y);return a[Math.floor(a.length/2)]||0;};
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0;
export function reviewFirstWaveCounterturn({
 candidate,map,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs
}={}){
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),tol=Number(map?.tolerance);
 // Never replace an already verified structural reversal, or change 30s/5m.
 if(Number(durationMs)!==60000||!candidate||
    (candidate.ready===true&&entryFamilyOf(candidate)!=='continuation')||
    !positive(spot)||!(at>0&&clock>=at&&clock-at<=1950)||
    !(map?.observedCandles>=20&&Number(map.asOf)>0&&Number(map.asOf)<=at&&
      at-Number(map.asOf)<=180000&&tol>0&&Array.isArray(map.levels)))return candidate;
 const q=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const r=quoteHistory[i],ts=Number(r?.ts),received=Number(r?.receivedAt??ts),p=Number(r?.price);
  if(ts<at-13000)break;
  if(ts>at||received>clock)continue;
  if(!positive(p))return candidate;
  q.push({ts,price:p});
 }
 q.reverse();
 if(q.length<10||q.at(-1).ts!==at||q.at(-1).price!==spot||
    q.some((r,i)=>i>0&&(r.ts<=q[i-1].ts||r.ts-q[i-1].ts>2500)))return candidate;
 const changes=q.slice(1).map((r,i)=>Math.abs(r.price-q[i].price)).filter(x=>x>0);
 if(changes.length<7)return candidate;
 const typical=median(changes);
 const signals=[];
 for(const side of ['CALL','PUT']){
  const d=direction(side);
  const last=q.at(-1),prev=q.at(-2),before=q.at(-3);
  // Two independent observed counter-ticks. A terminal high or low
  // without any price rejection is NOT automatically an opposite trade.
  if(!(d*(last.price-prev.price)>0&&d*(prev.price-before.price)>0))continue;
  let extremeIndex=0;
  for(let i=1;i<q.length-2;i++)
   if(d*q[i].price<d*q[extremeIndex].price)extremeIndex=i;
  const extreme=q[extremeIndex],age=at-extreme.ts;
  if(!(extremeIndex>=3&&extremeIndex<=q.length-3&&age>=1800&&age<=8000))continue;
  const approach=-d*(extreme.price-q[0].price),retreat=d*(spot-extreme.price);
  if(!(approach>=Math.max(tol*.38,typical*2)&&
       retreat>=Math.max(tol*.28,typical*1.8)&&retreat<=tol*1.45))continue;
  if(q.slice(extremeIndex+1,-2).some(r=>d*(r.price-extreme.price)>tol*1.5))continue;
  for(const zone of map.levels){
   const role=levelRoleEvidence(zone,side),tests=Array.isArray(zone.tests)?zone.tests:[];
   if(!(role.known&&role.pivots>=1&&(role.pivots>=2||role.rejections>=1)&&
     Number(zone.independentTests)>=2&&tests.some(t=>Number(t.age)>=10)))continue;
   const low=Number(zone.low),high=Number(zone.high),level=Number(zone.level);
   if(!(positive(low)&&positive(high)&&positive(level)&&low<=level&&level<=high&&
     extreme.price>=low-tol*.55&&extreme.price<=high+tol*.55))continue;
   // A genuine break THROUGH old support/resistance is not a turn.
   if(q.slice(extremeIndex).some(r=>d>0?r.price<low-tol*.48:r.price>high+tol*.48))continue;
   const departure=d*(spot-level);
   if(!(departure>=-tol*.35&&departure<=tol*1.65))continue;
   signals.push({side,level,low,high,extreme,retreat,departure,role,
     independentTests:Number(zone.independentTests),
     oldestTestAge:Math.max(...tests.map(t=>Number(t.age)||0))});
  }
 }
 if(new Set(signals.map(s=>s.side)).size!==1)return candidate;
 const selected=signals.sort((a,b)=>
  b.role.pivots-a.role.pivots||
  b.role.rejections-a.role.rejections||
  Math.abs(a.extreme.price-a.level)-Math.abs(b.extreme.price-b.level)||
  a.level-b.level)[0];
 if(!selected)return candidate;
 // The final standard admission, expiry and executor validators still run.
 const micro={extreme:selected.extreme.price,extremeAt:selected.extreme.ts,
  firstBreak:q.at(-2).price,retest:q.at(-2).price,observedAt:at,
  departure:selected.departure};
 return {...candidate,ready:true,side:selected.side,observedAt:at,entryPrice:spot,
  predictedPrice:null,expectedLogMove:null,
  reason:'confirmed-level-structure-reversal',
  earlyTurnEvidence:{kind:'level-microstructure-first-turn',
    withoutThreeClosedBars:true,firstWave:true},
  priceStructure:{...(candidate.priceStructure||{}),confirmedReversal:{
    kind:'confirmed-level-structure-reversal',
    side:selected.side,confirmedAt:at,
    level:{level:selected.level,low:selected.low,high:selected.high,
      directionalPivots:selected.role.pivots,
      directionalRejections:selected.role.rejections,
      independentTests:selected.independentTests,
      oldestTestAge:selected.oldestTestAge},
    earlyLevelProof:{tolerance:tol,verifiedAt:at,source:'independent-first-wave-237'},
    microTurn:micro
  }}};
}

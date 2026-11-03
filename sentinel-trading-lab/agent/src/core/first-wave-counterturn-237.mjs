// Sentinel 237: the first observed counter-wave at an established historical
// wall gets an independent vote over a mature continuation. No new timer,
// broker call, expiry mutation, forecast or direct order execution.
import {levelRoleEvidence} from './level-role-evidence.mjs';
import {entryFamilyOf} from './entry-family.mjs';
const direction=x=>x==='CALL'?1:x==='PUT'?-1:0;
const median=values=>{const a=[...values].sort((x,y)=>x-y);return a[Math.floor(a.length/2)]||0;};
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0;
// The 30s selected-cycle forecast is a CONTINUATION, not an independent
// structural reversal. Its historical reason was missing from the family
// table, so it bypassed the 239 first-wave arbitration altogether.
// Fix only local arbitration: do NOT alter saved entry-family preferences.
const isContinuation=c=>entryFamilyOf(c)==='continuation'||
 ['observed-trend-and-30s-cycle-projection','causal-completed-pattern-outcomes',
  'validated-structure-over-cycle'].includes(String(c?.reason||''));
export function reviewFirstWaveCounterturn({
 candidate,map,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs
}={}){
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),tol=Number(map?.tolerance);
 // Only the 30s/1m first-wave routes; 5m, older approved reversals and
 // expiry selection remain unchanged. Never guess a side from speed alone.
 if(![30000,60000].includes(Number(durationMs))||!candidate||
    (candidate.ready===true&&!isContinuation(candidate))||
    !positive(spot)||!(at>0&&clock>=at&&clock-at<=(Number(durationMs)===30000?1450:1950))||
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
 // Anticipate the LAST acceleration into a proven historical wall, before
 // either the 30s or 1m legacy continuation can chase its terminal price.
 // This is a short-lived WAIT only at the CURRENT quote, not a timer/lock.
 // A true crossing/holding beyond the wall is never re-labelled a reversal.
 const arming=[];
 for(const side of ['CALL','PUT']){
  const d=direction(side),trend=-d;
  const last=q.at(-1),prev=q.at(-2),before=q.at(-3),older=q.at(-5);
  if(!(trend*(last.price-prev.price)>0&&trend*(prev.price-before.price)>0&&
     trend*(last.price-older.price)>=Math.max(tol*.38,typical*2.6)&&
     trend*(last.price-q[0].price)>=Math.max(tol*.75,typical*4)))continue;
  for(const z of map.levels){
   const role=levelRoleEvidence(z,side),tests=Array.isArray(z.tests)?z.tests:[];
   const low=Number(z.low),high=Number(z.high),level=Number(z.level);
   if(!(role.known&&role.pivots>=1&&role.rejections>=2&&
       Number(z.independentTests)>=2&&tests.some(t=>Number(t.age)>=10)&&
       positive(level)&&positive(low)&&positive(high)&&low<=level&&level<=high&&
       last.price>=low-tol*.45&&last.price<=high+tol*.20))continue;
   const crossed=q.slice(-3).filter(x=>d>0?x.price<low-tol*.48:x.price>high+tol*.48);
   if(crossed.length||d*(last.price-q[0].price)>0)continue;
   arming.push({side,level,observedAt:at,velocity3:Math.abs(last.price-older.price)});
  }
 }
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
  // A prior burst at the wall can produce a genuine FIRST counterwave
  // before the normal .28*tolerance retracement. Never lower the number
  // of two independent opposing observed quotes or the level proof.
  const prior=q[Math.max(0,extremeIndex-3)];
  const burst=-d*(extreme.price-prior.price);
  const terminalSpike=burst>=Math.max(tol*.42,typical*2.8)&&
    approach>=Math.max(tol*.75,typical*4)&&
    burst>=Math.max(typical*2,approach*.32);
  if(!(approach>=Math.max(tol*.38,typical*2)&&
       retreat>=Math.max(terminalSpike?tol*.18:tol*.28,
                        typical*(terminalSpike?1.2:1.8))&&
       retreat<=tol*1.45))continue;
  if(q.slice(extremeIndex+1,-2).some(r=>d*(r.price-extreme.price)>tol*1.5))continue;
  for(const zone of map.levels){
   const role=levelRoleEvidence(zone,side),tests=Array.isArray(zone.tests)?zone.tests:[];
   if(!(role.known&&role.pivots>=1&&(role.pivots>=2||role.rejections>=1)&&
     Number(zone.independentTests)>=2&&tests.some(t=>Number(t.age)>=10)&&
     (!terminalSpike||role.rejections>=2)))continue;
   const low=Number(zone.low),high=Number(zone.high),level=Number(zone.level);
   if(!(positive(low)&&positive(high)&&positive(level)&&low<=level&&level<=high&&
     extreme.price>=low-tol*.55&&extreme.price<=high+tol*.55))continue;
   // A genuine break THROUGH old support/resistance is not a turn.
   if(q.slice(extremeIndex).some(r=>d>0?r.price<low-tol*.48:r.price>high+tol*.48))continue;
   const departure=d*(spot-level);
   if(!(departure>=-tol*.35&&departure<=tol*1.65))continue;
   signals.push({side,level,low,high,extreme,retreat,departure,terminalSpike,role,
     independentTests:Number(zone.independentTests),
     oldestTestAge:Math.max(...tests.map(t=>Number(t.age)||0))});
  }
 }
 if(new Set(signals.map(s=>s.side)).size!==1){
  // During an accelerating approach, prepare the contrary hypothesis
  // BEFORE the peak. No forced PUT/CALL until the first price rejection.
  if(signals.length===0&&arming.length&&
     new Set(arming.map(x=>x.side)).size===1&&
     candidate.ready===true&&isContinuation(candidate)&&
     candidate.side!==arming[0].side)
   return {...candidate,ready:false,side:null,provisionalSide:arming[0].side,
     reason:'terminal-spike-at-proven-wall-awaiting-first-rejection',
     spikeAnticipation:{state:'armed',side:arming[0].side,
      at,level:arming[0].level,velocity3:arming[0].velocity3}};
  return candidate;
 }
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
    earlyLevelProof:{tolerance:tol,verifiedAt:at,source:selected.terminalSpike?'terminal-spike-first-wave-239':'independent-first-wave-237'},
    microTurn:micro
  }}};
}

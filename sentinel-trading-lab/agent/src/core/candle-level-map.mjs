// Research candidate: candle-derived context, without a collection timer.
// Receives only validated CLOSED rows from historical-price-structure.mjs.
const WINDOWS=[3,10,20,50,100];
import {levelRoleEvidence,observedRoleRetest} from './level-role-evidence.mjs';
export function buildCandleLevelMap({rows=[],zones=[],tolerance=0}={}){
 const levels=zones.map(zone=>{
  const tests=[];let armed=true,visit=0;
  for(let i=0;i<rows.length;i++){
   const c=rows[i],range=c.high-c.low;
   const high=Math.abs(c.high-zone.level)<=tolerance;
   const low=Math.abs(c.low-zone.level)<=tolerance;
   const away=c.low>zone.high+tolerance||c.high<zone.low-tolerance;
   if(away)armed=true;
   if(!high&&!low)continue;
   const previous=rows[i-1],next=rows[i+1];
   const contiguous=!!previous&&!!next&&previous.to===c.from&&c.to===next.from;
   // A pivot is confirmed only after a received closed candle on each side.
   const resistancePivot=contiguous&&high&&c.high>previous.high&&c.high>next.high;
   const supportPivot=contiguous&&low&&c.low<previous.low&&c.low<next.low;
   const pivot=resistancePivot||supportPivot;
   const upper=range>0?(c.high-Math.max(c.open,c.close))/range:0;
   const lower=range>0?(Math.min(c.open,c.close)-c.low)/range:0;
   if(armed)visit++;
   const approachedHigh=!!previous&&previous.close<zone.low-tolerance;
   const approachedLow=!!previous&&previous.close>zone.high+tolerance;
   const rejectedHigh=contiguous&&high&&approachedHigh&&next.close<zone.low-tolerance&&
    (upper>=.5||next.high<=c.high+tolerance);
   const rejectedLow=contiguous&&low&&approachedLow&&next.close>zone.high+tolerance&&
    (lower>=.5||next.low>=c.low-tolerance);
   tests.push({age:rows.length-1-i,independent:armed,visit,pivot,resistancePivot,supportPivot,
    rejectedHigh,rejectedLow,
    rejected:rejectedHigh||rejectedLow,
    resistanceWick:high?upper:0,supportWick:low?lower:0,
    bodyFraction:range>0?Math.abs(c.close-c.open)/range:0});
   armed=false;
  }
  return {low:zone.low,high:zone.high,level:zone.level,tests,
   independentTests:tests.filter(t=>t.independent).length,
   independentRejections:new Set(tests.filter(t=>t.rejected).map(t=>t.visit)).size,
   confirmedPivots:tests.filter(t=>t.pivot).length,
   resistancePivots:tests.filter(t=>t.resistancePivot).length,
   supportPivots:tests.filter(t=>t.supportPivot).length,
   resistanceRejections:new Set(tests.filter(t=>t.rejectedHigh).map(t=>t.visit)).size,
   supportRejections:new Set(tests.filter(t=>t.rejectedLow).map(t=>t.visit)).size,
   resistanceWick:Math.max(0,...tests.map(t=>t.resistanceWick)),
   supportWick:Math.max(0,...tests.map(t=>t.supportWick)),
   windows:WINDOWS.filter(n=>rows.length>=n&&tests.some(t=>t.age<n))};
 });
 return {observedCandles:rows.length,asOf:rows.at(-1)?.to??null,tolerance,
  windows:WINDOWS.map(size=>({size,available:rows.length>=size,
   observed:Math.min(size,rows.length),
   levels:rows.length>=size?levels.filter(z=>z.tests.some(t=>t.age<size)).map(z=>z.level):[]})),
  levels};
}
function previousPrice(rows,at){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=at)
  return at-rows[i].ts<=2500?rows[i].price:null;
 return null;
}
export function assessCandleLevelRoute({map,quoteHistory=[],quoteAt,now=quoteAt,price,side,targetPrice}={}){
 if(!map?.observedCandles||map.asOf>now)return null;
 const ts=Number(quoteAt),spot=Number(price),tolerance=map.tolerance;
 if(!(spot>0&&ts>0&&ts<=now&&now-ts<=1450&&tolerance>0))return null;
 const byTime=new Map();
 for(const q of quoteHistory){
  if(!(q.ts>=ts-12000&&q.ts<=ts&&(q.receivedAt??q.ts)<=now&&q.price>0))continue;
  const previous=byTime.get(q.ts);
  if(!previous||(q.receivedAt??q.ts)<(previous.receivedAt??previous.ts))byTime.set(q.ts,q);
 }
 const q=[...byTime.values()].sort((a,b)=>a.ts-b.ts);
 if(q.at(-1)?.ts!==ts||q.at(-1).price!==spot)return null;
 const origin=previousPrice(q,ts-6000),earlier=previousPrice(q,ts-2000),last=q.at(-2)?.price;
 const levels=map.levels.filter(z=>z.confirmedPivots>0||
  (z.independentRejections??z.independentTests)>=2);
 const sgn=side==='CALL'?1:side==='PUT'?-1:0;
 const ahead=sgn?levels.filter(z=>sgn*(z.level-spot)>0)
  .sort((a,b)=>sgn*(a.level-b.level)):[];
 const describe=z=>({level:z.level,windows:z.windows,independentTests:z.independentTests,
  independentRejections:z.independentRejections??null,
  confirmedPivots:z.confirmedPivots,
  oldestBarsAgo:Math.max(...z.tests.map(t=>t.age)),newestBarsAgo:Math.min(...z.tests.map(t=>t.age))});
 const route={windows:map.windows.map(({levels,...w})=>({...w,levelCount:levels.length})),side,
  nextLevels:ahead.slice(0,5).map(z=>({...describe(z),
   beforeProjectedTarget:Number.isFinite(targetPrice)?sgn*(targetPrice-z.level)>=0:null})),
  event:null};
 if(!(origin&&earlier&&last)||q.some((p,i)=>i&&p.ts-q[i-1].ts>2500))return route;
 const low=Math.min(...q.map(p=>p.price)),high=Math.max(...q.map(p=>p.price));
 const move=spot-earlier,step=spot-last,minMove=tolerance*.5;
 const events=[];
 for(const z of levels){
  const down=origin<z.level&&high>=z.low-tolerance&&high<=z.high+tolerance*2&&
   spot<=z.high&&spot>=z.low-tolerance*3&&high-spot>=minMove&&move< -minMove&&step<=0;
  const up=origin>z.level&&low<=z.high+tolerance&&low>=z.low-tolerance*2&&
   spot>=z.low&&spot<=z.high+tolerance*3&&spot-low>=minMove&&move>minMove&&step>=0;
  const recent=q.filter(p=>p.ts>=ts-2500),coverage=recent.length>=3&&recent[0].ts<=ts-1500;
  const above=coverage&&recent.every(p=>p.price>z.high+tolerance*.25);
  const below=coverage&&recent.every(p=>p.price<z.low-tolerance*.25);
  const breakUp=origin<z.level&&spot>z.high+tolerance&&above&&move>minMove&&step>=0;
  const breakDown=origin>z.level&&spot<z.low-tolerance&&below&&move< -minMove&&step<=0;
  const eventSide=up||breakUp?'CALL':down||breakDown?'PUT':null;
  if(!eventSide)continue;
  const rejection=up||down,wick=up?z.supportWick:z.resistanceWick;
  // This is an observed structural criterion, not an estimated win rate.
  const role=levelRoleEvidence(z,eventSide);
  const retested=rejection&&!role.confirmed&&observedRoleRetest({quoteHistory,quoteAt,now,price,
   side:eventSide,zone:z,tolerance});
  const candleBacked=rejection&&((role.pivots>0&&(z.independentTests>=2||wick>=.5))||retested);
  events.push({side:eventSide,kind:rejection?'rejection':'breakout',
   candleBacked,wickFraction:wick,zone:describe(z),distance:Math.abs(spot-z.level),
   roleMismatch:rejection&&role.known&&!role.confirmed&&!retested});
 }
 // A confirmed CLOSED-candle rejection is stronger evidence than a
 // nearby but unconfirmed touch. Ranking by proximity first previously
 // allowed an unconfirmed level to shadow a genuine rejection and leave
 // a contradictory harmonic forecast in charge of CALL/PUT.
 events.sort((a,b)=>Number(b.candleBacked)-Number(a.candleBacked)||
  a.distance-b.distance);
 route.event=events[0]??null;
 if(route.event){
  route.conflict=events.some(e=>e.side!==route.event.side&&
   Math.abs(e.zone.level-route.event.zone.level)<=tolerance*2);
 }
 return route;
}
export function applyCandleLevelRoute({candidate,map,...input}={}){
 if(!candidate||Number(input.durationMs)!==30000)return candidate;
 const side=candidate.side??candidate.pendingForecast?.side;
 const route=assessCandleLevelRoute({map,...input,side,
  targetPrice:candidate.pendingForecast?.predictedPrice});
 if(!route)return candidate;
 const event=route.event;
 const evidence={...candidate.priceStructure,candleRoute:route};
 // Only an already observed rejection at a confirmed candle structure may
 // take precedence over extrapolation. A future level alone cannot flip it.
 if(event?.kind==='rejection'&&event.candleBacked&&!route.conflict){
  const contradicted=candidate.pendingForecast?.ready&&candidate.pendingForecast.side!==event.side;
  if(route.side!==event.side){
   const departure=assessCandleLevelRoute({map,...input,side:event.side,
    targetPrice:contradicted?undefined:candidate.pendingForecast?.predictedPrice});
   route.side=event.side;route.nextLevels=departure.nextLevels;
  }
  if(contradicted)route.discardedProjection={side:candidate.pendingForecast.side,
   predictedPrice:candidate.pendingForecast.predictedPrice};
  return {...candidate,...(contradicted?{predictedPrice:null,expectedLogMove:null}:{}),
   ready:true,side:event.side,entryPrice:Number(input.price),
   observedAt:Number(input.quoteAt),reason:'multiscale-candle-rejection',priceStructure:evidence};
 }
 return {...candidate,priceStructure:evidence};
}

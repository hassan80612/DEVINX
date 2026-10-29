// Qualify the current price against observed market structure. Pure and causal:
// no queued candidates, clock-based entry windows, forecasts or broker reads.
import {levelRoleEvidence} from './level-role-evidence.mjs';
import {currentQuoteStructureTurn} from './observed-level-sequence.mjs';
const direction=s=>s==='CALL'?1:s==='PUT'?-1:0;
const median=a=>{const v=[...a].sort((x,y)=>x-y);return v[Math.floor(v.length/2)]||0;};
export function currentEntryContextRisk({candidate,structure,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 const d=direction(candidate?.side),at=Number(quoteAt),spot=Number(price),horizon=Number(durationMs);
 if(!d||candidate.ready!==true||![30000,60000,300000].includes(horizon)||
   !(at>0&&now>=at&&now-at<=1450&&spot>0)||
   candidate.observedAt!==at||candidate.entryPrice!==spot)return null;
 const span=Math.min(60000,horizon/3),rows=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const q=quoteHistory[i],ts=Number(q?.ts),p=Number(q?.price);
  if(ts<at-Math.max(span,20000)-2500)break;
  if(ts>at||Number(q?.receivedAt??ts)>now)continue;
  if(!(ts>0&&p>0))return null;
  rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.length<6||rows.at(-1).ts!==at||rows.at(-1).price!==spot||
  rows.some((q,i)=>i&&(q.ts<=rows[i-1].ts||q.ts-rows[i-1].ts>2500)))return null;
 const recent=rows.filter(q=>q.ts>=at-span);
 if(at-recent[0]?.ts<span-2500)return null;
 const steps=rows.slice(1).map((q,i)=>Math.abs(q.price-rows[i].price)).filter(v=>v>0);
 const tick=Math.max(median(steps),spot*1e-8);
 const map=structure?.candleLevelMap,tol=Number(map?.tolerance);
 if(candidate.reason==='closed-range-extreme-reversal-confirmed'){
  const opposingLevel=tol>0&&map.asOf<=now&&map.observedCandles>=10&&
   (map.levels||[]).find(z=>levelRoleEvidence(z,d===1?'PUT':'CALL').confirmed&&
    spot>=Number(z.low)-tol*.5&&spot<=Number(z.high)+tol*.5);
  if(!opposingLevel)return null;
  let travel=0;for(let i=1;i<recent.length;i++)travel+=Math.abs(recent[i].price-recent[i-1].price);
  const net=spot-recent[0].price,base=recent.find(q=>q.ts>=at-span/3);
  // A directional leg still advancing in its original direction is not a
  // stationary range merely because its final quote retreats. Reuse the
  // range engine's 0.40 directional/oscillatory boundary; a real local
  // structural break retains authority without another closed candle.
  if(travel>0&&d*net<0&&Math.abs(net)/travel>=.40&&base&&
    d*(spot-base.price)<0&&
    !currentQuoteStructureTurn({quoteHistory,quoteAt,now,price,side:candidate.side}))
   return {kind:'range-turn-inside-persistent-directional-leg',side:candidate.side,
    level:Number(opposingLevel.level),observedSpanMs:span,netMove:net,efficiency:Math.abs(net)/travel};
 }
 if(!['closed-structure-and-live-impulse','historical-level-breakout',
   'historical-trend-and-live-forecast','break-retest-continuation'].includes(candidate.reason))return null;
 if(!(tol>0&&map.asOf<=now&&map.observedCandles>=10))return null;
 const last=rows.at(-2),stalled=d*(spot-last.price)<=0;
 if(!stalled)return null;
 const older=rows.filter(q=>q.ts<=at-3000);
 if(older.length<3)return null;
 const extreme=older.reduce((a,b)=>d*(b.price-a.price)>0?b:a);
 // Price must actually have tested and retreated from the same wall, then
 // returned without clearing that high/low. Nearness alone never vetoes.
 const after=rows.filter(q=>q.ts>extreme.ts);
 const pulledBack=after.some(q=>d*(extreme.price-q.price)>=tick*2);
 if(!pulledBack||Math.abs(spot-extreme.price)>Math.max(tick,tol*.5))return null;
 const wall=(map.levels||[]).find(z=>{
  const role=levelRoleEvidence(z,d===1?'PUT':'CALL');
  return role.pivots>0&&role.rejections>0&&
   spot>=Number(z.low)-tol*.5&&spot<=Number(z.high)+tol*.5&&
   extreme.price>=Number(z.low)-tol*.5&&extreme.price<=Number(z.high)+tol*.5&&
   d*(spot-(d===1?Number(z.high):Number(z.low)))<=0;
 });
 return wall?{kind:'continuation-retesting-uncleared-opposing-wall',side:candidate.side,
  level:Number(wall.level),previousTestAt:extreme.ts,previousTestPrice:extreme.price}:null;
}

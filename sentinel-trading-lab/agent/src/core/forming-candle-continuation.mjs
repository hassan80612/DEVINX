// An early, observed pullback resumption. This is not a prediction that a
// forming candle will close in its current color. No future OHLC, timer,
// fixed entry second, broker read or queued candidate is used.
import {levelRoleEvidence} from './level-role-evidence.mjs';
const epoch=x=>{const n=Number(x);return n>0?(n<1e12?n*1000:n):0;};
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]||0;};
export function formingCandleContinuation({structure,candles=[],quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 const at=Number(quoteAt),spot=Number(price),duration=Number(durationMs);
 if(![30000,60000].includes(duration)||!(at>0&&now>=at&&now-at<=1450&&spot>0))return null;
 const period=Number(structure?.periodMs),atr=Number(structure?.atr),tol=Number(structure?.tolerance);
 const fast=structure?.averages?.find(x=>x.period===20),slow=structure?.averages?.find(x=>x.period===50),
  main=structure?.averages?.find(x=>x.period===100);
 if(!(period>=30000&&period<=300000&&atr>0&&tol>0&&fast&&slow))return null;
 const d=fast.value>slow.value?1:fast.value<slow.value?-1:0,side=d===1?'CALL':'PUT';
 if(!d||d*fast.slope<=0||d*slow.slope<0||main&&d*(slow.value-main.value)<=0)return null;
 const closed=candles.map(c=>({from:epoch(c.from??c.ts),to:epoch(c.to),open:Number(c.open),
  high:Number(c.high??c.max),low:Number(c.low??c.min),close:Number(c.close),receivedAt:Number(c.receivedAt??0)}))
  .filter(c=>c.to<=at&&c.to-c.from===period&&c.receivedAt<=now&&
   [c.open,c.high,c.low,c.close].every(x=>Number.isFinite(x)&&x>0)&&
   c.low<=Math.min(c.open,c.close)&&c.high>=Math.max(c.open,c.close))
  .sort((a,b)=>a.from-b.from).slice(-5);
 const previous=closed.at(-1),start=previous?.to;
 // A CLOSED pullback and a genuinely observed new candle are required.
 // No rule waits for this new candle to finish or for the old high to break.
 if(closed.length<3||!(at>=start&&at<start+period)||d*(previous.close-previous.open)>=0)return null;
 const rows=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const q=quoteHistory[i],ts=Number(q?.ts),p=Number(q?.price);
  if(ts<start-35000)break;
  if(ts>at||Number(q?.receivedAt??ts)>now)continue;
  if(!(Number.isFinite(ts)&&Number.isFinite(p)&&p>0))return null;
  rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.at(-1)?.ts!==at||rows.at(-1)?.price!==spot||
  rows.some((q,i)=>i&&(q.ts<=rows[i-1].ts||q.ts-rows[i-1].ts>2500)))return null;
 const live=rows.filter(q=>q.ts>=start),before=rows.filter(q=>q.ts<start);
 if(live.length<3||before.length<8||live[0].ts-start>2500)return null;
 const steps=before.slice(1).map((q,i)=>Math.abs(q.price-before[i].price)).filter(x=>x>0);
 if(steps.length<5)return null;
 const tick=Math.max(median(steps),spot*1e-8),opening=live[0].price,move=d*(spot-opening);
 const lookup=t=>{for(let i=before.length-1;i>=0;i--)if(before[i].ts<=t)
  return t-before[i].ts<=1500?before[i].price:null;return null;};
 const fiveMoves=[];
 for(let k=5;k<=30;k+=5){const a=lookup(start-(k+5)*1000),b=lookup(start-k*1000);
  if(a!=null&&b!=null)fiveMoves.push(Math.abs(b-a));}
 if(fiveMoves.length<3)return null;
 const budget=Math.max(median(fiveMoves),tick*4);
 // Evidence is price progress after the pullback, while still close to
 // the candle's observed beginning. An already expanded body is too late.
 const aligned=live.slice(1).filter((q,i)=>d*(q.price-live[i].price)>0).length;
 const lastStep=d*(spot-live.at(-2).price);
 if(aligned<2||lastStep<=0||move<Math.max(tick*1.5,tol*.2)||move>budget||
  Math.abs(opening-previous.close)>Math.max(tol,tick*3))return null;
 const extreme=d===1?previous.low:previous.high,map=structure.candleLevelMap;
 const level=map?.levels?.find(z=>levelRoleEvidence(z,side).confirmed&&
  extreme>=Number(z.low)-tol&&extreme<=Number(z.high)+tol&&
  opening>=Number(z.low)-tol*2&&opening<=Number(z.high)+tol*2);
 const emaTouch=Math.abs(extreme-fast.value)<=tol*2&&Math.abs(opening-fast.value)<=tol*3;
 if(!level&&!emaTouch)return null;
 // Even an early resumption needs runway BEFORE the previous swing high/
 // low or the next independently confirmed opposing zone. Crossing either
 // barrier is not a prerequisite or a way to renew this early setup.
 const oldEdge=d===1?Math.max(...closed.map(c=>c.high)):Math.min(...closed.map(c=>c.low));
 const barriers=[oldEdge,...(map?.levels||[]).filter(z=>levelRoleEvidence(z,d===1?'PUT':'CALL').confirmed)
  .map(z=>d===1?Number(z.low):Number(z.high))].filter(p=>d*(p-spot)>0);
 const room=barriers.length?Math.min(...barriers.map(p=>d*(p-spot))):0;
 const needed=Math.max(atr*.5*duration/period,tol*3,move*2);
 if(d*(oldEdge-spot)<=0||room<needed)return null;
 return {ready:true,side,reason:'forming-candle-pullback-continuation',observedAt:at,
  entryPrice:spot,strength:null,expirySeconds:duration/1000,
  marketPhase:'continuing',marketPhaseLabel:'CONTINUIDADE',marketTrendSide:side,
  formingContinuation:{candleFrom:start,candlePeriodMs:period,firstQuoteAt:live[0].ts,
   openingPrice:opening,move,priceBudget:budget,typicalStep:tick,confirmingMoves:aligned,
   anchorType:level?'confirmed-level':'ema20-pullback',anchorLevel:level?.level??fast.value,
   room,requiredRoom:needed,previousSwingEdge:oldEdge}};
}

// Sentinel 226 — genuine beginning of an observed continuation.
// Only past finished 5-second buckets plus the CURRENT verified broker quote.
// The existing common market base, room, price and click validators remain
// authoritative. This does not set expiry, schedule a wait or issue an order.
import {ema} from './indicators.mjs';
import {pullbackResumption,adxDmi} from './market-intelligence-226.mjs';
const reasons=new Set(['completed-structure-not-ready','neutral-closed-structure','lateral-or-mixed-structure']);
const finite=v=>Number.isFinite(Number(v))&&Number(v)>0;
export function reviewFreshPullbackContinuation({candidate,quoteHistory=[],quoteAt,
 now=quoteAt,price,durationMs}={}){
 const ms=Number(durationMs),at=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(![30000,60000].includes(ms)||candidate?.ready===true||
   !reasons.has(String(candidate?.reason||''))||
   !(at>0&&at<=clock&&clock-at<=(ms===30000?1450:1950)&&finite(spot)))return candidate;
 const tape=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>{
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts);
  return ts>=at-70000&&ts<=at&&received<=clock&&finite(q.price);
 }).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(tape.length<45||tape.at(-1).ts!==at||tape.at(-1).price!==spot||
   tape.some((q,i)=>i>0&&(q.ts<=tape[i-1].ts||q.ts-tape[i-1].ts>2400)))return candidate;
 const buckets=new Map();
 for(const q of tape){
  const start=Math.floor(q.ts/5000)*5000;
  const bar=buckets.get(start);
  if(!bar)buckets.set(start,{start,firstAt:q.ts,lastAt:q.ts,open:q.price,
    high:q.price,low:q.price,close:q.price,count:1});
  else {bar.high=Math.max(bar.high,q.price);bar.low=Math.min(bar.low,q.price);
   bar.close=q.price;bar.count++;bar.lastAt=q.ts}
 }
 const activeStart=Math.floor(at/5000)*5000;
 const history=[...buckets.values()].sort((a,b)=>a.start-b.start);
 const active=history.at(-1);
 if(!active||active.start!==activeStart)return candidate;
 const closed=history.filter(b=>b.start<activeStart&&b.count>=2&&
   b.firstAt-b.start<=2200&&b.start+5000-b.lastAt<=2200).slice(-16);
 if(closed.length<9||closed.at(-1).start!==activeStart-5000||
   closed.slice(-9).some((b,i,a)=>i>0&&b.start-a[i-1].start!==5000))
  return candidate;
 const closes=closed.map(x=>x.close);
 const fast=ema(closes,3),slow=ema(closes,6);
 if(fast==null||slow==null)return candidate;
 const previous=closed.slice(-5);
 const ranges=previous.map(b=>b.high-b.low).filter(x=>x>0).sort((a,b)=>a-b);
 const tol=Math.max(ranges[Math.floor(ranges.length/2)]||0,spot*.00001);
 const resume=pullbackResumption([...closed.slice(-5),active],{tolerance:tol,fast,slow});
 const dmi=adxDmi(closed,5);
 const options=[['CALL',resume.call],['PUT',resume.put]].filter(v=>v[1]);
 if(options.length!==1)return candidate;
 const side=options[0][0],sign=side==='CALL'?1:-1;
 const baseline=closed.at(-9).close, priorHigh=Math.max(...closed.slice(-6).map(b=>b.high)),
   priorLow=Math.min(...closed.slice(-6).map(b=>b.low));
 // No continuation at a distant terminal high/low. New breakout routes
 // retain their dedicated independent evidence and original guards.
 if(sign*(spot-baseline)<=tol*.38)return candidate;
 if(side==='CALL'&&spot>=priorHigh+tol*.18)return candidate;
 if(side==='PUT'&&spot<=priorLow-tol*.18)return candidate;
 // An aligned observed DMI adds confidence but is never mandatory.
 if(dmi.ready&&dmi.adx>=27&&dmi.direction!==side)return candidate;
 const last=tape.at(-1),prev=tape.at(-2),before=tape.findLast(q=>q.ts<=at-2000);
 if(!before||(at-2000)-before.ts>1700||sign*(spot-before.price)<=tol*.12||
   sign*(last.price-prev.price)<=0)return candidate;
 return {...candidate,ready:true,side,observedAt:at,entryPrice:spot,
   reason:'fresh-pullback-continuation',strength:Math.min(88,Math.round(63+17*
    Math.min(1,sign*(spot-before.price)/Math.max(tol,1e-12)))),
   freshPullbackEvidence:{at,priorClose:closed.at(-1).close,
    previousExtreme:side==='CALL'?priorHigh:priorLow,dmi}};
}

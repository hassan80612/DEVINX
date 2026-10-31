import {structuralQuoteMaxAgeMs} from './structure-quote-freshness.mjs';
// Timing at old resistance/support: do not chase a final weak tick into the
// upper/lower end of a historically traded band. No quote collection, timers,
// extra broker connections, machine learning claims or guaranteed outcomes.
import {entryFamilyOf} from './entry-family.mjs';
import {assessCandleLevelRoute} from './candle-level-map.mjs';
import {levelRoleEvidence} from './level-role-evidence.mjs';
const epoch=x=>{const n=Number(x);return n>0?(n<1e12?n*1000:n):0;};
const direction=side=>side==='CALL'?1:side==='PUT'?-1:0;
function recentTape(quoteHistory,at,now,spot,span=16000){
 const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>{
  const ts=Number(q?.ts),p=Number(q?.price),received=Number(q?.receivedAt??ts);
  return ts>=at-span&&ts<=at&&received<=now&&p>0&&Number.isFinite(p);
 }).map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(rows.length<3||rows.at(-1).ts!==at||rows.at(-1).price!==spot)return null;
 const tail=rows.slice(-4);
 if(tail.some((q,i)=>i>0&&(q.ts<=tail[i-1].ts||q.ts-tail[i-1].ts>2500)))return null;
 return rows;
}
function lastTwoConfirm(rows,side){
 const d=direction(side),tail=rows.slice(-3);
 if(!d||tail.length<3||tail.some((q,i)=>i>0&&(q.ts-tail[i-1].ts>2000||q.ts<=tail[i-1].ts)))return false;
 return d*(tail[2].price-tail[1].price)>0&&d*(tail[1].price-tail[0].price)>0;
}
function confirmedBars(candles,at,now){
 const raw=(Array.isArray(candles)?candles:[]).map(c=>({
  from:epoch(c?.from??c?.ts),to:epoch(c?.to),
  high:Number(c?.high??c?.max),low:Number(c?.low??c?.min),
  receivedAt:c?.receivedAt==null?0:Number(c.receivedAt)
 })).filter(c=>c.from>0&&c.to>c.from&&c.to<=at&&c.receivedAt<=now&&
  c.high>=c.low&&c.low>0);
 if(!raw.length)return[];
 const buckets=new Map();
 for(const c of raw){
  const period=c.to-c.from;
  if(!buckets.has(period))buckets.set(period,new Map());
  buckets.get(period).set(c.from,c);
 }
 return [...buckets.values()].map(m=>[...m.values()].sort((a,b)=>a.from-b.from))
  .sort((a,b)=>b.at(-1).to-a.at(-1).to||b.length-a.length)[0]?.slice(-100)||[];
}
const position=(bars,spot,n)=>{const arr=bars.slice(-n),hi=Math.max(...arr.map(x=>x.high)),
 lo=Math.min(...arr.map(x=>x.low));return hi>lo?(spot-lo)/(hi-lo):null;};
export function reviewLiveExtremeTiming({candidate,original,quoteHistory=[],candles=[],
 quoteAt,now=quoteAt,price,durationMs}={}){
 if(candidate?.ready!==true||![30000,60000].includes(Number(durationMs))||!direction(candidate.side))return candidate;
 const at=Number(quoteAt),time=Number(now),spot=Number(price);
 if(!(at>0&&at<=time&&time-at<=1950&&spot>0))return candidate;
 const rows=recentTape(quoteHistory,at,time,spot),d=direction(candidate.side);
 if(!rows)return candidate;
 const family=entryFamilyOf(candidate);
 // A single impulse reversal at a range extreme is NOT a validated turn:
 // two consecutive observed prices in the new direction are enough to
 // qualify immediately, but alternating 1-tick noise is insufficient.
 if(candidate.reason==='closed-range-extreme-reversal-confirmed'&&
    !lastTwoConfirm(rows,candidate.side))
   return{...candidate,ready:false,side:null,provisionalSide:candidate.side,
     reason:'range-reversal-lacks-two-consecutive-live-confirmations'};
 if(family!=='continuation')return candidate;
 const bars=confirmedBars(candles,at,time);
 if(bars.length<50)return candidate;
 const pos3=position(bars,spot,3),pos50=position(bars,spot,50);
 if(pos3==null||pos50==null)return candidate;
 const nearLocal=d>0?pos3>=.88:pos3<=.12;
 const nearHistorical=d>0?pos50>=.78:pos50<=.22;
 const recentStep=d*(spot-rows.at(-2).price);
 const impulse=Number(original?.observedImpulse??candidate.observedImpulse);
 const noise=Number(original?.noise??candidate.noise);
 if(!nearLocal||!nearHistorical||!(recentStep<0&&noise>0&&Math.abs(impulse)/noise<.4))
   return candidate;
 // The last quote is already retreating after a weak approach to a
 // 50-closed-candle edge. Do not turn this WAIT into an opposite order.
 return{...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:'far-extreme-weak-continuation-after-pullback',
  entryRisk:{kind:'historical-extreme-and-fading-tick',observedBars:bars.length,
    pricePosition3:Number(pos3.toFixed(3)),pricePosition50:Number(pos50.toFixed(3)),
    impulseNoise:Number((Math.abs(impulse)/noise).toFixed(3))}};
}
// Preserve the 189 observed 1m reversal route, with a modestly lighter
// candle sample (40 versus 50). Still require a historical tested level
// and two consecutive actual price moves. No waiting timer added.
// All other strategy, expiry, precision and executor guards still apply.
export function reviewEarlyDistantReversal({candidate,map,quoteHistory=[],quoteAt,
 now=quoteAt,price,durationMs}={}){
 if(Number(durationMs)!==60000||!candidate||
   (candidate.ready===true&&entryFamilyOf(candidate)!=='continuation'))return candidate;
 const at=Number(quoteAt),time=Number(now),spot=Number(price);
 if(!(at>0&&at<=time&&time-at<=structuralQuoteMaxAgeMs(durationMs)&&spot>0&&map?.observedCandles>=40&&
   map.asOf<=time&&Number(map.tolerance)>0))return candidate;
 const route=assessCandleLevelRoute({map,quoteHistory,quoteAt:at,now:time,
   price:spot,side:candidate.provisionalSide||candidate.side||'CALL',durationMs});
 const event=route?.event;
 if(!event||event.kind!=='rejection'||event.candleBacked!==true||route.conflict)return candidate;
 // Keep a qualified same-side setup; only independent opposite evidence
 // may displace an already-ready continuation. All downstream gates still run.
 if(candidate.ready===true&&event.side===candidate.side)return candidate;
 const zone=map.levels?.find(z=>Number(z.level)===Number(event.zone?.level));
 const proof=levelRoleEvidence(zone,event.side);
 if(!(proof.known&&proof.pivots>=1&&zone?.independentTests>=2&&
    zone.tests?.some(t=>Number(t.age)>=20)))return candidate;
 const rows=recentTape(quoteHistory,at,time,spot,12000);
 if(!rows||!lastTwoConfirm(rows,event.side))return candidate;
 // The actual price must remain in the historical rejection area, not
 // already 1-2 candles away from the first turn.
 const d=direction(event.side),tol=Number(map.tolerance);
 const departure=d*(spot-Number(zone.level));
 if(!(departure>=-tol&&departure<=tol*3))return candidate;
 return {...candidate,ready:true,side:event.side,observedAt:at,entryPrice:spot,
  predictedPrice:null,expectedLogMove:null,reason:'multiscale-candle-rejection',
  priceStructure:{...candidate.priceStructure,candleRoute:route},
  earlyLevelProof:{level:Number(zone.level),ageAtLeast20:true,confirmedTicks:2}};
}

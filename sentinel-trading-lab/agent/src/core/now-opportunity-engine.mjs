// Read-only present-time entry analysis for the Sentinel Agent.
// Never forecasts a future price, sends an order, or schedules a future entry.
// Closed bars decide the structural side; fresh live quotes confirm NOW.
import {observedNoise} from './forward-direction-quality.mjs';

const sideOf=v=>v>0?'CALL':v<0?'PUT':null;
const sign=side=>side==='CALL'?1:-1;
const isSide=side=>side==='CALL'||side==='PUT';
const finitePrice=p=>Number.isFinite(Number(p))&&Number(p)>0;
function causalQuotes(history,now){
 const byTime=new Map();
 for(const q of Array.isArray(history)?history:[]){
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),price=Number(q?.price);
  if(!(ts>0&&ts<=now&&received>0&&received<=now&&finitePrice(price)&&ts>=now-180000))continue;
  const previous=byTime.get(ts);
  if(!previous||received<previous.receivedAt)byTime.set(ts,{ts,receivedAt:received,price});
 }
 return [...byTime.values()].sort((a,b)=>a.ts-b.ts);
}
function closingBars(quotes,now,barMs,count=4){
 const end=Math.floor(now/barMs)*barMs,all=[];
 for(let k=count;k>0;k--){
  const from=end-k*barMs,to=from+barMs;
  const ticks=quotes.filter(q=>q.ts>=from&&q.ts<to);
  // Each completed bar needs observations near both ends. An interpolation
  // over gaps must never masquerade as actual broker price structure.
  const gap=Math.min(3500,barMs*.46);
  if(ticks.length<2||ticks[0].ts-from>gap||
    to-ticks.at(-1).ts>gap+500||
    ticks.some((t,i)=>i>0&&t.ts-ticks[i-1].ts>Math.max(2800,barMs*.55)))
    return null;
  all.push({from,to,open:ticks[0].price,close:ticks.at(-1).price,
    high:Math.max(...ticks.map(t=>t.price)),low:Math.min(...ticks.map(t=>t.price))});
 }
 return all;
}
function before(quotes,at,maxAgeMs=3500){
 for(let i=quotes.length-1;i>=0;i--)if(quotes[i].ts<=at)
  return at-quotes[i].ts<=maxAgeMs?quotes[i]:null;
 return null;
}
export function analyzeNowOpportunity({quoteHistory=[],price=null,quoteAt=null,
 now=Date.now(),durationMs=30000}={}){
 const seconds=Number(durationMs)/1000;
 const waiting=reason=>({side:null,reason,ready:false,observedAt:Number(quoteAt)||null,
   entryPrice:null,strength:null,expirySeconds:seconds});
 if(!(seconds>=5&&seconds<=3600))return waiting('invalid-expiry');
 if(!(Number(quoteAt)>0&&Number(quoteAt)<=now&&now-Number(quoteAt)<=2500&&finitePrice(price)))
  return waiting('stale-live-quote');
 const quotes=causalQuotes(quoteHistory,now);
 if(!quotes.length||!quotes.some(q=>q.ts===Number(quoteAt)&&Number(q.price)===Number(price)))
  return waiting('live-quote-unverified');
 const barMs=(seconds<=10?5:seconds<=30?10:15)*1000;
 const bars=closingBars(quotes,now,barMs);
 if(!bars)return waiting('completed-structure-not-ready');
 const moves=bars.map(b=>Math.log(b.close/b.open));
 const net=Math.log(bars.at(-1).close/bars[0].open);
 const side=sideOf(net);
 if(!side)return waiting('neutral-closed-structure');
 const aligned=moves.filter(m=>sign(side)*m>0).length;
 if(aligned<3)return waiting('lateral-or-mixed-structure');
 const noise=observedNoise({quotes,now,horizonSeconds:barMs*4/1000});
 if(!(noise>0))return waiting('insufficient-quote-variation');
 // Require a real directional movement over FOUR completed bars. A
 // microscopic rise/fall is not a signal, even if three candles were green.
 if(sign(side)*net<noise*.52)return waiting('closed-movement-below-noise');
 const latest=before(quotes,Number(quoteAt)-Math.min(6000,barMs*.7),3500);
 if(!latest)return waiting('recent-movement-not-ready');
 const impulse=Math.log(Number(price)/latest.price);
 if(sign(side)*impulse<noise*.10)return waiting('current-impulse-against-structure');
 const follow=Math.log(Number(price)/bars.at(-1).close);
 if(sign(side)*follow< -noise*.08)return waiting('current-price-retracing');
 // Three closed bars alone cannot trigger entry. The live tick must also
 // move in the same direction as the established structure.
 const strength=Math.min(100,Math.round(100*Math.min(1,
   Math.min(sign(side)*net/(noise*1.25),sign(side)*impulse/(noise*.38)))));
 return {ready:true,side,reason:'closed-structure-and-live-impulse',
   observedAt:Number(quoteAt),entryPrice:Number(price),strength,
   expirySeconds:seconds,barSeconds:barMs/1000,alignedBars:aligned,
   observedNetMove:net,observedImpulse:impulse,noise};
}
// One-shot state machine. No second CALL/PUT during the selected expiry.
// Analysis can run on every quote while the previous signal is locked.
// At expiry only a fresh AFTER-expiry quote can authorize the next signal.
export function advanceNowOpportunity({previous=null,candidate=null,now=Date.now(),
 quoteAt=null,asset='UNKNOWN',engineId='automatic',durationMs=30000}={}){
 const horizon=Number(durationMs);
 if(!(horizon>=5000&&horizon<=3600000))return null;
 const key=[String(asset).toUpperCase(),String(engineId),horizon].join('|');
 const old=previous?.context===key?previous:null;
 const fresh=Number(quoteAt)>0&&Number(quoteAt)<=now&&now-Number(quoteAt)<=2500;
 if(old?.phase==='fired'&&now<old.exitAt)
  return {...old,entryReadyNow:false,observationSide:candidate?.side||null,
    lastObservedAt:Number(quoteAt)||null};
 const priorExpiry=old?.phase==='fired'?Number(old.exitAt):Number(old?.lastExpiryAt)||null;
 // Do not manufacture an instant re-entry from the same tick captured
 // before the previous option actually expired.
 const canRelease=fresh&&(!priorExpiry||Number(quoteAt)>=priorExpiry);
 const ready=canRelease&&candidate?.ready===true&&isSide(candidate.side)&&
   Number(candidate.observedAt)===Number(quoteAt)&&finitePrice(candidate.entryPrice);
 if(ready){
  const expiry=now+horizon;
  return {context:key,engineId,asset:String(asset).toUpperCase(),
   phase:'fired',reason:'present-confirmed',side:candidate.side,
   entryAt:now,entryTriggeredAt:now,plannedEntryAt:now,
   entryPrice:Number(candidate.entryPrice),confirmedEntryPrice:Number(candidate.entryPrice),
   exitAt:expiry,windowStartedAt:now,windowEndsAt:expiry,
   holdingSeconds:horizon/1000,delaySeconds:horizon/1000,
   issuedAt:now,entryReadyNow:true,observationSide:candidate.side,
   lastObservedAt:Number(quoteAt)};
 }
 return {context:key,engineId,asset:String(asset).toUpperCase(),
   phase:'scanning',reason:!fresh?'waiting-fresh-quote':candidate?.reason||'scanning-now',
   side:null,entryAt:null,exitAt:null,entryTriggeredAt:null,entryReadyNow:false,
   windowStartedAt:priorExpiry||now,windowEndsAt:0,observationSide:candidate?.side||null,
   lastObservedAt:Number(quoteAt)||null,lastExpiryAt:priorExpiry,
   holdingSeconds:horizon/1000,delaySeconds:horizon/1000};
}

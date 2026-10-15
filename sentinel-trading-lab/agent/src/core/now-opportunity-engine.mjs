// Read-only present-time entry analysis for the Sentinel Agent.
// Never forecasts a future price, sends an order, or schedules a future entry.
// Closed bars decide the structural side; fresh live quotes confirm NOW.
import {observedNoise} from './forward-direction-quality.mjs';
import {currentStrategyEvidence} from './now-strategy-evidence.mjs';

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

// Recognize genuinely observed two-sided market oscillations using CLOSED
// 5-second prices from the past, not future projections or forming candles.
// Return null for a directional regime; return a verdict when past alternation
// means a short-term impulse is a potentially misleading end-of-range leg.
function completedRangeStructure(quotes,now,noise,spot){
 const period=5000,end=Math.floor(now/period)*period;
 const last=quotes.filter(q=>q.ts>=end-135000&&q.ts<=now);
 if(last.length<50||last.at(-1).ts-last[0].ts<50000)return null;
 const closes=[];
 for(let t=end-130000;t<end;t+=period){
  const part=last.filter(q=>q.ts>=t&&q.ts<t+period);
  if(part.length<2||part[0].ts-t>3000||
    t+period-part.at(-1).ts>3500||
    part.some((q,i)=>i>0&&q.ts-part[i-1].ts>3500))continue;
  closes.push({at:t,price:part.at(-1).price,log:Math.log(part.at(-1).price)});
 }
 if(closes.length<10)return null;
 // A directional trend with small pullbacks has high total path efficiency.
 // A long oscillation traverses both directions, returning near its origin.
 let travelled=0;
 for(let i=1;i<last.length;i++){
  if(last[i].ts-last[i-1].ts<=3500)
   travelled+=Math.abs(Math.log(last[i].price/last[i-1].price));
 }
 const net=Math.abs(Math.log(last.at(-1).price/last[0].price));
 const efficiency=travelled>0?net/travelled:1;
 // A noisy REAL downtrend can have very low 1-second path efficiency.
 // Distinguish net directional travel from alternating price extremes
 // using a causal 90-second linear-fit strength, not net/path alone.
 const regression=last.filter(x=>x.ts>=now-90000);
 let meanT=0,meanP=0;
 for(const q of regression){meanT+=(q.ts-now)/1000;meanP+=Math.log(q.price);}
 meanT/=regression.length;meanP/=regression.length;
 let xx=0,yy=0,xy=0;
 for(const q of regression){
  const x=(q.ts-now)/1000-meanT,y=Math.log(q.price)-meanP;
  xx+=x*x;yy+=y*y;xy+=x*y;
 }
 const trendFit=xx>0&&yy>0?xy*xy/(xx*yy):0;
 if(trendFit>=.70)return null;
 const pivots=[];
 for(let i=2;i<closes.length-2;i++){
  const near=[closes[i-2],closes[i-1],closes[i+1],closes[i+2]];
  const hi=closes[i].log>Math.max(...near.map(x=>x.log));
  const lo=closes[i].log<Math.min(...near.map(x=>x.log));
  if(hi||lo)pivots.push({at:closes[i].at,type:hi?'HIGH':'LOW'});
 }
 if(pivots.length<2)return null;
 if(pivots.length===2)return {ready:false,reason:'range-awaiting-third-confirmed-turn'};
 const recent=pivots.slice(-4),gaps=recent.slice(1).map((p,i)=>(p.at-recent[i].at)/1000);
 const sorted=[...gaps].sort((a,b)=>a-b),half=sorted[Math.floor(sorted.length/2)];
 const minGap=Math.min(...gaps),maxGap=Math.max(...gaps);
 const upper=Math.max(...last.map(x=>Math.log(x.price)));
 const lower=Math.min(...last.map(x=>Math.log(x.price)));
 const span=upper-lower;
 if(!(span>noise*1.10))return null;
 const regular=gaps.length>=2&&half>=12&&half<=90&&
   minGap>=9&&(maxGap-minGap)/half<=.52&&
   recent.every((v,i)=>i===0||v.type!==recent[i-1].type);
 // An unresolved oscillation is not a trend. Continue observing each new
 // quote rather than chase its latest leg as a directional entry.
 if(!regular)return {ready:false,reason:'irregular-multi-swing-range'};
 // These are observations of the present, not a forecast of the next
 // half-cycle. The selected holding time must not veto every subsequent
 // entry based on a guessed future repetition of past swing duration.
 const position=(Math.log(spot)-lower)/span;
 // Confirm ACTUAL retreat from a recent extreme. Being at the upper bound
 // alone is not a PUT, and being at the lower bound alone is not a CALL.
 const recentTicks=last.filter(x=>x.ts>=now-6500);
 const lastFew=recentTicks.slice(-4),peak=Math.max(...recentTicks.map(q=>q.price));
 const trough=Math.min(...recentTicks.map(q=>q.price));
 const down=lastFew.slice(1).filter((x,i)=>x.price<lastFew[i].price).length;
 const up=lastFew.slice(1).filter((x,i)=>x.price>lastFew[i].price).length;
 const retreat= Math.log(peak/spot),bounce=Math.log(spot/trough);
 const minTurn=Math.max(noise*.045,span*.016);
 const highTurn=position>=.73&&retreat>=minTurn&&down>=2;
 const lowTurn=position<=.27&&bounce>=minTurn&&up>=2;
 if(highTurn||lowTurn)return {ready:true,side:highTurn?'PUT':'CALL',
  reason:'closed-range-extreme-reversal-confirmed',
  observedSwingSeconds:half,position,efficiency};
 return {ready:false,reason:'range-extreme-awaiting-confirmed-turn'};
}

export function analyzeNowOpportunity({quoteHistory=[],price=null,quoteAt=null,
 now=Date.now(),durationMs=30000,engineId='automatic'}={}){
 const seconds=Number(durationMs)/1000;
 const waiting=reason=>({side:null,reason,ready:false,observedAt:Number(quoteAt)||null,
   entryPrice:null,strength:null,expirySeconds:seconds});
 if(!(seconds>=5&&seconds<=3600))return waiting('invalid-expiry');
 if(!(Number(quoteAt)>0&&Number(quoteAt)<=now&&now-Number(quoteAt)<=2500&&finitePrice(price)))
  return waiting('stale-live-quote');
 const quotes=causalQuotes(quoteHistory,now);
 if(!quotes.length||!quotes.some(q=>q.ts===Number(quoteAt)&&Number(q.price)===Number(price)))
  return waiting('live-quote-unverified');
 // Selected strategies produce native current evidence; the shared lifecycle
 // owns their signals. No legacy score/candle/forecast prerequisite is used.
 if(engineId!=='automatic'){
  const result=currentStrategyEvidence({quotes,price:Number(price),quoteAt:Number(quoteAt),engineId});
  return {...waiting(result.reason),...result,entryPrice:result.ready?Number(price):null};
 }
 // This structure is retained across cycles; never start collecting it
 // again at expiry. Holding time does not impose any post-expiry pause.
 const barMs=(seconds<=10?5:seconds<=30?10:15)*1000;
 const bars=closingBars(quotes,now,barMs);
 if(!bars)return waiting('completed-structure-not-ready');
 const moves=bars.map(b=>Math.log(b.close/b.open));
 const net=Math.log(bars.at(-1).close/bars[0].open);
 const noise=observedNoise({quotes,now,horizonSeconds:barMs*4/1000});
 if(!(noise>0))return waiting('insufficient-quote-variation');
 const range=completedRangeStructure(quotes,now,noise,Number(price));
 if(range){
  if(!range.ready)return waiting(range.reason);
  return {ready:true,side:range.side,reason:range.reason,
    observedAt:Number(quoteAt),entryPrice:Number(price),
    strength:null,expirySeconds:seconds,
    regime:'observed-range-turn',observedSwingSeconds:range.observedSwingSeconds};
 }
 // Directional efficiency distinguishes a persistent move from price
 // zigzags of similar amplitude. A weak sideways swing must not trigger
 // CALL/PUT merely because 3 of 4 small candle bodies share a colour.
 const route=quotes.filter(q=>q.ts>=bars[0].from&&q.ts<bars.at(-1).to);
 let travelled=0;
 for(let i=1;i<route.length;i++){
  if(route[i].ts-route[i-1].ts>3000)continue;
  travelled+=Math.abs(Math.log(route[i].price/route[i-1].price));
 }
 if(!(travelled>0)||Math.abs(net)/travelled<.20)
  return waiting('choppy-sideways-structure');
 const side=sideOf(net);
 if(!side)return waiting('neutral-closed-structure');
 const aligned=moves.filter(m=>sign(side)*m>0).length;
 if(aligned<3)return waiting('lateral-or-mixed-structure');
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
   // A broker quote can precede the worker's Date.now() by milliseconds.
   // Cycle origin MUST be the observed quote clock or both PC and phone
   // incorrectly discard every legitimate real-time analysis as "old".
   exitAt:expiry,windowStartedAt:Number(quoteAt),windowEndsAt:expiry,
   holdingSeconds:horizon/1000,delaySeconds:horizon/1000,
   issuedAt:now,entryReadyNow:true,observationSide:candidate.side,
   lastObservedAt:Number(quoteAt)};
 }
 return {context:key,engineId,asset:String(asset).toUpperCase(),
   phase:'scanning',reason:!fresh?'waiting-fresh-quote':candidate?.reason||'scanning-now',
   side:null,entryAt:null,exitAt:null,entryTriggeredAt:null,entryReadyNow:false,
   // Scanning is not an open signal window. Do not invent a cycle start
   // equal to worker time: quoteAt normally trails the worker by 50-500ms.
   windowStartedAt:null,windowEndsAt:0,observationSide:candidate?.side||null,
   lastObservedAt:Number(quoteAt)||null,lastExpiryAt:priorExpiry,
   holdingSeconds:horizon/1000,delaySeconds:horizon/1000};
}

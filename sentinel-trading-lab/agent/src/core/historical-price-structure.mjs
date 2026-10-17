// Price structure from the last 100 CLOSED, actually received candles.
// Older levels remain spatial evidence; they are neither guaranteed barriers
// nor a reason to wait for 100 new candles. No broker calls or clock lookup.
import {buildCandleLevelMap} from './candle-level-map.mjs';
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0;
const epoch=x=>{const n=Number(x);return n>0?(n<1e12?n*1000:n):0;};
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0;};
const direction=x=>x>0?'CALL':x<0?'PUT':null;
function closedCandles(candles,now){
 const groups=new Map();
 for(const c of Array.isArray(candles)?candles:[]){
  const from=epoch(c.from??c.ts),to=epoch(c.to??(from?from+60000:0));
  const open=Number(c.open),close=Number(c.close),high=Number(c.high??c.max),low=Number(c.low??c.min);
  if(Number(c.receivedAt)>now)continue;
  if(!(from>0&&to>from&&to<=now&&[open,close,high,low].every(positive)&&
    low<=Math.min(open,close)&&high>=Math.max(open,close)))continue;
  const period=to-from;
  if(!groups.has(period))groups.set(period,new Map());
  groups.get(period).set(from,{from,to,open,close,high,low});
 }
 const series=[...groups.values()].map(g=>[...g.values()].sort((a,b)=>a.from-b.from));
 // Never mix 1m and 5m bars into an artificial moving average.
 series.sort((a,b)=>b.length-a.length||b.at(-1).to-a.at(-1).to);
 return (series[0]||[]).slice(-100);
}
function ema(rows,period){
 if(rows.length<period)return null;
 const alpha=2/(period+1);let value=rows[0].close,previous=value;
 for(let i=1;i<rows.length;i++){previous=value;value+=alpha*(rows[i].close-value);}
 return {period,value,slope:value-previous};
}
export function historicalPriceStructure({candles=[],now=Date.now()}={}){
 const rows=closedCandles(candles,now);
 if(!rows.length)return {candles:0,zones:[],averages:[],atr:null,periodMs:null};
 const trueRanges=rows.map((r,i)=>Math.max(r.high-r.low,i?Math.abs(r.high-rows[i-1].close):0,i?Math.abs(r.low-rows[i-1].close):0));
 const atr=trueRanges.slice(-14).reduce((s,x)=>s+x,0)/Math.min(14,rows.length);
 const scale=Math.max(atr,median(trueRanges),rows.at(-1).close*1e-8);
 const tolerance=scale*.10;
 const points=[];
 for(let i=0;i<rows.length;i++){
  const bar=rows[i],neighbors=rows.slice(Math.max(0,i-2),Math.min(rows.length,i+3)).filter(x=>x!==bar);
  const age=rows.length-1-i,weight=.5+.5*Math.exp(-age/50);
  points.push({price:bar.high,index:i,age,kind:'high',weight,
    pivot:neighbors.length>=2&&neighbors.every(x=>x.high<bar.high)});
  points.push({price:bar.low,index:i,age,kind:'low',weight,
    pivot:neighbors.length>=2&&neighbors.every(x=>x.low>bar.low)});
 }
 points.sort((a,b)=>a.price-b.price);
 const zones=[];
 for(const p of points){
  let z=zones.at(-1);
  if(!z||p.price-z.low>tolerance*2){
   z={low:p.price,high:p.price,level:p.price,weight:0,touches:0,pivots:0,ages:[],indices:new Set()};zones.push(z);
  }
  z.high=p.price;z.level=(z.low+z.high)/2;z.weight+=p.weight;
  z.pivots+=p.pivot?1:0;z.ages.push(p.age);z.indices.add(p.index);z.touches=z.indices.size;
 }
 return {candles:rows.length,periodMs:rows.at(-1).to-rows.at(-1).from,
  asOf:rows.at(-1).to,atr:scale,tolerance,
  candleLevelMap:buildCandleLevelMap({rows,zones,tolerance}),
  averages:[20,50,100].map(p=>ema(rows,p)).filter(Boolean),
  zones:zones.map(({indices,...z})=>z)};
}
function priceBefore(rows,at){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=at)
  return at-rows[i].ts<=2500?rows[i].price:null;
 return null;
}
export function applyHistoricalPriceStructure({candidate,structure,quoteHistory=[],quoteAt,now=quoteAt,price}={}){
 if(!candidate||!structure?.candles)return candidate;
 const spot=Number(price),ts=Number(quoteAt);
 if(!(positive(spot)&&ts>0&&ts<=now&&now-ts<=1450))return candidate;
 const q=quoteHistory.filter(x=>x.ts<=ts&&(x.receivedAt??x.ts)<=now&&x.ts>=ts-12000&&positive(x.price));
 if(q.at(-1)?.ts!==ts||Number(q.at(-1)?.price)!==spot)return candidate;
 const earlier=priceBefore(q,ts-2000),origin=priceBefore(q,ts-6000),previous=q.at(-2)?.price;
 const evidence={candles:structure.candles,periodMs:structure.periodMs,
  averages:structure.averages,nearestSupport:null,nearestResistance:null,reaction:null};
 // A handful of candles does not establish the requested wider context.
 // Keep the existing analyst running while the received history is sparse;
 // never impose a new collection timer or fabricate a 20-period average.
 if(!structure.averages.length)return {...candidate,priceStructure:evidence};
 if(!(positive(spot)&&earlier&&origin&&previous))return {...candidate,priceStructure:evidence};
 const prices=q.map(x=>x.price),hi=Math.max(...prices),lo=Math.min(...prices);
 const move=spot-earlier,step=spot-previous;
 const tolerance=Math.max(structure.tolerance,spot*1e-8);
 const minReaction=Math.max(tolerance*.5,structure.atr*.025);
 const relevant=structure.zones.filter(z=>z.touches>=2||z.pivots>0);
 const below=relevant.filter(z=>z.level<=spot).sort((a,b)=>b.level-a.level);
 const above=relevant.filter(z=>z.level>=spot).sort((a,b)=>a.level-b.level);
 const describe=z=>z?{level:z.level,touches:z.touches,oldestBarsAgo:Math.max(...z.ages),newestBarsAgo:Math.min(...z.ages)}:null;
 evidence.nearestSupport=describe(below[0]);evidence.nearestResistance=describe(above[0]);
 const reactions=[];
 for(const z of relevant){
  const level=z.level,distance=Math.abs(spot-level);
  if(distance>Math.max(structure.atr*.4,hi-lo))continue;
  const recent=q.filter(x=>x.ts>=ts-2500);
  const heldUp=recent.length>=3&&recent[0].ts<=ts-1500&&recent.every(x=>x.price>z.high+tolerance*.25);
  const heldDown=recent.length>=3&&recent[0].ts<=ts-1500&&recent.every(x=>x.price<z.low-tolerance*.25);
  const breakoutUp=origin<level&&spot>z.high+tolerance&&heldUp&&move>minReaction&&step>=0;
  const breakoutDown=origin>level&&spot<z.low-tolerance&&heldDown&&move< -minReaction&&step<=0;
  // A prior wick is a region, not an automatic reversal. Current retreat
  // must be visible in received prices and still advancing on this quote.
  const rejectionUp=origin>level&&lo<=z.high+tolerance&&lo>=z.low-tolerance*2&&
    spot>=z.low&&spot<=z.high+tolerance*3&&spot-lo>=minReaction&&move>minReaction&&step>=0;
  const rejectionDown=origin<level&&hi>=z.low-tolerance&&hi<=z.high+tolerance*2&&
    spot<=z.high&&spot>=z.low-tolerance*3&&hi-spot>=minReaction&&move< -minReaction&&step<=0;
  const side=breakoutUp||rejectionUp?'CALL':breakoutDown||rejectionDown?'PUT':null;
  const averageConfluence=structure.averages.filter(a=>Math.abs(a.value-level)<=tolerance*2).length;
  if(side)reactions.push({side,kind:breakoutUp||breakoutDown?'breakout':'rejection',
    zone:describe(z),averageConfluence,
    weight:(1+z.pivots+Math.log1p(z.touches)+averageConfluence)/(1+distance/tolerance)});
 }
 reactions.sort((a,b)=>b.weight-a.weight);
 const reaction=reactions[0];
 if(reaction){
  evidence.reaction=reaction;
  // Equally strong opposing levels are unresolved, not two simultaneous calls.
  const opposed=reactions.find(x=>x.side!==reaction.side&&x.weight>=reaction.weight*.8);
  if(opposed)return {...candidate,ready:false,side:null,reason:'historical-level-reactions-conflict',priceStructure:evidence};
  if(candidate.pendingForecast?.ready&&candidate.pendingForecast.side!==reaction.side)
   return {...candidate,ready:false,side:null,reason:'historical-level-versus-expiry-conflict',priceStructure:evidence};
  return {...candidate,ready:true,side:reaction.side,observedAt:ts,entryPrice:spot,
   reason:'historical-level-'+reaction.kind,priceStructure:evidence};
 }
 // A received candle history can establish the trend before four new 10s
 // bars close. Admit only a fitted forecast aligned with BOTH moving
 // averages and fresh movement, with room before the next historical zone.
 if(!candidate.ready&&structure.averages.length>=2&&candidate.pendingForecast?.ready){
  const f=candidate.pendingForecast,side=f.side,sgn=side==='CALL'?1:-1;
  const [fast,slow]=structure.averages;
  const aligned=sgn*(fast.value-slow.value)>0&&sgn*fast.slope>0&&
    sgn*move>minReaction&&sgn*step>=0;
  const wall=side==='CALL'?above[0]:below[0];
  const requiredSpace=Math.max(Math.abs(f.predictedPrice-spot),tolerance*2);
  const space=!wall||Math.abs(wall.level-spot)>requiredSpace;
  if(aligned&&space&&Math.abs(f.expectedLogMove)>=f.fitResidual)
   return {...candidate,...f,reason:'historical-trend-and-live-forecast',priceStructure:evidence};
 }
 // Deceleration INTO a tested level is different from a sustained breakout.
 // This check has no timeout and never waits for another completed candle.
 const intended=candidate.side,wall=intended==='CALL'?above[0]:below[0];
 if(candidate.ready&&wall&&Math.abs(wall.level-spot)<=tolerance&&wall.touches>=2){
  const shortMove=spot-earlier,longMove=earlier-origin;
  const against=intended==='CALL'?shortMove<=0:shortMove>=0;
  const slowing=Math.abs(shortMove)<Math.abs(longMove)/4;
  if(against||slowing)return {...candidate,side:null,ready:false,
    reason:'historical-level-pressure-unconfirmed',priceStructure:evidence};
 }
 return {...candidate,priceStructure:evidence};
}
// Cache only candle-derived structure. Every current reaction uses the fresh
// quote, including corrections to any of the 100 retained closed candles.
export class HistoricalPriceStructureCache{
 constructor(){this.key=null;this.value=null;}
 get({candles=[],now,context=''}){
  const rows=closedCandles(candles,now);
  const key=context+'|'+rows.map(c=>[c.from,c.to,c.open,c.high,c.low,c.close].join(',')).join(';');
  if(key!==this.key){this.key=key;this.value=historicalPriceStructure({candles:rows,now});}
  return this.value;
 }
}

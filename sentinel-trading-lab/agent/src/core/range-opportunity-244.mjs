// Sentinel 244: allow genuinely repeatable sideways swings to compete for
// CALL/PUT at the USER-SELECTED 30s/1m expiry. No waiting for a new candle,
// no broker read, no countdown or expiry mutation. Only completed analogues.
const side=v=>v>0?'CALL':v<0?'PUT':null;
const closest=(q,ts)=>{
 let nearest=null,best=1701;
 for(let i=q.length-1;i>=0;i--){
  const d=Math.abs(q[i].ts-ts);
  if(d<best){nearest=q[i];best=d;}
  if(q[i].ts<ts-1800)break;
 }
 return nearest;
};
export function analyzeCausalRange244({quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 const wait={ready:false,reason:'range-analogue-unverified'};
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),duration=Number(durationMs);
 if(duration!==60000||!(at>0&&clock>=at&&clock-at<=1950&&spot>0))
  return wait;
 const q=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(v=>
  Number(v?.ts)<=at&&Number(v?.ts)>=at-185000&&Number(v?.receivedAt??v?.ts)<=clock&&Number(v?.price)>0
 ).map(v=>({ts:Number(v.ts),price:Number(v.price)})).sort((a,b)=>a.ts-b.ts);
 if(q.length<120||q.at(-1).ts!==at||q.at(-1).price!==spot||
   q.some((v,i)=>i>0&&(v.ts<=q[i-1].ts||v.ts-q[i-1].ts>2600)))return wait;
 const recent=q.filter(v=>v.ts>=at-125000),hi=Math.max(...recent.map(v=>v.price)),
  lo=Math.min(...recent.map(v=>v.price)),width=hi-lo,position=(spot-lo)/width;
 if(!(width>spot*1e-5&&position>=-.12&&position<=1.12))return wait;
 // A directional channel is NOT a repeating stationary range.
 const start=recent[0].price,end=recent.at(-1).price;
 if(Math.abs(end-start)>width*.38)return wait;
 const fit=()=>{
  const n=recent.length,avgX=recent.reduce((a,v)=>a+(v.ts-at)/1000,0)/n,
    avgY=recent.reduce((a,v)=>a+v.price,0)/n;
  let xx=0,xy=0,yy=0;
  for(const v of recent){const x=(v.ts-at)/1000-avgX,y=v.price-avgY;
   xx+=x*x;xy+=x*y;yy+=y*y;}
  return xx>0&&yy>0?xy*xy/(xx*yy):1;
 };
 if(fit()>.27)return wait;
 let best=null;
 for(let period=22;period<=82;period++){
  let error=0,count=0;
  for(let back=0;back<=115;back+=3){
   const x=closest(q,at-back*1000),old=closest(q,at-(back+period)*1000);
   if(!x||!old)continue;
   error+=Math.abs(x.price-old.price);count++;
  }
  if(count<26)continue;
  const mae=error/count;
  if(!best||mae<best.mae)best={period,mae};
 }
 if(!best||best.mae>width*.12)return wait;
 const outcomes=[];
 for(let cycles=Math.ceil((duration+2200)/(best.period*1000));cycles<=5;cycles++){
  const t=at-cycles*best.period*1000;
  const entry=closest(q,t),exit=closest(q,t+duration);
  if(!entry||!exit||exit.ts>at)continue;
  if(Math.abs(entry.price-spot)>width*.17)continue;
  outcomes.push({delta:exit.price-entry.price,at:t});
  if(outcomes.length===3)break;
 }
 if(outcomes.length<2)return wait;
 const agreed=side(outcomes[0].delta);
 const minMove=width*.14;
 if(!agreed||outcomes.some(o=>side(o.delta)!==agreed||Math.abs(o.delta)<minMove))
  return wait;
 // Never chase the top of a range as CALL or the bottom as PUT.
 if((position>=.72&&agreed!=='PUT')||(position<=.28&&agreed!=='CALL'))return wait;
 return {ready:true,side:agreed,reason:'verified-range-expiry-analogue-244',
  observedAt:at,entryPrice:spot,expirySeconds:duration/1000,
  rangePosition:Number(position.toFixed(3)),observedSwingSeconds:best.period/2,
  observedRangePeriodSeconds:best.period,analogueCount:outcomes.length,
  worstAnalogueMove:Math.min(...outcomes.map(o=>Math.abs(o.delta))),
  proof:'historical-expiry-outcomes-only',regime:'repeatable-sideways'};
}

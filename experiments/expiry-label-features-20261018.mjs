// Causal, currency-scale-free features. No future outcomes, time-of-day,
// broker identity, volume inference or additional history retention.
const epoch=v=>Number(v)<1e12?Number(v)*1000:Number(v);
const clip=x=>Math.max(-8,Math.min(8,x));
export function expiryLabelFeatures({quoteHistory=[],candles=[],price,quoteAt,now=quoteAt}={}){
 const ts=Number(quoteAt),spot=Number(price);
 if(!(ts>0&&ts<=now&&now-ts<=1450&&spot>0))return null;
 const qs=quoteHistory.filter(q=>q.ts>=ts-180000&&q.ts<=ts&&(q.receivedAt??q.ts)<=now&&q.price>0).sort((a,b)=>a.ts-b.ts);
 if(qs.at(-1)?.ts!==ts||qs.at(-1)?.price!==spot)return null;
 const before=t=>{const q=qs.findLast(q=>q.ts<=t);return q&&t-q.ts<=2500?q.price:null;};
 const refs=[2,5,10,20,30,60,120].map(h=>before(ts-h*1000));
 if(refs.some(p=>!p))return null;
 const byTime=new Map();
 for(const c of candles){
  const from=epoch(c.from??c.ts),to=epoch(c.to),open=Number(c.open),close=Number(c.close),high=Number(c.high??c.max),low=Number(c.low??c.min);
  if(!(from>0&&to-from===60000&&to<=ts&&!(Number(c.receivedAt)>now)&&
   [open,close,high,low].every(x=>x>0&&Number.isFinite(x))&&high>=Math.max(open,close)&&low<=Math.min(open,close)))continue;
  byTime.set(from,{from,to,open,close,high,low});
 }
 const rows=[...byTime.values()].sort((a,b)=>a.from-b.from).slice(-50);
 if(rows.length<50||ts-rows.at(-1).to>90000||rows.some((c,i)=>i&&c.from!==rows[i-1].to))return null;
 const noise=(since)=>{
  let sq=0,dt=0;
  for(let i=1;i<qs.length;i++){
   if(qs[i-1].ts<since)continue;
   const seconds=(qs[i].ts-qs[i-1].ts)/1000;if(!(seconds>0&&seconds<=10))continue;
   sq+=Math.log(qs[i].price/qs[i-1].price)**2;dt+=seconds;
  }
  return dt>=12&&sq>0?Math.sqrt(sq/dt*30):null;
 };
 const scale=noise(ts-180000);if(!(scale>0))return null;
 const r=refs.map(p=>Math.log(spot/p)/scale);
 const recent=qs.filter(q=>q.ts>=ts-30000);let travel=0;
 for(let i=1;i<recent.length;i++)if(recent[i].ts-recent[i-1].ts<=10000)travel+=Math.abs(Math.log(recent[i].price/recent[i-1].price));
 const names=['return2','return5','return10','return20','return30','return60','return120','acceleration2to5','acceleration10to30','efficiency30','lastStep','volatilityRatio'];
 const values=[...r,r[0]-r[1]*2/5,r[2]-r[4]/3,travel?Math.log(spot/recent[0].price)/travel:0,
  qs.length>1?Math.log(spot/qs.at(-2).price)/scale:0,(noise(ts-30000)??scale)/scale];
 for(const n of [3,10,20,50]){
  const part=rows.slice(-n),hi=Math.max(...part.map(c=>c.high)),lo=Math.min(...part.map(c=>c.low)),range=Math.max(hi-lo,spot*1e-8);
  names.push('position'+n,'trend'+n,'resistanceDistance'+n,'supportDistance'+n);
  values.push(2*(spot-lo)/range-1,Math.log(part.at(-1).close/part[0].open)/(scale*Math.sqrt(n)),
   Math.log(hi/spot)/scale,Math.log(spot/lo)/scale);
 }
 for(let i=1;i<=3;i++){
  const c=rows.at(-i),range=Math.max(c.high-c.low,spot*1e-8);
  names.push('body'+i,'upperWick'+i,'lowerWick'+i);
  values.push((c.close-c.open)/range,(c.high-Math.max(c.open,c.close))/range,(Math.min(c.open,c.close)-c.low)/range);
 }
 const ema=p=>{let a=rows[0].close;for(const c of rows.slice(1))a+=2/(p+1)*(c.close-a);return a;};
 names.push('relativeToLastClose','ema20to50','momentumPositionInteraction','momentumTrendInteraction');
 values.push(Math.log(spot/rows.at(-1).close)/scale,Math.log(ema(20)/ema(50))/scale,r[1]*values[12],r[3]*values[13]);
 if(!values.every(Number.isFinite))return null;
 return {names,values:values.map(clip)};
}

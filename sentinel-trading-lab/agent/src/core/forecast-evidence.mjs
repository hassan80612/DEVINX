const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const FORECAST_MODEL='future-v6.0';
export const EVIDENCE_GROUPS={
  flow:['micro','acceleration'],momentum:['momentum','persistence'],
  structure:['trend','history','regime','mtf'],context:['location','setup','reversal'],strategy:['strategy']
};
// An indicator has one place in the budget. Agreement is measured over the
// same family budget used to predict direction, including multi-timeframe.
export function fuseForecastEvidence(features=[]){
  const unique=[...new Map(features.filter(f=>f.available&&f.weight>0&&Number.isFinite(f.value)).map(f=>[f.key,f])).values()];
  const rows=Object.entries(EVIDENCE_GROUPS).map(([family,keys])=>{
    const fs=unique.filter(f=>keys.includes(f.key)),rawWeight=fs.reduce((v,f)=>v+f.weight,0);
    return {family,rawWeight,value:rawWeight?fs.reduce((v,f)=>v+f.weight*f.value,0)/rawWeight:0};
  }).filter(f=>f.rawWeight>0);
  const cap=Math.max(.28,1/Math.max(1,rows.length));let left=1,remaining=[...rows];
  while(remaining.length){
    const total=remaining.reduce((v,f)=>v+f.rawWeight,0);
    const capped=remaining.filter(f=>left*f.rawWeight/total>cap+1e-12);
    if(!capped.length){for(const f of remaining)f.weight=left*f.rawWeight/total;break}
    for(const f of capped){f.weight=cap;left-=cap}
    remaining=remaining.filter(f=>!capped.includes(f));
  }
  const signal=clamp(rows.reduce((v,f)=>v+f.value*f.weight,0),-1,1);
  const directional=rows.filter(f=>Math.abs(f.value)>=.08),total=directional.reduce((v,f)=>v+f.weight,0);
  const aligned=directional.filter(f=>Math.sign(f.value)===Math.sign(signal)).reduce((v,f)=>v+f.weight,0);
  return {signal,rows,agreement:total?aligned/total:.5,conflict:total?(total-aligned)/total:0};
}
// Exhaustion is evidence that the move may weaken. It cannot manufacture an
// opposite forecast merely by subtracting more than the original signal.
export function attenuateForecast(signal,{overextended=false,turning=false,flowConflict=false,accelerationConflict=false,seconds=60}={}){
  let retain=1;
  if(overextended)retain*=.52;
  if(turning)retain*=seconds<=60?.65:.80;
  if(flowConflict)retain*=.70;
  if(accelerationConflict)retain*=.82;
  return signal*retain;
}
export function predictionInput({candles=[],quoteHistory=[],now=Date.now()}={}){
  const byPeriod=new Map();
  for(const c of candles){
    const from=Number(c.from),to=Number(c.to),values=['open','high','low','close'].map(k=>Number(c[k]));
    if(!Number.isFinite(from)||!Number.isFinite(to)||from*1000>now||to<=from||values.some(x=>!Number.isFinite(x)||x<=0))continue;
    const period=to-from;if(!byPeriod.has(period))byPeriod.set(period,new Map());
    byPeriod.get(period).set(from,{...c,from,to,open:values[0],high:values[1],low:values[2],close:values[3]});
  }
  const periods=[...byPeriod.keys()].sort((a,b)=>a-b),usable=periods.find(p=>byPeriod.get(p).size>=35),period=usable??periods.sort((a,b)=>byPeriod.get(b).size-byPeriod.get(a).size)[0];
  const cleanCandles=period==null?[]:[...byPeriod.get(period).values()].sort((a,b)=>a.from-b.from);
  const quotes=[...new Map(quoteHistory.filter(q=>Number.isFinite(Number(q.ts))&&Number.isFinite(Number(q.price))&&Number(q.price)>0&&Number(q.ts)<=now).map(q=>[Number(q.ts),{ts:Number(q.ts),price:Number(q.price)}])).values()].sort((a,b)=>a.ts-b.ts);
  return {candles:cleanCandles,quoteHistory:quotes,inputQuality:{periodSeconds:period??null,sourceCandles:candles.length,uniqueCandles:cleanCandles.length,excludedCandles:candles.length-cleanCandles.length}};
}

/**
 * Selected-engine historical forward analogs (research model).
 *
 * At the forecast time, compare present historical price-pattern features to
 * strictly PAST anchors with completed, truly-observed forward outcomes for
 * EXACTLY the selected expiry. Current forming candle direction is not an
 * input. No other engine, broker expiry, DB or fabricated win rate is used.
 *
 * When there are insufficient complete historical comparisons, return null:
 * no fake "historical foresight"; caller can expose its older extrapolation.
 */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function clean(history,asOf){
 const seen=new Map();
 for(const q of Array.isArray(history)?history:[]){
  const ts=Number(q?.ts),p=Number(q?.price);
  if(Number.isFinite(ts)&&Number.isFinite(p)&&p>0&&ts<=asOf&&ts>=0)
    seen.set(ts,p);
 }
 return [...seen].sort((a,b)=>a[0]-b[0]).map(([ts,p])=>({ts,lp:Math.log(p)}));
}
const prior=(rows,t)=>{
 let a=0,b=rows.length-1,k=-1;
 while(a<=b){const m=(a+b)>>1;if(rows[m].ts<=t){k=m;a=m+1;}else b=m-1}
 return k<0?null:rows[k];
};
const after=(rows,t)=>{
 let a=0,b=rows.length-1,k=-1;
 while(a<=b){const m=(a+b)>>1;if(rows[m].ts>=t){k=m;b=m-1;}else a=m+1}
 return k<0?null:rows[k];
};
function features(rows,t,h){
 const now=prior(rows,t);if(!now)return null;
 const windows=[Math.max(3,Math.min(12,h*.2)),Math.max(10,Math.min(60,h)),Math.max(30,Math.min(240,3*h))];
 const prices=windows.map(sec=>prior(rows,t-sec*1000));
 if(prices.some(v=>!v))return null;
 const rates=prices.map((v,i)=>(now.lp-v.lp)/Math.sqrt(windows[i]));
 const historyWindow=rows.filter(r=>r.ts>=t-Math.max(45,h)*1000&&r.ts<=t);
 if(historyWindow.length<5)return null;
 let path=0;
 for(let i=1;i<historyWindow.length;i++)path+=Math.abs(historyWindow[i].lp-historyWindow[i-1].lp);
 const movement=Math.abs(now.lp-historyWindow[0].lp);
 const efficiency=path?clamp(movement/path,0,1):0;
 const top=Math.max(...historyWindow.map(x=>x.lp)),bottom=Math.min(...historyWindow.map(x=>x.lp));
 const rangePosition=top>bottom?clamp((now.lp-bottom)/(top-bottom),0,1):.5;
 return {rates,efficiency,rangePosition,now};
}
const ENGINE_WEIGHTS=Object.freeze({
 automatic:[1.5,1.5,1.2,1.4,1.2],
 price_action:[2.0,1.6,.7,1,1.6],
 support_resistance:[.7,1.0,1.0,1.0,2.6],
 trend:[.7,1.8,2.0,2.4,.5],
 mean_reversion:[.7,1.3,.8,.7,2.5],
 breakout:[1.2,1.4,1.2,1.7,1.8],
 trendline_breakout:[.9,1.5,2.0,1.9,1.2],
 fibonacci_retest:[.6,1.2,1.1,1.1,2.0],
 smart_confluence:[1.0,1.5,1.5,1.6,1.2]
});
function normalizedDistance(a,b,scale,weights){
 const dv=[
  (a.rates[0]-b.rates[0])/scale[0],
  (a.rates[1]-b.rates[1])/scale[1],
  (a.rates[2]-b.rates[2])/scale[2],
  (a.efficiency-b.efficiency)*2,
  (a.rangePosition-b.rangePosition)*2
 ];
 const weightSum=weights.reduce((x,y)=>x+y,0);
 return Math.sqrt(dv.reduce((x,v,i)=>x+weights[i]*v*v,0)/weightSum);
}
export function historicalForwardAnalogs({
 quoteHistory=[],asOf=Date.now(),selectedSeconds=30,
 engineId='automatic',maxCandidates=240
}={}){
 const h=Number(selectedSeconds),now=Number(asOf);
 if(!(h>0)||!Number.isFinite(now))return null;
 const rows=clean(quoteHistory,now);
 if(rows.length<24||rows.at(-1).ts-rows[0].ts<(h+40)*1000)return null;
 const current=features(rows,rows.at(-1).ts,h);
 if(!current)return null;
 const first=rows[0].ts,last=rows.at(-1).ts;
 const latestAnchor=last-h*1000-2000;
 // The anchor's outcome MUST be fully realized in the current quote history.
 // Spacing avoids giving hundreds of nearly-identical, overlapping 1s
 // observations artificial weight.
 const strideMs=Math.max(3000,Math.min(h*150,60000));
 const examples=[];
 for(let anchor=first+Math.max(40,h*3)*1000;anchor<=latestAnchor;anchor+=strideMs){
   const f=features(rows,anchor,h);
   if(!f)continue;
   const future=after(rows,anchor+h*1000);
   if(!future||future.ts>last||future.ts-(anchor+h*1000)>Math.min(3000,Math.max(1200,h*250)))continue;
   const result=future.lp-f.now.lp;
   examples.push({f,logReturn:result,at:anchor});
   if(examples.length>maxCandidates)examples.shift();
 }
 if(examples.length<6)return null;
 const scales=[0,1,2].map(i=>{
   const avg=examples.reduce((sum,e)=>sum+e.f.rates[i],0)/examples.length;
   const variance=examples.reduce((sum,e)=>sum+(e.f.rates[i]-avg)**2,0)/examples.length;
   return Math.max(1e-8,Math.sqrt(variance));
 });
 const weights=ENGINE_WEIGHTS[engineId]||ENGINE_WEIGHTS.automatic;
 const similar=examples.map(e=>({d:normalizedDistance(current,e.f,scales,weights),logReturn:e.logReturn,at:e.at}))
  .sort((a,b)=>a.d-b.d).slice(0,Math.max(6,Math.min(20,Math.floor(examples.length*.4))));
 let total=0,sum=0,sumSquare=0,upWeight=0,downWeight=0;
 for(const r of similar){
  const w=1/(.2+r.d)**2;total+=w;sum+=w*r.logReturn;
  sumSquare+=w*r.logReturn*r.logReturn;
  if(r.logReturn>0)upWeight+=w;
  if(r.logReturn<0)downWeight+=w;
 }
 const estimatedReturn=sum/total,dispersion=Math.sqrt(Math.max(0,sumSquare/total-estimatedReturn**2));
 const support=(upWeight+downWeight)>0?
  upWeight/(upWeight+downWeight):null;
 return Object.freeze({
  estimatedLogReturn:estimatedReturn,
  returnDispersion:dispersion,
  // Historical analogue direction share is NOT a verified live win rate
  // or an empirically calibrated probability for this forecast.
  directionalShare:support,
  comparisons:examples.length,
  neighbors:similar.length,
  lastObservedAt:last,
  observedUntil:last,
  targetHorizonSeconds:h,
  engineId:String(engineId),
  source:'completed-historical-forward-outcomes',
  earliestSampleAt:similar.reduce((x,r)=>Math.min(x,r.at),Infinity),
  latestTrainingOutcomeBeforeForecast:true
 });
}

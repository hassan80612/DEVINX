/**
 * Historical, jointly observed FUTURE-entry outcomes for ONE selected motor.
 *
 * Unlike P(t+2H)-P(t+H) from two independently fitted endpoint models,
 * this estimator learns the real completed return between t+H (entry) and
 * t+2H (expiry) conditional on the pattern visible at t. No future leakage,
 * synthetic win probability, broker order, extra motor, DB or fixed wait.
 * A modest cap prevents one shared-analogue formula from drowning out the
 * individual motor's own future price estimates.
 */
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const weightsByEngine=Object.freeze({
 automatic:[1.2,1.3,1.1,1.1,1.3,1.1,1.0],
 price_action:[1.7,1.4,1.0,1.2,1.6,1.4,1.0],
 support_resistance:[.7,1,1,1.4,2.1,.8,1.6],
 trend:[1,1.6,1.9,1.9,.6,.6,1],
 mean_reversion:[.7,.9,.8,1.3,1.8,1.5,1.6],
 breakout:[1.2,1.6,1.0,1.5,1.6,1.3,1.1],
 trendline_breakout:[1.1,1.5,1.8,1.6,.9,.8,1],
 fibonacci_retest:[.7,1,1.0,.9,2.2,1,1.6],
 smart_confluence:[1.1,1.5,1.5,1.6,1.3,1.2,1.2]
});
const clean=(history,now)=>{
 const known=new Map();
 for(const q of Array.isArray(history)?history:[]){
  const ts=Number(q?.ts),price=Number(q?.price);
  if(Number.isFinite(ts)&&Number.isFinite(price)&&price>0&&ts>=0&&ts<=now)known.set(ts,Math.log(price));
 }
 return [...known].sort((a,b)=>a[0]-b[0]).map(([ts,lp])=>({ts,lp}));
};
const atOrBefore=(rows,time)=>{
 let lo=0,hi=rows.length-1,result=-1;
 while(lo<=hi){const mid=(lo+hi)>>1;if(rows[mid].ts<=time){result=mid;lo=mid+1}else hi=mid-1}
 return result<0?null:rows[result];
};
const atOrAfter=(rows,time)=>{
 let lo=0,hi=rows.length-1,result=-1;
 while(lo<=hi){const mid=(lo+hi)>>1;if(rows[mid].ts>=time){result=mid;hi=mid-1}else lo=mid+1}
 return result<0?null:rows[result];
};
const features=(rows,t,h)=>{
 const last=atOrBefore(rows,t);
 if(!last)return null;
 const windows=[Math.max(3,Math.min(12,h*.2)),Math.max(10,Math.min(65,h)),Math.max(35,Math.min(180,3*h))];
 const history=windows.map(sec=>atOrBefore(rows,t-sec*1000));
 if(history.some(x=>!x))return null;
 const windowStart=t-Math.max(40,Math.min(180,3*h))*1000;
 const segment=rows.filter(x=>x.ts>=windowStart&&x.ts<=t);
 if(segment.length<18)return null;
 let path=0,flips=0,prevSign=0,squared=0;
 for(let i=1;i<segment.length;i++){
  const dt=(segment[i].ts-segment[i-1].ts)/1000;
  if(!(dt>0)||dt>8)continue;
  const dx=segment[i].lp-segment[i-1].lp;
  squared+=dx*dx/dt;
  path+=Math.abs(dx);
  const sign=Math.sign(dx);
  if(prevSign&&sign&&prevSign!==sign)flips++;
  if(sign)prevSign=sign;
 }
 const sigma=Math.max(1e-9,Math.sqrt(squared/Math.max(1,segment.length-1)));
 const rates=history.map((p,i)=>clamp((last.lp-p.lp)/(sigma*Math.sqrt(windows[i])),-8,8));
 const extreme=Math.max(...segment.map(x=>x.lp)),low=Math.min(...segment.map(x=>x.lp));
 const efficiency=path?clamp(Math.abs(last.lp-segment[0].lp)/path,0,1):0;
 const position=extreme>low?(last.lp-low)/(extreme-low):.5;
 const chop=clamp(flips/Math.max(1,segment.length-2),0,1);
 const slopeChange=clamp(rates[0]-rates[1],-8,8);
 const feat=[rates[0],rates[1],rates[2],efficiency,position,chop,slopeChange];
 const regime=(rates[0]*rates[1]<0&&Math.abs(slopeChange)>.7)?'reversal':
   efficiency<.32&&chop>.3?'oscillating':
   efficiency>.52&&rates[1]*rates[2]>0?'trending':'mixed';
 return {feat,regime,sigma,efficiency,chop};
};
const distance=(a,b,scale,weights)=>{
 let sum=0,total=0;
 for(let i=0;i<weights.length;i++){
  const d=(a[i]-b[i])/scale[i];
  sum+=weights[i]*d*d;total+=weights[i];
 }
 return Math.sqrt(sum/total);
};
export function historicalFutureEntryAnalogs({
 quoteHistory=[],asOf=Date.now(),delaySeconds=30,holdingSeconds=delaySeconds,
 engineId='automatic',maxCandidates=180
}={}){
 const now=Number(asOf),h=Number(delaySeconds),hold=Number(holdingSeconds);
 if(!Number.isFinite(now)||!(h>0)||!(hold>0)||h>3600||hold>3600)return null;
 const rows=clean(quoteHistory,now);
 const lookbackSeconds=Math.max(40,Math.min(180,3*h));
 if(rows.length<80||rows.at(-1).ts-rows[0].ts<(lookbackSeconds+h+hold+12)*1000)return null;
 const last=rows.at(-1),current=features(rows,last.ts,h);
 if(!current)return null;
 const spacingMs=Math.max(5000,Math.min(30000,Math.floor((h+hold)*350)));
 const end=last.ts-(h+hold)*1000-1200;
 const candidates=[];
 const maxLagMs=Math.min(1100,Math.max(600,h*100));
 for(let t=rows[0].ts+lookbackSeconds*1000;t<=end;t+=spacingMs){
  const f=features(rows,t,h);
  if(!f)continue;
  const start=atOrAfter(rows,t+h*1000),finish=atOrAfter(rows,t+(h+hold)*1000);
  if(!start||!finish||
   start.ts-(t+h*1000)>maxLagMs||
   finish.ts-(t+(h+hold)*1000)>maxLagMs||
   finish.ts>last.ts)continue;
  candidates.push({at:t,feat:f.feat,regime:f.regime,
    entryReturn:start.lp-finish.lp,returnLog:finish.lp-start.lp});
  if(candidates.length>maxCandidates)candidates.shift();
 }
 if(candidates.length<6)return null;
 const scales=current.feat.map((_,i)=>{
  const avg=candidates.reduce((n,x)=>n+x.feat[i],0)/candidates.length;
  const variance=candidates.reduce((n,x)=>n+(x.feat[i]-avg)**2,0)/candidates.length;
  return Math.max(i===3||i===4||i===5?.15:.65,Math.sqrt(variance));
 });
 const weights=weightsByEngine[engineId]||weightsByEngine.automatic;
 const sorted=candidates.map(x=>({...x,d:distance(x.feat,current.feat,scales,weights)}))
  .sort((a,b)=>a.d-b.d);
 const selected=sorted.slice(0,Math.min(18,Math.max(6,Math.floor(candidates.length*.3))));
 let total=0,sum=0,square=0,up=0,down=0;
 for(const x of selected){
  const w=1/(.25+x.d)**2;
  total+=w;sum+=x.returnLog*w;square+=x.returnLog*x.returnLog*w;
  if(x.returnLog>0)up+=w;else if(x.returnLog<0)down+=w;
 }
 if(!(total>0))return null;
 // Overlapping t->t+2H outcomes must not be counted as independent evidence.
 const nonOverlapping=[];
 for(const c of selected.slice().sort((a,b)=>a.at-b.at)){
  if(!nonOverlapping.length||c.at-nonOverlapping.at(-1)>=Math.max(5000,(h+hold)*1000))
   nonOverlapping.push(c.at);
 }
 const effectiveExamples=nonOverlapping.length;
 const meanReturn=sum/total;
 const dispersion=Math.sqrt(Math.max(0,square/total-meanReturn*meanReturn));
 const directionalAgreement=Math.max(up,down)/Math.max(1e-12,up+down);
 return Object.freeze({
  returnLog:meanReturn,dispersion,directionalAgreement,
  engineId,regime:current.regime,efficiency:current.efficiency,
  oscillation:current.chop,
  comparisonCount:candidates.length,matchedCount:selected.length,
  independentExamples:effectiveExamples,
  entryDelaySeconds:h,holdingSeconds:hold,
  source:'paired-past-entry-to-exit-outcomes',
  latestTrainingTargetAt:end,
  noFutureLeakage:true
 });
}

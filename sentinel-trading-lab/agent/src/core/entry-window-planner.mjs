// The selected "Entrada daqui a" controls an OPPORTUNITY WINDOW, while
// holdingSeconds determines the ACTUAL price-outcome horizon after entry.
// No UI clock, current candle or selected strategy can create a forecast.
// Never issues broker orders. Candidate scores are NOT win probabilities.
export function entryOffsets(windowSeconds){
 const h=Number(windowSeconds);
 if(!Number.isInteger(h)||h<5||h>3600)return [];
 return [...new Set([Math.min(h,Math.max(2,Math.ceil(h*.08))),
   Math.max(2,Math.round(h*.24)),Math.max(2,Math.round(h*.48)),
   Math.max(2,Math.round(h*.72)),Math.max(2,Math.round(h*.90))])]
   .filter(x=>x<=h).sort((a,b)=>a-b);
}
export function planEntryWindow({windowSeconds=30,holdingSeconds=windowSeconds,
 now=Date.now(),engineId='automatic',asset='UNKNOWN',forecastMode='continuous',
 evaluateLead=()=>null}={}){
 const offsets=entryOffsets(windowSeconds);
 const base={engineId,asset,delaySeconds:windowSeconds,holdingSeconds,
  issuedAt:now,entryAt:null,exitAt:null,entryOffsetSeconds:null,
  windowStartedAt:now,windowEndsAt:now+windowSeconds*1000,
  projectedEntryPrice:null,projectedExitPrice:null,side:null,
  forecastOwner:forecastMode==='selective'?'selective-historical-outcomes-v2':
    'continuous-selected-engine-window-v1',
  status:'scanning-entry-window',actionable:false,calibrated:false};
 if(!offsets.length)return {...base,status:'invalid-window'};
 let best=null;
 const qualified=[];
 for(const seconds of offsets){
  const c=evaluateLead(seconds);
  const p1=Number(c?.projectedEntryPrice),p2=Number(c?.projectedExitPrice);
  const side=c?.side;
  if(!['CALL','PUT'].includes(side)||!(p1>0&&p2>0)||
   (p2>p1?'CALL':p2<p1?'PUT':null)!==side)continue;
  const raw=Number(c.selectionStrength);
  if(!Number.isFinite(raw)||raw<=0)continue;
  // A confirmed forecast must leave time for the PC to evaluate its real
  // quote inside the ORIGINAL window. No forced early entry.
  const reserve=Math.max(1,Math.min(2,windowSeconds*.05));
  if(windowSeconds-seconds<reserve)continue;
  const score=raw-.018*seconds/windowSeconds;
  qualified.push({...c,score,seconds});
 }
 // A solitary strong CALL must not beat several independent PUT entry
 // offsets by magnitude alone (or vice versa). Require stable direction
 // across the window whenever BOTH directions are projected.
 const call=qualified.filter(x=>x.side==='CALL');
 const put=qualified.filter(x=>x.side==='PUT');
 let selectable=qualified;
 if(call.length&&put.length){
  const majority=call.length>put.length?call:put.length>call.length?put:null;
  const minority=majority===call?put:call;
  const weight=x=>x.reduce((sum,r)=>sum+Math.max(0,r.selectionStrength),0);
  // At least two lead instants must agree, with nontrivial aggregate
  // directional evidence; otherwise admit NO opportunity this cycle.
  if(!majority||majority.length<2||
     weight(majority)<weight(minority)*1.25)return base;
  selectable=majority;
 }
 for(const c of selectable)if(!best||c.score>best.score)best=c;
 if(!best)return base;
 return {...base,status:'forecast',side:best.side,
  entryOffsetSeconds:best.seconds,
  entryAt:now+best.seconds*1000,
  exitAt:now+(best.seconds+holdingSeconds)*1000,
  projectedEntryPrice:best.projectedEntryPrice,
  projectedExitPrice:best.projectedExitPrice,
  selectionStrength:best.selectionStrength,
  ...(best.historicalExamples==null?{}:{historicalExamples:best.historicalExamples}),
  ...(best.similarExamples==null?{}:{similarExamples:best.similarExamples}),
  ...(best.validationExamples==null?{}:{validationExamples:best.validationExamples})
 };
}

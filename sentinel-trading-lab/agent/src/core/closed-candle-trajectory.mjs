import {prepareClosedCandles,contextFromClosedCandles} from './closed-candle-context.mjs';
/**
 * Three CLOSED broker-bar structure predictor. Current quote anchors prices only.
 * Learns a shared trajectory and paired ENTRY->EXPIRY return from fully
 * completed historical examples. Tuning is chronological and purged.
 * Informational until broker performance is established; not wired to 67.1.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):null;
const round=n=>Number(n.toPrecision(12));
function temporalContext(quoteHistory,now){
 const known=new Map();
 for(const q of Array.isArray(quoteHistory)?quoteHistory:[]){
  const ts=Number(q?.ts),p=positive(q?.price),arrival=Number(q?.receivedAt??ts);
  if(!Number.isFinite(ts)||ts<0||ts>now||!p||!Number.isFinite(arrival)||arrival>now)continue;
  const readyAt=Math.max(ts,arrival);
  if(!known.has(ts)||known.get(ts).readyAt>readyAt)known.set(ts,{ts,p,readyAt});
 }
 const events=[...known.values()].sort((a,b)=>a.readyAt-b.readyAt||a.ts-b.ts);
 if(!events.length)return [];
 const earliest=events[0].readyAt;
 const start=now-Math.floor(Math.min(7200000,now-earliest)/1000)*1000;
 let j=0,quote=null,series=[];
 for(let ts=start;ts<=now;ts+=1000){
  // A historical feature sees only quotes already ARRIVED at that time.
  // Later backfills cannot rewrite a previously sampled context.
  while(j<events.length&&events[j].readyAt<=ts){
   if(!quote||events[j].ts>quote.ts)quote=events[j];
   j++;
  }
  if(!quote||ts-quote.ts>2500){series=[];continue;}
  series.push({ts,lp:Math.log(quote.p),quoteAt:quote.ts});
 }
 return series;
}
function solve(a,b){
 const n=a.length,m=b[0].length;
 const matrix=a.map((row,i)=>[...row,...b[i]]);
 for(let k=0;k<n;k++){
  let best=k;
  for(let i=k+1;i<n;i++)if(Math.abs(matrix[i][k])>Math.abs(matrix[best][k]))best=i;
  if(Math.abs(matrix[best][k])<1e-12)return null;
  [matrix[k],matrix[best]]=[matrix[best],matrix[k]];
  const d=matrix[k][k];
  for(let j=k;j<n+m;j++)matrix[k][j]/=d;
  for(let i=0;i<n;i++){
   if(i===k)continue;const f=matrix[i][k];
   if(!f)continue;
   for(let j=k;j<n+m;j++)matrix[i][j]-=f*matrix[k][j];
  }
 }
 return matrix.map(row=>row.slice(n));
}
const dot=(x,w)=>Array.from({length:w[0].length},(_,k)=>
 x.reduce((sum,v,j)=>sum+v*w[j][k],0));
function fit(samples,penalty,halfLife,targets){
 const p=samples[0].x.length,last=samples.at(-1).i;
 const a=Array.from({length:p},()=>Array(p).fill(0));
 const b=Array.from({length:p},()=>Array(targets).fill(0));
 let weightSum=0;
 for(const s of samples){
  const weight=halfLife===Infinity?1:Math.exp(-Math.LN2*(last-s.i)/halfLife);
  weightSum+=weight;
  for(let j=0;j<p;j++){
   for(let k=0;k<=j;k++)a[j][k]+=weight*s.x[j]*s.x[k];
   for(let k=0;k<targets;k++)b[j][k]+=weight*s.x[j]*s.y[k];
  }
 }
 for(let j=0;j<p;j++){
  for(let k=j+1;k<p;k++)a[j][k]=a[k][j];
  a[j][j]+=j===0?1e-8:penalty*weightSum;
 }
 return solve(a,b);
}
export function closedCandleTrajectory({
 quoteHistory=[],candles=[],candleSeconds,asOf=Date.now(),entryDelaySeconds=30,holdingSeconds=30
}={}){
 const now=Number(asOf),lead=Number(entryDelaySeconds),hold=Number(holdingSeconds);
 const empty=status=>({status,side:null,issuedAt:now,
  entryAt:now+lead*1000,exitAt:now+(lead+hold)*1000,
  entryDelaySeconds:lead,holdingSeconds:hold,expectedPath:[],
  actionable:false,calibrated:false,modelConfidence:null});
 if(!Number.isFinite(now)||!Number.isInteger(lead)||lead<0||
    !Number.isInteger(hold)||hold<1||lead+hold>1800)return empty('invalid-interval');
 const rows=temporalContext(quoteHistory,now),n=rows.length;
 const endOffset=lead+hold;
 const maxLag=Math.min(600,Math.max(180,hold*2));
 if(n<maxLag+endOffset+40)return empty('insufficient-completed-context');
 const lp=rows.map(q=>q.lp);
 const prepared=prepareClosedCandles(candles,candleSeconds);
 const features=i=>contextFromClosedCandles(prepared,rows[i].ts,candleSeconds,hold);
 const current=features(n-1);
 if(!current)return empty('insufficient-three-closed-candles');
 const offsets=[...new Set([lead,endOffset,
  ...Array.from({length:8},(_,j)=>Math.max(1,Math.round(endOffset*(j+1)/8)))])]
  .sort((a,b)=>a-b);
 const targetCount=offsets.length+1,pairedIndex=targetCount-1;
 const stride=Math.max(2,Math.round(hold/10)),samples=[];
 for(let i=maxLag;i+endOffset<n;i+=stride){
  // Freeze learning at the latest closed bar too. A spike in the forming
  // candle cannot enter through a newly completed training label.
  if(rows[i+endOffset].ts>current.latestClosedAt)continue;
  const f=features(i);if(!f)continue;
  const y=offsets.map(k=>(lp[i+k]-lp[i])/f.scale);
  y.push((lp[i+endOffset]-lp[i+lead])/f.scale);
  // Every sampled feature and target is observable no later than issue time.
  samples.push({i,x:f.x,y,outcomeAt:rows[i+endOffset].ts});
 }
 if(samples.length<12)return empty('insufficient-completed-examples');
 const split=Math.floor(samples.length*.75),validation=samples.slice(split);
 const validationStart=samples[split]?.i;
 const training=samples.slice(0,split).filter(s=>s.i+endOffset<validationStart);
 const defaults={penalty:.2,halfLife:Math.max(900,hold*6)};
 let chosen=defaults,validationMse=null,validationAccuracy=null;
 // The validation interval begins AFTER every training outcome ends.
 // If this cannot be done, use the fixed regularized prior and disclose it.
 if(training.length>=Math.max(16,Math.ceil(samples[0].x.length*.65))&&validation.length>=6){
  let best=Infinity;
  for(const halfLife of [Math.max(300,hold*2),Math.max(900,hold*6),Infinity])
   for(const penalty of [.02,.2,2]){
    const w=fit(training,penalty,halfLife,targetCount);if(!w)continue;
    let error=0,hits=0;
    for(const s of validation){
     const predicted=dot(s.x,w)[pairedIndex],truth=s.y[pairedIndex];
     error+=(predicted-truth)**2;
     if((predicted>0&&truth>0)||(predicted<0&&truth<0))hits++;
    }
    error/=validation.length;
    if(error<best){best=error;chosen={penalty,halfLife};
     validationMse=error;validationAccuracy=hits/validation.length;}
   }
 }
 const coefficients=fit(samples,chosen.penalty,chosen.halfLife,targetCount);
 if(!coefficients)return empty('singular-context');
 const estimates=dot(current.x,coefficients);
 if(estimates.some(v=>!Number.isFinite(v)))return empty('nonfinite-prediction');
 const base=lp.at(-1),entryIndex=offsets.indexOf(lead),exitIndex=offsets.indexOf(endOffset);
 const entryMove=estimates[entryIndex]*current.scale;
 const exitMove=estimates[exitIndex]*current.scale;
 const pairedMove=estimates[pairedIndex]*current.scale;
 const projectedEntryPrice=round(Math.exp(base+entryMove));
 const projectedExitPrice=round(Math.exp(base+exitMove));
 const expectedPath=[{secondsFromNow:0,price:round(Math.exp(base))},
  ...offsets.filter(k=>k>0).map(k=>({secondsFromNow:k,
   price:round(Math.exp(base+estimates[offsets.indexOf(k)]*current.scale))}))];
 const sortedPath=expectedPath.slice().sort((a,b)=>a.secondsFromNow-b.secondsFromNow);
 return {status:'closed-candle-trajectory',side:pairedMove>1e-12?'CALL':pairedMove< -1e-12?'PUT':null,
  issuedAt:now,entryAt:now+lead*1000,exitAt:now+endOffset*1000,
  entryDelaySeconds:lead,holdingSeconds:hold,projectedEntryPrice,projectedExitPrice,
  expectedPairedLogReturn:pairedMove,expectedPath:sortedPath,
  expectedLow:Math.min(...sortedPath.map(x=>x.price)),
  expectedHigh:Math.max(...sortedPath.map(x=>x.price)),
  historicalExamples:samples.length,
  historySeconds:rows.at(-1).ts/1000-rows[0].ts/1000,
  latestTrainingOutcomeAt:samples.at(-1).outcomeAt,
  latestObservedQuoteAt:rows.at(-1).quoteAt,
  validation:{examples:validationMse===null?0:validation.length,
   mse:validationMse,accuracy:validationAccuracy,
   meaning:'past chronological tuning evidence, NOT future win probability',
   purgedTrainingOutcomes:true},
  fitted:{penalty:chosen.penalty,halfLifeSeconds:chosen.halfLife===Infinity?null:chosen.halfLife,
   features:current.x.length,targets:targetCount},
  actionable:false,calibrated:false,modelConfidence:null,
  modelVersion:'closed-candle-trajectory-v1',candleContext:current};
}

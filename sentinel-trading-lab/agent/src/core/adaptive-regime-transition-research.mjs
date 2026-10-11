/**
 * Independent direct future-interval predictor.
 * Learns a shared trajectory and paired ENTRY->EXPIRY return from fully
 * completed historical examples. Tuning is chronological and purged.
 * Research only. Three frozen hypotheses; never imported by published runtime.
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
const similarity=(a,b)=>.1+.9*Math.exp(-a.reduce((sum,v,j)=>sum+(v-b[j])**2,0)/(2*a.length));
function fit(samples,penalty,halfLife,targets,mode='global',anchor=null){
 const getX=s=>mode==='transition'?s.transitionX:s.x;
 const p=getX(samples[0]).length,last=samples.at(-1).i;
 const a=Array.from({length:p},()=>Array(p).fill(0));
 const b=Array.from({length:p},()=>Array(targets).fill(0));
 let weightSum=0;
 for(const s of samples){
  const recency=halfLife===Infinity?1:Math.exp(-Math.LN2*(last-s.i)/halfLife);
  const weight=recency*(mode==='similar'?similarity(s.regime,anchor):1),sx=getX(s);
  weightSum+=weight;
  for(let j=0;j<p;j++){
   for(let k=0;k<=j;k++)a[j][k]+=weight*sx[j]*sx[k];
   for(let k=0;k<targets;k++)b[j][k]+=weight*sx[j]*s.y[k];
  }
 }
 for(let j=0;j<p;j++){
  for(let k=j+1;k<p;k++)a[j][k]=a[k][j];
  a[j][j]+=j===0?1e-8:penalty*weightSum;
 }
 return solve(a,b);
}
export function regimeTransitionForecasts({
 quoteHistory=[],asOf=Date.now(),entryDelaySeconds=30,holdingSeconds=30
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
 const lp=rows.map(q=>q.lp),ret=lp.map((v,i)=>i?v-lp[i-1]:0);
 const sq=[0],abs=[0],cross=[0],flips=[0];
 for(let i=0;i<ret.length;i++){
  const r=ret[i];sq.push(sq.at(-1)+r*r);abs.push(abs.at(-1)+Math.abs(r));
  cross.push(cross.at(-1)+(i>0?r*ret[i-1]:0));
  flips.push(flips.at(-1)+(i>0&&r*ret[i-1]<0?1:0));
 }
 const sigma=(i,w)=>Math.sqrt(Math.max((sq[i+1]-sq[Math.max(0,i+1-w)])/w,1e-15));
 const lags=[...new Set([2,5,10,15,30,60,90,120,180,240,300,450,600,
  Math.max(1,Math.round(hold/4)),Math.max(1,Math.round(hold/2)),hold,
  Math.round(hold*1.5),hold*2].filter(v=>v<=maxLag))].sort((a,b)=>a-b);
 const features=i=>{
  const s=sigma(i,90),scale=s*Math.sqrt(hold);
  let low=Infinity,high=-Infinity;
  for(let j=i-180;j<=i;j++){low=Math.min(low,lp[j]);high=Math.max(high,lp[j]);}
  const width=high-low;
  const movement=abs[i+1]-abs[i-89];
  const x=[1,...lags.map(lag=>clamp((lp[i]-lp[i-lag])/(s*Math.sqrt(lag)),-15,15)),
   clamp((lp[i]-2*lp[i-30]+lp[i-60])/(s*Math.sqrt(30)),-15,15),
   width>1e-12?2*(lp[i]-low)/width-1:0,
   movement>1e-12?Math.abs(lp[i]-lp[i-90])/movement:0,
   clamp(Math.log((sigma(i,30)+1e-12)/(sigma(i,180)+1e-12)),-4,4)];
  const signedEfficiency=movement>1e-12?(lp[i]-lp[i-90])/movement:0;
  const short=(lp[i]-lp[i-30])/(s*Math.sqrt(30));
  const older=(lp[i-30]-lp[i-120])/(s*Math.sqrt(90));
  const transition=clamp(short-older,-8,8)/2;
  const serial=clamp((cross[i+1]-cross[i-59])/(sq[i+1]-sq[i-59]+1e-15),-1,1);
  const flipRate=(flips[i+1]-flips[i-59])/60;
  const vol=x.at(-1),position=x.at(-3),efficiency=x.at(-2),acc=x.at(-4);
  const regime=[signedEfficiency/.3,transition,serial/.25,(flipRate-.5)/.2,vol/.6];
  const hReturn=x[1+lags.indexOf(hold)]??short;
  const transitionX=[...x,signedEfficiency,serial,flipRate,transition,
   short*efficiency,older*efficiency,position*efficiency,
   hReturn*efficiency,hReturn*vol,position*serial,acc*efficiency,
   short*transition,position*transition];
  const label=short*older<0&&Math.abs(short)>1?'transition':
   Math.abs(signedEfficiency)>.22?'trend':serial<-.1?'oscillation':'mixed';
  return {x,scale,regime,transitionX,label};
 };
 const offsets=[...new Set([lead,endOffset,
  ...Array.from({length:8},(_,j)=>Math.max(1,Math.round(endOffset*(j+1)/8)))])]
  .sort((a,b)=>a-b);
 const targetCount=offsets.length+1,pairedIndex=targetCount-1;
 const stride=Math.max(2,Math.round(hold/10)),samples=[];
 for(let i=maxLag;i+endOffset<n;i+=stride){
  const f=features(i);
  const y=offsets.map(k=>(lp[i+k]-lp[i])/f.scale);
  y.push((lp[i+endOffset]-lp[i+lead])/f.scale);
  // Every sampled feature and target is observable no later than issue time.
  samples.push({i,x:f.x,transitionX:f.transitionX,regime:f.regime,y,outcomeAt:rows[i+endOffset].ts});
 }
 if(samples.length<12)return empty('insufficient-completed-examples');
 const split=Math.floor(samples.length*.75),validation=samples.slice(split);
 const validationStart=samples[split]?.i;
 const training=samples.slice(0,split).filter(s=>s.i+endOffset<validationStart);
 const current=features(n-1),validationAnchor=validationStart===undefined?current:features(validationStart);
 const defaults={penalty:.2,halfLife:Math.max(900,hold*6)};
 const fittedModels=[];
 for(const mode of ['global','similar','transition']){
  let chosen=defaults,validationMse=null,validationAccuracy=null;
  const canTune=training.length>=Math.max(16,Math.ceil(samples[0].x.length*.65))&&validation.length>=6;
  if(canTune){
   let best=Infinity;
   for(const halfLife of [Math.max(300,hold*2),Math.max(900,hold*6),Infinity])
    for(const penalty of [.02,.2,2]){
     const w=fit(training,penalty,halfLife,targetCount,mode,validationAnchor.regime);if(!w)continue;
     let error=0,hits=0;
     for(const s of validation){
      const predicted=dot(mode==='transition'?s.transitionX:s.x,w)[pairedIndex],truth=s.y[pairedIndex];
      error+=(predicted-truth)**2;
      if((predicted>0&&truth>0)||(predicted<0&&truth<0))hits++;
     }
     error/=validation.length;
     if(error<best){best=error;chosen={penalty,halfLife};
      validationMse=error;validationAccuracy=hits/validation.length;}
    }
  }
  const coefficients=fit(samples,chosen.penalty,chosen.halfLife,targetCount,mode,current.regime);
  if(!coefficients)continue;
  const estimates=dot(mode==='transition'?current.transitionX:current.x,coefficients);
  if(estimates.some(v=>!Number.isFinite(v)))continue;
  fittedModels.push({mode,chosen,validationMse,validationAccuracy,estimates});
 }
 if(fittedModels.length!==3)return empty('singular-context');
 const predictions={};
 for(const {mode,chosen,validationMse,validationAccuracy,estimates} of fittedModels){
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
 predictions[mode]={status:'adaptive-direct-trajectory',side:pairedMove>1e-12?'CALL':pairedMove< -1e-12?'PUT':null,
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
  modelVersion:'regime-transition-research-v1',researchOnly:true,
  experimentMode:mode,detectedContext:current.label,
  tuningTrainLatestOutcomeAt:training.at(-1)?.outcomeAt??null,
  tuningValidationFirstIssueAt:validation.length?rows[validation[0].i].ts:null};
 }
 // Choose only from completed, purged historical evidence. No future test label.
 const global=predictions.global;
 let selected='global';
 for(const mode of ['similar','transition']){
  const mse=predictions[mode].validation.mse,best=predictions[selected].validation.mse;
  if(mse!==null&&best!==null&&mse<best*.95)selected=mode;
 }
 predictions.adaptiveChoice={...predictions[selected],experimentMode:'adaptiveChoice',selectedMode:selected};
 return {status:'regime-transition-research',researchOnly:true,
  detectedContext:current.label,regimeVector:current.regime,
  selectedMode:selected,predictions};
}


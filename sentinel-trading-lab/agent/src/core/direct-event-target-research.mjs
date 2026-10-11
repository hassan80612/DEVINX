/**
 * Independent direct future-interval predictor.
 * Learns a shared trajectory and paired ENTRY->EXPIRY return from fully
 * completed historical examples. Tuning is chronological and purged.
 * Research-only direct labels, independent from published forecasts.
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

const scalarDot=(x,w)=>x.reduce((sum,v,j)=>sum+v*w[j],0);
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-35,35)));
function fitLogistic(samples,penalty,halfLife){
 const valid=samples.filter(s=>s.direction!==0);
 if(valid.length<12)return null;
 const p=valid[0].x.length,last=valid.at(-1).i;
 const positive=valid.filter(s=>s.direction>0).length;
 const startProbability=(positive+.5)/(valid.length+1);
 let w=Array(p).fill(0);w[0]=Math.log(startProbability/(1-startProbability));
 if(positive===0||positive===valid.length)return w;
 const weighted=valid.map(s=>({...s,weight:halfLife===Infinity?1:Math.exp(-Math.LN2*(last-s.i)/halfLife)}));
 const total=weighted.reduce((sum,s)=>sum+s.weight,0);
 const loss=v=>{
  let value=0;
  for(const s of weighted){const z=scalarDot(s.x,v),y=s.direction>0?1:0;
   value+=s.weight*(Math.max(z,0)+Math.log1p(Math.exp(-Math.abs(z)))-y*z);}
  for(let j=1;j<p;j++)value+=penalty*total*v[j]*v[j]/2;
  return value;
 };
 for(let iteration=0;iteration<8;iteration++){
  const a=Array.from({length:p},()=>Array(p).fill(0)),b=Array.from({length:p},()=>[0]);
  for(const s of weighted){
   const probability=sigmoid(scalarDot(s.x,w)),y=s.direction>0?1:0;
   const variance=Math.max(probability*(1-probability),1e-8)*s.weight;
   for(let j=0;j<p;j++){
    b[j][0]+=s.weight*(y-probability)*s.x[j];
    for(let k=0;k<=j;k++)a[j][k]+=variance*s.x[j]*s.x[k];
   }
  }
  for(let j=0;j<p;j++){
   for(let k=j+1;k<p;k++)a[j][k]=a[k][j];
   const regularizer=j===0?1e-8:penalty*total;
   a[j][j]+=regularizer;b[j][0]-=regularizer*w[j];
  }
  const step=solve(a,b);if(!step)break;
  const oldLoss=loss(w);let rate=1,next=null;
  for(let trial=0;trial<8;trial++){
   const candidate=w.map((v,j)=>v+rate*step[j][0]);
   if(loss(candidate)<=oldLoss+1e-9){next=candidate;break;}rate*=.5;
  }
  if(!next)break;
  const movement=Math.max(...next.map((v,j)=>Math.abs(v-w[j])));w=next;
  if(movement<1e-6)break;
 }
 return w;
}

export function directEventTargets({
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
 const sq=[0],abs=[0];
 for(const r of ret){sq.push(sq.at(-1)+r*r);abs.push(abs.at(-1)+Math.abs(r));}
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
  const short=x[1+lags.indexOf(30)],fast=x[1+lags.indexOf(5)],long=x[1+lags.indexOf(60)];
  const reversalX=[1,...x.slice(1,-4).map(Math.abs),Math.abs(x.at(-4)),Math.abs(x.at(-3)),x.at(-2),x.at(-1),fast*short,short*long];
  return {x,scale,reversalX};
 };

 const bins=Math.min(33,Math.max(3,Math.ceil(hold/10)+1));
 const topBinsStart=6,bottomBinsStart=6+bins;
 const entryIndex=6+bins*2,exitIndex=entryIndex+1,drawIndex=exitIndex+1;
 const targetCount=drawIndex+1;
 const binAt=fraction=>clamp(Math.round(fraction*(bins-1)),0,bins-1);
 const stride=Math.max(2,Math.round(hold/10)),samples=[];
 for(let i=maxLag;i+endOffset<n;i+=stride){
  const f=features(i),entry=i+lead,exit=i+endOffset;
  let highAt=entry,lowAt=entry;
  for(let t=entry+1;t<=exit;t++){
   if(lp[t]>lp[highAt])highAt=t;
   if(lp[t]<lp[lowAt])lowAt=t;
  }
  const direction=Math.sign(lp[exit]-lp[entry]),prior=Math.sign(lp[i]-lp[i-30]);
  const reversal=direction&&prior?(direction!==prior?1:-1):0;
  const highFraction=(highAt-entry)/hold,lowFraction=(lowAt-entry)/hold;
  const y=[direction,reversal,(lp[highAt]-lp[i])/f.scale,(lp[lowAt]-lp[i])/f.scale,highFraction,lowFraction,
   ...Array.from({length:bins},(_,b)=>b===binAt(highFraction)?1:0),
   ...Array.from({length:bins},(_,b)=>b===binAt(lowFraction)?1:0),
   (lp[entry]-lp[i])/f.scale,(lp[exit]-lp[i])/f.scale,direction===0?1:0];
  samples.push({i,x:f.x,reversalX:f.reversalX,y,direction,prior,highFraction,lowFraction,outcomeAt:rows[exit].ts});
 }
 if(samples.length<12)return empty('insufficient-completed-examples');
 const split=Math.floor(samples.length*.75),validation=samples.slice(split),validationStart=samples[split]?.i;
 const training=samples.slice(0,split).filter(s=>s.i+endOffset<validationStart);
 const canTune=training.length>=Math.max(24,samples[0].x.length)&&validation.length>=8;
 const defaults={penalty:.2,halfLife:Math.max(900,hold*6)};
 const grid=canTune?[...new Set([Math.max(300,hold*2),Math.max(900,hold*6),Infinity])].flatMap(halfLife=>[.02,.2,2].map(penalty=>({penalty,halfLife}))):[defaults];
 const chosen={directionRidge:null,directionLogistic:null,topPrice:null,bottomPrice:null,topMeanTime:null,bottomMeanTime:null,topModeTime:null,bottomModeTime:null,reversal:null};
 const best=Object.fromEntries(Object.keys(chosen).map(k=>[k,Infinity]));
 for(const config of grid){
  const fitted=fit(canTune?training:samples,config.penalty,config.halfLife,targetCount);
  const reversalFit=fit((canTune?training:samples).map(s=>({...s,x:s.reversalX,y:[s.y[1]]})),config.penalty,config.halfLife,1);
  const classifier=fitLogistic(canTune?training:samples,config.penalty,config.halfLife);
  if(!fitted)continue;
  const errors=Object.fromEntries(Object.keys(chosen).map(k=>[k,0]));
  let directionCount=0,reversalCount=0;
  for(const s of canTune?validation:[]){
   const yhat=dot(s.x,fitted);
   if(s.direction){
    directionCount++;
    errors.directionRidge+=(yhat[0]>=0?1:-1)!==s.direction?1:0;
    const probability=classifier?sigmoid(scalarDot(s.x,classifier)):.5;
    errors.directionLogistic-=Math.log(Math.max(s.direction>0?probability:1-probability,1e-12));
   }
   if(s.y[1]){reversalCount++;const reversalEstimate=reversalFit?dot(s.reversalX,reversalFit)[0]:0;errors.reversal+=(reversalEstimate>=0?1:-1)!==s.y[1]?1:0;}
   errors.topPrice+=(yhat[2]-s.y[2])**2;errors.bottomPrice+=(yhat[3]-s.y[3])**2;
   errors.topMeanTime+=Math.abs(clamp(yhat[4],0,1)-s.highFraction);
   errors.bottomMeanTime+=Math.abs(clamp(yhat[5],0,1)-s.lowFraction);
   const topScores=yhat.slice(topBinsStart,topBinsStart+bins),bottomScores=yhat.slice(bottomBinsStart,bottomBinsStart+bins);
   const topFraction=topScores.indexOf(Math.max(...topScores))/(bins-1),bottomFraction=bottomScores.indexOf(Math.max(...bottomScores))/(bins-1);
   errors.topModeTime+=Math.abs(topFraction-s.highFraction);errors.bottomModeTime+=Math.abs(bottomFraction-s.lowFraction);
  }
  for(const key of Object.keys(chosen)){
   const count=key.startsWith('direction')?directionCount:key==='reversal'?reversalCount:validation.length;
   const error=canTune&&count?errors[key]/count:Infinity;
   if(chosen[key]===null||error<best[key]-1e-12){chosen[key]=config;best[key]=error;}
  }
 }
 if(Object.values(chosen).some(x=>x===null))return empty('singular-context');
 const current=features(n-1),base=lp.at(-1),coefficients=new Map();
 const fittedFor=config=>{
  const key=config.penalty+':'+config.halfLife;
  if(!coefficients.has(key))coefficients.set(key,fit(samples,config.penalty,config.halfLife,targetCount));
  return coefficients.get(key);
 };
 const estimates={};
 for(const [key,config] of Object.entries(chosen)){
  const fitResult=fittedFor(config);if(!fitResult)return empty('singular-context');
  estimates[key]=dot(current.x,fitResult);
 }
 const logitFit=fitLogistic(samples,chosen.directionLogistic.penalty,chosen.directionLogistic.halfLife);
 const reversalFit=fit(samples.map(s=>({...s,x:s.reversalX,y:[s.y[1]]})),chosen.reversal.penalty,chosen.reversal.halfLife,1);
 const reversalScore=reversalFit?dot(current.reversalX,reversalFit)[0]:null;
 const priorNow=Math.sign(lp.at(-1)-lp.at(-31));
 const callProbability=logitFit?sigmoid(scalarDot(current.x,logitFit)):null;
 const ridgeSide=Math.abs(estimates.directionRidge[0])<=1e-12?null:estimates.directionRidge[0]>0?'CALL':'PUT';
 const logisticSide=callProbability===null?null:callProbability>=.5?'CALL':'PUT';
 const entry=round(Math.exp(base+estimates.directionRidge[entryIndex]*current.scale));
 const exit=round(Math.exp(base+estimates.directionRidge[exitIndex]*current.scale));
 const priceSide=exit>entry?'CALL':exit<entry?'PUT':null;
 const topPrice=round(Math.exp(base+estimates.topPrice[2]*current.scale));
 const bottomPrice=round(Math.exp(base+estimates.bottomPrice[3]*current.scale));
 const argmaxFraction=(values,start)=>{const scores=values.slice(start,start+bins);return scores.indexOf(Math.max(...scores))/(bins-1);};
 const times={mean:{top:clamp(estimates.topMeanTime[4],0,1),bottom:clamp(estimates.bottomMeanTime[5],0,1)},
  mode:{top:argmaxFraction(estimates.topModeTime,topBinsStart),bottom:argmaxFraction(estimates.bottomModeTime,bottomBinsStart)}};
 const models={};
 for(const [classifier,side] of [['ridge',ridgeSide],['logistic',logisticSide]])
  for(const timing of ['mean','mode']){
   const key=classifier+'_'+timing;
   models[key]={status:'direct-event-target-research',side,issuedAt:now,
    entryAt:now+lead*1000,exitAt:now+endOffset*1000,entryDelaySeconds:lead,holdingSeconds:hold,
    projectedEntryPrice:entry,projectedExitPrice:exit,priceProjectionSide:priceSide,
    directionPriceDisagreement:!!side&&!!priceSide&&side!==priceSide,
    rawCallProbability:classifier==='logistic'?callProbability:null,
    events:{top:{secondsFromNow:lead+times[timing].top*hold,price:topPrice},
     bottom:{secondsFromNow:lead+times[timing].bottom*hold,price:bottomPrice},
     reversal:{predicted:priorNow&&reversalScore!==null?reversalScore>=0:null,score:reversalScore}},
    historicalExamples:samples.length,nonDrawTrainingExamples:samples.filter(s=>s.direction!==0).length,
    latestTrainingOutcomeAt:samples.at(-1).outcomeAt,latestObservedQuoteAt:rows.at(-1).quoteAt,
    tuningTrainLatestOutcomeAt:canTune?training.at(-1).outcomeAt:null,
    tuningValidationFirstIssueAt:canTune?rows[validation[0].i].ts:null,
    validation:{examples:canTune?validation.length:0,purgedTrainingOutcomes:true,
      objective:classifier==='ridge'?'historical direction error':'historical binary log loss',
      losses:best,meaning:'past tuning evidence; NOT a calibrated future win probability'},
    fitted:chosen,actionable:false,calibrated:false,modelConfidence:null,
    researchOnly:true,modelVersion:'direct-event-target-research-v1'};
  }
 return {status:'direct-event-target-research',researchOnly:true,models};
}

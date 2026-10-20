// Sentinel 13.9.69: honest direction probabilities for exactly 30 seconds.
// Feed-only data; no presumed periodicity, future labels, synthetic fills or extra polling.
// NEVER interpret an untrained score as a measured chance of success.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const sigmoid=z=>1/(1+Math.exp(-clamp(z,-32,32)));
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const FEATURES=9,VERSION='gemini-logistic-30s-v1';
export function cleanQuotes(raw=[],now=Infinity){
 const byTs=new Map();
 for(const q of Array.isArray(raw)?raw:[]){const ts=Number(q?.ts),price=Number(q?.price);
  if(Number.isSafeInteger(ts)&&ts>=1e12&&ts<=now&&Number.isFinite(price)&&price>0)byTs.set(ts,{ts,price});}
 return [...byTs.values()].sort((a,b)=>a.ts-b.ts);
}
function observedPrice(rows,time){
 let lo=0,hi=rows.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].ts<time)lo=mid+1;else hi=mid}
 const after=rows[lo],before=rows[lo-1];
 if(after?.ts===time)return after.price;
 if(!before||!after||after.ts-before.ts>2200||time-before.ts>1100||after.ts-time>1100)return null;
 return before.price+(after.price-before.price)*(time-before.ts)/(after.ts-before.ts);
}
export function probabilityFeatures(raw,t){
 const quotes=cleanQuotes(raw,t);
 if(quotes.length<55||!Number.isSafeInteger(t)||t-quotes.at(-1).ts>1250)return null;
 const v=[];
 for(let sec=60;sec>=0;sec--){const p=observedPrice(quotes,t-sec*1000);if(p==null)return null;v.push(Math.log(p))}
 const r=v.slice(1).map((p,i)=>p-v[i]),sigma=Math.sqrt(mean(r.map(x=>x*x)));
 if(!Number.isFinite(sigma)||sigma<1e-9)return null;
 const z=n=>clamp((v[60]-v[60-n])/(sigma*Math.sqrt(n)),-6,6),tail=r.slice(-10);
 const pressure=tail.reduce((s,x)=>s+Math.abs(x),0);
 const mu=mean(v),sd=Math.sqrt(mean(v.map(x=>(x-mu)**2)));
 const vs=Math.sqrt(mean(r.slice(-15).map(x=>x*x)));
 const arr=[z(1),z(3),z(5),z(10),z(15),pressure>1e-12?clamp(tail.reduce((s,x)=>s+x,0)/pressure,-1,1):0,sd>1e-9?clamp((v[60]-mu)/sd,-6,6):0,clamp(vs/sigma,.2,5)-1,z(3)-z(15)];
 return arr.every(Number.isFinite)?arr:null;
}
export function fitProbability(rows){
 if(!Array.isArray(rows)||rows.length<160||rows.some(x=>!Array.isArray(x.x)||x.x.length!==FEATURES||x.x.some(v=>!Number.isFinite(v))||![0,1].includes(x.y)))return null;
 const means=Array.from({length:FEATURES},(_,j)=>mean(rows.map(x=>x.x[j])));
 const scales=means.map((mu,j)=>Math.max(.1,Math.sqrt(mean(rows.map(x=>(x.x[j]-mu)**2)))));
 const xs=rows.map(x=>x.x.map((v,j)=>clamp((v-means[j])/scales[j],-5,5)));
 let p=clamp(mean(rows.map(x=>x.y)),.01,.99),bias=Math.log(p/(1-p));
 const weights=means.map(()=>0);
 for(let k=0;k<240;k++){
  let gb=0;const g=weights.map(()=>0);
  for(let i=0;i<rows.length;i++){
   let v=bias;for(let j=0;j<FEATURES;j++)v+=weights[j]*xs[i][j];
   const error=sigmoid(v)-rows[i].y;gb+=error;
   for(let j=0;j<FEATURES;j++)g[j]+=error*xs[i][j];
  }
  const rate=.22/rows.length;bias=clamp(bias-rate*gb,-4,4);
  for(let j=0;j<FEATURES;j++)weights[j]=clamp(weights[j]-rate*(g[j]+2*weights[j]),-4,4);
 }
 return {version:VERSION,trained:rows.length,until:rows.at(-1).dueAt,means,scales,bias,weights};
}
export function callProbability(model,x){
 if(!model||model.version!==VERSION||!Array.isArray(x)||x.length!==FEATURES)return null;
 let z=model.bias;for(let j=0;j<FEATURES;j++){if(!Number.isFinite(x[j])||!(model.scales[j]>0))return null;z+=clamp((x[j]-model.means[j])/model.scales[j],-5,5)*model.weights[j]}
 return sigmoid(z);
}
export function payoutDecision(pCall,payout,margin=.03){
 const b=payout>1&&payout<=100?payout/100:payout;
 if(!Number.isFinite(pCall)||pCall<0||pCall>1||!Number.isFinite(b)||b<=0||b>1)return {side:'AGUARDAR',reason:'probability-or-payout-unavailable'};
 const threshold=1/(1+b)+margin,pPut=1-pCall,side=pCall>threshold?'CALL':pPut>threshold?'PUT':'AGUARDAR';
 const winningChance=side==='CALL'?pCall:side==='PUT'?pPut:null;
 return {side,pCall,pPut,threshold,breakEven:1/(1+b),expectedUnitReturn:winningChance==null?null:winningChance*(1+b)-1,reason:side==='AGUARDAR'?'below-economic-threshold':'calibrated-direction'};
}
function wilsonLower(w,n){if(!n)return 0;const z=2.576,p=w/n,d=1+z*z/n;return (p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/d}
function binomialTail(w,n,p){if(!n)return 1;let a=0,log=0;for(let j=2;j<=n;j++)log+=Math.log(j);for(let j=2;j<=w;j++)log-=Math.log(j);for(let j=2;j<=n-w;j++)log-=Math.log(j);log+=w*Math.log(p)+(n-w)*Math.log1p(-p);let term=Math.exp(log);a=term;for(let k=w+1;k<=n;k++){term*=(n-k+1)/k*p/(1-p);a+=term}return clamp(a,0,1)}
// Chronological, purged walk-forward. No outcome may inform a previous prediction.
export function verifyProbability(rows,payout){
 const b=payout>1&&payout<=100?payout/100:payout;
 if(!(b>0&&b<=1))return {qualified:false,reason:'unknown-payout'};
 const sorted=[...rows].sort((a,c)=>a.t-c.t);
 if(sorted.length<280)return {qualified:false,reason:'insufficient-unseen-outcomes',samples:sorted.length};
 const predictions=[],folds=[];
 for(let start=160;start<sorted.length;start+=40){
  const test=sorted.slice(start,start+40);if(!test.length)break;
  const train=sorted.slice(0,start).filter(x=>x.dueAt<=test[0].t);
  if(train.length<160)continue;
  const model=fitProbability(train);if(!model)continue;
  const baseline=mean(train.map(x=>x.y));
  for(const row of test){
   const p=callProbability(model,row.x),d=payoutDecision(p,b);
   const traded=d.side!=='AGUARDAR';
   predictions.push({t:row.t,y:row.y,p,baseline,side:d.side,traded,won:traded?((d.side==='CALL')===(row.y===1)):null});
  }
  folds.push({train:train.length,until:train.at(-1).dueAt,testStart:test[0].t});
 }
 const trades=predictions.filter(x=>x.traded),wins=trades.filter(x=>x.won).length;
 const breakEven=1/(1+b),sessions=new Set(trades.map(x=>new Date(x.t).toISOString().slice(0,10))).size;
 const brier=predictions.length?mean(predictions.map(x=>(x.p-x.y)**2)):null;
 const baseBrier=predictions.length?mean(predictions.map(x=>(x.baseline-x.y)**2)):null;
 const low=wilsonLower(wins,trades.length),pval=trades.length?binomialTail(wins,trades.length,breakEven):null;
 const qualified=trades.length>=100&&folds.length>=3&&sessions>=3&&low>breakEven&&pval<.01&&brier<baseBrier;
 return {qualified,samples:sorted.length,unseen:predictions.length,trades:trades.length,wins,losses:trades.length-wins,lower99:low,breakEven,pValue:pval,brier,baselineBrier:baseBrier,sessions,folds:folds.length,reason:qualified?'out-of-sample-edge-supported':'insufficient-unseen-edge'};
}
export class Probabilistic30s {
 constructor(saved={}){
  this.contexts=new Map();
  if(saved?.version===1)for(const [key,v] of Object.entries(saved.contexts||{})){
   if(!v||!Array.isArray(v.rows))continue;
   const rows=v.rows.slice(-1800).filter(x=>Number.isSafeInteger(x.t)&&x.dueAt-x.t===30000&&[0,1].includes(x.y)&&Array.isArray(x.x)&&x.x.length===FEATURES&&x.x.every(Number.isFinite));
   this.contexts.set(key,{rows,pending:null,lastQueued:Math.max(0,Number(v.lastQueued||0)),assessment:null,model:null,lastChecked:0});
  }
 }
 state(key){if(!this.contexts.has(key))this.contexts.set(key,{rows:[],pending:null,lastQueued:0,assessment:null,model:null,lastChecked:0});return this.contexts.get(key)}
 observe({provider,asset,quotes,quoteAt,price,now,payout}){
  const key=String(provider||'unknown').toLowerCase()+'|'+String(asset||'').toUpperCase(),ctx=this.state(key);
  const t=Number(quoteAt),q=cleanQuotes(quotes,now);
  if(!Number.isSafeInteger(t)||t<1e12||now-t>1250||now<t||q.at(-1)?.ts!==t)return {decision:{side:'AGUARDAR',reason:'missing-fresh-observed-quotes'},samples:ctx.rows.length};
  if(ctx.pending&&t>=ctx.pending.dueAt){
   const due=ctx.pending.dueAt;
   const at=q.filter(x=>Math.abs(x.ts-due)<=1250).sort((a,b)=>Math.abs(a.ts-due)-Math.abs(b.ts-due))[0];
   if(at){
    const diff=at.price-ctx.pending.entryPrice,epsilon=ctx.pending.entryPrice*1e-10;
    if(Math.abs(diff)>epsilon)ctx.rows.push({...ctx.pending,y:diff>0?1:0});
    ctx.rows=ctx.rows.slice(-1800);ctx.pending=null;
   }else if(t-due>15000)ctx.pending=null;
  }
  if(!ctx.pending&&t>=ctx.lastQueued+30000){
   const x=probabilityFeatures(q,t);
   if(x){ctx.pending={t,dueAt:t+30000,x,entryPrice:price};ctx.lastQueued=t}
  }
  // Revalidate only on new closed 40-row blocks; the market click path stays cheap.
  if(ctx.rows.length>=280&&ctx.rows.length-ctx.lastChecked>=40){
   ctx.assessment=verifyProbability(ctx.rows,payout);
   ctx.lastChecked=ctx.rows.length;
   ctx.model=ctx.assessment.qualified?fitProbability(ctx.rows):null;
  }
  const x=probabilityFeatures(q,t);
  const p=ctx.model?callProbability(ctx.model,x):null;
  const decision=ctx.assessment?.qualified&&p!=null?payoutDecision(p,payout):{side:'AGUARDAR',reason:ctx.rows.length<280?'collecting-30s-real-outcomes':'unproven-out-of-sample-edge'};
  return {decision,samples:ctx.rows.length,validated:ctx.assessment?.qualified===true,assessment:ctx.assessment?{...ctx.assessment}:null,modelVersion:VERSION};
 }
 snapshot(){
  const contexts={};
  for(const [key,v] of this.contexts)contexts[key]={rows:v.rows.slice(-1800),lastQueued:v.lastQueued};
  return {version:1,contexts};
 }
}

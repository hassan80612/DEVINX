// OFFLINE ONLY. Fixed hypothesis: extrapolate observed trend + cycle phase to
// exactly t+30s, rather than following the immediate slope of the current wave.
// Window 180s; observed 1s grid; minimum 60 points; two observed cycle periods.
// Search 12..90s in 2s steps. Penalized fit selects a line or ONE harmonic.
// All fit/selection inputs are past prices. No win-rate fitting or live use.
const TAU=2*Math.PI;
function solve(matrix,target){
 const n=target.length,a=matrix.map((r,i)=>[...r,target[i]]);
 for(let k=0;k<n;k++){
  let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
  if(Math.abs(a[pivot][k])<1e-10)return null;
  [a[k],a[pivot]]=[a[pivot],a[k]];
  const d=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=d;
  for(let i=0;i<n;i++)if(i!==k){const m=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=m*a[k][j];}
 }
 return a.map(r=>r[n]);
}
const features=(t,period)=>period?[1,t/180,Math.sin(TAU*t/period),Math.cos(TAU*t/period)]:[1,t/180];
function fit(points,period){
 const n=period?4:2,xx=Array.from({length:n},()=>Array(n).fill(0)),xy=Array(n).fill(0);
 const design=points.map(p=>features(p.t,period));
 for(let k=0;k<points.length;k++)for(let i=0;i<n;i++){
  xy[i]+=design[k][i]*points[k].y;
  for(let j=0;j<n;j++)xx[i][j]+=design[k][i]*design[k][j];
 }
 const coefficients=solve(xx,xy);if(!coefficients)return null;
 const predict=t=>features(t,period).reduce((s,v,i)=>s+v*coefficients[i],0);
 const sse=points.reduce((s,p)=>s+(p.y-predict(p.t))**2,0);
 return {period,coefficients,sse,predict};
}
export function thirtySecondCycleForecast({quoteHistory=[],quoteAt,price,now=quoteAt,durationMs=30000}={}){
 const none=reason=>({ready:false,side:null,reason});
 if(durationMs!==30000||!(Number.isFinite(price)&&price>0&&quoteAt>0&&quoteAt<=now&&now-quoteAt<=1450))return none('invalid-30s-input');
 const rows=quoteHistory.filter(q=>q.ts<=quoteAt&&(q.receivedAt??q.ts)<=now&&q.ts>=quoteAt-180000&&Number.isFinite(q.price)&&q.price>0).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==quoteAt||rows.at(-1)?.price!==price)return none('unverified-live-quote');
 const points=[];let j=rows.length-1;
 for(let t=quoteAt;t>=Math.max(rows[0].ts,quoteAt-180000);t-=1000){
  while(j>=0&&rows[j].ts>t)j--;
  if(j>=0&&t-rows[j].ts<=500)points.push({t:(t-quoteAt)/1000,y:Math.log(rows[j].price/price)});
 }
 points.reverse();
 if(points.length<60)return none('insufficient-observed-cycle-history');
 if(points.some((p,i)=>i&&p.t-points[i-1].t>3))return none('observed-cycle-history-gap');
 const line=fit(points,null);if(!line||line.sse<1e-20)return none('insufficient-nonlinear-variation');
 const span=-points[0].t,periods=[];
 for(let period=12;period<=Math.min(90,span/2);period+=2)periods.push(period);
 const n=points.length,criterion=(model,count,searchPenalty=0)=>n*Math.log(Math.max(model.sse/n,1e-30))+count*Math.log(n)+searchPenalty;
 let selected=line,best=criterion(line,2);
 for(const period of periods){
  const model=fit(points,period);if(!model)continue;
  const score=criterion(model,4,2*Math.log(Math.max(1,periods.length)));
  if(score<best){best=score;selected=model;}
 }
 const expectedLogMove=selected.predict(30)-selected.predict(0);
 if(!Number.isFinite(expectedLogMove)||Math.abs(expectedLogMove)<1e-12)return none('neutral-30s-cycle-expectation');
 const predictedPrice=price*Math.exp(expectedLogMove);
 if(!(Number.isFinite(predictedPrice)&&predictedPrice>0))return none('invalid-30s-cycle-expectation');
 return {ready:true,side:expectedLogMove>0?'CALL':'PUT',reason:'research-30s-trend-and-cycle-phase',
  observedAt:quoteAt,entryPrice:price,predictedPrice,expectedLogMove,horizonMs:30000,
  fittedPeriodSeconds:selected.period,observedPoints:n,fitResidual:Math.sqrt(selected.sse/n),
  fitSelectionCriterion:best};
}

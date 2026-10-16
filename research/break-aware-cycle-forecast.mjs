// OFFLINE ONLY. Follow-up to the frozen phase candidate: permit ONE observed
// trend break while fitting the wave. No endpoint/outcome-dependent tuning.
// First choose the best broken linear baseline; test harmonics for that one
// baseline and for the original line. This bounds work per incoming quote.
const TAU=2*Math.PI;
export const breakHypothesis=Object.freeze({horizonMs:30000,windowMs:180000,minimumPoints:60,
 breakGridSeconds:30,minimumPointsOnEachSideSeconds:30,
 selection:'Line, one broken line, line+cycle, best broken line+cycle; BIC plus searched-model penalty',
 admission:'Keep every published entry at the same instant. No additional wait or confidence gate.'});
function solve(xx,xy){
 const n=xy.length,a=xx.map((r,i)=>[...r,xy[i]]);
 for(let k=0;k<n;k++){
  let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;
  if(Math.abs(a[p][k])<1e-10)return null;[a[k],a[p]]=[a[p],a[k]];
  const d=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=d;
  for(let i=0;i<n;i++)if(i!==k){const f=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=f*a[k][j];}
 }
 return a.map(r=>r[n]);
}
function feature(t,knot,period){
 const x=[1,t/180];if(knot!==null)x.push(Math.max(0,(t-knot)/180));
 if(period!==null)x.push(Math.sin(TAU*t/period),Math.cos(TAU*t/period));return x;
}
function fit(points,knot=null,period=null){
 const design=points.map(p=>feature(p.t,knot,period)),dim=design[0].length;
 const xx=Array.from({length:dim},()=>Array(dim).fill(0)),xy=Array(dim).fill(0);
 for(let k=0;k<points.length;k++)for(let i=0;i<dim;i++){
  xy[i]+=design[k][i]*points[k].y;
  for(let j=i;j<dim;j++)xx[i][j]+=design[k][i]*design[k][j];
 }
 for(let i=0;i<dim;i++)for(let j=0;j<i;j++)xx[i][j]=xx[j][i];
 const beta=solve(xx,xy);if(!beta)return null;
 const predict=t=>feature(t,knot,period).reduce((s,x,i)=>s+x*beta[i],0);
 const sse=points.reduce((s,p)=>s+(p.y-predict(p.t))**2,0);
 return {knot,period,predict,sse,dim};
}
export function breakAwareCycleForecast({quoteHistory=[],quoteAt,price,now=quoteAt,durationMs=30000}={}){
 const none=reason=>({ready:false,side:null,reason});
 if(durationMs!==30000||!(Number.isFinite(price)&&price>0&&quoteAt>0&&quoteAt<=now&&now-quoteAt<=1450))return none('invalid-break-forecast-input');
 const rows=quoteHistory.filter(q=>q.ts<=quoteAt&&(q.receivedAt??q.ts)<=now&&q.ts>=quoteAt-180000&&Number.isFinite(q.price)&&q.price>0).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==quoteAt||rows.at(-1)?.price!==price)return none('unverified-break-forecast-quote');
 const points=[];let j=rows.length-1;
 for(let t=quoteAt;t>=Math.max(rows[0].ts,quoteAt-180000);t-=1000){
  while(j>=0&&rows[j].ts>t)j--;
  if(j>=0&&t-rows[j].ts<=500)points.push({t:(t-quoteAt)/1000,y:Math.log(rows[j].price/price)});
 }
 points.reverse();
 if(points.length<60||points.some((p,i)=>i&&p.t-points[i-1].t>3))return none('unavailable-observed-break-context');
 const n=points.length,span=-points[0].t,knots=[],periods=[];
 for(let k=-30;k>=-span+30;k-=30)knots.push(k);
 for(let p=12;p<=Math.min(90,span/2);p+=2)periods.push(p);
 const criterion=(m,trials=1)=>n*Math.log(Math.max(m.sse/n,1e-30))+m.dim*Math.log(n)+2*Math.log(Math.max(1,trials));
 let selected=fit(points);if(!selected)return none('singular-break-context');
 let best=criterion(selected),bestBroken=null,bestBrokenScore=Infinity;
 for(const k of knots){
  const m=fit(points,k);if(!m)continue;const score=criterion(m,knots.length);
  if(score<bestBrokenScore){bestBrokenScore=score;bestBroken=m;}
  if(score<best){best=score;selected=m;}
 }
 for(const period of periods)for(const knot of [null,...(bestBroken?[bestBroken.knot]:[])]){
  const m=fit(points,knot,period);if(!m)continue;
  const trials=periods.length*(knot===null?1:knots.length),score=criterion(m,trials);
  if(score<best){best=score;selected=m;}
 }
 const expectedLogMove=selected.predict(30)-selected.predict(0);
 if(!Number.isFinite(expectedLogMove)||Math.abs(expectedLogMove)<1e-12)return none('neutral-break-forecast');
 const predictedPrice=price*Math.exp(expectedLogMove);
 if(!(Number.isFinite(predictedPrice)&&predictedPrice>0))return none('invalid-break-price');
 return {ready:true,side:expectedLogMove>0?'CALL':'PUT',reason:'research-30s-break-aware-cycle',
  observedAt:quoteAt,entryPrice:price,predictedPrice,horizonMs:30000,expectedLogMove,
  fittedBreakSecondsAgo:selected.knot===null?null:-selected.knot,fittedPeriodSeconds:selected.period,
  fitSelectionCriterion:best,observedPoints:n};
}

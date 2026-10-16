// OFFLINE ONLY: binary 30s target with observed candle geometry and speed.
// Observed rolling 10s bars are reconstructed from video quotes; they are not
// the original broker OHLC and may miss intratick extremes. No probability claim.
const clamp=x=>Math.max(-4,Math.min(4,x));
function before(rows,t){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=t&&(rows[i].receivedAt??rows[i].ts)<=t)
  return t-rows[i].ts<=1500?rows[i]:null;
 return null;
}
export const candleFeatureNames=['return2','return5','return10','return20','return32','return60',
 'bodyLatest','bodyPrevious','bodyOlder','wickLatest','wickPrevious','wickOlder',
 'priorRangePosition','currentRetreatBalance','speedAcceleration','levelSpeedInteraction'];
export function candleExpiryFeatures(rows,time){
 const visible=rows.filter(q=>q.ts<=time&&(q.receivedAt??q.ts)<=time&&q.ts>=time-61500);
 const spot=before(visible,time),start=before(visible,time-60000);
 if(!spot||!start||visible.some((q,i)=>i&&q.ts-visible[i-1].ts>2500))return null;
 let variance=0,seconds=0;
 for(let i=1;i<visible.length;i++){
  const d=Math.log(visible[i].price/visible[i-1].price),dt=(visible[i].ts-visible[i-1].ts)/1000;
  variance+=d*d;seconds+=dt;
 }
 const sigma=Math.sqrt(variance/seconds);if(!(sigma>1e-12))return null;
 const returns=[];
 for(const h of [2,5,10,20,32,60]){
  const q=before(visible,time-h*1000);if(!q)return null;
  returns.push(clamp(Math.log(spot.price/q.price)/(sigma*Math.sqrt(h))));
 }
 const bodies=[],wicks=[];let latest;
 for(let k=0;k<3;k++){
  const end=time-k*10000,from=end-10000,part=visible.filter(q=>q.ts>from&&q.ts<=end),open=before(visible,from);
  if(!open||part.length<4||end-part.at(-1).ts>1500)return null;
  const close=part.at(-1).price,high=Math.max(open.price,...part.map(q=>q.price)),low=Math.min(open.price,...part.map(q=>q.price));
  const range=high-low;if(!(range>0))return null;
  bodies.push((close-open.price)/range);
  wicks.push(((Math.min(open.price,close)-low)-(high-Math.max(open.price,close)))/range);
  if(!k)latest={high,low};
 }
 // Define historical boundaries BEFORE the latest 10s reaction. A breakout
 // must not create its own supposed resistance by moving that boundary.
 const prior=visible.filter(q=>q.ts>=time-60000&&q.ts<=time-10000);
 const upper=Math.max(...prior.map(q=>q.price)),lower=Math.min(...prior.map(q=>q.price)),span=upper-lower;
 if(!(span>0))return null;
 const position=clamp((2*spot.price-upper-lower)/span);
 const retreatBalance=clamp((2*spot.price-latest.high-latest.low)/span);
 const p3=before(visible,time-3000),p6=before(visible,time-6000);if(!p3||!p6)return null;
 const speed=Math.log(spot.price/p3.price)/(sigma*Math.sqrt(3));
 const acceleration=clamp((Math.log(spot.price/p3.price)-Math.log(p3.price/p6.price))/(sigma*Math.sqrt(3)));
 return {x:[...returns,...bodies,...wicks,position,retreatBalance,acceleration,clamp(position*Math.abs(speed))],price:spot.price,at:spot.ts};
}
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
export function candleExpiryDirection({quoteHistory=[],quoteAt,price,now=quoteAt,durationMs=30000}={}){
 const none=reason=>({ready:false,side:null,reason});
 if(durationMs!==30000||!(Number.isFinite(price)&&price>0&&quoteAt>0&&quoteAt<=now&&now-quoteAt<=1450))return none('invalid-30s-candle-input');
 const rows=quoteHistory.filter(q=>q.ts<=quoteAt&&(q.receivedAt??q.ts)<=now&&q.ts>=quoteAt-180000&&Number.isFinite(q.price)&&q.price>0).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==quoteAt||rows.at(-1)?.price!==price)return none('unverified-quote');
 const here=candleExpiryFeatures(rows,quoteAt);if(!here)return none('unavailable-candle-context');
 const samples=[];
 for(let time=quoteAt-31000;time>=rows[0].ts+61500;time-=5000){
  const f=candleExpiryFeatures(rows,time);if(!f)continue;
  const end=rows.find(q=>q.ts>=f.at+30000&&q.ts<=f.at+31000&&(q.receivedAt??q.ts)<=now);
  if(!end||end.price===f.price)continue;
  samples.push({x:[1,...f.x],y:end.price>f.price?1:-1});
 }
 if(samples.length<8)return none('insufficient-closed-30s-candle-outcomes');
 const dim=here.x.length+1,xx=Array.from({length:dim},(_,i)=>Array.from({length:dim},(_,j)=>i===j?5:0)),xy=Array(dim).fill(0);
 for(const s of samples)for(let i=0;i<dim;i++){
  xy[i]+=s.x[i]*s.y;for(let j=0;j<dim;j++)xx[i][j]+=s.x[i]*s.x[j];
 }
 const beta=solve(xx,xy);if(!beta)return none('singular-candle-fit');
 const score=beta.reduce((s,b,i)=>s+b*(i?here.x[i-1]:1),0);
 if(!Number.isFinite(score)||Math.abs(score)<1e-12)return none('neutral-30s-candle-fit');
 return {ready:true,side:score>0?'CALL':'PUT',reason:'research-30s-candle-binary-outcomes',
  observedAt:quoteAt,entryPrice:price,horizonMs:30000,score,completedSamples:samples.length};
}

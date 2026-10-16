// OFFLINE RESEARCH ONLY. This module is never imported by the Agent.
// Same causal feature map for continuation, reaction and range: no strategy votes.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function indexAt(rows,t){
 let lo=0,hi=rows.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].ts<=t)lo=mid+1;else hi=mid;}
 return lo-1;
}
function indexAfter(rows,t){
 let lo=0,hi=rows.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].ts<t)lo=mid+1;else hi=mid;}
 return lo;
}
function features(rows,t){
 const idx=indexAt(rows,t),start=indexAfter(rows,t-60000);
 if(idx<0||t-rows[idx].ts>1500||idx-start<12||rows[start].ts>t-58000)return null;
 const p=rows[idx].log;
 let variance=0,seconds=0,path=0,hi=-Infinity,lo=Infinity;
 for(let i=start;i<=idx;i++){
  hi=Math.max(hi,rows[i].log);lo=Math.min(lo,rows[i].log);
  if(i>start){const dt=(rows[i].ts-rows[i-1].ts)/1000,d=rows[i].log-rows[i-1].log;
   if(dt>0&&dt<=2.5){variance+=d*d;seconds+=dt;path+=Math.abs(d);}else return null;
  }
 }
 const sigma=Math.sqrt(variance/(seconds||1));if(!(sigma>1e-10))return null;
 const returns=[];
 for(const h of [2,5,10,20,32,60]){
  const j=indexAt(rows,t-h*1000);if(j<0||t-h*1000-rows[j].ts>1500)return null;
  returns.push(clamp((p-rows[j].log)/(sigma*Math.sqrt(h)),-4,4));
 }
 const span=hi-lo,net=p-rows[start].log;
 const position=span>0?2*(p-lo)/span-1:0;
 const efficiency=path>0?net/path:0;
 return {x:[...returns,position,efficiency*2],sigma,price:rows[idx].price,at:rows[idx].ts};
}
function solve(matrix,y){
 const n=y.length,a=matrix.map((r,i)=>[...r,y[i]]);
 for(let col=0;col<n;col++){
  let pivot=col;for(let i=col+1;i<n;i++)if(Math.abs(a[i][col])>Math.abs(a[pivot][col]))pivot=i;
  if(Math.abs(a[pivot][col])<1e-10)return null;
  [a[col],a[pivot]]=[a[pivot],a[col]];
  const v=a[col][col];for(let j=col;j<=n;j++)a[col][j]/=v;
  for(let i=0;i<n;i++)if(i!==col){const f=a[i][col];for(let j=col;j<=n;j++)a[i][j]-=f*a[col][j];}
 }
 return a.map(r=>r[n]);
}
export function contextualDirection({quoteHistory=[],quoteAt,price,now=quoteAt,durationMs=30000},
 {method='neighbours',memoryMs=600000}={}){
 const none=reason=>({ready:false,side:null,reason,observedAt:quoteAt});
 if(durationMs!==30000||!(price>0)||quoteAt>now||now-quoteAt>1450)return none('research-invalid-or-stale-quote');
 const rows=quoteHistory.filter(q=>q.ts<=quoteAt&&q.ts>=quoteAt-memoryMs&&
  (q.receivedAt??q.ts)<=now&&q.price>0).map(q=>({...q,log:Math.log(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==quoteAt||rows.at(-1).price!==price)return none('research-unverified-quote');
 const here=features(rows,quoteAt);if(!here)return none('research-context-unavailable');
 const samples=[];
 for(let t=Math.ceil((rows[0].ts+62000)/5000)*5000;t<=quoteAt-durationMs-1500;t+=5000){
  const f=features(rows,t);if(!f)continue;
  const j=indexAfter(rows,f.at+durationMs);
  if(!rows[j]||rows[j].ts>quoteAt||rows[j].ts-f.at-durationMs>1000)continue;
  const outcome=rows[j].log-Math.log(f.price);
  const y=clamp(outcome/(f.sigma*Math.sqrt(durationMs/1000)),-3,3);
  const diff=f.x.reduce((sum,v,i)=>sum+(v-here.x[i])**2,0)/f.x.length;
  samples.push({...f,y,diff,age:quoteAt-rows[j].ts});
 }
 if(samples.length<8)return none('research-insufficient-closed-outcomes');
 let score,used=0;
 if(method==='ridge'){
  const dim=here.x.length+1,xx=Array.from({length:dim},(_,i)=>Array.from({length:dim},(_,j)=>i===j?5:0)),xy=Array(dim).fill(0);
  for(const s of samples){const x=[1,...s.x],w=Math.exp(-s.age/180000);used++;
   for(let i=0;i<dim;i++){xy[i]+=w*x[i]*s.y;for(let j=0;j<dim;j++)xx[i][j]+=w*x[i]*x[j];}}
  const beta=solve(xx,xy);if(!beta)return none('research-singular-context');
  score=beta.reduce((sum,b,i)=>sum+b*(i?here.x[i-1]:1),0);
 }else{
  const selected=[];
  for(const s of samples.sort((a,b)=>a.diff-b.diff)){
   if(selected.some(x=>Math.abs(x.at-s.at)<durationMs))continue;
   selected.push(s);if(selected.length===12)break;
  }
  if(selected.length<3)return none('research-insufficient-independent-outcomes');
  let total=0,numerator=0;
  for(const s of selected){const w=Math.exp(-s.age/180000)/(.25+s.diff);numerator+=w*s.y;total+=w;}
  score=numerator/(total||1);used=selected.length;
 }
 // A magnitude threshold on normalized expected movement, not a claimed win rate.
 if(!Number.isFinite(score)||Math.abs(score)<.20)return none('research-no-directional-edge');
 return {ready:true,side:score>0?'CALL':'PUT',reason:'research-contextual-'+method,
  observedAt:quoteAt,entryPrice:price,score,samples:used};
}

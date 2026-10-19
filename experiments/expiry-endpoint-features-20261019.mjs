// Research only. All features end at the current observed quote, never its label.
export const ENDPOINT_FEATURE_NAMES=[...['3','6','15','30','60','120','180'].map(x=>'return'+x),...['30','90','180'].map(x=>'slope'+x),...['30','90','180'].map(x=>'residual'+x),...['30','90','180'].map(x=>'location'+x),...['30','90','180'].map(x=>'efficiency'+x),'return6-persistence30','return30-persistence30','return6-persistence90','return30-persistence90'];
const clip=x=>Math.max(-8,Math.min(8,x));
export function endpointFeatures({quoteHistory=[],quoteAt,price,now=quoteAt}={}){
 const at=Number(quoteAt),spot=Number(price);if(!(at>0&&at<=now&&now-at<=1450&&spot>0))return null;
 const seconds=new Map();for(const q of quoteHistory)if(q.ts<=at&&q.ts>=at-183000&&(q.receivedAt??q.ts)<=now&&Number.isFinite(q.price)&&q.price>0)seconds.set(Math.floor(q.ts/1000),q);
 const rows=[...seconds.values()].sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==at||rows.at(-1)?.price!==spot||rows.length<120||at-rows[0].ts<175000||rows.some((q,i)=>i&&q.ts-rows[i-1].ts>3000))return null;
 const active=rows.filter(q=>q.ts>=at-180000);
 const x=active.map(q=>(q.ts-at)/1000),y=active.map(q=>Math.log(q.price/spot));
 const steps=y.slice(1).map((v,i)=>v-y[i]),vol=Math.sqrt(steps.reduce((s,v)=>s+v*v,0)/steps.length);if(!(vol>1e-12))return null;
 const back=sec=>{for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=at-sec*1000)return at-sec*1000-rows[i].ts<=3000?Math.log(rows[i].price/spot):null;return null;};
 const returns=[3,6,15,30,60,120,180].map(sec=>{const v=back(sec);return v===null?null:clip(-v/(vol*Math.sqrt(sec)));});
 if(returns.some(v=>v===null))return null;
 const slope=[],residual=[],location=[],efficiency=[];
 for(const sec of [30,90,180]){
  const ids=x.map((v,i)=>v>=-sec?i:-1).filter(i=>i>=0),mx=ids.reduce((s,i)=>s+x[i],0)/ids.length,my=ids.reduce((s,i)=>s+y[i],0)/ids.length;
  let xx=0,xy=0;for(const i of ids){xx+=(x[i]-mx)**2;xy+=(x[i]-mx)*(y[i]-my);}
  const b=xx>0?xy/xx:0,intercept=my-b*mx,scale=vol*Math.sqrt(sec);
  const ys=ids.map(i=>y[i]),hi=Math.max(...ys),lo=Math.min(...ys),path=ids.slice(1).reduce((s,i,k)=>s+Math.abs(y[i]-y[ids[k]]),0);
  slope.push(clip(b*30/(vol*Math.sqrt(30))));residual.push(clip(-intercept/scale));
  location.push(hi>lo?-(hi+lo)/(hi-lo):0);efficiency.push(path>0?-ys[0]/path:0);
 }
 return [...returns,...slope,...residual,...location,...efficiency,
  returns[1]*efficiency[0]**2,returns[3]*efficiency[0]**2,
  returns[1]*efficiency[1]**2,returns[3]*efficiency[1]**2];
}
export function endpointPrediction(input,model){
 const xs=endpointFeatures(input);if(!xs)return null;
 const z=xs.reduce((s,v,i)=>s+v/model.scale[i]*model.coefficients[i],0),p=1/(1+Math.exp(-Math.max(-40,Math.min(40,z))));
 return {side:p>=.5?'CALL':'PUT',callProbability:p,features:xs};
}

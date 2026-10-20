// Sentinel: rapid, model-based directional estimate from the most recent 30-60s.
// This is a conditional Gaussian *estimate*, NOT a statistically calibrated win rate.
// No historical labels or broker executions are needed for the warmup.
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-20,20)));
export function shortProbability({quoteHistory=[],quoteAt,price,durationMs=30000,payout=null,now=Date.now()}={}){
 const wait=(reason,extra={})=>({ready:false,side:null,reason,pCall:null,pPut:null,source:'parametric-unvalidated',...extra});
 const h=Number(durationMs)/1000;
 if(![30,60].includes(h))return wait('unsupported-probability-horizon');
 const t=Number(quoteAt),p=Number(price);
 if(!Number.isFinite(t)||t>now||now-t>1500||!(p>0))return wait('stale-or-invalid-quote');
 const cutoff=t-66000,rows=[],seen=new Map();
 // Last 3000 observed quotes are enough even with high-frequency broker feeds.
 for(const x of quoteHistory.slice(-3000)){
  const ts=Number(x?.ts),value=Number(x?.price);
  if(Number.isFinite(ts)&&ts<=t&&ts>=cutoff&&Number.isFinite(value)&&value>0)seen.set(ts,value);
 }
 for(const [ts,value] of seen)rows.push({ts,price:value});
 rows.sort((a,b)=>a.ts-b.ts);
 if(rows.length<8||rows.at(-1).ts!==t||Math.abs(rows.at(-1).price-p)>p*.0000001)return wait('insufficient-observed-quotes');
 const earliest=rows[0].ts;
 if(t-earliest<30000)return wait('collecting-30s-history',{historySeconds:Math.floor((t-earliest)/1000)});
 function observedAt(target){
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].ts<target)lo=mid+1;else hi=mid}
  const after=rows[lo],before=rows[lo-1];
  if(after?.ts===target)return after.price;
  if(!before||!after||after.ts-before.ts>6500)return null;
  return before.price+(after.price-before.price)*(target-before.ts)/(after.ts-before.ts);
 }
 const logs=[],weights=[];
 for(const [seconds,weight] of [[3,.10],[5,.15],[10,.18],[15,.17],[30,.30],[60,.10]]){
  const previous=observedAt(t-seconds*1000);
  if(previous>0){logs.push({seconds,value:Math.log(p/previous),weight});weights.push(weight)}
 }
 if(!logs.some(x=>x.seconds===30))return wait('missing-30s-price-evidence');
 const size=weights.reduce((a,b)=>a+b,0),driftPerSecond=logs.reduce((a,x)=>a+x.weight*x.value/x.seconds,0)/size;
 const earliestVarianceMs=Math.max(t-60000,earliest);
 const recent=rows.filter(x=>x.ts>=earliestVarianceMs);
 let quadratic=0,span=0,gaps=0;
 for(let i=1;i<recent.length;i++){
  const dt=(recent[i].ts-recent[i-1].ts)/1000;
  if(dt<=0)continue;
  if(dt>7)gaps++;
  const r=Math.log(recent[i].price/recent[i-1].price);
  quadratic+=r*r;span+=dt;
 }
 if(span<29||gaps>1||!(quadratic>=0))return wait('incomplete-recent-price-path');
 const r30=logs.find(x=>x.seconds===30).value;
 const instant=logs.find(x=>x.seconds===5)||logs.find(x=>x.seconds===3);
 const contrary=instant&&Math.sign(instant.value)!==Math.sign(r30)&&Math.abs(instant.value)>1e-9;
 const adjusted=driftPerSecond*(contrary?.55:1);
 // Noise and finite-sample shrinkage avoid treating a clean-looking trend as certainty.
 const volPerRootSec=Math.max(Math.sqrt(quadratic/span),Math.abs(r30)/Math.sqrt(30)*.3,1e-8);
 const rawZ=adjusted*h/(volPerRootSec*Math.sqrt(h));
 const shrunkZ=clamp(rawZ*.27,-.65,.65);
 const pCall=clamp(sigmoid(1.5*shrunkZ),.275,.725),pPut=1-pCall;
 const b=Number(payout);
 const payoutFrac=b>1&&b<=100?b/100:b;
 const verifiedPayout=Number.isFinite(payoutFrac)&&payoutFrac>0&&payoutFrac<=1;
 // A decision is allowed with an early technical estimate, but NOT certified
 // as profitable. The threshold is merely a conservative preliminary filter.
 const threshold=verifiedPayout?1/(1+payoutFrac)+.02:.59;
 const side=pCall>threshold?'CALL':pPut>threshold?'PUT':null;
 return {ready:side!==null,side,reason:side?'preliminary-short-probability':'no-preliminary-directional-advantage',
  pCall,pPut,threshold,horizonSeconds:h,historySeconds:Math.round(span),quoteCount:recent.length,
  source:'parametric-unvalidated',calibrated:false,driftPerSecond,volPerRootSec};
}

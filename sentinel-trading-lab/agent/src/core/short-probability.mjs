// Sentinel: horizon-specific directional estimates; these are NOT calibrated win rates.
// This is a conditional Gaussian *estimate*, NOT a statistically calibrated win rate.
// No historical labels or broker executions are needed for the warmup.
import {observedQuoteWindow} from './observed-quote-window.mjs';
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-20,20)));
export function shortProbability({quoteHistory=[],quoteAt,price,durationMs=30000,payout=null,now=Date.now()}={}){
 const wait=(reason,extra={})=>({ready:false,side:null,reason,pCall:null,pPut:null,source:'parametric-unvalidated',...extra});
 const h=Number(durationMs)/1000;
 if(![30,60,120,300].includes(h))return wait('unsupported-probability-horizon');
 const t=Number(quoteAt),p=Number(price);
 if(!Number.isFinite(t)||t>now||now-t>1500||!(p>0))return wait('stale-or-invalid-quote');
 // Each expiry gets its own causal warm-up. A 5m estimate uses a full
 // 300s observed anchor and realized-volatility window; it does not turn
 // missing history into a signal or block the shared structural analysis.
 const lookback=h>=300?320:h>=120?100:h>=60?90:66;
 const minObserved=h>=300?300:h>=120?90:h>=60?45:30;
 const rows=observedQuoteWindow({history:quoteHistory,at:t,now,windowMs:lookback*1000,maxQuotes:6000});
 if(rows.length<8||rows.at(-1).ts!==t||Math.abs(rows.at(-1).price-p)>p*.0000001)return wait('insufficient-observed-quotes');
 const earliest=rows[0].ts;
 if(t-earliest<minObserved*1000)return wait('collecting-horizon-history',{historySeconds:Math.floor((t-earliest)/1000)});
 function observedAt(target){
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].ts<target)lo=mid+1;else hi=mid}
  const after=rows[lo],before=rows[lo-1];
  if(after?.ts===target)return after.price;
  if(!before||!after||after.ts-before.ts>6500)return null;
  return before.price+(after.price-before.price)*(target-before.ts)/(after.ts-before.ts);
 }
 const logs=[],weights=[];
 const scales=h>=300?[[3,.02],[5,.03],[10,.04],[15,.04],[30,.08],[60,.10],[90,.10],[180,.24],[300,.35]]:
  h>=120?[[3,.04],[5,.06],[10,.10],[15,.10],[30,.15],[60,.20],[90,.35]]:
  h>=60?[[3,.07],[5,.09],[10,.12],[15,.13],[30,.18],[45,.18],[60,.23]]:
  [[3,.10],[5,.15],[10,.18],[15,.17],[30,.30],[60,.10]];
 for(const [seconds,weight] of scales){
  const previous=observedAt(t-seconds*1000);
  if(previous>0){logs.push({seconds,value:Math.log(p/previous),weight});weights.push(weight)}
 }
 const horizonReferenceSeconds=h>=300?300:h>=120?90:h>=60?60:30;
 if(!logs.some(x=>x.seconds===horizonReferenceSeconds))return wait('missing-horizon-price-evidence');
 const size=weights.reduce((a,b)=>a+b,0),driftPerSecond=logs.reduce((a,x)=>a+x.weight*x.value/x.seconds,0)/size;
 const earliestVarianceMs=Math.max(t-(h>=300?300000:h>=120?90000:60000),earliest);
 const recent=rows.filter(x=>x.ts>=earliestVarianceMs);
 let quadratic=0,span=0,gaps=0;
 for(let i=1;i<recent.length;i++){
  const dt=(recent[i].ts-recent[i-1].ts)/1000;
  if(dt<=0)continue;
  if(dt>7)gaps++;
  const r=Math.log(recent[i].price/recent[i-1].price);
  quadratic+=r*r;span+=dt;
 }
 if(span<minObserved-1||gaps>Math.max(1,Math.ceil(minObserved/60))||!(quadratic>=0))return wait('incomplete-recent-price-path');
 // Longer horizons may have their 90s/180s anchor while the common 30s
 // reversal reference falls inside a feed gap. Missing evidence is not a
 // zero return, and must never throw during an otherwise valid analysis.
 const reference30=logs.find(x=>x.seconds===30);
 if(!reference30)return wait('missing-30s-reference-price');
 const r30=reference30.value;
 const five=logs.find(x=>x.seconds===5),three=logs.find(x=>x.seconds===3);
 const instant=five||three;
 const contrary=instant&&Math.sign(instant.value)!==Math.sign(r30)&&Math.abs(instant.value)>1e-9;
 const adjusted=driftPerSecond*(contrary?.55:1);
 // Noise and finite-sample shrinkage avoid treating a clean-looking trend as certainty.
 const volPerRootSec=Math.max(Math.sqrt(quadratic/span),Math.abs(r30)/Math.sqrt(30)*.3,1e-8);
 // Require TWO independently observed fast windows opposing the 30s trend;
 // filter minor one-tick noise rather than assuming a confirmed reversal.
 const fastReversalAgainst30s=!!(five&&three&&r30!==0&&
   Math.sign(five.value)===Math.sign(three.value)&&
   Math.sign(five.value)===-Math.sign(r30)&&
   Math.abs(five.value)>=volPerRootSec*Math.sqrt(5)*.55);
 const trendSide=r30>0?'CALL':r30<0?'PUT':null;
 const fastSide=five?.value>0?'CALL':five?.value<0?'PUT':null;
 const rawZ=adjusted*h/(volPerRootSec*Math.sqrt(h));
 const shrunkZ=clamp(rawZ*.27,-.65,.65);
 const pCall=clamp(sigmoid(1.5*shrunkZ),.275,.725),pPut=1-pCall;
 const b=Number(payout);
 const payoutFrac=b>1&&b<=100?b/100:b;
 const verifiedPayout=Number.isFinite(payoutFrac)&&payoutFrac>0&&payoutFrac<=1;
 // A decision is allowed with an early technical estimate, but NOT certified
 // as profitable. The threshold is merely a conservative preliminary filter.
 const threshold=verifiedPayout?Math.max(.59,1/(1+payoutFrac)+.02):.61;
 const side=pCall>threshold?'CALL':pPut>threshold?'PUT':null;
 return {ready:side!==null,side,reason:side?'preliminary-short-probability':'no-preliminary-directional-advantage',
  pCall,pPut,threshold,horizonSeconds:h,historySeconds:Math.round(span),quoteCount:recent.length,
  source:'parametric-unvalidated',calibrated:false,driftPerSecond,volPerRootSec,
  fastReversalAgainst30s,trendSide,fastSide};
}

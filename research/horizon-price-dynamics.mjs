// Offline hypothesis: fit one-second price dynamics and project to the actual
// expiry. A fitted expectation is not a calibrated directional probability.
// Window = existing 180s retention; cadence = source video's coarse 1Hz.
// No labels, order placement, clock buckets, or new operation timers.
export function horizonPriceDynamics({quoteHistory=[],quoteAt,price,now=quoteAt,durationMs=30000}={}){
 const no=reason=>({ready:false,side:null,reason});
 if(![30000,60000].includes(durationMs)||!(Number.isFinite(price)&&price>0&&quoteAt>0&&quoteAt<=now&&now-quoteAt<=1450))return no('invalid-horizon-or-quote');
 const rows=quoteHistory.filter(q=>q.ts<=quoteAt&&(q.receivedAt??q.ts)<=now&&q.ts>=quoteAt-180000&&Number.isFinite(q.price)&&q.price>0).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==quoteAt||rows.at(-1)?.price!==price)return no('unverified-quote');
 const series=[];
 let j=rows.length-1;
 // Relative sampling is invariant to arbitrary wall-clock origin. Keep gaps;
 // previous observations may represent a grid point only within 500ms.
 for(let t=quoteAt;t>=Math.max(rows[0].ts,quoteAt-180000);t-=1000){
  while(j>=0&&rows[j].ts>t)j--;
  if(j>=0&&t-rows[j].ts<=500)series.push({at:t,observedAt:rows[j].ts,log:Math.log(rows[j].price)});
  else series.push({at:t,log:null});
 }
 series.reverse();
 const pairs=[];
 for(let i=1;i<series.length;i++){
  const a=series[i-1],b=series[i];
  if(a.log===null||b.log===null||b.observedAt<=a.observedAt)continue;
  pairs.push({x:a.log,y:b.log-a.log});
 }
 if(pairs.length<30)return no('insufficient-observed-dynamics');
 const mx=pairs.reduce((s,p)=>s+p.x,0)/pairs.length,my=pairs.reduce((s,p)=>s+p.y,0)/pairs.length;
 const xx=pairs.reduce((s,p)=>s+(p.x-mx)**2,0);
 if(!(xx>0))return no('flat-observed-dynamics');
 const xy=pairs.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0);
 // Stable AR(1) level dynamics. At the unit-root boundary this becomes a
 // drift process; a fitted explosive coefficient cannot compound a trend.
 const b=Math.max(-1,Math.min(0,xy/xx)),phi=1+b;
 const horizon=durationMs/1000,p=Math.log(price);
 const geometric=phi===1?horizon:(1-phi**horizon)/(1-phi);
 const expectedLogMove=(my+b*(p-mx))*geometric;
 if(!Number.isFinite(expectedLogMove)||expectedLogMove===0)return no('neutral-horizon-expectation');
 const predictedPrice=price*Math.exp(expectedLogMove);
 if(!(Number.isFinite(predictedPrice)&&predictedPrice>0))return no('invalid-price-expectation');
 return {ready:true,side:expectedLogMove>0?'CALL':'PUT',reason:'research-fitted-expiry-price-dynamics',
  observedAt:quoteAt,entryPrice:price,predictedPrice,expectedLogMove,horizonMs:durationMs,
  fittedPersistence:phi,fittedOneSecondDrift:my,observedPairs:pairs.length};
}

// Exact helper and range function extracted from 36a7dcca579ff5da33b307c34c9467cfd2d16e44. Test-only reference.
function before(quotes,at,maxAgeMs=3500){
 for(let i=quotes.length-1;i>=0;i--)if(quotes[i].ts<=at)
  return at-quotes[i].ts<=maxAgeMs?quotes[i]:null;
 return null;
}

export function completedRangeStructure(quotes,now,noise,spot,holdingMs=30000){
 const period=5000,end=Math.floor(now/period)*period;
 const last=quotes.filter(q=>q.ts>=end-135000&&q.ts<=now);
 if(last.length<50||last.at(-1).ts-last[0].ts<50000)return null;
 // Bucket real observed ticks once. Scanning the entire 135-second
 // tape again for every 5-second bar was a quadratic hot path on each tick.
 // Preserve the exact candle boundaries, ordering and evidence requirements.
 const observedByBar=new Map();
 for(const q of last){
  if(q.ts<end-130000||q.ts>=end)continue;
  const bin=Math.floor(q.ts/period)*period;
  if(!observedByBar.has(bin))observedByBar.set(bin,[]);
  observedByBar.get(bin).push(q);
 }
 const closes=[];
 for(let t=end-130000;t<end;t+=period){
  const part=observedByBar.get(t)||[];
  if(part.length<2||part[0].ts-t>3000||
    t+period-part.at(-1).ts>3500||
    part.some((q,i)=>i>0&&q.ts-part[i-1].ts>3500))continue;
  closes.push({at:t,price:part.at(-1).price,log:Math.log(part.at(-1).price)});
 }
 if(closes.length<10)return null;
 // A directional trend with small pullbacks has high total path efficiency.
 // A long oscillation traverses both directions, returning near its origin.
 let travelled=0;
 for(let i=1;i<last.length;i++){
  if(last[i].ts-last[i-1].ts<=3500)
   travelled+=Math.abs(Math.log(last[i].price/last[i-1].price));
 }
 const net=Math.abs(Math.log(last.at(-1).price/last[0].price));
 const efficiency=travelled>0?net/travelled:1;
 // A noisy REAL downtrend can have very low 1-second path efficiency.
 // Distinguish net directional travel from alternating price extremes
 // using a causal 90-second linear-fit strength, not net/path alone.
 const regression=last.filter(x=>x.ts>=now-90000);
 let meanT=0,meanP=0;
 for(const q of regression){meanT+=(q.ts-now)/1000;meanP+=Math.log(q.price);}
 meanT/=regression.length;meanP/=regression.length;
 let xx=0,yy=0,xy=0;
 for(const q of regression){
  const x=(q.ts-now)/1000-meanT,y=Math.log(q.price)-meanP;
  xx+=x*x;yy+=y*y;xy+=x*y;
 }
 const trendFit=xx>0&&yy>0?xy*xy/(xx*yy):0;
 if(trendFit>=.70)return null;
 const pivots=[];
 for(let i=2;i<closes.length-2;i++){
  const near=[closes[i-2],closes[i-1],closes[i+1],closes[i+2]];
  const hi=closes[i].log>Math.max(...near.map(x=>x.log));
  const lo=closes[i].log<Math.min(...near.map(x=>x.log));
  if(hi||lo){
   const observed=last.filter(q=>q.ts>=closes[i-1].at&&q.ts<closes[i+2].at);
   pivots.push({at:closes[i].at,type:hi?'HIGH':'LOW',
     level:hi?Math.max(...observed.map(q=>Math.log(q.price))):
       Math.min(...observed.map(q=>Math.log(q.price)))});
  }
 }
 if(pivots.length<2)return null;
 if(pivots.length===2)return {ready:false,reason:'range-awaiting-third-confirmed-turn'};
 const recent=pivots.slice(-4),gaps=recent.slice(1).map((p,i)=>(p.at-recent[i].at)/1000);
 const sorted=[...gaps].sort((a,b)=>a-b),half=sorted[Math.floor(sorted.length/2)];
 const minGap=Math.min(...gaps),maxGap=Math.max(...gaps);
 // Established range boundaries come from ALREADY CONFIRMED past pivots.
 // Including the current price here made every new high its own resistance
 // and every new low its own support, mislabeling breakouts as reversals.
 const highs=pivots.filter(p=>p.type==='HIGH').slice(-2);
 const lows=pivots.filter(p=>p.type==='LOW').slice(-2);
 if(!highs.length||!lows.length)return null;
 const upper=Math.max(...highs.map(p=>p.level));
 const lower=Math.min(...lows.map(p=>p.level));
 const span=upper-lower;
 if(!(span>noise*1.10))return null;
 const boundaryTolerance=Math.max(noise*.10,span*.02);
 if(Math.log(spot)>upper+boundaryTolerance||Math.log(spot)<lower-boundaryTolerance)
   return null;
 const regular=gaps.length>=2&&half>=12&&half<=90&&
   minGap>=9&&(maxGap-minGap)/half<=.52&&
   recent.every((v,i)=>i===0||v.type!==recent[i-1].type);
 // Uneven pivots with a directional fit belong to the trend assessment,
 // not a counter-trend reversal or a blanket "irregular" waiting state.
 if(!regular&&trendFit>=.50)return null;
 // A confirmed oscillation retains its range identity even when a short
 // directional leg develops inside it. The October 22 escape caused trend
 // chasing near established extremes before the third-turn reaction.
 // For >=60s holds, do not enter a brief repeating swing whose observed
 // half-cycle is shorter than the intended broker outcome window.
 // This is a market-structure check, NOT an added timer or polling delay.
 if(regular&&Number(holdingMs)>=60000&&Number(holdingMs)/1000>half*1.35)
  return {ready:false,reason:'range-expiry-exceeds-observed-swing'};
 const position=(Math.log(spot)-lower)/span;
 // Confirm ACTUAL retreat from a recent extreme. Being at the upper bound
 // alone is not a PUT, and being at the lower bound alone is not a CALL.
 const recentTicks=last.filter(x=>x.ts>=now-6500);
 const lastFew=recentTicks.slice(-4),peak=Math.max(...recentTicks.map(q=>q.price));
 const trough=Math.min(...recentTicks.map(q=>q.price));
 const down=lastFew.slice(1).filter((x,i)=>x.price<lastFew[i].price).length;
 const up=lastFew.slice(1).filter((x,i)=>x.price>lastFew[i].price).length;
 const retreat= Math.log(peak/spot),bounce=Math.log(spot/trough);
 const minTurn=Math.max(noise*.045,span*.016);
 // Two small counter-ticks are not a current reversal if price has already
 // resumed its original direction. Both net recent movement and the latest
 // observed step must agree with the claimed turn. No extra collection wait.
 const turnBase=before(last,now-3000,2500);
 const turnMove=turnBase?Math.log(spot/turnBase.price):0;
 const previous=last.at(-2),lastStep=previous?Math.log(spot/previous.price):0;
 const highTurn=position>=.73&&retreat>=minTurn&&down>=2&&turnMove<0&&lastStep<=0;
 const lowTurn=position<=.27&&bounce>=minTurn&&up>=2&&turnMove>0&&lastStep>=0;
 if(highTurn||lowTurn){
 // Only protect actual turn SIGNALS. Keep WAIT and all previous
 // range-lifecycle classifications exactly as before.
 // A rising HH/HL or falling LH/LL sequence is a trending channel,
 // not a stationary range. A minor counter-tick at its extreme
 // must not become a protected opposite-side reversal.
 // This uses only previously confirmed 5s pivots; no timer, broker
 // request, added candle requirement or change to entry execution.
 if(highs.length===2&&lows.length===2){
  const minStep=Math.max(span*.06,noise*.15);
  const highStep=highs[1].level-highs[0].level;
  const lowStep=lows[1].level-lows[0].level;
  if((highStep>minStep&&lowStep>minStep)||
     (highStep< -minStep&&lowStep< -minStep))return null;
 }
  return {ready:true,side:highTurn?'PUT':'CALL',
  reason:'closed-range-extreme-reversal-confirmed',
  observedSwingSeconds:half,position,efficiency};
 }
 return {ready:false,reason:regular?'range-extreme-awaiting-confirmed-turn':
   'irregular-range-awaiting-current-turn'};
}

// Single read-only directional engine shared by every strategy.
// Uses only already-received live quotes. No second signal/voting engine,
// scheduled confirmation, new time gate, prediction of a guaranteed reversal,
// or broker command. All names describe evidence, not hit probabilities.
const sideOf=n=>n>0?'CALL':n<0?'PUT':null;
const logMove=(a,b)=>Math.log(a/b);
function at(rows,t,maxGap=1500){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=t)
  return t-rows[i].ts<=maxGap?rows[i]:null;
 return null;
}
export function sharedMarketBase({quoteHistory=[],quoteAt=null,price=null,now=Date.now(),
 durationMs=30000,selectedStrategy='automatic'}={}){
 const time=Number(quoteAt),spot=Number(price);
 const unavailable=reason=>({ready:false,reason,side:null,observedAt:time||null});
 if(!(time>0&&time<=now&&now-time<=2500&&spot>0))
  return unavailable('quote-unverified');
 const map=new Map();
 for(const value of quoteHistory){
  const ts=Number(value.ts),receivedAt=Number(value.receivedAt??ts),p=Number(value.price);
  if(!(ts>0&&ts<=time&&receivedAt>0&&receivedAt<=time&&ts>=time-100000&&p>0))continue;
  if(!map.has(ts))map.set(ts,{ts,price:p});
 }
 const rows=[...map.values()].sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==time||rows.at(-1).price!==spot)return unavailable('quote-unverified');
 const q2=at(rows,time-2000),q4=at(rows,time-4000),q6=at(rows,time-6000),
  q12=at(rows,time-12000),q22=at(rows,time-22000),q40=at(rows,time-40000);
 if(!q2||!q4||!q6||!q12||!q22)
  return unavailable('price-history-not-ready');
 const d2=logMove(spot,q2.price),d4=logMove(spot,q4.price),
  d6=logMove(spot,q6.price),d12=logMove(spot,q12.price),
  prior=logMove(q4.price,q22.price);
 const shortSide=sideOf(d2),short4Side=sideOf(d4),olderSide=sideOf(prior);
 // Noise is computed on observed quote-to-quote moves, not guessed from
 // a forming candle or smoothed future prices.
 let noiseSq=0,pairs=0;
 for(let i=1;i<rows.length;i++){
  if(rows[i].ts<time-22000)continue;
  const dt=(rows[i].ts-rows[i-1].ts)/1000;
  if(dt<=0||dt>3)continue;
  const r=logMove(rows[i].price,rows[i-1].price);
  noiseSq+=r*r/dt;pairs++;
 }
 const noise=pairs>=10?Math.sqrt(noiseSq/pairs)*Math.sqrt(4):null;
 if(!(noise>0))return unavailable('current-noise-unavailable');
 const recent=rows.filter(q=>q.ts>=time-40000);
 const high=Math.max(...recent.map(x=>x.price));
 const low=Math.min(...recent.map(x=>x.price));
 const span=high>low?logMove(high,low):0;
 const position=span>0?logMove(spot,low)/span:.5;
 // A new directional leg near a PRIOR extreme. The latest 2s and 4s
 // must point in the same direction and have already retreated from the
 // previously observed extreme. A mere slowing candle is NOT reversal.
 const turn=Boolean(shortSide&&shortSide===short4Side&&olderSide&&
  shortSide!==olderSide&&
  Math.abs(d4)>noise*.52&&Math.abs(d2)>noise*.22&&
  Math.sign(d2)===Math.sign(d4)&&
  ((shortSide==='CALL'&&position<.34)||(shortSide==='PUT'&&position>.66)));
 // Trend can also begin before all 4 old structure bars close.
 // Require a coherent direction on three intervals, not merely the last candle.
 const direction=shortSide===short4Side&&shortSide===sideOf(d6)?shortSide:null;
 const developing=Boolean(direction&&Math.abs(d4)>noise*.70&&
  Math.abs(d12)>noise*.9&&
  (!olderSide||olderSide===direction));
 // A sustained trend that has exhausted its acceleration should not get
 // relabelled "new trend" merely because its last closed candle was strong.
 const prev2=logMove(q2.price,q4.price);
 const surgeStillGrowing=Math.abs(d2)>=Math.abs(prev2)*.70;
 const early=turn||developing&&surgeStillGrowing;
 const side=turn?shortSide:developing&&surgeStillGrowing?direction:null;
 const marketPhase=turn?'new-turn':developing?'continuation':'unresolved';
 // Strategies modify context/interpretation; one central market direction
 // remains authoritative and cannot be vetoed by a second strategy.
 const autoStrategy=turn?'support_resistance':
  developing?'trend':'price_action';
 const usedStrategy=selectedStrategy==='automatic'?autoStrategy:selectedStrategy;
 return {ready:early,side,reason:turn?'observed-early-turn':early?'observed-early-continuation':'base-structure',
  observedAt:time,entryPrice:side?spot:null,expirySeconds:Number(durationMs)/1000,
  observedNetMove:d12,observedImpulse:d2,pricePosition:position,
  noise,marketPhase,contextStrategy:usedStrategy,signalOwner:'shared-market-base'};
}

// Causal horizon proof for a historical level REJECTION, not a direction predictor.
// The 2-6 second wick is a *candidate*: authority requires a real observed
// follow-through appropriate to the actual selected broker settlement horizon.
// No timers, loops awaiting completion, browser calls, forecast probabilities,
// future quotations, position instructions or changes to actual broker expiry.
const WINDOWS=Object.freeze({
 5000:[1,2,3],15000:[2,4,7],30000:[3,6,12],
 60000:[4,10,20],120000:[5,15,35],300000:[6,20,60]
});
const sign=s=>s==='CALL'?1:s==='PUT'?-1:0;
const median=a=>{const v=[...a].sort((x,y)=>x-y);return v[Math.floor(v.length/2)]??0};
const point=(rows,t,ageMs)=>{
 for(let i=rows.length-1;i>=0;i--)
  if(rows[i].ts<=t)return t-rows[i].ts<=ageMs?rows[i]:null;
 return null;
};
export function proveLevelRejectionAtExpiry({quoteHistory=[],quoteAt,now=quoteAt,price,
 durationMs,side,zone,atr,tolerance}={}){
 const periods=WINDOWS[Number(durationMs)],dir=sign(side),
  at=Number(quoteAt),clock=Number(now),spot=Number(price),
  tol=Number(tolerance),vol=Number(atr);
 const unknown=(reason)=>({confirmed:false,reason,kind:'unverified',
  durationMs:Number(durationMs),windows:periods||null});
 if(!periods||!dir||!Number.isFinite(spot)||spot<=0||
    !(at>0&&clock>=at&&clock-at<=2500&&tol>0&&vol>0))
  return unknown('incomplete-causal-input');
 const span=periods[2]*1000,maxAge=Number(durationMs)<=15000?1500:2500;
 const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(x=>
   Number(x?.ts)>=at-span-maxAge&&Number(x?.ts)<=at&&
   Number(x?.receivedAt??x.ts)<=clock&&Number(x?.price)>0
 ).map(x=>({ts:Number(x.ts),price:Number(x.price)}))
  .sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==at||rows.at(-1)?.price!==spot)
  return unknown('unverified-last-quote');
 const anchors=periods.map(s=>point(rows,at-s*1000,maxAge));
 if(anchors.some(x=>!x))return unknown('missing-past-horizon');
 const walk=rows.filter(x=>x.ts>=at-span);
 const maxGap=Number(durationMs)<=15000?1700:3500;
 if(walk.some((x,i)=>i>0&&x.ts-walk[i-1].ts>maxGap))
  return unknown('unobserved-quote-gap');
 const diffs=walk.slice(1).map((x,i)=>Math.abs(x.price-walk[i].price)).filter(n=>n>0);
 if(diffs.length<3)return unknown('too-few-changes');
 const tick=Math.max(median(diffs),spot*1e-8);
 const moves=anchors.map(x=>dir*(spot-x.price));
 const zLevel=Number(zone?.level);
 const zoneConfirmed=Number(zone?.confirmedPivots)>0||
  Number(zone?.independentRejections)>=2;
 const levelDeparture=dir*(spot-zLevel);
 const roomNeeded=Math.max(tol*1.25,tick*3);
 // Normalize required movement by AVAILABLE real seconds; a one-second
 // window cannot travel two median one-second steps in a steady market.
 const latest=walk.at(-2);
 const lastStep=latest?dir*(spot-latest.price):0;
 const lastDirection=lastStep>0&&
  moves[0]>=Math.max(tick*Math.min(2,periods[0])-.000000001,tol*.18);
 const expiryScale=Math.min(1,periods[2]/10);
 const extended=moves[1]>=Math.max(tick*Math.min(3,periods[1])-.000000001,tol*.65*expiryScale);
 const sustained=moves[2]>=Math.max(tick*Math.min(5,periods[2])-.000000001,tol*.95*expiryScale);
 // Reject an incidental wick even at a historically strong level. Price has
 // to have MOVED away from it, not merely touched it at this instant.
 const validLevel=zoneConfirmed&&Number.isFinite(zLevel)&&
    levelDeparture>=roomNeeded;
 const confirmed=validLevel&&lastDirection&&extended&&sustained;
 return {confirmed,kind:confirmed?'sustained-level-reversal':'provisional-reaction',
  reason:confirmed?'causal-multihorizon-followthrough':
   !zoneConfirmed?'level-without-independent-pivot':
   !validLevel?'not-away-from-confirmed-level':
   !lastDirection?'last-move-not-supporting':
   !extended?'medium-path-not-supporting':'holding-path-not-supporting',
  durationMs:Number(durationMs),windows:periods,moves,
  provenLevel:zoneConfirmed,levelDeparture,
  // Absolute units and age retained for per-entry research, not win probability.
  observedTypicalStep:tick
 };
}

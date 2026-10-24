// Causal horizon proof for a historical level REJECTION, not a direction predictor.
// The 2-6 second wick is a *candidate*: authority requires a real observed
// follow-through appropriate to the actual selected broker settlement horizon.
// No timers, loops awaiting completion, browser calls, forecast probabilities,
// future quotations, position instructions or changes to actual broker expiry.
const WINDOWS=Object.freeze({
 5000:[1,2,3],10000:[2,3,5],15000:[2,4,7],30000:[3,6,12],
 60000:[4,10,20],120000:[5,15,35],300000:[6,20,60]
});
const sign=s=>s==='CALL'?1:s==='PUT'?-1:0;
const median=a=>{const v=[...a].sort((x,y)=>x-y);return v[Math.floor(v.length/2)]??0};
const point=(rows,t,ageMs)=>{
 for(let i=rows.length-1;i>=0;i--)
  if(rows[i].ts<=t)return t-rows[i].ts<=ageMs?rows[i]:null;
 return null;
};
// A 5s-30s option can observe a legitimate completed micro-pivot well
// before a long fixed-duration lookback exists. Preserve that proven
// support/resistance turn rather than misclassifying it as a 60s trend.
// Neither historical labels nor a last-tick bounce alone are sufficient.
function provenLocalTurn({rows,at,spot,side,zone,tol,durationMs}){
 if(!(Number(durationMs)<=30000&&Number(durationMs)>=5000))return null;
 const dir=sign(side);
 const recent=rows.filter(x=>x.ts>=at-10000);
 if(recent.length<7||recent.at(-1).ts!==at||
    recent.at(-1).ts-recent[0].ts<6000)return null;
 if(recent.some((x,i)=>i>0&&x.ts-recent[i-1].ts>1700))return null;
 const changes=recent.slice(1).map((q,i)=>Math.abs(q.price-recent[i].price)).filter(x=>x>0);
 if(changes.length<5)return null;
 const tick=Math.max(median(changes),spot*1e-8);
 const level=Number(zone?.level);
 const confirmedLevel=Number(zone?.confirmedPivots)>0||
  Number(zone?.independentRejections)>=2;
 if(!confirmedLevel||!(level>0))return null;
 let pivot=0;
 for(let i=1;i<recent.length;i++)
  if(dir*recent[i].price<dir*recent[pivot].price)pivot=i;
 if(pivot<2||pivot>recent.length-3)return null;
 const approach=dir*(recent[pivot].price-recent[0].price);
 const departure=dir*(spot-recent[pivot].price);
 const step=dir*(spot-recent.at(-2).price);
 const room=dir*(spot-level);
 const minMove=Math.max(tick*.85,tol*.3);
 if(!(approach<=-minMove*1.5&&departure>=minMove&&step>=0&&
   room>=Math.max(tol*.5,tick*.75)&&
   Math.abs(recent[pivot].price-level)<=Math.max(tol*2,tick*2)))return null;
 return {confirmed:true,kind:'observed-local-pivot-reversal',
  reason:'causal-approach-and-departure-confirmed',
  durationMs:Number(durationMs),windows:[0,0,6],moves:[departure],
  priorApproachMove:approach,approachVerified:true,
  provenLevel:true,levelDeparture:room,observedTypicalStep:tick,
  pivotConfirmedAt:recent[pivot+1].ts};
}
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
 // The same CAUSAL structure applies to EVERY supported expiry: an observed
 // approach toward a proven level in the opposing direction, followed by
 // departure from that level. The windows scale to each selected duration,
 // rather than importing 60-second thresholds into short trades.
 // This must never query the broker, wait for extra data or change an
 // independently qualified entry already produced by another market module.
 const span=periods[2]*1000,maxAge=Number(durationMs)<=15000?1500:2500;
 const scanSpan=span*2;
 // Quote history is already chronological in the local broker driver.
 // Inspect only the recent window backwards, without sorting/copying the
 // whole 6,000-tick tape on every candidate (would slow the chart).
 const source=Array.isArray(quoteHistory)?quoteHistory:[];
 const rows=[];let lastTimestamp=Infinity;
 for(let i=source.length-1;i>=0;i--){
  const x=source[i],ts=Number(x?.ts);
  if(ts<at-scanSpan-maxAge)break;
  if(!Number.isFinite(ts)||ts>lastTimestamp)
    return unknown('unordered-quote-history');
  lastTimestamp=ts;
  const received=Number(x?.receivedAt??ts),p=Number(x?.price);
  if(ts<=at&&received<=clock&&p>0&&Number.isFinite(p))
   rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.at(-1)?.ts!==at||rows.at(-1)?.price!==spot)
  return unknown('unverified-last-quote');
 // The short local-pivot exception exists ONLY when the longer sampling
 // history genuinely has not accumulated yet (e.g. immediately after an
 // asset switch). If the frame exists but has gaps/late quotes, do not
 // bypass its failed continuity checks through the short-window rule.
 const fullHistoryAvailable=!!point(rows,at-scanSpan,maxAge);
 const localTurn=!fullHistoryAvailable?provenLocalTurn({rows,at,spot,side,zone,tol,durationMs}):null;
 const anchors=periods.map(s=>point(rows,at-s*1000,maxAge));
 if(anchors.some(x=>!x))return localTurn||unknown('missing-past-horizon');
 const walk=rows.filter(x=>x.ts>=at-span);
 const maxGap=Number(durationMs)<=15000?1700:3500;
 if(walk.some((x,i)=>i>0&&x.ts-walk[i-1].ts>maxGap))
  return unknown('unobserved-quote-gap');
 const diffs=walk.slice(1).map((x,i)=>Math.abs(x.price-walk[i].price)).filter(n=>n>0);
 if(diffs.length<3)return unknown('too-few-changes');
 const tick=Math.max(median(diffs),spot*1e-8);
 const moves=anchors.map(x=>dir*(spot-x.price));
 // Price movement in the last holding-aware segment means very little
 // without a witnessed opposing approach before the turn. The candidate
 // must show BOTH legs using already received chronological quotes.
 const startAt=at-scanSpan,middleAt=at-span;
 const past=point(rows,startAt,maxAge),turnStart=anchors[2];
 const approach=rows.filter(x=>x.ts>=startAt&&x.ts<=middleAt);
 let approachMove=null;
 const minimumApproachSamples=Number(durationMs)<=5000?2:
   Number(durationMs)<=15000?3:5;
 const maximumGap=Number(durationMs)<=15000?1700:3500;
 let approachVerified=!!past&&!!turnStart&&
  approach.length>=minimumApproachSamples&&
  approach.every((q,i)=>i===0||q.ts-approach[i-1].ts<=maximumGap);
 if(approachVerified){
  approachMove=dir*(turnStart.price-past.price);
  const required=Math.max(tick*Math.min(2,span/1000),tol*.35*Math.min(1,span/10000));
  approachVerified=approachMove<=-required;
 }
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
 const confirmed=validLevel&&lastDirection&&extended&&sustained&&approachVerified;
 if(!confirmed&&localTurn)return localTurn;
 return {confirmed,kind:confirmed?'sustained-level-reversal':'provisional-reaction',
  reason:confirmed?'causal-multihorizon-followthrough':
   !zoneConfirmed?'level-without-independent-pivot':
   !validLevel?'not-away-from-confirmed-level':
   !lastDirection?'last-move-not-supporting':
   !extended?'medium-path-not-supporting':
   !sustained?'holding-path-not-supporting':'prior-opposing-approach-not-confirmed',
  durationMs:Number(durationMs),windows:periods,moves,
  // Only scalar evidence; no extra browser work, credentials or quote logging.
  priorApproachMove:approachMove,approachVerified,
  provenLevel:zoneConfirmed,levelDeparture,
  // Absolute units and age retained for per-entry research, not win probability.
  observedTypicalStep:tick
 };
}

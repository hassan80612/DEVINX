// Shared, synchronous, broker-read-only final guard. A strategy may identify
// a candidate reaction, but only the market base can authorize its direction.
// Uses completed 5-second bars from already received, timestamped quotes;
// adds no broker request, timer, waiting candle, or click path.
import {currentQuoteStructureTurn} from './observed-level-sequence.mjs';
import {verifiedFastLevelReversal} from './fast-level-reversal.mjs';
// A 30s/1m reversal must not need the 3rd completed 5s pivot AFTER the price
// already rejected a proven historical wall. Verify the recorded FIRST
// counter-move against ACTUAL quote receipts, not a reason label. This is
// deliberately narrower than relaxing the ordinary trend/pivot veto.
export function verifiedFirstQuoteTurnAtLevel({
  reversalEvidence:e,quoteHistory=[],quoteAt,price,side,now=quoteAt,durationMs
}={}){
 if(![30000,60000].includes(Number(durationMs))||e?.kind!=='confirmed-level-structure-reversal'||
    e?.side!==side||!['CALL','PUT'].includes(side)||
    !e?.microTurn||!e?.earlyLevelProof)return false;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),
  tol=Number(e.earlyLevelProof.tolerance),level=e.level||{},turn=e.microTurn,
  d=side==='CALL'?1:-1;
 if(!(at>0&&clock>=at&&clock-at<=(Number(durationMs)===30000?1450:1950)&&spot>0&&tol>0&&
   Number(e.confirmedAt)===at&&Number(turn.observedAt)===at&&
   Number(level.level)>0&&Number(level.independentTests)>=2&&
   Number(level.oldestTestAge)>=10&&
   Number(level.directionalPivots)>=1&&
   (Number(level.directionalPivots)>=2||Number(level.directionalRejections)>=1)))return false;
 const extremeAt=Number(turn.extremeAt),extreme=Number(turn.extreme);
 if(!(extremeAt>=at-8000&&extremeAt<=at-1800&&extreme>0&&
   Number.isFinite(Number(level.low))&&Number.isFinite(Number(level.high))&&
   extreme>=Number(level.low)-tol*.55&&extreme<=Number(level.high)+tol*.55&&
   d*(spot-extreme)>=(e.earlyLevelProof.source==='terminal-spike-first-wave-239'?tol*.18:
    e.earlyLevelProof.source==='independent-first-wave-237'?tol*.28:tol*.55)&&
   d*(spot-extreme)<=tol*1.7&&
   d*(spot-Number(level.level))>=-tol*.35&&
   d*(spot-Number(level.level))<=tol*1.7))return false;
 const rows=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
   const q=quoteHistory[i],ts=Number(q?.ts),recv=Number(q?.receivedAt??ts),p=Number(q?.price);
   if(ts<at-9000)break;
   if(ts>at||recv>clock)continue;
   if(!(ts>0&&p>0&&Number.isFinite(p)))return false;
   rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.length<7||rows.at(-1).ts!==at||rows.at(-1).price!==spot||
   rows.some((q,i)=>i>0&&(q.ts<=rows[i-1].ts||q.ts-rows[i-1].ts>2500)))return false;
 const touch=rows.find(q=>q.ts===extremeAt&&q.price===extreme);
 if(!touch)return false;
 // The lower .18 tolerance for a terminal spike is valid ONLY when
 // the historical barrier has at least two independent rejections AND
 // the recorded approach really accelerated into it before the turn.
 if(e.earlyLevelProof.source==='terminal-spike-first-wave-239'){
  if(Number(level.directionalRejections)<2)return false;
  const idx=rows.findIndex(q=>q.ts===extremeAt&&q.price===extreme);
  if(idx<3)return false;
  const past=rows[Math.max(0,idx-3)],origin=rows[0];
  const burst=-d*(extreme-past.price),approach=-d*(extreme-origin.price);
  if(!(burst>=tol*.42&&approach>=tol*.75&&burst>=approach*.32))
   return false;
 }
 const last=rows.at(-1),prev=rows.at(-2),before=rows.at(-3);
 if(!(prev.ts>extremeAt&&d*(last.price-prev.price)>0&&
       d*(prev.price-before.price)>0))return false;
 // A genuine historical rejection, not a breakout through the old wall.
 const after=rows.filter(q=>q.ts>=extremeAt);
 if(after.some(q=>d>0?q.price<Number(level.low)-tol*.48:
                         q.price>Number(level.high)+tol*.48))return false;
 return true;
}

export function countertrendPivotRisk({quoteHistory=[],quoteAt,price,side,now=quoteAt,reversalEvidence=null,durationMs=30000}={}){
 const ts=Number(quoteAt),spot=Number(price),clock=Number(now);
 const levelTurn=['failed-breakout-structure-change','confirmed-level-structure-reversal'].includes(reversalEvidence?.kind)&&
  reversalEvidence.side===side&&Number(reversalEvidence.confirmedAt)<=ts&&
  clock-Number(reversalEvidence.confirmedAt)<=1450&&
  (Number(reversalEvidence.level?.confirmedPivots)>0||Number(reversalEvidence.level?.independentRejections)>=2);
 if(!['CALL','PUT'].includes(side)||!(ts>0&&spot>0&&clock>=ts&&clock-ts<=2500))return false;
 if(verifiedFastLevelReversal({reversalEvidence,quoteHistory,quoteAt,price,side,now,durationMs}))return false;
 if(verifiedFirstQuoteTurnAtLevel({reversalEvidence,quoteHistory,quoteAt,price,side,now,durationMs}))return false;
 const end=Math.floor(ts/5000)*5000;
 const bucket=new Map();
 for(const q of quoteHistory){
  const t=Number(q?.ts),received=Number(q?.receivedAt??t),p=Number(q?.price);
  if(!(t>=end-120000&&t<end&&received<=clock&&p>0&&t<=ts))continue;
  const from=Math.floor(t/5000)*5000;
  let b=bucket.get(from);
  if(!b){b={from,to:from+5000,firstAt:t,lastAt:t,open:p,high:p,low:p,close:p};bucket.set(from,b)}
  else{b.high=Math.max(b.high,p);b.low=Math.min(b.low,p);if(t<b.firstAt){b.firstAt=t;b.open=p}if(t>=b.lastAt){b.lastAt=t;b.close=p}}
 }
 const ordered=[...bucket.values()].sort((a,b)=>a.from-b.from)
   .filter(b=>b.firstAt-b.from<=2500&&b.to-b.lastAt<=2500);
 let start=0;
 for(let i=1;i<ordered.length;i++)if(ordered[i].from!==ordered[i-1].to)start=i;
 const bars=ordered.slice(start);
 if(bars.length<10)return false;
 const highs=[],lows=[];
 for(let i=2;i<bars.length-2;i++){
  const b=bars[i],near=[bars[i-2],bars[i-1],bars[i+1],bars[i+2]];
  if(near.every(n=>b.high>n.high))highs.push({price:b.high,at:b.to});
  if(near.every(n=>b.low<n.low))lows.push({price:b.low,at:b.to});
 }
 // A one-way trend need not produce two local highs AND two lows.
 // Use only completed 5s bars already received. No extra wait or polling.
 const trail=bars.slice(-13);
 if(trail.length>=11){
  const moves=trail.slice(1).map((b,i)=>b.close-trail[i].close);
  const net=trail.at(-1).close-trail[0].open;
  const sign=Math.sign(net);
  const aligned=moves.filter(v=>sign*v>0).length;
  const gross=moves.reduce((total,v)=>total+Math.abs(v),0);
  const efficiency=gross>0?Math.abs(net)/gross:0;
  const absMoves=moves.map(Math.abs).sort((a,b)=>a-b);
  const typical=absMoves[Math.floor(absMoves.length/2)]||0;
  if(sign!==0&&aligned>=Math.ceil(moves.length*.75)&&
     efficiency>=.76&&Math.abs(net)>=typical*7){
   const extreme=sign>0?
     Math.max(spot,...trail.map(b=>b.high)):
     Math.min(spot,...trail.map(b=>b.low));
   const progress=sign*(extreme-trail[0].open);
   const retreat=Math.max(0,sign*(extreme-spot));
   // Veto only a shallow countertrend entry. A substantive price
   // retreat remains eligible as a genuine reversal candidate.
   if(progress>typical*5&&retreat<=progress*.18&&
      ((sign>0&&side==='PUT')||(sign<0&&side==='CALL')))
    return !(levelTurn&&currentQuoteStructureTurn({quoteHistory,quoteAt,price,side,now}));
  }
 }
 if(highs.length<2||lows.length<2)return false;
 const h0=highs.at(-2).price,h1=highs.at(-1).price;
 const l0=lows.at(-2).price,l1=lows.at(-1).price;
 const changes=bars.slice(1).map((b,i)=>Math.abs(b.close-bars[i].close)).sort((a,b)=>a-b);
 const mid=changes[Math.floor(changes.length/2)]||0;
 const span=Math.max(...bars.map(b=>b.high))-Math.min(...bars.map(b=>b.low));
 const minStep=Math.max(spot*1e-8,span*.035,mid*.28);
 const tolerance=Math.max(spot*1e-8,mid*.35);
 // Clear HH + HL: do not sell a tiny pullback as a confirmed TOP.
 if(h1-h0>minStep&&l1-l0>minStep&&side==='PUT'&&spot>=l1-tolerance)
   return !(levelTurn&&currentQuoteStructureTurn({quoteHistory,quoteAt,price,side,now}));
 // Clear LH + LL: do not buy a tiny rebound as a confirmed BOTTOM.
 if(h1-h0< -minStep&&l1-l0< -minStep&&side==='CALL'&&spot<=h1+tolerance)
   return !(levelTurn&&currentQuoteStructureTurn({quoteHistory,quoteAt,price,side,now}));
 return false;
}

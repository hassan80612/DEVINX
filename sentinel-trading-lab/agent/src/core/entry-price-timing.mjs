// Assess the PRICE of a currently qualified short entry. No pending review state.
// Candle seconds, reason labels and uncalibrated probabilities grant no bypass.
// All data come from the existing feed; there are no timers or broker reads.
import {currentQuoteStructureTurn} from './observed-level-sequence.mjs';
import {verifiedFastLevelReversal} from './fast-level-reversal.mjs';
import {proveLevelRejectionAtExpiry} from './causal-level-rejection-proof.mjs';
const dir=s=>s==='CALL'?1:s==='PUT'?-1:0;
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]||0;};
function tape(history,at,now,price){
 const rows=[];
 for(let i=history.length-1;i>=0;i--){
  const q=history[i],ts=Number(q?.ts),p=Number(q?.price);
  if(ts<at-75000)break;
  if(ts>at||Number(q.receivedAt??ts)>now)continue;
  if(!(p>0&&Number.isFinite(p)&&Number.isFinite(ts)))return null;
  rows.push({ts,price:p});
 }
 rows.reverse();
 if(rows.at(-1)?.ts!==at||rows.at(-1)?.price!==price||
  rows.some((q,i)=>i&&(q.ts<=rows[i-1].ts||q.ts-rows[i-1].ts>2500)))return null;
 return rows;
}
function atOrBefore(rows,t){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=t)
  return t-rows[i].ts<=2000?rows[i]:null;
 return null;
}
export function stretchedImpulse({quoteHistory=[],quoteAt,now=quoteAt,price,side}={}){
 const at=Number(quoteAt),spot=Number(price),d=dir(side);
 if(!d||!(at>0&&now>=at&&now-at<=1950&&spot>0))return null;
 const rows=tape(quoteHistory,at,now,spot);
 if(!rows||rows.length<25)return null;
 const recent=atOrBefore(rows,at-5000),base=atOrBefore(rows,at-20000);
 if(!recent||!base)return null;
 // Compare equal five-second movements. Tick frequency cannot change scale.
 const baseline=[];
 for(let s=25;s<=65;s+=5){
  const a=atOrBefore(rows,at-s*1000),b=atOrBefore(rows,at-(s-5)*1000);
  if(a&&b)baseline.push(Math.abs(b.price-a.price));
 }
 if(baseline.length<6)return null;
 const typical=Math.max(median(baseline),spot*1e-8);
 const burst=d*(spot-recent.price),leg=d*(spot-base.price);
 const local=rows.filter(q=>q.ts>=base.ts);
 const peak=local.reduce((a,b)=>d*(b.price-a.price)>0?b:a);
 // Review the accumulated extension, even when the final five seconds
 // have already slowed. Requiring another fresh burst here missed the
 // late end of an otherwise unusually large observed twenty-second leg.
 if(leg<typical*6||d*(peak.price-spot)>typical*.5)return null;
 return {kind:'extended-current-impulse',side,startedAt:base.ts,
  originPrice:base.price,peakPrice:peak.price,typicalMove:typical,burst,leg};
}

// Reuse a reversal's own CURRENT price confirmation, not its reason label.
// A structural break must still be close to the first crossing. A large jump
// beyond that trigger remains late, even if the direction itself is valid.
function ownReversalConfirmation({candidate,rows,proof,risk,side,at,now,spot,quoteHistory}){
 if(!risk||!rows)return null;
 const e=candidate.priceStructure?.confirmedReversal,d=dir(side);
 if(!e||e.side!==side||e.kind!==candidate.reason||
   !(e.confirmedAt<=at&&now-e.confirmedAt>=0&&now-e.confirmedAt<=1450))return null;
 if(e.kind==='confirmed-fast-level-reversal'){
  if(e.touchAt<=risk.startedAt||d*(spot-e.touchPrice)>risk.typicalMove*3)return null;
  return verifiedFastLevelReversal({reversalEvidence:e,quoteHistory,quoteAt:at,now,price:spot,side})?e:null;
 }
 if(e.kind!=='confirmed-level-structure-reversal'||!proof||
   proof.turnAt<=risk.startedAt||proof.pivotPrice!==e.pivotPrice||proof.turnPrice!==e.turnPrice)return null;
 const first=rows.find(q=>q.ts>proof.turnAt&&d*(q.price-proof.pivotPrice)>proof.amplitude);
 if(first?.ts!==e.confirmedAt||
   d*(spot-proof.pivotPrice)>proof.amplitude+risk.typicalMove*.5)return null;
 return {...proof,confirmedAt:first.ts};
}

export function reviewEntryPrice({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 if(![30000,60000].includes(Number(durationMs))||candidate?.ready!==true||!dir(candidate.side))return candidate;
 const side=candidate.side,at=Number(quoteAt),spot=Number(price),d=dir(side);
 const risk=stretchedImpulse({quoteHistory,quoteAt,now,price,side});
 if(!risk)return candidate;
 const reaction=candidate.priceStructure?.reaction,levelProof=candidate.priceStructure?.reactionProof;
 if(candidate.reason==='historical-level-rejection'&&reaction?.kind==='rejection'&&reaction.side===side&&
   levelProof?.confirmed===true&&levelProof.side===side&&levelProof.observedAt===at&&
   proveLevelRejectionAtExpiry({quoteHistory,quoteAt:at,now,price:spot,durationMs,side,
    zone:reaction.zone,tolerance:levelProof.tolerance,atr:levelProof.atr}).confirmed)
  return {...candidate,entryTiming:{kind:'current-price-confirmed',proof:levelProof}};
 const rows=tape(quoteHistory,at,now,spot);
 const proof=currentQuoteStructureTurn({quoteHistory,quoteAt,now,price,side});
 const ownProof=ownReversalConfirmation({candidate,rows,proof,risk,side,at,now,spot,quoteHistory});
 // A current higher-low/lower-high plus its FIRST pivot break also supplies
 // the price confirmation for an already qualified continuation. A past
 // break or a jump far beyond the trigger is not a new entry opportunity.
 const first=proof&&rows.find(q=>q.ts>proof.turnAt&&d*(q.price-proof.pivotPrice)>proof.amplitude);
 const currentBreak=proof&&proof.turnAt>risk.startedAt&&first&&
  first.ts<=at&&now-first.ts<=1450&&
  d*(spot-proof.pivotPrice)<=proof.amplitude+risk.typicalMove*.5?{...proof,confirmedAt:first.ts}:null;
 if(ownProof||currentBreak)return {...candidate,entryTiming:{kind:'current-price-confirmed',proof:ownProof||currentBreak}};
 // Decline THIS quote. The next qualified quote is assessed afresh by the
 // common 160 engine, never stored, delayed, expired or automatically rearmed.
 return {...candidate,ready:false,side:null,provisionalSide:side,
  reason:'extended-move-without-current-entry-confirmation',entryTiming:{kind:'entry-price-already-extended',...risk}};
}

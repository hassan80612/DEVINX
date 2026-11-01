// Sentinel 13.9.213: independent, causal validation ONLY for previously weak
// entry families. The 207 impulse path and the 212 rapid-reversal / level
// breakout policies remain unchanged. This code never delays a trade,
// manufactures the opposite direction or touches broker expiry/execution.
import {currentQuoteStructureTurn} from './observed-level-sequence.mjs';

const SIDE=new Set(['CALL','PUT']);
const maxGap=2500;
const epoch=v=>Number(v)>0?(Number(v)<1e12?Number(v)*1000:Number(v)):0;
const noRisk=Object.freeze({blocked:false,kind:'hybrid-213-family-proof',reasons:[]});

export function evaluateHybridFamilyProof({candidate,quoteHistory=[],candles=[],
 quoteAt,now=quoteAt,price,durationMs}={}){
 // 30s, 5m, already confirmed fast reversals, 207 impulse and historical
 // breakout are never evaluated here.
 if(Number(durationMs)!==60000||candidate?.ready!==true||!SIDE.has(candidate.side)||
  !['confirmed-level-structure-reversal','failed-breakout-structure-change',
    'break-retest-continuation'].includes(candidate.reason))return noRisk;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(!(at>0&&clock>=at&&clock-at<=1950&&spot>0&&
  Number(candidate.observedAt)===at&&Number(candidate.entryPrice)===spot))return noRisk;
 const qs=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>{
  const t=Number(q?.ts),r=Number(q?.receivedAt??t),p=Number(q?.price);
  return Number.isFinite(t)&&t<=at&&t>=at-65000&&r<=clock&&p>0&&Number.isFinite(p);
 }).sort((a,b)=>Number(a.ts)-Number(b.ts));
 if(qs.length<5||Number(qs.at(-1).ts)!==at||Number(qs.at(-1).price)!==spot)return noRisk;
 const d=candidate.side==='CALL'?1:-1;
 if(candidate.reason==='break-retest-continuation'){
  // Only an independently confirmed *opposite* structural break can contradict
  // this retest. EMA opposition by itself incorrectly excluded a 207 WIN.
  const opposite=candidate.side==='CALL'?'PUT':'CALL';
  const turn=currentQuoteStructureTurn({quoteHistory:qs,quoteAt:at,now:clock,
    price:spot,side:opposite,durationMs});
  if(!turn||Number(turn.confirmedAt)!==at)return noRisk;
  return {blocked:true,kind:'hybrid-213-family-proof',
   reasons:['retest-contradicted-by-live-opposite-structure'],
   details:{opposite,confirmedAt:at}};
 }
 const target=at-60000;
 let prior=null;
 for(let i=qs.length-1;i>=0;i--){
  if(Number(qs[i].ts)<=target){
   if(target-Number(qs[i].ts)<=maxGap)prior=Number(qs[i].price);
   break;
  }
 }
 if(prior===null)return noRisk; // Missing evidence never creates a new veto.
 const minute=d*(spot-prior);
 // Only the 207 structural reversal needs closed-bar corroboration in addition
 // to the already-received one-minute tape. Opposing candles alone also occur
 // in WIN, so never apply that blanket gate.
 if(candidate.reason==='confirmed-level-structure-reversal'){
  const last=(Array.isArray(candles)?candles:[])
   .filter(c=>epoch(c?.to)>0&&epoch(c?.to)<=at&&
      epoch(c?.to)-epoch(c?.from)===60000&&
      Number(c?.receivedAt??0)<=clock&&
      Number.isFinite(Number(c?.open))&&Number.isFinite(Number(c?.close)))
   .sort((a,b)=>epoch(a.to)-epoch(b.to)).at(-1);
  if(!last||!(d*(Number(last.close)-Number(last.open))<0&&minute<=0))return noRisk;
  return {blocked:true,kind:'hybrid-213-family-proof',
   reasons:['structural-turn-against-last-closed-bar-and-minute'],
   details:{minuteMove:minute,closedBarTo:epoch(last.to)}};
 }
 // In the false-breakout family, the price must actually have recovered
 // direction over the previous full minute; a short favourable 5s bounce is
 // not by itself reliable proof of a sustained failed breakout.
 if(minute>0)return noRisk;
 return {blocked:true,kind:'hybrid-213-family-proof',
  reasons:['failed-breakout-without-minute-reclaim'],
  details:{minuteMove:minute}};
}

export function reviewHybridFamilyProof({candidate,...input}={}){
 const risk=evaluateHybridFamilyProof({candidate,...input});
 if(!risk.blocked)return candidate;
 return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
   reason:risk.reasons[0],entryRisk:risk};
}

// Keep the 207 final admission path literally unchanged for its two strongest
// reference families. Later 209 duplicate-opportunity policy is still
// evaluated for all remaining 212 families, including fast reversal.
export function usesLegacy207OpportunityAdmission(candidate){
 return candidate?.reason==='closed-structure-and-live-impulse'||
  candidate?.reason==='confirmed-level-structure-reversal';
}

// Review the PRICE of a short entry after an unusually extended impulse.
// Candle seconds, reason labels and uncalibrated probabilities grant no bypass.
// All data come from the existing feed; there are no timers or broker reads.
import {currentQuoteStructureTurn} from './observed-level-sequence.mjs';
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

export class LateImpulseReview{
 constructor(){this.context=null;this.pending=new Map();this.expiredQuotes=new Map();}
 review({candidate,context='',quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
  if(this.context!==context){this.context=context;this.pending.clear();this.expiredQuotes.clear();}
  // Expiry belongs to a candidate, never to an indefinitely locked side.
  // Run cleanup even when the analyst currently has no qualified candidate.
  const expired=new Map();
  for(const [side,state] of this.pending)if(Number(now)>=state.expiresAt){
   expired.set(side,state);this.pending.delete(side);
  }
  if(![30000,60000].includes(Number(durationMs)))return candidate;
  const at=Number(quoteAt),spot=Number(price),side=candidate?.side,d=dir(side);
  if(candidate?.ready!==true||!d)return candidate;
  const ended=expired.get(side);
  if(ended){
   this.expiredQuotes.set(side,at);
   return {...candidate,ready:false,side:null,provisionalSide:side,
    reason:'candidato-de-impulso-expirado',entryTimingReview:{...ended,phase:'expired'}};
  }
  // Replaying the exact same market observation cannot restart that window.
  // A newer candidate is evaluated from CURRENT risk with no inherited lock.
  if(this.expiredQuotes.get(side)===at)return {...candidate,ready:false,side:null,
   provisionalSide:side,reason:'candidato-de-impulso-expirado',
   entryTimingReview:{phase:'expired',observedAt:at}};
  this.expiredQuotes.delete(side);
  const risk=stretchedImpulse({quoteHistory,quoteAt,now,price,side});
  let state=this.pending.get(side);
  // A full return to the pre-impulse price ends that leg, rather than keeping
  // its old WAIT alive. A newly qualified candidate gets its own evaluation.
  if(state&&d*(spot-state.originPrice)<=0){this.pending.delete(side);state=null;}
  if(!state&&!risk)return candidate;
  const proof=currentQuoteStructureTurn({quoteHistory,quoteAt,now,price,side});
  const rows=tape(quoteHistory,at,now,spot);
  const deadline=Number(durationMs)===30000?9000:14000;
  if(!state){
   // Even a genuine pivot break can arrive after a large price jump. An
   // earlier retest must not exempt the price of THIS stretched candidate.
   state={...risk,detectedAt:at,expiresAt:at+deadline};
   this.pending.set(side,state);
  }
  const block=(phase,reason)=>({...candidate,ready:false,side:null,
   provisionalSide:side,reason,entryTimingReview:{...state,phase}});
  if(!rows)return block('waiting-price','impulso-estendido-aguardando-preco-observado');
  // Never carry a confirming pivot across a feed gap.
  const after=rows.filter(q=>q.ts>=state.detectedAt);
  const turn=after.reduce((a,b)=>d*(b.price-a.price)<0?b:a,after[0]);
  const last=rows.at(-2),previous=rows.at(-3);
  const pullback=turn?d*(state.peakPrice-turn.price):0;
  // The frozen impulse high/low is a real pivot after a material pullback.
  // It needs no third historical swing when that preceding impulse itself
  // supplies the first leg. Two advancing received prices confirm the break.
  const retest=turn&&last&&previous&&turn.ts>state.detectedAt&&
   pullback>=state.typicalMove*.6&&pullback<=state.leg*.65&&
   d*(spot-state.peakPrice)>state.typicalMove*.2&&
   d*(spot-last.price)>0&&d*(last.price-previous.price)>0?
   {side,pivotAt:state.detectedAt,pivotPrice:state.peakPrice,
    turnAt:turn.ts,turnPrice:turn.price,confirmedAt:at}:null;
  const structural=proof&&proof.turnAt>state.detectedAt&&
   proof.pivotAt>=state.detectedAt&&d*(spot-state.peakPrice)>0?proof:null;
  const freshBreak=retest||structural;
  if(freshBreak){
   this.pending.delete(side);
   return {...candidate,entryTimingReview:{phase:'price-confirmed',proof:freshBreak}};
  }
  return block('waiting-retest','impulso-estendido-aguardando-reteste-e-quebra-de-pivo');
 }
}

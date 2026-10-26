// Read-only, directional pivot-break evidence from already RECEIVED quotes.
// Only rejects a stale opposite trend entry when a previously established
// LH/LL or HH/HL sequence has actually broken its last counter-swing pivot.
// No opposite trade is fabricated; no timer, broker read or fixed wait.
import {observedSwings} from './observed-level-sequence.mjs';
const median=x=>{const a=[...x].sort((a,b)=>a-b);return a[Math.floor(a.length/2)]||0;};
export function oppositePivotBreakRisk({candidate,quoteHistory=[],quoteAt,now=quoteAt,price}={}){
 // A fresh confirmed reversal is authoritative. Only continuation and
 // ordinary trend projections can carry the outdated opposite-side bias.
 const protectedReversal=/reversal|rejection|structure-change|range-extreme|failed-breakout/.test(String(candidate?.reason||''))||
   candidate?.priceStructure?.confirmedReversal?.side===candidate?.side;
 if(candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side)||
   protectedReversal)return null;
 const ts=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(!(ts>0&&clock>=ts&&clock-ts<=1450&&spot>0&&
   Number(candidate.observedAt)===ts&&Number(candidate.entryPrice)===spot))return null;
 const sampled=new Map();
 for(const q of quoteHistory){
  const at=Number(q?.ts),received=Number(q?.receivedAt??at),p=Number(q?.price);
  if(!(at>=ts-80000&&at<=ts&&received<=clock&&p>0))continue;
  if(!sampled.has(at))sampled.set(at,{ts:at,price:p});
 }
 let rows=[...sampled.values()].sort((a,b)=>a.ts-b.ts);
 let contiguous=0;for(let i=1;i<rows.length;i++)if(rows[i].ts-rows[i-1].ts>2500)contiguous=i;
 rows=rows.slice(contiguous);
 if(rows.length<18||rows.at(-1).ts!==ts||rows.at(-1).price!==spot||
    rows.at(-1).ts-rows[0].ts<10000)return null;
 const tail=rows.slice(-90);
 const recentChanges=tail.slice(1).map((r,i)=>Math.abs(r.price-tail[i].price)).filter(x=>x>0);
 const typical=median(recentChanges);
 const amplitude=Math.max(spot*1e-8,typical*4);
 if(!(typical>0&&amplitude>0))return null;
 const turns=observedSwings(rows,amplitude);
 const highs=turns.filter(t=>t.kind==='high'),lows=turns.filter(t=>t.kind==='low');
 if(highs.length<2||lows.length<2)return null;
 const upBreak=candidate.side==='PUT',sign=upBreak?1:-1;
 const aH=highs.at(-2),bH=highs.at(-1),aL=lows.at(-2),bL=lows.at(-1);
 const preceding=upBreak?
  bH.price<aH.price-amplitude*.45&&bL.price<aL.price-amplitude*.45:
  bH.price>aH.price+amplitude*.45&&bL.price>aL.price+amplitude*.45;
 if(!preceding)return null;
 const pivot=upBreak?bH:bL;
 const threshold=pivot.price+sign*amplitude*.5;
 const beyond=q=>sign*(q.price-threshold)>0;
 if(!beyond(rows.at(-1)))return null;
 const crossing=rows.find((q,i)=>i>0&&q.ts>pivot.confirmedAt&&beyond(q)&&!beyond(rows[i-1]));
 if(!crossing||ts-crossing.ts>5000)return null;
 const follow=rows.filter(q=>q.ts>=crossing.ts&&beyond(q));
 if(follow.length<2||follow.at(-1).ts===follow[0].ts)return null;
 const last=rows.slice(-4);
 if(!(sign*(spot-last[0].price)>typical*.5&&
   sign*(spot-last.at(-2).price)>=0))return null;
 return {kind:'observed-opposite-swing-pivot-broken',
  candidateSide:candidate.side,observedSide:upBreak?'CALL':'PUT',
  pivot:pivot.price,breakAt:crossing.ts,amplitude};
}

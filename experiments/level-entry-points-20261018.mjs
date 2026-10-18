// Research-only event detector. No calls to a broker, runtime or database.
import {applyHistoricalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0;
function before(rows,at){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=at)return at-rows[i].ts<=2500?rows[i]:null;
 return null;
}
export function levelEntryPoints({structure,quoteHistory=[],quoteAt,now=quoteAt,price}={}){
 const ts=Number(quoteAt),spot=Number(price);
 if(!(ts>0&&ts<=now&&now-ts<=1450&&positive(spot))||!structure?.averages?.length||structure.asOf>now)return [];
 const rows=quoteHistory.filter(q=>q.ts<=ts&&q.ts>=ts-12000&&Number(q.receivedAt??q.ts)<=now&&positive(q.price)).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==ts||Number(rows.at(-1)?.price)!==spot)return [];
 const early=before(rows,ts-2000),origin=before(rows,ts-6000);
 if(!early||!origin||rows.length<3)return [];
 const out=[],tolerance=Math.max(structure.tolerance,spot*1e-8);
 const minReaction=Math.max(tolerance*.5,structure.atr*.025);
 const longMove=early.price-origin.price,shortMove=spot-early.price;
 const side=longMove>0?'CALL':longMove<0?'PUT':null,sgn=side==='CALL'?1:-1;
 const relevant=structure.zones.filter(z=>z.confirmedPivots==null?z.touches>=2||z.pivots>0:z.confirmedPivots>0||z.independentRejections>=2);
 const walls=relevant.filter(z=>sgn*(z.level-spot)>=0).sort((a,b)=>sgn*(a.level-b.level));
 const wall=walls[0];
 // Reuse the released near-wall pressure threshold (2s move < 4s / 4).
 // Require the approach itself to exceed the released reaction noise floor.
 if(side&&wall&&wall.touches>=2&&Math.abs(wall.level-spot)<=tolerance&&
  sgn*longMove>minReaction&&sgn*shortMove>=0&&Math.abs(shortMove)<Math.abs(longMove)/4)
  out.push({kind:'slowing-approach-to-level',side,level:wall.level,tolerance,longMove,shortMove,
   originAt:origin.ts,originPrice:origin.price});
 const observed=applyHistoricalPriceStructure({candidate:{ready:false,side:null},structure,
  quoteHistory:rows,quoteAt:ts,now,price:spot});
 const reaction=observed.priceStructure?.reaction;
 // Only use the module's top reaction if its own opposing-level check passed.
 if(reaction&&observed.ready&&observed.side===reaction.side){
  const approach=rows.filter(q=>q.ts>=origin.ts);
  const low=Math.min(...approach.map(q=>q.price)),high=Math.max(...approach.map(q=>q.price));
  const z=relevant.find(z=>z.level===reaction.zone.level);
  const currentApproachTouch=reaction.kind!=='rejection'?null:reaction.side==='CALL'?
   !!z&&low<=z.high+tolerance&&low>=z.low-tolerance*2:
   !!z&&high>=z.low-tolerance&&high<=z.high+tolerance*2;
  out.push({kind:reaction.kind==='breakout'?'detected-level-breakout':'detected-level-rejection',
   side:reaction.side,level:reaction.zone.level,tolerance,currentApproachTouch,
   originAt:origin.ts,originPrice:origin.price,longMove,shortMove});
 }
 return out;
}

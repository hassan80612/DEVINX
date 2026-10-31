// Causal one-minute continuation admission review. A signal can still point
// in the right direction but arrive after most of its recent excursion.
// Only veto an already-ready continuation; never infer a reversal, change
// expiry, wait, access the broker or use subsequent prices/outcomes.
import {entryFamilyOf} from './entry-family.mjs';

export const STRETCHED_CONTINUATION_POLICY=Object.freeze({
  durationMs:60000, quoteMaxAgeMs:1950, historyMs:60000,
  minimumSamples:40, extremeFraction:.10, twentySecondRangeFraction:.40
});
const atOrBefore=(rows,target)=>{
  for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=target)return rows[i];
  return null;
};
export function reviewStretchedContinuationEntry({
  candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs
}={}){
  if(candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side)||
     Number(durationMs)!==STRETCHED_CONTINUATION_POLICY.durationMs||
     entryFamilyOf(candidate)!=='continuation')return candidate;
  const at=Number(quoteAt),time=Number(now),spot=Number(price);
  if(!(Number.isFinite(at)&&at>0&&time>=at&&
      time-at<=STRETCHED_CONTINUATION_POLICY.quoteMaxAgeMs&&
      Number.isFinite(spot)&&spot>0))return candidate;
  const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>{
    const ts=Number(q?.ts),p=Number(q?.price);
    const received=Number(q?.receivedAt??ts);
    return Number.isFinite(ts)&&ts>=at-62500&&ts<=at&&
      Number.isFinite(p)&&p>0&&received<=time;
  }).map(q=>({ts:Number(q.ts),price:Number(q.price)}))
    .sort((a,b)=>a.ts-b.ts);
  if(rows.length<STRETCHED_CONTINUATION_POLICY.minimumSamples||
     rows.at(-1).ts!==at||rows.at(-1).price!==spot)return candidate;
  const a60=atOrBefore(rows,at-60000),a20=atOrBefore(rows,at-20000);
  if(!a60||!a20||at-60000-a60.ts>2500||at-20000-a20.ts>2500)return candidate;
  const window=rows.filter(q=>q.ts>=at-60000);
  const uniqueTimes=new Set(window.map(q=>q.ts));
  if(uniqueTimes.size<STRETCHED_CONTINUATION_POLICY.minimumSamples)return candidate;
  let low=Infinity,high=-Infinity;
  for(const q of window){if(q.price<low)low=q.price;if(q.price>high)high=q.price;}
  const range=high-low,dir=candidate.side==='CALL'?1:-1;
  if(!(range>0&&Number.isFinite(range)))return candidate;
  const distanceFromDirectionalEdge=dir>0?high-spot:spot-low;
  const recentMove=dir*(spot-a20.price);
  const nearEdge=distanceFromDirectionalEdge>=0&&
    distanceFromDirectionalEdge<=range*STRETCHED_CONTINUATION_POLICY.extremeFraction;
  const stretched=recentMove>=range*STRETCHED_CONTINUATION_POLICY.twentySecondRangeFraction;
  if(!nearEdge||!stretched)return candidate;
  // WAIT for this specific quote, not a timed lock. A subsequent independently
  // qualified setup (including a confirmed reversal) can be reconsidered.
  return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
    reason:'Continuidade esticada no extremo; entrada tardia.',
    entryRisk:{kind:'causal-stretched-continuation',blocked:true,
      details:{durationMs:60000,range60:Number(range.toPrecision(8)),
        edgeFraction:Number((distanceFromDirectionalEdge/range).toFixed(4)),
        movement20Fraction:Number((recentMove/range).toFixed(4))}}};
}

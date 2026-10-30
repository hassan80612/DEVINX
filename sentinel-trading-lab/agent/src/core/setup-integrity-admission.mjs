// Causal last-mile review for two audited historical-level entry routes.
// Preserve other routes (including strong structural continuations and real
// reversals), all broker settings and the 5m extreme-only policy.
// No timers, quote collection, automatic opposite orders or broker UI writes.
const ROUTES=new Set(['historical-level-rejection','historical-level-breakout']);
const HORIZONS=new Set([30000,60000]);
const direction=side=>side==='CALL'?1:side==='PUT'?-1:0;
function past(rows,at,maxAge=1800){
 for(let i=rows.length-1;i>=0;i--)
  if(rows[i].ts<=at)return at-rows[i].ts<=maxAge?rows[i]:null;
 return null;
}
function observedTape(history,at,now,price){
 const rows=[];let lastTs=Infinity;
 const source=Array.isArray(history)?history:[];
 for(let i=source.length-1;i>=0;i--){
  const item=source[i],ts=Number(item?.ts);
  if(ts<at-33000)break;
  if(!Number.isFinite(ts)||ts>lastTs)return null;
  lastTs=ts;
  const value=Number(item?.price),receivedAt=Number(item?.receivedAt??ts);
  if(ts<=at&&receivedAt<=now&&value>0&&Number.isFinite(value))
   rows.push({ts,price:value});
 }
 rows.reverse();
 if(rows.length<25||rows.at(-1)?.ts!==at||rows.at(-1)?.price!==price||
    rows.some((r,i)=>i>0&&(r.ts<=rows[i-1].ts||r.ts-rows[i-1].ts>2500)))
  return null;
 return rows;
}
export function reviewSetupIntegrity({candidate,quoteHistory=[],quoteAt,now=quoteAt,price,durationMs}={}){
 if(candidate?.ready!==true||!HORIZONS.has(Number(durationMs))||
    !ROUTES.has(candidate.reason)||!direction(candidate.side))return candidate;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),d=direction(candidate.side);
 if(!(at>0&&clock>=at&&clock-at<=1950&&spot>0&&
   Number(candidate.observedAt)===at&&Number(candidate.entryPrice)===spot))return candidate;
 const rows=observedTape(quoteHistory,at,clock,spot);
 if(!rows)return candidate;
 const p5=past(rows,at-5000),p20=past(rows,at-20000),p30=past(rows,at-30000);
 if(!p5||!p20||!p30)return candidate;
 const recent=rows.filter(r=>r.ts>=p30.ts),prices=recent.map(r=>r.price);
 const high=Math.max(...prices),low=Math.min(...prices),width=high-low;
 if(!(width>spot*1e-8))return candidate;
 const changes=recent.slice(1).map((q,i)=>Math.abs(q.price-recent[i].price))
  .filter(v=>v>0).sort((a,b)=>a-b);
 if(changes.length<8)return candidate;
 const typical=Math.max(changes[Math.floor(changes.length/2)],spot*1e-8);
 const extremePosition=d>0?(spot-low)/width:(high-spot)/width;
 if(extremePosition<.95)return candidate;
 const movement5=d*(spot-p5.price),movement20=d*(spot-p20.price),
       movement30=d*(spot-p30.price);
 const exhaustedRejection=candidate.reason==='historical-level-rejection'&&
   candidate.priceStructure?.reaction?.kind==='rejection'&&
   // Confirmed directional follow-through does not prove that buying the
   // very bottom / top of an already completed leg is still a good price.
   movement20>=Math.max(width*.45,typical*3)&&movement30>=typical*3;
 const chasedBreakout=candidate.reason==='historical-level-breakout'&&
   candidate.priceStructure?.reaction?.kind==='breakout'&&
   // Only a late terminal burst after most of a 30s price range has been
   // consumed. This is not a blanket breakout restriction.
   movement20>=Math.max(width*.78,typical*8)&&
   movement5>=width*.28&&movement30>=typical*2;
 if(!exhaustedRejection&&!chasedBreakout)return candidate;
 return {...candidate,ready:false,provisionalSide:candidate.side,side:null,
  reason:exhaustedRejection?'historical-rejection-entry-after-extreme':
   'historical-breakout-late-range-extension',
  entryRisk:{kind:'causal-setup-price-integrity',route:candidate.reason,
   durationMs:Number(durationMs),extremePosition:Number(extremePosition.toFixed(3)),
   observedRange:width,typicalStep:typical,movement5,movement20,movement30}};
}

// A last-moment decision is not an extrapolation of the current candle.
// This synchronous, broker-read-only adjudicator uses ALREADY received,
// chronological price segments spanning the selected holding time.
// It may correct a stale continuation vote BEFORE the immutable entry.
// Never runs inside an open position, waits, or accesses the broker UI.
const SIDE=new Set(['CALL','PUT']);
const opposite=s=>s==='CALL'?'PUT':'CALL';
const scales=Object.freeze({
 5000:[1,2,4,8],10000:[2,3,6,11],15000:[2,4,8,14],
 30000:[3,6,11,18],60000:[4,9,17,28],
 120000:[7,15,30,50],300000:[10,24,46,80]
});
// Historical level rejection is only a proposal based on a short observed
// bounce. Do not treat its label as a veto on causal expiry-matched evidence.
// Confirmed range turns, multiscale structural events and retests remain
// protected; the ordinary 4-segment current-quote proof still gates any flip.
const isProtected=reason=>{
 const r=String(reason||'');
 return r!=='historical-level-rejection'&&
  /rejection|reversal|retest|structure-change|level|range-extreme|failed-breakout/.test(r);
};
function priceAt(rows,at,age=2400){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=at)
  return at-rows[i].ts<=age?rows[i].price:null;
 return null;
}
export function adjudicateExpiryTrend({candidate,quoteHistory=[],quoteAt,now=quoteAt,
 price,durationMs,estimate=null}={}){
 if(candidate?.ready!==true||!SIDE.has(candidate.side))return candidate;
 const points=scales[Number(durationMs)];
 if(!points||isProtected(candidate.reason))return candidate;
 const t=Number(quoteAt),current=Number(price),clock=Number(now);
 if(!(t>0&&clock>=t&&clock-t<=1500&&current>0))return candidate;
 // Do not scan historic chart candles or request anything from the broker.
 // Quote data are bounded, causal, and deduplicated by source timestamp.
 const earliest=t-points[3]*1000-2600,byTime=new Map();
 for(const q of quoteHistory.slice(-3200)){
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),p=Number(q?.price);
  if(ts>=earliest&&ts<=t&&received<=clock&&p>0&&
    Number.isFinite(ts)&&Number.isFinite(p)&&(!byTime.has(ts)||received<byTime.get(ts).receivedAt))
    byTime.set(ts,{ts,price:p,receivedAt:received});
 }
 const rows=[...byTime.values()].sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==t||Math.abs(rows.at(-1).price-current)>current*1e-10)return candidate;
 const vals=[...points].reverse().map(x=>priceAt(rows,t-x*1000));
 vals.push(current);
 if(vals.some(x=>!(x>0)))return candidate;
 // Anchor agreement cannot prove a continuous path across missing market
 // data. Keep the independently qualified original instead of manufacturing
 // an opposite-side proof through a feed gap. No extra quote is requested.
 const oldest=t-points[3]*1000;
 const from=rows.findLastIndex(q=>q.ts<=oldest);
 for(let i=from+1;i<rows.length;i++)
  if(rows[i].ts-rows[i-1].ts>3500)return candidate;
 const delta=vals.slice(1).map((x,i)=>Math.log(x/vals[i]));
 const net=delta.reduce((a,b)=>a+b,0),absolute=delta.reduce((a,x)=>a+Math.abs(x),0);
 if(!(absolute>0))return candidate;
 const trend=net>0?'CALL':net<0?'PUT':null;
 if(!SIDE.has(trend)||trend===candidate.side)return candidate;
 const sign=trend==='CALL'?1:-1;
 const agreeing=delta.filter(x=>sign*x>0).length;
 // A three-part trend PLUS its CURRENT part, not a single green/red tick.
 const coherent=agreeing>=3&&sign*delta.at(-1)>0&&
  sign*delta.at(-2)>0&&Math.abs(net)/absolute>=.76;
 if(!coherent)return candidate;
 // A movement smaller than prevailing observed tick variability is noise.
 const steps=[];
 for(let i=Math.max(1,rows.length-80);i<rows.length;i++){
  if(rows[i].ts-rows[i-1].ts>2300)continue;
  const change=Math.abs(Math.log(rows[i].price/rows[i-1].price));
  if(change>0)steps.push(change);
 }
 steps.sort((a,b)=>a-b);
 const typical=steps.length?steps[Math.floor(steps.length/2)]:0;
 if(!(typical>0&&Math.abs(net)>=typical*4))return candidate;
 // The most recent 2-3 seconds must not already be turning back AGAIN.
 const fresh=priceAt(rows,t-Math.min(3,points[0])*1000);
 if(!fresh||sign*Math.log(current/fresh)<0)return candidate;
 // A visible nearby opposing historical wall is not a confirmed breakout.
 // When this is a severe structural disagreement, decline only THAT
 // candidate, rather than force the prior opposite-side entry.
 const wall=trend==='CALL'?candidate.priceStructure?.nearestResistance:
   candidate.priceStructure?.nearestSupport;
 if(Number.isFinite(Number(wall?.level))&&Number(wall.level)>0&&
    sign*Math.log(Number(wall.level)/current)>=0&&
    sign*Math.log(Number(wall.level)/current)<Math.abs(net)*.15){
   return {...candidate,ready:false,side:null,reason:'opposite-trend-near-confirmed-wall',
     expiryTrendDecision:'conflict-near-wall'};
 }
 // A second independent estimate contributes but is never mandatory:
 // 5/10/15s have no probability model, and longer ones can be uncalibrated.
 const modelAgreement=trend==='CALL'?Number(estimate?.pCall):Number(estimate?.pPut);
 const forecastSupports=Number.isFinite(modelAgreement)&&modelAgreement>=.57;
 // Four coherent moves and a strong majority of the observed excursion
 // can corroborate the direction even when the probability model is absent.
 const priceProof=agreeing===4&&Math.abs(net)/absolute>=.87&&Math.abs(net)>=typical*7;
 // A historical rejection may be only a tiny bounce inside a 60s trend.
 // In that case, demand the stronger *independent price proof*, not an
 // uncalibrated probability estimate, before changing the proposed side.
 const historicalRejection=String(candidate.reason)==='historical-level-rejection';
 if(historicalRejection&&!priceProof)return candidate;
 if(!forecastSupports&&!priceProof)return candidate;
 // No claim that a move will continue at expiry: this is an independently
 // observed, time-matched price reversal of the PREVIOUS direction vote.
 return {...candidate,ready:true,side:trend,reason:'observed-multi-interval-trend-correction',
  expiryTrendDecision:'replaced-conflicting-continuation',
  originalSide:candidate.side,originalReason:candidate.reason,
  observedAt:t,entryPrice:current,expiryTrendSeconds:points[3],
  expiryTrendAgreement:agreeing,expiryTrendEfficiency:Math.abs(net)/absolute};
}

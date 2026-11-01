// Sentinel 217: narrow 1m EUR/USD OTC exhaustion research.
const HORIZON=60000;
const TARGET_SCALES=Array.from({length:13},(_,i)=>i*5000);
const valid=x=>Number.isFinite(Number(x))&&Number(x)>0;
export function evaluateExtremeBoundary({candidate,quoteHistory=[],quoteAt,now,price,durationMs,levels,asset}={}){
 const neutral=(reason,more={})=>({proposeOpposite:false,reason,...more});
 if(Number(durationMs)!==HORIZON)return neutral('other-horizon');
 if(String(asset||'').toUpperCase().trim()!=='EUR/USD OTC')return neutral('out-of-scope-asset');
 if(candidate?.ready!==true||(candidate?.side!=='CALL'&&candidate?.side!=='PUT'))return neutral('invalid-candidate');
 const t=Number(quoteAt),clock=Number(now),spot=Number(price);
 if(!(t>0&&clock>=t&&clock-t<=1950&&valid(spot)&&
   Number(candidate?.observedAt)===t&&Number(candidate?.entryPrice)===spot))
  return neutral('not-current-decision');
 const received=new Map();
 for(const q of quoteHistory){
  const qt=Number(q?.ts),at=Number(q?.receivedAt??qt),p=Number(q?.price);
  if(qt<=t&&qt>=t-62000&&at<=clock&&valid(p)){
   const prev=received.get(qt);
   if(!prev||at<prev.receivedAt)received.set(qt,{ts:qt,receivedAt:at,price:p});
  }
 }
 const rows=[...received.values()].sort((a,b)=>a.ts-b.ts);
 if(rows.length<57||rows.at(-1)?.ts!==t||rows.at(-1)?.price!==spot||
    rows.some((q,i)=>i>0&&q.ts-rows[i-1].ts>3500))return neutral('incomplete-quote-path');
 function past(seconds){
  const want=t-seconds*1000;
  for(let i=rows.length-1;i>=0;i--)
   if(rows[i].ts<=want)return want-rows[i].ts<=2600?rows[i].price:null;
  return null;
 }
 const ps=TARGET_SCALES.map(s=>past(s/1000));
 if(ps.some(x=>!valid(x)))return neutral('missing-5s-anchor');
 const sign=candidate.side==='CALL'?1:-1;
 const step=ps.slice(0,-1).map((p,i)=>sign*(p-ps[i+1]));
 const turns=step.slice(1).filter((d,i)=>d*step[i]<0).length;
 const band=rows.filter(x=>x.ts>=t-HORIZON).map(x=>x.price);
 const low=Math.min(...band),high=Math.max(...band),range=high-low;
 if(!(range>0))return neutral('flat-band');
 const pos=sign===1?(spot-low)/range:(high-spot)/range;
 const trend60=sign*(spot-ps.at(-1)),trend5=sign*(spot-ps[1]);
 const historicalWall=candidate.side==='CALL'?levels?.resistance:levels?.support;
 const wall=Number(historicalWall?.level),touches=Number(historicalWall?.touches);
 const room=valid(wall)?sign*(wall-spot):null;
 const evidence={trend60Pips:trend60*10000,trend5Pips:trend5*10000,
  turns5s:turns,positionAlongDirection:pos,wallRoomPips:room===null?null:room*10000};
 const overheated=trend60>0.0005&&trend5>0.0001&&turns>=4&&pos>=.9&&
  room!==null&&room>=0&&room<=.00015&&touches>=2;
 return overheated?
  {proposeOpposite:true,reason:'exploratory-extreme-and-opposing-wall',
   hypotheticalSide:candidate.side==='CALL'?'PUT':'CALL',evidence}:
  neutral('not-exhaustion-pattern',{evidence});
}
export function reviewExtremeBoundarySide(input={}){
 const candidate=input.candidate;
 if(input.entryFamily!=='automatic'||candidate?.ready!==true)return candidate;
 const evidence=evaluateExtremeBoundary(input);
 if(!evidence.proposeOpposite)return candidate;
 return {...candidate,side:evidence.hypotheticalSide,
  reason:'extreme-boundary-opposite',originalSide:candidate.side,
  originalReason:candidate.reason,extremeBoundaryEvidence:evidence.evidence};
}

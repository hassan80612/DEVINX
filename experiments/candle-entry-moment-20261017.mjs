// RESEARCH ONLY. Current-price events qualify an existing direction; no
// fixed entry second, future candle close, direction flip or stored signal.
import {structuralCandleInput} from './verified-candle-source-20261017.mjs';
const epoch=x=>{const n=Number(x);return n>0?(n<1e12?n*1000:n):0;};
function previousNativeCandle(snap,now,durationMs){
 const groups=new Map();
 for(const c of structuralCandleInput(snap)){
  const from=epoch(c.from??c.ts),to=epoch(c.to??(from?from+60000:0));
  const open=Number(c.open),close=Number(c.close),high=Number(c.high??c.max),low=Number(c.low??c.min),period=to-from;
  if(to>now||Number(c.receivedAt)>now||period<Math.max(30000,durationMs)||![open,close,high,low].every(v=>Number.isFinite(v)&&v>0)||low>Math.min(open,close)||high<Math.max(open,close))continue;
  if(!groups.has(period))groups.set(period,new Map());
  groups.get(period).set(from,{from,to,open,close,high,low,period});
 }
 const choices=[...groups].map(([period,values])=>({period,rows:[...values.values()].sort((a,b)=>a.from-b.from)}))
  .filter(({period,rows})=>rows.length>=2&&rows.at(-2).to===rows.at(-1).from&&now-rows.at(-1).to<period)
  .sort((a,b)=>a.period-b.period);
 return choices[0]?.rows.at(-1)??null;
}
export function candleEntryMoment({candidate,snap,now,durationMs=30000}){
 if(!candidate?.ready||!['CALL','PUT'].includes(candidate.side)||durationMs!==30000)return candidate;
 const c=previousNativeCandle(snap,now,durationMs);
 // A selective entry cannot be certified without its candle evidence.
 // Old quote-only video fixtures therefore cannot validate this policy.
 if(!c)return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:'research-candle-native-context-unavailable',candleMoment:{status:'native-context-unavailable'}};
 const ts=Number(snap.quoteTs),spot=Number(snap.price),sign=candidate.side==='CALL'?1:-1;
 const rows=(snap.quoteHistory??[]).filter(q=>q.ts>=c.to&&q.ts<=ts&&(q.receivedAt??q.ts)<=now&&q.price>0).sort((a,b)=>a.ts-b.ts);
 const wait=()=>({...candidate,ready:false,side:null,provisionalSide:candidate.side,
  reason:'research-candle-entry-moment-not-confirmed',candleMoment:{status:'observing',previousFrom:c.from,periodMs:c.period}});
 if(!(rows.length>=3&&rows.at(-1).ts===ts&&rows.at(-1).price===spot&&ts<=now&&now-ts<=1450))return wait();
 const range=c.high-c.low;if(!(range>0))return wait();
 const tol=Math.max(range*.03,spot*1e-8),body=Math.abs(c.close-c.open),mid=(c.open+c.close)/2;
 const bodyFraction=body/range,wick=sign>0?Math.min(c.open,c.close)-c.low:c.high-Math.max(c.open,c.close);
 const events=[];let low=rows[0].price,high=low,broken=false,tested=false;
 const extreme=sign>0?c.high:c.low,bodyEdge=sign>0?Math.min(c.open,c.close):Math.max(c.open,c.close);
 for(let i=1;i<rows.length;i++){
  const q=rows[i],p=rows[i-1],distance=sign*(p.price-extreme);
  low=Math.min(low,p.price);high=Math.max(high,p.price);
  if(distance>tol)broken=true;
  else if(broken&&distance>=-tol)tested=true;
  else if(distance< -tol){broken=false;tested=false;}
  if(q.ts<ts-1450||q.ts-p.ts>2500)continue;
  const crosses=level=>sign*(p.price-level)<=tol&&sign*(q.price-level)>tol&&sign*(spot-level)>tol;
  if(tested&&crosses(extreme))events.push({kind:'breakout-retest-resumption',at:q.ts,level:extreme});
  const touchedWick=sign>0?low<=c.low+tol*2:high>=c.high-tol*2;
  if(wick/range>=.45&&touchedWick&&crosses(bodyEdge))events.push({kind:'wick-rejection-body-reclaim',at:q.ts,level:bodyEdge});
  const aligned=sign*(c.close-c.open)>0;
  const excursion=sign>0?c.close-low:high-c.close;
  const heldBody=sign>0?low>=mid-tol:high<=mid+tol;
  if(aligned&&bodyFraction>=.4&&excursion>=range*.15&&heldBody&&crosses(c.close))
   events.push({kind:'body-pullback-resumption',at:q.ts,level:c.close});
  const openNearClose=Math.abs(rows[0].price-c.close)<=tol*2;
  if(!aligned&&bodyFraction>=.4&&openNearClose&&crosses(c.open))
   events.push({kind:'opposite-body-reclaim',at:q.ts,level:c.open});
 }
 if(!events.length)return wait();
 const event=events.at(-1);
 return {...candidate,reason:'research-candle-moment-'+event.kind,
  candleMoment:{status:'confirmed',...event,previousFrom:c.from,periodMs:c.period,bodyFraction,wickFraction:wick/range}};
}

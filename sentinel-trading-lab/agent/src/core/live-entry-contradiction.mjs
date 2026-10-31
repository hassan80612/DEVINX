// Causal last-mile admission: never infer direction from the previous candle alone.
// This module does not submit orders, delay a signal or reverse its side.
const valid=p=>Number.isFinite(p)&&p>0;
const continuation=/continuation|breakout|trend|impulse|followthrough|cycle|analogue|forecast/i;
const reversal=/reversal|rejection|reclaim|range-extreme|structure-change/i;
export function liveEntryContradiction({candidate,quoteHistory=[],quoteAt,now=quoteAt,price}={}){
 if(candidate?.ready!==true||!['CALL','PUT'].includes(candidate.side))return null;
 const at=Number(quoteAt),clock=Number(now),spot=Number(price),sign=candidate.side==='CALL'?1:-1;
 if(!valid(spot)||at<=0||at>clock||clock-at>1450||
  Number(candidate.observedAt)!==at||Number(candidate.entryPrice)!==spot)return null;
 const q=[];
 for(let i=quoteHistory.length-1;i>=0;i--){
  const v=quoteHistory[i],t=Number(v?.ts);
  if(t<at-9000)break;
  if(t>at||Number(v?.receivedAt??t)>clock||!valid(Number(v?.price)))continue;
  q.push({ts:t,price:Number(v.price)});
 }
 q.reverse();
 if(q.length<5||q.at(-1).ts!==at||q.at(-1).price!==spot||
   q.some((v,i)=>i>0&&(v.ts<=q[i-1].ts||v.ts-q[i-1].ts>2500)))return null;
 const near=ms=>{const target=at-ms;for(let i=q.length-1;i>=0;i--)
  if(q[i].ts<=target)return target-q[i].ts<=1500?q[i].price:null;return null;};
 const old=near(7000),mid=near(3000),recent=near(1000);
 if(old==null||mid==null||recent==null)return null;
 const first=sign*(mid-old),last=sign*(spot-mid),step=sign*(spot-recent);
 const path=q.map(x=>x.price),span=Math.max(...path)-Math.min(...path);
 if(!(span>0))return null;
 // Evidence of an actual reversal while a stale continuation is proposed:
 // strong completed advance, material observed retreat, and adverse latest tick.
 const giveback=sign===1?Math.max(...path)-spot:spot-Math.min(...path);
 if(!reversal.test(String(candidate.reason||''))&&continuation.test(String(candidate.reason||''))&&first>span*.35&&
  last< -span*.22&&step< -span*.08&&giveback>span*.28)
  return {kind:'live-continuation-turned-back',first,last,step};
 // A reversal is not confirmed just because a prior high/low was touched.
 // Reject only when BOTH recent windows have visibly resumed the opposite
 // direction. A tiny rebound or one transient tick never satisfies this.
 if(reversal.test(String(candidate.reason||''))&&last< -span*.28&&
  step< -span*.12&&sign*(spot-old)<span*.08)
  return {kind:'live-reversal-not-holding',first,last,step};
 return null;
}

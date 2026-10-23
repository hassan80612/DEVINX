// Shared 30s / 60s / 2m / 5m expiry-direction evidence.
// Small candles do not imply reversal; strong trend at an extreme can continue.
// Compare previously COMPLETED same-expiry outcomes at the same flow phase.
// Read-only: no broker command, timer, model calibration or UI changes.
const WINDOWS=[2000,6000,12000,25000,45000,75000];
const valid=x=>Number.isFinite(x)&&x>0;
const direction=v=>v>0?'CALL':v<0?'PUT':null;
function at(rows,t){
 let lo=0,hi=rows.length-1,index=-1;
 while(lo<=hi){const mid=(lo+hi)>>1;if(rows[mid].ts<=t){index=mid;lo=mid+1}else hi=mid-1}
 return index>=0&&t-rows[index].ts<=3000?rows[index].price:null;
}
function phase(rows,t,expiry){
 const spot=at(rows,t);
 if(!valid(spot))return null;
 const previous=WINDOWS.map(h=>at(rows,t-h));
 if(previous.some(p=>!valid(p)))return null;
 const changes=previous.map(p=>Math.log(spot/p));
 const lookback=Math.min(210000,Math.max(90000,1.5*expiry));
 let highest=-Infinity,lowest=Infinity,oldest=Infinity,count=0;
 for(let i=rows.length-1;i>=0;i--){
  const q=rows[i];if(q.ts>t)continue;if(q.ts<t-lookback)break;
  highest=Math.max(highest,q.price);lowest=Math.min(lowest,q.price);
  oldest=Math.min(oldest,q.ts);count++;
 }
 if(count<12||t-oldest<lookback*.70||highest<=lowest)return null;
 const location=(spot-lowest)/(highest-lowest);
 const middle=Math.sign(changes[3]),long=Math.sign(changes[5]);
 const oneWay=middle!==0&&middle===long;
 const short=Math.sign(changes[1]);
 // Distinguishes a small but positively flowing candle from a true recoil.
 const recoil=oneWay&&short===-middle;
 const continuing=oneWay&&short===middle;
 const magnitude=Math.sqrt(changes.reduce((n,x)=>n+x*x,0)/changes.length);
 return {spot,changes,location,oneWay,recoil,continuing,magnitude};
}
export function causalPatternDirection({quoteHistory=[],rangeQuoteHistory=[],
 quoteAt=null,price=null,now=Date.now(),durationMs=30000}={}){
 const expiry=Number(durationMs),t=Number(quoteAt),spot=Number(price);
 const empty=reason=>({ready:false,side:null,reason});
 if(![30000,60000,120000,300000].includes(expiry)||!(t>0&&t<=now&&valid(spot)))
  return empty('invalid-expiry-context');
 if(now-t>2500)return empty('stale-observation');
 const map=new Map(),cutoff=t-2100000;
 for(const q of [...rangeQuoteHistory,...quoteHistory]){
  const ts=Number(q?.ts),receivedAt=Number(q?.receivedAt??ts),p=Number(q?.price);
  if(!(ts>=cutoff&&ts<=t&&receivedAt<=now&&valid(p)))continue;
  const prev=map.get(ts);
  if(!prev||receivedAt<prev.receivedAt)map.set(ts,{ts,receivedAt,price:p});
 }
 const rows=[...map.values()].sort((a,b)=>a.ts-b.ts);
 if(!rows.length||rows.at(-1).ts!==t||
  Math.abs(rows.at(-1).price-spot)>spot*1e-10)return empty('unverified-current-price');
 const current=phase(rows,t,expiry);
 if(!current)return empty('insufficient-observed-phase');
 const stride=expiry>=120000?10000:expiry>=60000?6000:4000;
 const from=rows[0].ts+Math.max(80000,expiry*1.10);
 const possible=[];
 for(let time=Math.ceil(from/stride)*stride;time<=t-expiry-3500;time+=stride){
  const past=phase(rows,time,expiry),exit=at(rows,time+expiry);
  if(!past||!valid(exit))continue;
  if(current.oneWay!==past.oneWay||current.recoil!==past.recoil||
    current.continuing!==past.continuing)continue;
  const locDiff=Math.abs(current.location-past.location);
  if(locDiff>.23)continue;
  const normal=Math.max(1e-8,current.magnitude,past.magnitude);
  const shape=current.changes.reduce((s,x,i)=>
   s+((x-past.changes[i])/(2*normal))**2,0)/WINDOWS.length;
  const distance=shape+1.5*locDiff*locDiff;
  if(distance>.40)continue;
  possible.push({at:time,distance,move:Math.log(exit/past.spot)});
 }
 if(possible.length<4)return empty('insufficient-similar-expiry-outcomes');
 possible.sort((a,b)=>a.distance-b.distance||b.at-a.at);
 const independent=[];
 for(const p of possible){
  if(independent.some(x=>Math.abs(x.at-p.at)<expiry))continue;
  independent.push(p);if(independent.length>=8)break;
 }
 if(independent.length<4)return empty('insufficient-independent-outcomes');
 const up=independent.filter(x=>x.move>0).length;
 const down=independent.filter(x=>x.move<0).length;
 const side=up>=Math.ceil(independent.length*.80)?'CALL':
  down>=Math.ceil(independent.length*.80)?'PUT':null;
 if(!side)return empty('mixed-expiry-outcomes');
 const sign=side==='CALL'?1:-1;
 const weighted=independent.reduce((s,x)=>s+x.move/(.15+x.distance),0)/
  independent.reduce((s,x)=>s+1/(.15+x.distance),0);
 const tickMoves=[];
 for(let i=Math.max(1,rows.length-80);i<rows.length;i++){
  if(rows[i].ts-rows[i-1].ts>3500)continue;
  tickMoves.push(Math.abs(Math.log(rows[i].price/rows[i-1].price)));
 }
 tickMoves.sort((a,b)=>a-b);
 const typical=tickMoves[Math.floor(tickMoves.length/2)]||1e-8;
 const outcomes=independent.map(x=>sign*x.move).sort((a,b)=>a-b);
 const median=outcomes[Math.floor(outcomes.length/2)];
 if(!(sign*weighted>typical*2&&median>typical*2))
  return empty('weak-expiry-movement');
 return {ready:true,side,reason:'causal-independent-expiry-phase-forecast',
  strength:Math.round(100*Math.max(up,down)/independent.length),
  phase:current.recoil?'recovery':current.continuing?'continuation':'transition',
  analogues:possible.length,selected:independent.length,
  expectation:weighted,observedAt:t,entryPrice:spot,
  expirySeconds:expiry/1000,swingPosition:current.location};
}

// RESEARCH ONLY. Weighted median expiry outcome targets binary direction, not mean move size.
// Causal local analogues of the current price trajectory. Read-only.
// Incomparable historical trajectories return to the existing structural
// assessment. Never consumes unseen prices, resets a cycle, or adds a timer.
// The fitted examples are earlier observations whose 30/60s outcomes were
// already observable before the CURRENT tick.
function at(rows,t){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=t)
  return t-rows[i].ts<=1500?rows[i].price:null;
 return null;
}
const signed=v=>v>0?'CALL':v<0?'PUT':null;
export function binaryPatternDirection({quoteHistory=[],quoteAt=null,price=null,
 now=Date.now(),durationMs=30000}={}){
 const expiry=Number(durationMs),ts=Number(quoteAt),spot=Number(price);
 const empty=reason=>({ready:false,side:null,reason});
 if(![30000,60000].includes(expiry)||!(ts>0&&ts<=now&&
  Number.isFinite(spot)&&spot>0))return empty('unsupported-or-unknown');
 if(now-ts>2500)return empty('stale-live-quote');
 const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>
  Number(q.ts)<=ts&&Number(q.receivedAt??q.ts)<=now&&
  Number(q.ts)>=ts-180000&&Number(q.price)>0)
 .map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==ts||rows.at(-1).price!==spot)return empty('unverified-quote');
 // Include the observed 60s context so a pullback in the old wave is not
 // treated as the same setup as a new movement after the chart changes.
 const horizons=[2,5,10,20,32,60].map(x=>x*1000);
 function features(time){
  const p=at(rows,time);
  if(!(p>0))return null;
  const xs=horizons.map(h=>at(rows,time-h));
  if(xs.some(x=>!(x>0)))return null;
  return xs.map(x=>Math.log(p/x));
 }
 const here=features(ts);
 if(!here)return empty('insufficient-context');
 const norm=Math.max(1e-7,Math.sqrt(here.reduce((s,x)=>s+x*x,0)/here.length));
 // Keep short-trajectory relevance separate: a long move must not hide
 // the absence of any genuinely similar current 2s-32s trajectory.
 const shortNorm=Math.max(1e-7,Math.sqrt(here.slice(0,5).reduce((s,x)=>s+x*x,0)/5));
 const training=[];
 const first=Math.ceil((rows[0].ts+62000)/4000)*4000;
 for(let time=first;time<=ts-expiry-2500;time+=4000){
  const xs=features(time),p=at(rows,time),exit=at(rows,time+expiry);
  if(!xs||!(p>0)||!(exit>0))continue;
  const magnitude=Math.max(1e-7,Math.sqrt(xs.reduce((s,x)=>s+x*x,0)/xs.length));
  const diff=xs.reduce((s,x,i)=>{
   // Prefer the exact current trajectory, but normalize only enough to
   // avoid fixed synthetic price-volatility units.
   const e=(x-here[i])/(norm+magnitude)*2;
   return s+e*e;
  },0)/xs.length;
  const shortMagnitude=Math.max(1e-7,Math.sqrt(xs.slice(0,5).reduce((s,x)=>s+x*x,0)/5));
  const shortDiff=xs.slice(0,5).reduce((s,x,i)=>s+((x-here[i])/(shortNorm+shortMagnitude)*2)**2,0)/5;
  training.push({diff,shortDiff,side:signed(Math.log(exit/p)),move:Math.log(exit/p)});
 }
 if(training.length<8)return empty('insufficient-completed-analogues');
 training.sort((a,b)=>a.diff-b.diff);
 const top=training.slice(0,Math.min(12,training.length));
 // diff=1 is a geometric bound, not a fitted price or a win probability:
 // normalized RMS difference exceeds the average trajectory magnitude.
 // Only examples actually selected for the vote can satisfy relevance.
 if(Math.min(...top.map(x=>x.shortDiff))>1)
  return empty('no-comparable-current-trajectory');
 let weighted=0,sum=0,winsCall=0,winsPut=0;
 for(const x of top){
  const w=1/(.18+x.diff);sum+=w;
  weighted+=w*x.move;
  if(x.side==='CALL')winsCall+=w;
  if(x.side==='PUT')winsPut+=w;
 }
 const outcomes=top.map(x=>({move:x.move,weight:1/(.18+x.diff)})).sort((a,b)=>a.move-b.move);
 let cumulative=0,medianMove=0;
 for(const x of outcomes){cumulative+=x.weight;if(cumulative>=sum/2){medianMove=x.move;break;}}
 const direction=signed(medianMove),strength=Math.abs(winsCall-winsPut)/(sum||1);
 return {ready:!!direction,side:direction,
  reason:'causal-completed-pattern-outcomes',
  analogues:training.length,selected:top.length,strength,
  expectation:medianMove,meanExpectation:weighted/(sum||1),expectedLogMove:medianMove,predictedPrice:spot*Math.exp(medianMove),horizonMs:expiry,callVoteFraction:(winsCall+(sum-winsCall-winsPut)/2)/(sum||1),observedAt:ts,entryPrice:spot};
}

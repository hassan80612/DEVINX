// Causal local analogues of the current price trajectory. Read-only.
// Does not block the production fallback or consume any unseen future price.
// The fitted examples are earlier observations whose 30/60s outcomes were
// already observable before the CURRENT tick.
function at(rows,t){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=t)
  return t-rows[i].ts<=1500?rows[i].price:null;
 return null;
}
const signed=v=>v>0?'CALL':v<0?'PUT':null;
export function causalPatternDirection({quoteHistory=[],quoteAt=null,price=null,
 now=Date.now(),durationMs=30000}={}){
 const expiry=Number(durationMs),ts=Number(quoteAt),spot=Number(price);
 const empty=reason=>({ready:false,side:null,reason});
 if(![30000,60000].includes(expiry)||!(ts>0&&ts<=now&&spot>0))return empty('unsupported-or-unknown');
 const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>
  Number(q.ts)<=ts&&Number(q.receivedAt??q.ts)<=now&&
  Number(q.ts)>=ts-180000&&Number(q.price)>0)
 .map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
 if(rows.at(-1)?.ts!==ts||rows.at(-1).price!==spot)return empty('unverified-quote');
 const horizons=[2,5,10,20,32].map(x=>x*1000);
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
 const training=[];
 const first=Math.ceil((rows[0].ts+34000)/4000)*4000;
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
  training.push({diff,side:signed(Math.log(exit/p)),move:Math.log(exit/p)});
 }
 if(training.length<8)return empty('insufficient-completed-analogues');
 training.sort((a,b)=>a.diff-b.diff);
 const top=training.slice(0,Math.min(12,training.length));
 let weighted=0,sum=0,winsCall=0,winsPut=0;
 for(const x of top){
  const w=1/(.18+x.diff);sum+=w;
  weighted+=w*x.move;
  if(x.side==='CALL')winsCall+=w;
  if(x.side==='PUT')winsPut+=w;
 }
 const direction=signed(weighted),strength=Math.abs(winsCall-winsPut)/(sum||1);
 return {ready:!!direction,side:direction,
  reason:'causal-completed-pattern-outcomes',
  analogues:training.length,selected:top.length,strength,
  expectation:weighted/(sum||1),observedAt:ts,entryPrice:spot};
}

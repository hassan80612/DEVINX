// Sentinel 229. READ-ONLY visual tape phase for the blue market line.
// Does not approve trades, change expiry, bypass the strict order reviewer,
// or claim an unverified direction. Uses only real observations by now.
const sign=x=>x>0?'CALL':x<0?'PUT':null;
export function liveVisualPhase229({quoteHistory=[],quoteAt,now=quoteAt,price,durationMs=60000}={}){
 const at=Number(quoteAt),clock=Number(now),spot=Number(price);
 const empty={ready:false,phase:'insufficient',legSide:null,turnSide:null};
 if(!(at>0&&clock>=at&&clock-at<=2500&&spot>0))return empty;
 // Read the observed last 20-25 seconds despite a few dropped ticks. A gap
 // that is too large still means insufficient observation, NOT sideways.
 const windowMs=Number(durationMs)===30000?12000:25000;
 const seen=new Map();
 for(const q of Array.isArray(quoteHistory)?quoteHistory:[]){
  const ts=Number(q?.ts),received=Number(q?.receivedAt??ts),p=Number(q?.price);
  if(!(ts>=at-windowMs-1500&&ts<=at&&received<=clock&&p>0))continue;
  seen.set(ts,p);
 }
 const rows=[...seen].sort((a,b)=>a[0]-b[0]).map(([ts,p])=>({ts,price:p}));
 if(rows.length<5||rows.at(-1).ts!==at||rows.at(-1).price!==spot)return empty;
 const earliest=rows[0];
 if(at-earliest.ts<Math.min(7000,windowMs*.60))return empty;
 const maxGap=Number(durationMs)===30000?6500:8500;
 if(rows.some((r,i)=>i>0&&r.ts-rows[i-1].ts>maxGap))return empty;
 const movements=rows.slice(1).map((q,i)=>q.price-rows[i].price);
 const magnitudes=movements.map(Math.abs).filter(x=>x>0).sort((a,b)=>a-b);
 if(magnitudes.length<3)return {...empty,ready:true,phase:'range'};
 const typical=magnitudes[Math.floor(magnitudes.length/2)]||0;
 const recent=rows.filter(q=>q.ts>=at-4500);
 if(recent.length<2)return empty;
 const first=rows[0],last=rows.at(-1);
 const net=last.price-first.price,legSide=sign(net);
 const range=Math.max(...rows.map(x=>x.price))-Math.min(...rows.map(x=>x.price));
 const travel=movements.reduce((total,x)=>total+Math.abs(x),0);
 const baseline=Math.max(typical*1.6,range*.09,spot*.00000002);
 if(range<=baseline*1.3||Math.abs(net)<baseline*.5)return {ready:true,phase:'range',legSide:null,turnSide:null};
 const leg=legSide==='CALL'?1:-1;
 const extreme=rows.reduce((best,q)=>leg*q.price>leg*best.price?q:best,first);
 const retreat=leg*(extreme.price-spot);
 const quick=leg*(spot-recent[0].price);
 const lastSteps=movements.slice(-3),opposing=lastSteps.filter(x=>leg*x<0).length;
 // "REVERSÃO EM TESTE" means an observed opposing price move; it is never
 // a confirmed reversal or a recommendation to execute.
 const turning=retreat>=Math.max(baseline*1.35,range*.19)&&quick< -baseline*.65&&
  (opposing>=2||retreat>=range*.3);
 if(turning)return {ready:true,phase:'reversal-testing',legSide,turnSide:legSide==='CALL'?'PUT':'CALL'};
 const weakening=retreat>=Math.max(baseline,range*.12)||quick<=baseline*.2;
 if(weakening)return {ready:true,phase:'weakening',legSide,turnSide:null};
 const efficient=Math.abs(net)/Math.max(travel,Number.EPSILON);
 if(efficient>=.19&&quick>=-baseline*.35)
  return {ready:true,phase:'continuing',legSide,turnSide:null};
 return {ready:true,phase:'mixed',legSide,turnSide:null};
}

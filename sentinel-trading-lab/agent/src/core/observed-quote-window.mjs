// Canonical causal input. The normal chronological broker trail needs no Map
// or sort; unordered/duplicate input retains the earliest received observation.
export function observedQuoteWindow({history=[],at,now=at,windowMs,maxQuotes=Infinity}={}){
 const end=Number(at),clock=Number(now),cutoff=end-Number(windowMs);
 const source=Array.isArray(history)?history:[];
 let rows=[],byTime=null,last=-Infinity;
 for(let i=Math.max(0,source.length-maxQuotes);i<source.length;i++){
  const q=source[i],ts=Number(q?.ts),receivedAt=Number(q?.receivedAt??ts),price=Number(q?.price);
  if(!(ts>0&&ts>=cutoff&&ts<=end&&receivedAt>0&&receivedAt<=clock&&Number.isFinite(price)&&price>0))continue;
  const point={ts,receivedAt,price};
  if(!byTime&&ts>last){rows.push(point);last=ts;continue;}
  if(!byTime)byTime=new Map(rows.map(x=>[x.ts,x]));
  const old=byTime.get(ts);
  if(!old||receivedAt<old.receivedAt)byTime.set(ts,point);
 }
 return byTime?[...byTime.values()].sort((a,b)=>a.ts-b.ts):rows;
}

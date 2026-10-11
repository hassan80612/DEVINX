/**
 * Bounded in-memory history for the new learned model only.
 * Keeps the first actually observed quote per second plus the freshest tail.
 * No files, broker polling, network writes or changes to the old dashboard.
 */
export function retainAdaptiveHistory({previous=null,quotes=[],now=Date.now(),
 asset='UNKNOWN',provider='unknown',seconds=3600}={}){
 const key=String(provider)+'|'+String(asset).toUpperCase(),lower=now-seconds*1000;
 const buckets=new Map();let latest=null;
 const input=[...(previous?.key===key?previous.quotes:[]),...quotes];
 for(const q of input){
  const ts=Number(q?.ts),price=Number(q?.price),arrival=Number(q?.receivedAt??ts);
  if(!Number.isFinite(ts)||ts<lower||ts>now||!Number.isFinite(price)||price<=0||
   !Number.isFinite(arrival)||arrival>now)continue;
  const v={ts,price,...(q.receivedAt!=null?{receivedAt:arrival}:{})};
  const bucket=Math.floor(ts/1000),existing=buckets.get(bucket);
  if(!existing||v.ts<existing.ts)buckets.set(bucket,v);
  if(!latest||v.ts>latest.ts)latest=v;
 }
 const retained=[...buckets.values()].sort((a,b)=>a.ts-b.ts);
 if(latest&&retained.at(-1)?.ts!==latest.ts)retained.push(latest);
 return {key,quotes:retained,seconds,maxPoints:seconds+2};
}

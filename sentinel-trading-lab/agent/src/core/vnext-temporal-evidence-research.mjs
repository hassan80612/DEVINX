/**
 * Sentinel 13.4.67 research-only temporal normalization and bounded memory.
 *
 * Multi-resolution actual quote archive (not interpolated or backdated):
 * - exact 1s landmarks for the most recent 5 min
 * - 2s landmarks from 5m to 20m
 * - 5s landmarks from 20m to 2h
 * - 30s landmarks after 2h
 *
 * Retains ORIGINAL timestamps/prices for selected historical ticks. This
 * makes computations depend on elapsed time, not broker quote refresh rate.
 * It does not create simulated prices or any future observation.
 *
 * Designed as a sidecar fed incrementally by the existing quote stream. A
 * discarded previous quote cannot be recovered from the runtime's current
 * 2400-tick snapshot. No production Agent or signal is changed here.
 */
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const maxMemory=4096;
const normalize=(records,asOf)=>{
 const map=new Map();
 for(const v of Array.isArray(records)?records:[]){
  const ts=Number(v?.ts),p=Number(v?.price);
  if(finite(ts)&&finite(p)&&ts>0&&ts<=asOf&&p>0)map.set(ts,p);
 }
 return [...map].sort((a,b)=>a[0]-b[0]).map(([ts,price])=>({ts,price}));
};
const bucket=(age)=>{
 if(age<=300000)return 1000;
 if(age<=1200000)return 2000;
 if(age<=7200000)return 5000;
 return 30000;
};
const before=(rows,at)=>{
 let lo=0,hi=rows.length-1,k=-1;
 while(lo<=hi){const m=(lo+hi)>>1;
  if(rows[m].ts<=at){k=m;lo=m+1}else hi=m-1}
 return k<0?null:rows[k];
};
export function temporalQuoteProfile(quoteHistory=[],asOf=Date.now()){
 const now=Number(asOf);
 const rows=normalize(quoteHistory,now),last=rows.at(-1),first=rows[0];
 let gaps=0,minGap=Infinity,maxGap=0;
 for(let i=1;i<rows.length;i++){
  const d=rows[i].ts-rows[i-1].ts;
  if(d>0){gaps+=d;minGap=Math.min(minGap,d);maxGap=Math.max(maxGap,d)}
 }
 const spanMs=first&&last?last.ts-first.ts:0;
 return {
  points:rows.length,spanMs,
  elapsedSeconds:Number((spanMs/1000).toFixed(3)),
  quotesPerSecond:spanMs>0?Number(((rows.length-1)*1000/spanMs).toFixed(3)):0,
  minGapMs:finite(minGap)?minGap:null,maxGapMs:maxGap||null,
  freshestAt:last?.ts||null,
  quoteAgeMs:last?now-last.ts:null,
  adequateToCover: Object.fromEntries([5,10,30,60,120,300,600,1800,3600]
   .map(h=>[h,spanMs>=Math.max(60,3*h)*1000]))
 };
}
export function compressTemporalQuotes({
 quoteHistory=[],asOf=Date.now(),horizonSeconds=300,
 maxPoints=maxMemory,maxAgeSeconds=12000
}={}){
 const now=Number(asOf);
 if(!(now>0))return [];
 const rows=normalize(quoteHistory,now);
 if(!rows.length)return [];
 const limit=Math.max(200,Math.min(maxMemory,Math.trunc(maxPoints)||maxMemory));
 const maxAge=Math.max(300,Math.min(36000,maxAgeSeconds))*1000;
 const last=rows.at(-1).ts;
 // Look from newest to oldest so that old, low-resolution ticks cannot
 // displace the freshest evidence under memory pressure.
 const res=[rows.at(-1)];
 let at=Math.floor(last/1000)*1000;
 while(at>=last-maxAge&&at>=rows[0].ts&&res.length<limit){
  const age=last-at,step=bucket(age);
  const q=before(rows,at);
  if(q&&at-q.ts<=Math.min(step,4000)&&q.ts!==res.at(-1).ts)
   res.push(q);
  at=Math.floor((at-1)/step)*step;
 }
 return res.reverse();
}
export class BoundedTemporalQuoteArchive{
 constructor({maxAgeSeconds=12000,maxPoints=4096}={}){
  this.maxAgeSeconds=maxAgeSeconds;
  this.maxPoints=maxPoints;
  this.history=[];
  this.lastSeen=0;
 }
 ingest(quotes,now=Date.now()){
  const t=Number(now),newQuotes=normalize(quotes,t)
   .filter(r=>r.ts>this.lastSeen);
  if(newQuotes.length){
   this.lastSeen=newQuotes.at(-1).ts;
   this.history=compressTemporalQuotes({
    quoteHistory:[...this.history,...newQuotes],
    asOf:t,maxPoints:this.maxPoints,
    maxAgeSeconds:this.maxAgeSeconds
   });
  }
  return this.history;
 }
 snapshot(asOf=Date.now()){
  return this.history.filter(q=>q.ts<=Number(asOf));
 }
 profile(asOf=Date.now()){
  return temporalQuoteProfile(this.snapshot(asOf),asOf);
 }
}

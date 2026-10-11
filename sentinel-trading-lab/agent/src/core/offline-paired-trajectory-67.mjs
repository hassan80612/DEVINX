/**
 * Isolated research: estimate ENTRY->EXPIRY directly from completed historical
 * trajectories. Never scores current-price->expiry as a future-entry trade.
 * No production integration, orders, confidence gates or measured win claim.
 */
const finite=n=>Number.isFinite(n);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const fixed=n=>Number(Number(n).toPrecision(12));
function normalize(quotes,now){
 const byTs=new Map();
 for(const q of Array.isArray(quotes)?quotes:[]){
  const t=Number(q?.ts),p=Number(q?.price);
  if(!finite(t)||!finite(p)||p<=0||t>now||t<0)continue;
  byTs.set(t,Math.log(p));
 }
 const source=[...byTs].sort((a,b)=>a[0]-b[0]);
 if(source.length<340)return [];
 const end=source.at(-1)[0],start=Math.max(source[0][0],end-3600000);
 const points=[],step=1000;let i=0;
 for(let t=start;t<=end;t+=step){
  while(i+1<source.length&&source[i+1][0]<=t)i++;
  const q=source[i];if(!q||t-q[0]>3500)return [];
  points.push({t,lp:q[1]});
 }
 return points.length>=340?points:[];
}
function buildStats(rows){
 const n=rows.length,l=rows.map(q=>q.lp);
 const abs=[0],sq=[0];
 for(let i=1;i<n;i++){const r=l[i]-l[i-1];abs.push(abs.at(-1)+Math.abs(r));sq.push(sq.at(-1)+r*r)}
 const total=(prefix,a,b)=>prefix[b]-prefix[a];
 const feat=(i,h)=>{
  const c=l[i],p=k=>l[Math.max(0,i-k)];
  if(i<200)return null;
  const m10=c-p(10),m30=c-p(30),m90=c-p(90);
  const old30=p(30)-p(60);
  const abs90=total(abs,i-90,i)||1e-12;
  const sq90=total(sq,i-90,i);
  const sigma=Math.sqrt(Math.max(sq90/90,1e-15));
  const vel=m10/(sigma*Math.sqrt(10)),medium=m30/(sigma*Math.sqrt(30)),
    long=m90/(sigma*Math.sqrt(90));
  const acceleration=(m30-old30)/(sigma*Math.sqrt(30));
  let high=-Infinity,low=Infinity;
  for(let j=i-180;j<=i;j++){high=Math.max(high,l[j]);low=Math.min(low,l[j])}
  const range=high-low;
  const pos=range>1e-12?(c-low)/range:.5;
  const rangeEfficiency=Math.abs(m90)/abs90;
  const realizedNear=total(sq,i-30,i),realizedPast=total(sq,i-150,i-30);
  const burst=Math.sqrt((realizedNear/30+1e-15)/(realizedPast/120+1e-15));
  const peakDist=(c-high)/Math.max(range,sigma*Math.sqrt(90));
  const troughDist=(c-low)/Math.max(range,sigma*Math.sqrt(90));
  const direction=Math.sign(m30||m90);
  const oldMove=Math.sign(old30),nearMove=Math.sign(m10);
  const turnTrigger=oldMove&&nearMove&&oldMove!==nearMove?1:0;
  const strength=(m10+m30*.33)/(sigma*Math.sqrt(30));
  return {vector:[
    clamp(vel,-8,8),clamp(medium,-8,8),clamp(long,-8,8),
    clamp(acceleration,-8,8),2*pos-1,clamp(rangeEfficiency*3,0,3),
    clamp(Math.log(Math.max(.0001,burst)),-3,3),
    clamp(turnTrigger*oldMove,-1,1),clamp(peakDist,-1,0),
    clamp(troughDist,0,1)
   ],sigma,direction,strength,at:i};
 };
 return {l,feat};
}
const WEIGHTS=[1.3,1.5,1.1,1.8,1.5,.85,1,1.3,.4,.4];
function distance(a,b){
 let n=0,total=0;
 for(let i=0;i<WEIGHTS.length;i++){
  const d=clamp(a[i]-b[i],-5,5);n+=d*d*WEIGHTS[i];total+=WEIGHTS[i]
 }
 return Math.sqrt(n/total);
}
function weightedMedian(rows,field){
 const sorted=rows.slice().sort((a,b)=>a[field]-b[field]);
 const half=sorted.reduce((a,b)=>a+b.weight,0)/2;let cumulative=0;
 for(const x of sorted){cumulative+=x.weight;if(cumulative>=half)return x[field]}
 return sorted.at(-1)?.[field]||0;
}

export function pairedTrajectoryForecast67({
 quoteHistory=[],asOf=Date.now(),entryDelaySeconds=30,holdingSeconds=30
}={}){
 const now=Number(asOf),delay=Number(entryDelaySeconds),hold=Number(holdingSeconds);
 const missing=status=>({status,side:null,issuedAt:now,
  entryAt:now+delay*1000,exitAt:now+(delay+hold)*1000,
  entryDelaySeconds:delay,holdingSeconds:hold,expectedPath:[],
  actionable:false,calibrated:false,measuredAccuracy:null});
 if(!finite(now)||!finite(delay)||!finite(hold)||delay<0||hold<=0||
    delay+hold>1800)return missing('invalid-time-interval');
 const rows=normalize(quoteHistory,now),step=1;
 const entryOffset=Math.ceil(delay/step),exitOffset=Math.ceil((delay+hold)/step);
 const currentIndex=rows.length-1;
 if(rows.length<420+exitOffset||now-rows.at(-1)?.t>2000)
  return missing('insufficient-complete-history');
 const {l,feat}=buildStats(rows),current=feat(currentIndex,delay+hold);
 if(!current)return missing('insufficient-features');
 const examples=[],stride=Math.max(12,Math.round(Math.min((delay+hold)/4,25)/step));
 for(let i=200;i+exitOffset<=currentIndex;i+=stride){
  const f=feat(i,delay+hold),d=f&&distance(f.vector,current.vector);
  if(!f||!finite(d))continue;
  // Both outcome endpoints are in the PAST at the issue time.
  const entryMove=l[i+entryOffset]-l[i];
  const pairedMove=l[i+exitOffset]-l[i+entryOffset];
  examples.push({at:i,d,entryMove,pairedMove,outcomeAt:rows[i+exitOffset].t});
 }
 examples.sort((a,b)=>a.d-b.d||b.at-a.at);
 const neighbors=[];
 for(const x of examples){
  // No overlapping outcome windows among the retained neighbors.
  if(neighbors.every(y=>Math.abs(x.at-y.at)>exitOffset)){
   neighbors.push(x);
   if(neighbors.length===18)break;
  }
 }
 if(neighbors.length<6)return missing('insufficient-disjoint-past-outcomes');
 const support=neighbors.map(x=>({...x,weight:1/(.20+x.d)**2}));
 const pairedMove=weightedMedian(support,'pairedMove');
 const entryMove=weightedMedian(support,'entryMove');
 const reference=Math.exp(l[currentIndex]);
 const projectedEntryPrice=fixed(reference*Math.exp(entryMove));
 const projectedExitPrice=fixed(projectedEntryPrice*Math.exp(pairedMove));
 const totalWeight=support.reduce((a,x)=>a+x.weight,0);
 const share={CALL:0,PUT:0,DRAW:0};
 for(const x of support){
  const side=x.pairedMove>1e-12?'CALL':x.pairedMove< -1e-12?'PUT':'DRAW';
  share[side]+=x.weight/totalWeight;
 }
 // An actually observed representative path, preserving its turns;
 // do not independently median each timestamp into a fictitious flat path.
 const representative=support.slice().sort((a,b)=>
  Math.abs(a.pairedMove-pairedMove)-Math.abs(b.pairedMove-pairedMove)||a.d-b.d)[0];
 const sampleOffsets=[...new Set([0,entryOffset,exitOffset,
  ...Array.from({length:9},(_,j)=>Math.round(exitOffset*(j+1)/10))])].sort((a,b)=>a-b);
 const expectedPath=sampleOffsets.map(offset=>({
  secondsFromNow:offset*step,
  price:fixed(reference*Math.exp(l[representative.at+offset]-l[representative.at]))
 }));
 return {status:'paired-trajectory-estimate',
  side:pairedMove>1e-12?'CALL':pairedMove< -1e-12?'PUT':null,
  issuedAt:now,entryAt:now+delay*1000,exitAt:now+(delay+hold)*1000,
  entryDelaySeconds:delay,holdingSeconds:hold,
  projectedEntryPrice,projectedExitPrice,expectedPairedLogReturn:pairedMove,
  // The representative trajectory is illustrative, separate from medians.
  expectedPath,pathMeaning:'representative-observed-past-trajectory',
  historicalPairedDirectionShare:share,
  completedPastOutcomes:examples.length,disjointNeighbors:support.length,
  latestTrainingOutcomeAt:Math.max(...support.map(x=>x.outcomeAt)),
  sampledEntryOffsetSeconds:entryOffset*step,
  sampledExitOffsetSeconds:exitOffset*step,
  actionable:false,calibrated:false,measuredAccuracy:null,
  modelVersion:'offline-direct-paired-trajectory-v1'};
}

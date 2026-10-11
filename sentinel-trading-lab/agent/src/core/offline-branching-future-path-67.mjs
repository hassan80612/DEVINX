/**
 * SENTINEL OFFLINE RESEARCH - CONDITIONAL FUTURE BRANCHES v1
 *
 * Not wired to Agent, website, trading, settings or orders.
 * Uses strictly historical, fully resolved future paths of earlier observations.
 * Models continuation, mid-path reversal and consolidation as competing scenarios.
 * Always needs original 13.4.67's receipt as its untouched fallback.
 */
const finite=n=>Number.isFinite(n);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const fixed=n=>Number(Number(n).toPrecision(12));
const SLICES=Object.freeze([.2,.4,.6,.8,1]);
function normalize(quotes,now){
 const byTs=new Map();
 for(const q of Array.isArray(quotes)?quotes:[]){
  const t=Number(q?.ts),p=Number(q?.price);
  if(!finite(t)||!finite(p)||p<=0||t>now||t<0)continue;
  byTs.set(t,Math.log(p));
 }
 const source=[...byTs].sort((a,b)=>a[0]-b[0]);
 if(source.length<170)return [];
 const end=source.at(-1)[0],start=Math.max(source[0][0],end-3600000);
 const points=[],step=2000;let i=0;
 for(let t=start;t<=end;t+=step){
  while(i+1<source.length&&source[i+1][0]<=t)i++;
  const q=source[i];if(!q||t-q[0]>3500)return [];
  points.push({t,lp:q[1]});
 }
 return points.length>=170?points:[];
}
function buildStats(rows){
 const n=rows.length,l=rows.map(q=>q.lp);
 const abs=[0],sq=[0];
 for(let i=1;i<n;i++){const r=l[i]-l[i-1];abs.push(abs.at(-1)+Math.abs(r));sq.push(sq.at(-1)+r*r)}
 const total=(prefix,a,b)=>prefix[b]-prefix[a];
 const feat=(i,h)=>{
  const c=l[i],p=k=>l[Math.max(0,i-k)];
  if(i<100)return null;
  const m10=c-p(5),m30=c-p(15),m90=c-p(45);
  const old30=p(15)-p(30);
  const abs90=total(abs,i-45,i)||1e-12;
  const sq90=total(sq,i-45,i);
  const sigma=Math.sqrt(Math.max(sq90/90,1e-15));
  const vel=m10/(sigma*Math.sqrt(10)),medium=m30/(sigma*Math.sqrt(30)),
    long=m90/(sigma*Math.sqrt(90));
  const acceleration=(m30-old30)/(sigma*Math.sqrt(30));
  let high=-Infinity,low=Infinity;
  for(let j=i-90;j<=i;j++){high=Math.max(high,l[j]);low=Math.min(low,l[j])}
  const range=high-low;
  const pos=range>1e-12?(c-low)/range:.5;
  const rangeEfficiency=Math.abs(m90)/abs90;
  const realizedNear=total(sq,i-15,i),realizedPast=total(sq,i-75,i-15);
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
function baselineResult(baseline,h,status='original-67-fallback'){
 const r=baseline?.receipt;
 return {status,side:r?.side||null,projectedPrice:r?.projectedPrice||null,
   expectedPath:[],expectedLow:r?.expectedLow||null,expectedHigh:r?.expectedHigh||null,
   branching:null,actionable:false,calibrated:false,modelVersion:'offline-conditional-branches-v1',horizonSeconds:h};
}
export function branchingFutureForecast67({quoteHistory=[],asOf=Date.now(),
 selectedSeconds=60,baseline=null,mode='hybrid'}={}){
 const now=Number(asOf),h=Number(selectedSeconds),b=baseline?.receipt;
 if(!finite(now)||!finite(h)||h<5||h>900||!b||
  !finite(Number(b.referencePrice))||!finite(Number(b.projectedPrice))||
  Number(b.referencePrice)<=0||Number(b.projectedPrice)<=0||
  Number(b.issuedAt)!==now||Number(b.targetAt)!==now+h*1000)
  return baselineResult(baseline,h,'baseline-input-unavailable');
 const rows=normalize(quoteHistory,now),step=2,fwd=Math.ceil(h/step);
 if(rows.length<210+fwd)return baselineResult(baseline,h,'too-little-complete-history');
 const {l,feat}=buildStats(rows);
 const currentIndex=rows.length-1,current=feat(currentIndex,h);
 if(!current||now-rows.at(-1).t>2000)
  return baselineResult(baseline,h,'stale-or-incomplete-history');
 const examples=[],lastFullIndex=currentIndex-fwd;
 const stride=Math.max(6,Math.round(Math.min(h/4,25)/step));
 // Absolutely no example may contain a future value after the issuance time.
 for(let i=100;i<=lastFullIndex;i+=stride){
  const f=feat(i,h);if(!f)continue;
  const future=SLICES.map(t=>{
   const k=Math.min(currentIndex,i+Math.round(fwd*t));
   return l[k]-l[i];
  });
  const initial=l[Math.min(currentIndex,i+Math.min(15,fwd))]-l[i];
  const end=future.at(-1);
  const d=distance(f.vector,current.vector);
  if(!finite(d)||future.some(x=>!finite(x)))continue;
  const mid=future.slice(0,-1);
  const branch=f.direction!==0&&Math.sign(end)===-f.direction?'reversal':
   f.direction!==0&&Math.sign(end)===f.direction?'continuation':'consolidation';
  const midOpposed=mid.some(x=>f.direction!==0&&Math.sign(x)===-f.direction);
  examples.push({at:i,d,future,initial,end,branch,midOpposed});
 }
 if(examples.length<10)return baselineResult(baseline,h,'insufficient-complete-outcomes');
 examples.sort((a,b)=>a.d-b.d);
 const nearest=[],minSeparation=Math.max(6,Math.floor(fwd/3));
 for(const candidate of examples){
  if(nearest.every(x=>Math.abs(x.at-candidate.at)>=minSeparation)){
    nearest.push(candidate);
    if(nearest.length===Math.min(18,Math.max(8,Math.round(examples.length*.17))))break;
  }
 }
 if(nearest.length<6)return baselineResult(baseline,h,'insufficient-independent-neighbors');
 const first=nearest[0].d,average=nearest.reduce((a,x)=>a+x.d,0)/nearest.length;
 const support=nearest.map(x=>({...x,weight:1/Math.pow(.20+x.d,2)}));
 const weightSum=support.reduce((a,x)=>a+x.weight,0);
 const medianPath=SLICES.map((fraction,j)=>weightedMedian(support.map(x=>({
  ...x,v:x.future[j]})),'v'));
 const possible={continuation:0,reversal:0,consolidation:0},midReversalWeight={yes:0,no:0};
 for(const row of support){possible[row.branch]+=row.weight;midReversalWeight[row.midOpposed?'yes':'no']+=row.weight}
 let upWeight=0,downWeight=0,zeroWeight=0;
 for(const x of support){if(x.end>1e-12)upWeight+=x.weight;
   else if(x.end< -1e-12)downWeight+=x.weight;else zeroWeight+=x.weight}
 const directionShare={CALL:upWeight/weightSum,PUT:downWeight/weightSum,DRAW:zeroWeight/weightSum};
 const medianCenter=medianPath.at(-1);
 const endpointDispersionBps=Math.sqrt(support.reduce((a,x)=>
   a+x.weight*(x.end-medianCenter)**2,0)/weightSum)*10000;
 for(const k of Object.keys(possible))possible[k]/=weightSum;
 const midReversalShare=midReversalWeight.yes/weightSum;
 const baseMove=Math.log(Number(b.projectedPrice)/Number(b.referencePrice));
 const pathEnd=medianPath.at(-1);
 // Empirical branch risk is not a calibrated probability of success.
 // Require statistical concentration and smooth fallback; do not force flips
 // from a single nearest historical match.
 const votes=[possible.continuation,possible.reversal,possible.consolidation];
 const concentration=Math.max(...votes),usable=concentration>=.56&&average<2.25;
 const mix=mode==='standalone'?1:(usable?clamp((concentration-.45)*1.25,.15,.58):0);
 const steps=SLICES.map((p,j)=>({
  secondsFromNow:Math.min(h,Math.round(h*p)),
  logMove:(baseMove*p)*(1-mix)+medianPath[j]*mix
 }));
 const uniq=[...new Map(steps.map(v=>[v.secondsFromNow,v])).values()];
 const endpoint=baseMove*(1-mix)+pathEnd*mix;
 const projectedPrice=fixed(Number(b.referencePrice)*Math.exp(endpoint));
 const side=Math.abs(endpoint)<1e-12?'NEUTRAL':endpoint>0?'CALL':'PUT';
 const predictedPath=uniq.map(x=>({secondsFromNow:x.secondsFromNow,
  price:fixed(Number(b.referencePrice)*Math.exp(x.logMove))}));
 const report={
  expectedBranch:possible.continuation>=possible.reversal&&possible.continuation>=possible.consolidation?'continuation':
    possible.reversal>=possible.consolidation?'reversal':'consolidation',
  observedNeighborShare:{...possible},
  historicalDirectionShare:directionShare,
  neighborReturnDispersionBps:Number(endpointDispersionBps.toFixed(5)),
  midPathOppositeDirectionShare:midReversalShare,
  projectedIntermediateReversal:predictedPath.slice(0,-1).some(x=>
    Math.sign(x.price-Number(b.referencePrice))!==Math.sign(projectedPrice-Number(b.referencePrice))&&
      Math.abs(x.price-Number(b.referencePrice))>1e-12),
  completePastPaths:examples.length,independentNeighbors:nearest.length,
  averageNeighborDistance:Number(average.toFixed(4)),
  expectedEndpointLogReturn:medianPath.at(-1),
  usedOnlyQuotesUntil:now,modelBlendWeight:mix,
  mode,observedHistoricalCasesOnly:true,measuredAccuracy:null
 };
 return {status:mix>0?'conditional-branch-estimate':'original-67-fallback',
  side:mix>0?side:b.side,
  projectedPrice:mix>0?projectedPrice:b.projectedPrice,
  expectedPath:mix>0?predictedPath:[],
  expectedLow:b.expectedLow,expectedHigh:b.expectedHigh,branching:report,
  calibrated:false,actionable:false,modelVersion:'offline-conditional-branches-v1',
  horizonSeconds:h};
}

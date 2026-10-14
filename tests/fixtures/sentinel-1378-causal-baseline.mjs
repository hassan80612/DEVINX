// Sentinel 13.7.1: causal forward-path forecast for the SELECTED automatic
// strategy. No last-candle veto and no legacy original-67 extrapolation.
// Fit historic analogs only when BOTH anchor features AND actual future
// quotes were known before issue time. No order clicks or broker API calls.
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const round=x=>Number(x.toPrecision(12));
function clean(quotes,now){
 const unique=new Map();
 for(const q of Array.isArray(quotes)?quotes:[]){
  const ts=Number(q?.ts),price=Number(q?.price),recv=Number(q?.receivedAt??q?.ts);
  if(Number.isFinite(ts)&&ts<=now&&Number.isFinite(recv)&&recv<=now&&
    Number.isFinite(price)&&price>0)unique.set(ts,{ts,lp:Math.log(price)});
 }
 return [...unique.values()].sort((a,b)=>a.ts-b.ts).slice(-6000);
}
const before=(r,t)=>{
 let lo=0,hi=r.length-1,k=-1;
 while(lo<=hi){const m=(lo+hi)>>1;if(r[m].ts<=t){k=m;lo=m+1}else hi=m-1}
 return k<0?null:r[k];
};
const after=(r,t)=>{
 let lo=0,hi=r.length-1,k=-1;
 while(lo<=hi){const m=(lo+hi)>>1;if(r[m].ts>=t){k=m;hi=m-1}else lo=m+1}
 return k<0?null:r[k];
};
function profile(r,t){
 const at=before(r,t);
 const p5=before(r,t-5000),p10=before(r,t-10000),p15=before(r,t-15000),p20=before(r,t-20000),p30=before(r,t-30000);
 const p60=before(r,t-60000),p90=before(r,t-90000);
 if(!at||!p5||!p10||!p15||!p20||!p30||!p60||!p90||
    t-at.ts>3000||t-90000-p90.ts>3000)return null;
 const recent=r.filter(x=>x.ts>=t-90000&&x.ts<=t);
 if(recent.length<24)return null;
 let squared=0,dtTotal=0,path=0;
 for(let i=1;i<recent.length;i++){
  const dt=(recent[i].ts-recent[i-1].ts)/1000;
  if(dt<=0||dt>3)continue;
  const d=recent[i].lp-recent[i-1].lp;
  squared+=d*d;dtTotal+=dt;path+=Math.abs(d);
 }
 if(dtTotal<55||squared<=0)return null;
 const sigma=Math.sqrt(squared/dtTotal);
 const net=at.lp-p90.lp;
 const low=Math.min(...recent.map(x=>x.lp)),high=Math.max(...recent.map(x=>x.lp));
 const scale=Math.max(1e-10,sigma);
 const rate5=(at.lp-p5.lp)/5,rate10=(at.lp-p10.lp)/10;
 const rate15=(at.lp-p15.lp)/15,rate20=(at.lp-p20.lp)/20,rate30=(at.lp-p30.lp)/30;
 const rate60=(at.lp-p60.lp)/60,rate90=net/90;
 // The former trend must NOT include the unfolding 10-20s reversal.
 const priorRate=(p30.lp-p90.lp)/60;
 return {at,sigma,rate5,rate10,rate15,rate20,rate30,rate60,rate90,priorRate,
  efficiency:clamp(Math.abs(net)/Math.max(path,1e-12),0,1),
  position:high-low>1e-12?(at.lp-low)/(high-low):.5,
  mean:recent.reduce((s,q)=>s+q.lp,0)/recent.length,
  high,low,
  features:[clamp(rate15/scale,-3,3),clamp(rate30/scale,-3,3),
   clamp(rate60/scale,-3,3),clamp(rate90/scale,-3,3),
   clamp((rate15-rate60)/scale,-3,3),
   clamp(Math.abs(net)/Math.max(path,1e-12),0,1),
   high-low>1e-12?(at.lp-low)/(high-low):.5,
   clamp(rate10/scale,-3,3)]
 };
}
// Identify a regime from OBSERVED swings rather than the colour of the
// current candle. Short-term noise alone cannot overturn a real trend.
export function forwardRegime(p){
 const long=p.priorRate,short=(p.rate10*.50+p.rate15*.35+p.rate20*.15);
 const normal=Math.max(1e-10,p.sigma);
 const oldSide=Math.sign(long),newSide=Math.sign(short);
 const relativeStrength=Math.abs(short)/Math.max(normal*.45,Math.abs(long));
 const opposed=oldSide!==0&&newSide!==0&&oldSide!==newSide;
 const shortPersistent=oldSide!==0&&
  Math.sign(p.rate5)===newSide&&Math.sign(p.rate10)===newSide&&
  Math.sign(p.rate15)===newSide;
 const moved=Math.abs(p.rate10*10)/Math.max(normal*Math.sqrt(10),1e-12);
 const meaningful=shortPersistent&&relativeStrength>.55&&moved>.48;
 const turn=opposed&&meaningful;
 const slowTrend=p.efficiency>.35&&Math.abs(long)>normal*.10;
 const regime=turn?'reversal':!slowTrend||p.efficiency<.25?'range':'trend';
 return {regime,oldSide,newSide,turn,relativeStrength,shortPersistent,
  moveSigma:moved,short,long};
}
function structureMove(p,seconds){
 const horizon=Math.max(0,Number(seconds));
 const s=forwardRegime(p);
 // Dynamic regime probabilities are not win-rate assertions.
 // Reversal: the confirmed 5/10/15s leg outweighs the spent 90s trend.
 // Trend: preserve the multi-candle structure; range: shrink continuation.
 const trend=s.regime==='reversal'?
   p.rate90*.07+p.rate60*.10+p.rate30*.13+p.rate20*.20+p.rate15*.20+p.rate10*.30:
   s.regime==='range'?
   p.rate90*.16+p.rate60*.19+p.rate30*.23+p.rate20*.18+p.rate15*.15+p.rate10*.09:
   p.rate90*.31+p.rate60*.34+p.rate30*.20+p.rate20*.10+p.rate15*.04+p.rate10*.01;
 const persistence=s.regime==='reversal'?.80:s.regime==='range'?.22:
   clamp(.30+.58*p.efficiency,.25,.84);
 const accel=clamp((p.rate10-p.rate30)*8,-p.sigma*1.5,p.sigma*1.5);
 const accelWeight=s.regime==='reversal'?.60:s.regime==='range'?.22:.16;
 const drift=trend*45*(1-Math.exp(-horizon/45))*persistence;
 const acceleration=accel*(1-Math.exp(-horizon/18))*accelWeight;
 const reversion=-(p.at.lp-p.mean)*
   (s.regime==='range'?.44:s.regime==='reversal'?.12:.10)*
   (1-Math.exp(-horizon/40));
 // A persistent 5/10/15/20-second directional leg has price evidence
 // that a slowly weighted 60/90-second trend may miss. Reprice the FUTURE
 // move, rather than placing a direction veto or waiting another candle.
 // One isolated quote/green candle cannot qualify as a persistent leg.
 const shortSide=Math.sign(p.rate10);
 const legAligned=shortSide!==0&&[p.rate5,p.rate15,p.rate20]
   .every(rate=>Math.sign(rate)===shortSide);
 const legSigma=Math.abs(p.rate10*10)/
   Math.max(1e-12,p.sigma*Math.sqrt(10));
 const legEvidence=legAligned?clamp((legSigma-.5)/1.5,0,1):0;
 const shortRate=p.rate5*.12+p.rate10*.34+p.rate15*.29+p.rate20*.25;
 const persistenceMove=shortRate*Math.min(horizon,45)*legEvidence*.68;
 const limit=Math.max(1e-9,p.sigma*Math.sqrt(Math.max(1,horizon))*2.5);
 return clamp(drift+acceleration+reversion+persistenceMove,-limit,limit);
}
function matches(r,now,current,maxSeconds){
 const cutoff=now-maxSeconds*1000-3500;
 const first=r[0].ts+95000;
 const stride=Math.max(10000,Math.min(60000,maxSeconds*500));
 const cases=[];
 // Non-overlapping outcomes prevent counting one swing 30 times.
 for(let t=first;t<=cutoff;t+=stride){
  const old=profile(r,t);
  if(!old)continue;
  const outcome=after(r,t+maxSeconds*1000);
  if(!outcome||outcome.ts>now||
    outcome.ts-(t+maxSeconds*1000)>3000)continue;
  const d=current.features.reduce((sum,v,i)=>{
   const weight=[1.1,1.5,1.3,1,.95,.6,.7,1.5][i];
   return sum+weight*(v-old.features[i])**2;
  },0);
  const regime=forwardRegime(old).regime;
  cases.push({t,dist:Math.sqrt(d/9.65),sigma:old.sigma,origin:old.at.lp,regime});
 }
 if(cases.length<6)return null;
 const currentRegime=forwardRegime(current).regime;
 // Analogues from opposite market regimes are not comparable reversals.
 const same=cases.filter(x=>x.regime===currentRegime);
 const eligible=same.length>=6?same:cases;
 const neighbors=eligible.sort((a,b)=>a.dist-b.dist).slice(0,Math.min(10,Math.max(6,Math.floor(eligible.length*.4))));
 return {cases,neighbors};
}
export function causalForwardPath({
 quoteHistory=[],asOf=Date.now(),holdingSeconds=30,maxSeconds=90
}={}){
 const now=Number(asOf),hold=Number(holdingSeconds),end=Number(maxSeconds);
 const rows=clean(quoteHistory,now);
 const latest=rows.at(-1);
 const invalid=status=>({status,priceAt:()=>null,modelVersion:'causal-interval-1371'});
 if(!(latest&&now-latest.ts<=2500&&hold>=5&&hold<=3600&&end>=hold&&end<=7200))
  return invalid('stale-or-invalid-horizon');
 const current=profile(rows,latest.ts);
 if(!current)return invalid('insufficient-causal-structure');
 const regime=forwardRegime(current);
 const analog=matches(rows,latest.ts,current,end);
 const modelPriceAt=seconds=>{
  const s=Number(seconds);
  if(!(s>=0&&s<=end))return null;
  if(s===0)return round(Math.exp(current.at.lp));
  const structural=structureMove(current,s);
  let blended=structural;
  if(analog){
   let total=0,sum=0;
   for(const m of analog.neighbors){
    const quote=after(rows,m.t+s*1000);
    if(!quote||quote.ts>now||quote.ts-(m.t+s*1000)>3000)continue;
    const weight=1/(.25+m.dist)**2;
    const relative=clamp(current.sigma/Math.max(m.sigma,1e-12),.5,2);
    sum+=(quote.lp-m.origin)*relative*weight;
    total+=weight;
   }
   if(total>0){
    // The historical component learns the endpoint, not the candle sign.
    // Shrink to structural baseline when samples are few / mismatched.
    const similarity=clamp(1/(1+analog.neighbors[0].dist),.25,.8);
    const sampleWeight=clamp((analog.neighbors.length-3)/9,0,.65);
    const mix=similarity*sampleWeight;
    blended=structural*(1-mix)+(sum/total)*mix;
   }
  }
  const limit=Math.max(1e-9,current.sigma*Math.sqrt(s)*3);
  return round(Math.exp(current.at.lp+clamp(blended,-limit,limit)));
 };
 return {status:'causal-forward-path',priceAt:modelPriceAt,
  modelVersion:'causal-interval-1371',referencePrice:round(Math.exp(current.at.lp)),
  sigmaPerSqrtSecond:current.sigma,analogExamples:analog?.cases.length||0,
  analogNeighbors:analog?.neighbors.length||0,regime:regime.regime,
  reversalEvidence:regime.turn?{shortLegSigma:regime.moveSigma,relativeStrength:regime.relativeStrength}:null,
  latestQuoteAt:latest.ts,
  quoteSpanSeconds:(latest.ts-rows[0].ts)/1000,
  predictedOnClosedHistory:true,causal:true};
}

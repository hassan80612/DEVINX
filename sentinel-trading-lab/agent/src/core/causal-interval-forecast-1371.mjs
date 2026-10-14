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
 const p15=before(r,t-15000),p30=before(r,t-30000);
 const p60=before(r,t-60000),p90=before(r,t-90000);
 if(!at||!p15||!p30||!p60||!p90||
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
 const rate15=(at.lp-p15.lp)/15,rate30=(at.lp-p30.lp)/30;
 const rate60=(at.lp-p60.lp)/60,rate90=net/90;
 return {at,sigma,rate15,rate30,rate60,rate90,
  efficiency:clamp(Math.abs(net)/Math.max(path,1e-12),0,1),
  position:high-low>1e-12?(at.lp-low)/(high-low):.5,
  mean:recent.reduce((s,q)=>s+q.lp,0)/recent.length,
  high,low,
  features:[clamp(rate15/scale,-3,3),clamp(rate30/scale,-3,3),
   clamp(rate60/scale,-3,3),clamp(rate90/scale,-3,3),
   clamp((rate15-rate60)/scale,-3,3),
   clamp(Math.abs(net)/Math.max(path,1e-12),0,1),
   high-low>1e-12?(at.lp-low)/(high-low):.5]
 };
}
function structureMove(p,seconds){
 // A multi-scale path, not the sign of the current tick. Recent acceleration
 // allows earlier reversal, while 90s structure avoids candle chasing.
 const horizon=Math.max(0,Number(seconds));
 const trend=(p.rate90*.37+p.rate60*.40+p.rate30*.18+p.rate15*.05);
 const accel=clamp((p.rate15-p.rate60)*12,-p.sigma*3,p.sigma*3);
 const persistence=clamp(.18+.7*p.efficiency,.18,.88);
 const trendMove=trend*45*(1-Math.exp(-horizon/45))*persistence;
 const accelMove=accel*(1-Math.exp(-horizon/22))*.40;
 const extreme=p.position-.5;
 const reversion=-(p.at.lp-p.mean)*(.15+.40*(1-p.efficiency))*
  (1-Math.exp(-horizon/40));
 // Structural exhaustion: decreasing momentum near previous extreme.
 const exhausting=p.rate15*p.rate60<0||Math.abs(p.rate15)<Math.abs(p.rate60)*.3;
 const turning=exhausting?-(p.position-.5)*p.sigma*Math.sqrt(horizon)*.4:0;
 const limit=Math.max(1e-9,p.sigma*Math.sqrt(Math.max(1,horizon))*2.5);
 return clamp(trendMove+accelMove+reversion+turning,-limit,limit);
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
   const weight=[1.2,1.7,1.6,1.3,1.1,.7,.8][i];
   return sum+weight*(v-old.features[i])**2;
  },0);
  cases.push({t,dist:Math.sqrt(d/8.4),sigma:old.sigma,origin:old.at.lp});
 }
 if(cases.length<6)return null;
 const neighbors=cases.sort((a,b)=>a.dist-b.dist).slice(0,Math.min(10,Math.max(6,Math.floor(cases.length*.4))));
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
  analogNeighbors:analog?.neighbors.length||0,regime:current.efficiency>.6?'trend':
   current.efficiency<.28?'range':'transition',latestQuoteAt:latest.ts,
  quoteSpanSeconds:(latest.ts-rows[0].ts)/1000,
  predictedOnClosedHistory:true,causal:true};
}

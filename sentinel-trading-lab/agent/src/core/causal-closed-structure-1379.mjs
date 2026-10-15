import {priorCandleReaction} from './prior-candle-reaction.mjs';
import {completedStreakStage} from './completed-streak-stage.mjs';
import {closedStructureTrajectory} from './closed-structure-trajectory-1392.mjs';
// Sentinel 13.7.9 candidate — causal completed-structure forecast.
// Direction derives from non-overlapping COMPLETED 10s blocks. The latest
// forming block is used only as today's reference price, not a direction vote.
// Historical analogs are optional, causal and compared at actual future time.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const precise=p=>Number(p.toPrecision(12));
function clean(quotes,now){
 const byTs=new Map();
 for(const q of quotes||[]){
  const ts=Number(q?.ts),p=Number(q?.price),recv=Number(q?.receivedAt??q?.ts);
  if(!(Number.isFinite(ts)&&ts<=now&&Number.isFinite(recv)&&recv<=now&&
    Number.isFinite(p)&&p>0))continue;
  const prev=byTs.get(ts);
  if(!prev||recv<prev.recv)byTs.set(ts,{ts,recv,lp:Math.log(p)});
 }
 return [...byTs.values()].sort((a,b)=>a.ts-b.ts).slice(-6000);
}
function before(rows,t){
 let lo=0,hi=rows.length-1,best=-1;
 while(lo<=hi){const mid=(lo+hi)>>1;
  if(rows[mid].ts<=t){best=mid;lo=mid+1}else hi=mid-1;
 }
 return best<0?null:rows[best];
}
function after(rows,t){
 let lo=0,hi=rows.length-1,best=-1;
 while(lo<=hi){const mid=(lo+hi)>>1;
  if(rows[mid].ts>=t){best=mid;hi=mid-1}else lo=mid+1;
 }
 return best<0?null:rows[best];
}
function profile(all,t){
 // Historical anchors must use data RECEIVED before that anchor.
 // Every feature uses at most the prior 100s. Binary-search that
 // bounded interval instead of filtering up to 6,000 quotes for EACH
 // historical analogue. Keep receipt-time causality unchanged.
 let lo=0,hi=all.length;
 while(lo<hi){const m=(lo+hi)>>1;if(all[m].ts<=t)lo=m+1;else hi=m}
 const end=lo;
 lo=0;hi=end;
 const earliest=t-105000;
 while(lo<hi){const m=(lo+hi)>>1;if(all[m].ts<earliest)lo=m+1;else hi=m}
 const rows=all.slice(lo,end).filter(x=>x.recv<=t);
 const at=before(rows,t);
 if(!at||t-at.ts>2500)return null;
 const closed=Math.floor(t/10000)*10000;
 // Ten 10s boundary prices => NINE independent completed 10s moves.
 // Last quoted instant of the FORMING bar cannot change these features.
 const points=[];
 for(let k=9;k>=0;k--){
  const wall=closed-k*10000,q=before(rows,wall);
  if(!q||wall-q.ts>3500)return null;
  points.push(q.lp);
 }
 const observed=rows.filter(x=>x.ts>=closed-90000&&x.ts<=closed);
 let squared=0,elapsed=0,travel=0;
 for(let i=1;i<observed.length;i++){
  const dt=(observed[i].ts-observed[i-1].ts)/1000;
  if(!(dt>0&&dt<=3))continue;
  const dx=observed[i].lp-observed[i-1].lp;
  squared+=dx*dx;elapsed+=dt;travel+=Math.abs(dx);
 }
 if(elapsed<52||!(squared>0))return null;
 const sigma=Math.sqrt(squared/elapsed);
 const bars=points.slice(1).map((p,i)=>p-points[i]);
 const mean=(arr)=>arr.reduce((a,b)=>a+b,0)/arr.length;
 const prior=mean(bars.slice(0,6));          // Previous completed 60s.
 const recent=mean(bars.slice(6));          // Most recent completed 30s.
 const lastTwo=bars.slice(-2),priorSign=Math.sign(prior);
 const recentSign=Math.sign(recent);
 const normalized10=Math.max(1e-12,sigma*Math.sqrt(10));
 const recentImpulse=Math.abs(bars.slice(-3).reduce((a,b)=>a+b,0))/
  Math.max(1e-12,sigma*Math.sqrt(30));
 const opposed=priorSign!==0&&recentSign!==0&&priorSign!==recentSign;
 const twoAgainst=lastTwo.every(v=>Math.sign(v)===recentSign);
 const swingBreak=opposed&&(recentSign>0?
   points.at(-1)>Math.max(...points.slice(4,8)):
   points.at(-1)<Math.min(...points.slice(4,8)));
 const reversal=opposed&&twoAgainst&&recentImpulse>=.72&&swingBreak;
 const location=(points.at(-1)-Math.min(...points))/
  Math.max(1e-12,Math.max(...points)-Math.min(...points));
 const againstLast=priorSign!==0&&Math.sign(bars.at(-1))===-priorSign;
 const spentLeg=againstLast&&
  Math.abs(bars.at(-1))<Math.abs(bars.at(-2))*.65&&
  Math.abs(bars.at(-2))<Math.abs(bars.at(-3))*.85;
 const exhaustion=spentLeg&&(priorSign>0?location>.88:location<.12);
 // Classify continuous trends from persistence, not distance travelled.
 // A soft opposite bar at an extreme is a pullback, not a mandatory range/stop.
 const recentBars=bars.slice(-6),grossTravel=recentBars.reduce((s,x)=>s+Math.abs(x),0);
 const netTravel=Math.abs(recentBars.reduce((s,x)=>s+x,0));
 const efficiency=grossTravel>0?netTravel/grossTravel:0;
 const signChanges=recentBars.slice(1).filter((x,i)=>
   Math.sign(x)!==Math.sign(recentBars[i])).length;
 const weakHistory=Math.abs(points.at(-1)-points[0])/
  Math.max(1e-12,sigma*Math.sqrt(90))<.75;
 const persistentTrend=priorSign!==0&&priorSign===recentSign&&
   !weakHistory&&efficiency>=.68&&signChanges<=2;
 const sideways=signChanges>=3&&efficiency<.48;
 const range=!reversal&&(weakHistory||sideways||(exhaustion&&!persistentTrend));
 const regime=reversal?'reversal':range?'range':'trend';
 const volatility=Math.max(normalized10,1e-12);
 const features=[
  clamp(prior/volatility,-4,4),clamp(recent/volatility,-4,4),
  clamp((bars.slice(-6).reduce((a,b)=>a+b,0))/Math.max(1e-12,sigma*Math.sqrt(60)),-4,4),
  clamp((recent-prior)/volatility,-4,4),
  clamp(bars.at(-1)/volatility,-4,4),
  clamp((bars.at(-1)-bars.at(-2))/volatility,-4,4),
  clamp((points.at(-1)-Math.max(...points))/volatility,-4,4),
  clamp((points.at(-1)-Math.min(...points))/volatility,-4,4)
 ];
 return {at,points,bars,sigma,prior,recent,regime,priorSign,recentSign,
  reversal,range,exhaustion,persistentTrend,efficiency,signChanges,
  normalized10,recentImpulse,features,closed,travel};
}
export function forwardRegime(p){
 if(!p)return {regime:'unknown',turn:false};
 return {regime:p.regime,turn:p.reversal,priorSide:p.priorSign,
  recentSide:p.recentSign,recentImpulse:p.recentImpulse};
}
// One curve for all candidate entry instants and the actual expiry;
// no separate CALL/PUT blocking after a 4-candle streak.
const structureMove=closedStructureTrajectory;
function matches(rows,now,current,maxSeconds){
 const cutoff=now-maxSeconds*1000-3500;
 const first=rows[0].ts+95000;
 const stride=Math.max(30000,Math.min(90000,maxSeconds*1000));
 const cases=[];
 for(let t=first;t<=cutoff;t+=stride){
  const old=profile(rows,t);
  if(!old)continue;
  const outcome=after(rows,t+maxSeconds*1000);
  if(!outcome||outcome.recv>now||outcome.ts-(t+maxSeconds*1000)>3000)continue;
  const weights=[1.7,1.7,1.2,1.1,.45,.45,.4,.4];
  const d=current.features.reduce((v,f,i)=>v+weights[i]*(f-old.features[i])**2,0);
  cases.push({t,origin:old.at.lp,sigma:old.sigma,regime:old.regime,
   dist:Math.sqrt(d/7.4)});
 }
 const same=cases.filter(x=>x.regime===current.regime);
 const eligible=same.length>=5?same:cases;
 if(eligible.length<6)return null;
 const neighbors=eligible.sort((a,b)=>a.dist-b.dist).slice(0,8);
 return {cases,neighbors};
}
export function causalForwardPath({quoteHistory=[],candles=[],asOf=Date.now(),
 holdingSeconds=30,maxSeconds=90}={}){
 const now=Number(asOf),hold=Number(holdingSeconds),end=Number(maxSeconds);
 const invalid=status=>({status,priceAt:()=>null,
  modelVersion:'causal-closed-structure-1379'});
 const rows=clean(quoteHistory,now),latest=rows.at(-1);
 if(!(latest&&now-latest.ts<=2500&&hold>=5&&hold<=3600&&end>=hold&&end<=7200))
  return invalid('stale-or-invalid-horizon');
 const current=profile(rows,latest.ts);
 if(!current)return invalid('insufficient-completed-structure');
 const streakStage=completedStreakStage({candles,quotePrice:Math.exp(latest.lp),
   asOf:now,sigma:current.sigma});
 current.streakStage=streakStage;
 const analog=current.exhaustion?null:matches(rows,now,current,end);
 const levelReaction=priorCandleReaction({candles,quoteHistory,asOf:now,sigma:current.sigma});
 const priceAt=s=>{
  if(!(Number.isFinite(s)&&s>=0&&s<=end))return null;
  if(s===0)return precise(Math.exp(latest.lp));
  let move=structureMove(current,s);
  if(analog){
   let total=0,sum=0;
   for(const row of analog.neighbors){
    const future=after(rows,row.t+s*1000);
    if(!future||future.recv>now||future.ts-row.t-s*1000>3000)continue;
    const w=1/(.3+row.dist)**2;
    sum+=clamp((future.lp-row.origin)*
      clamp(current.sigma/Math.max(1e-12,row.sigma),.5,1.8),
      -current.sigma*Math.sqrt(s)*2,current.sigma*Math.sqrt(s)*2)*w;
    total+=w;
   }
   if(total>0){
    const similarity=clamp(1/(1+analog.neighbors[0].dist),.2,.8);
    const mix=.35*similarity*clamp((analog.neighbors.length-3)/5,0,1);
    move=move*(1-mix)+(sum/total)*mix;
   }
  }
  // A measured failed test of the prior candle changes the estimated PATH;
  // it is not an extra entry veto or a fixed waiting period. A sustained
  // break receives no such reversal correction.
  if(levelReaction){
   // A return inside the prior candle can be an ordinary pullback. An
   // unconfirmed rejection must not entirely overwrite a persistent
   // completed-structure forecast on one short-lived price swing.
   const weight=clamp((levelReaction.normalizedRetreat-.75)/2.6,.12,.88);
   const rejection=levelReaction.rate*15*(1-Math.exp(-s/15));
   move=move*(1-weight)+rejection*weight;
  }
  const cap=current.sigma*Math.sqrt(s)*3;
  return precise(Math.exp(latest.lp+clamp(move,-cap,cap)));
 };
 return {status:'causal-forward-path',priceAt,
  modelVersion:'causal-closed-structure-1379',
  referencePrice:precise(Math.exp(latest.lp)),
  sigmaPerSqrtSecond:current.sigma,
  analogExamples:analog?.cases.length||0,
  analogNeighbors:analog?.neighbors.length||0,
  regime:levelReaction?'level-rejection':current.regime,
  levelReaction,trendContinuation:current.persistentTrend,
  directionalEfficiency:current.efficiency,
  completedSignChanges:current.signChanges,streakStage,
  reversalEvidence:current.reversal?
    {confirmedClosedBlocks:true,recentImpulse:current.recentImpulse}:null,
  latestQuoteAt:latest.ts,
  quoteSpanSeconds:(latest.ts-rows[0].ts)/1000,
  completedStructureEndAt:current.closed,
  predictedOnClosedHistory:true,causal:true};
}

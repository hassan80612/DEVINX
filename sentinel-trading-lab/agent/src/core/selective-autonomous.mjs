// Seletiva: search OBSERVED, completed outcomes for similar earlier
// market states. Entirely independent of the selected strategy, the live
// candle's direction and the automatic trend extrapolator.
// All forecasts are informational; neither confidence nor outcomes here
// represent broker win rates or permission for an order.
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const valid=n=>Number.isFinite(Number(n))&&Number(n)>0;
const round=n=>Number(n.toPrecision(12));

export function autonomousSelectiveEntry({quoteHistory=[],now=Date.now(),delaySeconds=30,
 holdingSeconds=delaySeconds,quoteTs=0,asset='UNKNOWN',engineId='automatic'}={}){
 const h=Number(delaySeconds),hold=Number(holdingSeconds),at=Number(quoteTs);
 const blank=status=>({engineId,asset,delaySeconds:h,holdingSeconds:hold,issuedAt:now,
  entryAt:now+h*1000,exitAt:now+(h+hold)*1000,side:null,
  projectedEntryPrice:null,projectedExitPrice:null,status,
  forecastOwner:'selective-historical-outcomes-v2',actionable:false,calibrated:false});
 if(!Number.isInteger(h)||h<0||h>3600||!Number.isInteger(hold)||hold<1||hold>3600)
  return blank('invalid-interval');
 if(!(at>0&&at<=now&&now-at<=2500))return blank('waiting-fresh-quote');
 const unique=new Map();
 for(const q of quoteHistory){
  const ts=Number(q?.ts),p=Number(q?.price),received=Number(q?.receivedAt??q?.ts);
  if(!Number.isFinite(ts)||!valid(p)||ts>now||received>now||!Number.isFinite(received))continue;
  const earlier=unique.get(ts);
  if(received<=ts+8000&&(!earlier||received<earlier.receivedAt))unique.set(ts,{ts,p,receivedAt:received});
 }
 const rows=[...unique.values()].sort((a,b)=>a.ts-b.ts);
 if(rows.length<12||now-rows.at(-1).ts>2500)return blank('waiting-fresh-quote');
 // A decision is anchored to the last completed observation interval.
 // The CURRENT partially forming bar/tick cannot flip it in milliseconds.
 const effectiveH=Math.max(h,hold);
 const grid=effectiveH<=15?10000:effectiveH<=120?15000:30000;
 const anchor=Math.floor(now/grid)*grid;
 // A closed observation may be several seconds old; train against the
 // ACTUAL future entry timestamp, not the older feature anchor.
 const elapsedMs=now-anchor;
 const lookup=t=>{
  let lo=0,hi=rows.length-1,i=-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(rows[m].ts<=t){i=m;lo=m+1;}else hi=m-1;}
  return i>=0&&t-rows[i].ts<=8000&&rows[i].receivedAt<=t?rows[i].p:null;
 };
 const last=lookup(anchor);
 if(!last)return blank('waiting-completed-observation');
 // Historical windows are descriptive FEATURES, never permission gates.
 // Timeframe is an input to the FEATURES and the future TARGET. No shared
 // fixed "5s vs 1m" model, 30s candle proxy or UI-only timer conversion.
 const recentLag=clamp(Math.round(6+effectiveH*.3),8,90);
 const middleLag=clamp(Math.round(15+effectiveH*.65),recentLag+10,300);
 const longLag=clamp(Math.round(30+effectiveH*1.3),middleLag+15,600);
 const lag=[recentLag,middleLag,longLag],oldest=rows[0].ts;
 // Historical sigma is cached once, not re-scanned for hundreds of
 // examples on each market update. Remove future-arrival contamination by
 // measuring at an 8s-known boundary, matching the observed quote tolerance.
 const prefixSq=[0],prefixSeconds=[0];
 for(let i=0;i<rows.length;i++){
  let square=0,dt=0;
  if(i>0){
   const seconds=(rows[i].ts-rows[i-1].ts)/1000;
   if(seconds>0&&seconds<=8){
    const change=Math.log(rows[i].p/rows[i-1].p);
    square=change*change;dt=seconds;
   }
  }
  prefixSq.push(prefixSq.at(-1)+square);
  prefixSeconds.push(prefixSeconds.at(-1)+dt);
 }
 const indexAt=t=>{
  let lo=0,hi=rows.length-1,out=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;
   if(rows[mid].ts<=t){out=mid;lo=mid+1;}else hi=mid-1;
  }
  return out;
 };
 const volatility=t=>{
  const end=indexAt(t-8000);
  if(end<1)return null;
  let lo=0,hi=end,start=end;
  while(lo<=hi){const mid=(lo+hi)>>1;
   if(rows[mid].ts>=t-120000){start=mid;hi=mid-1;}else lo=mid+1;
  }
  const duration=prefixSeconds[end+1]-prefixSeconds[start+1];
  const sum=prefixSq[end+1]-prefixSq[start+1];
  return duration>=12&&sum>0?Math.sqrt(sum/duration):null;
 };
 const features=t=>{
  const p=lookup(t),sigma=volatility(t);
  if(!p||!sigma)return null;
  const before=lag.map(l=>lookup(t-l*1000));
  const prior=lookup(t-middleLag*2000);
  if(before.some(x=>!x)||!prior)return null;
  const logp=Math.log(p),moves=before.map((x,i)=>
    clamp(Math.log(p/x)/(sigma*Math.sqrt(lag[i])),-5,5));
  const acceleration=clamp((logp-2*Math.log(before[1])+Math.log(prior))/
    (sigma*Math.sqrt(middleLag*2)),-5,5);
  // Normalized position in the previous short range, a reversal/exhaustion
  // feature. No future observations or selected-strategy inputs.
  return {p,sigma,vector:[...moves,acceleration]};
 };
 const live=features(anchor);
 if(!live)return blank('insufficient-observations');
 const stride=Math.max(3,Math.min(18,Math.round(effectiveH/5)));
 const historic=[];
 // Every example must have FINISHED both entry and expiry before the
 // current anchor. A missing or interrupted quote is never backfilled.
 for(let t=anchor-elapsedMs-(h+hold)*1000;t>=oldest+Math.max(longLag,middleLag*2)*1000&&historic.length<240;
  t-=stride*1000){
  const x=features(t),entry=lookup(t+elapsedMs+h*1000),
   exit=lookup(t+elapsedMs+(h+hold)*1000);
  if(!x||!entry||!exit)continue;
  const scaled=x.sigma*Math.sqrt(hold);
  if(!(scaled>0))continue;
  historic.push({at:t,vector:x.vector,
   entryMove:Math.log(entry/x.p)/scaled,
   exitMove:Math.log(exit/x.p)/scaled,
   paired:(Math.log(exit/entry))/scaled});
 }
 if(historic.length<12)return blank('insufficient-completed-outcomes');
 const weights=[1.0,1.1,1.0,.65];
 const select=(query,pool)=>{
  const matches=pool.map(e=>{
   let distance=0;
   for(let i=0;i<weights.length;i++)
    distance+=weights[i]*(query.vector[i]-e.vector[i])**2;
   return {...e,distance};
  }).filter(x=>x.distance<=4).sort((a,b)=>a.distance-b.distance)
   .slice(0,Math.min(13,Math.max(7,Math.ceil(pool.length*.15))));
  if(matches.length<7)return null;
  let w=0,up=0,mEntry=0,mExit=0,mPair=0,variance=0;
  for(const m of matches){
   const wt=1/(.5+m.distance);
   w+=wt;if(m.paired>0)up+=wt;
   mEntry+=wt*m.entryMove;mExit+=wt*m.exitMove;mPair+=wt*m.paired;
  }
  const mean=mPair/w,callShare=up/w;
  for(const m of matches){
   const wt=1/(.5+m.distance);
   variance+=wt*(m.paired-mean)**2;
  }
  const side=mean>0?'CALL':mean<0?'PUT':null;
  return {side,mean,callShare,agreement:side==='CALL'?callShare:1-callShare,
   dispersion:Math.sqrt(variance/w),entry:mEntry/w,exit:mExit/w,
   examples:matches.length};
 };
 const projection=select(live,historic);
 if(!projection)return blank('no-comparable-historical-pattern');
 const base=historic.filter(x=>x.paired!==0);
 const baseCall=base.filter(x=>x.paired>0).length/Math.max(1,base.length);
 const baseAgreement=projection.side==='CALL'?baseCall:1-baseCall;
 // A majority alone is NOT evidence: require historical pattern strength,
 // plus either clear uplift versus unconditional drift or a strong edge.
 const support=projection.agreement>=.68;
 const lift=projection.agreement-baseAgreement;
 const effect=Math.abs(projection.mean);
 const robust=effect>=.24&&effect>=projection.dispersion*.25;
 const specific=lift>=.06||(projection.agreement>=.79&&effect>=.55);
 // Chronological shadow validation, when enough completed cases exist.
 // Does not read broker settlement and never claims a calibrated win rate.
 let tested=0,hits=0;
 if(historic.length>=35){
  const order=historic.slice().reverse(),split=Math.floor(order.length*.76);
  for(let i=split;i<order.length;i++){
   const example=order[i];
   const past=order.slice(0,i).filter(x=>x.at+elapsedMs+(h+hold)*1000<=example.at);
   if(past.length<12)continue;
   const predicted=select(example,past);
   if(!predicted||predicted.agreement<.68)continue;
   tested++;
   if((predicted.side==='CALL'&&example.paired>0)||
      (predicted.side==='PUT'&&example.paired<0))hits++;
  }
 }
 // Do not learn permission from a demonstrably losing held-out period.
 const validated=tested<6||hits/tested>=.46;
 const accepted=support&&robust&&specific&&validated;
 const result={...blank(accepted?'forecast':'no-validated-historical-edge'),
  historicalExamples:historic.length,similarExamples:projection.examples,
  featureLagsSeconds:lag,analysisLeadSeconds:h,holdingSeconds:hold,
  featureAnchorAt:anchor,decisionAt:now,anchorOffsetSeconds:elapsedMs/1000,
  historicalAgreement:projection.agreement,validationExamples:tested,
  validationCorrect:hits,scenarioAt:anchor};
 if(!accepted)return result;
 const scale=live.sigma*Math.sqrt(hold);
 // Entry and expiry have separate historical outcome labels. Project their
 // levels from the same completed anchor, then verify the paired sign.
 const projectedEntryPrice=round(live.p*Math.exp(projection.entry*scale));
 const projectedExitPrice=round(live.p*Math.exp(projection.exit*scale));
 const diff=Math.log(projectedExitPrice/projectedEntryPrice);
 if(!(Math.abs(diff)>scale*.18)||Math.sign(diff)!==Math.sign(projection.mean))
  return {...result,status:'incoherent-conditional-path'};
 return {...result,status:'forecast',side:diff>0?'CALL':'PUT',
  projectedEntryPrice,projectedExitPrice};
}

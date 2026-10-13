// Causal evidence for the selected estimator's ENTRY -> EXPIRY decisions.
// No broker calls or persistent records. Historical predictions see only
// quotes that had arrived at issue time; outcomes never overlap.
const cache=new Map();
export function evidenceFromOutcomes(outcomes=[]){
 const samples=outcomes.length,hits=outcomes.filter(x=>x.correct===true).length;
 if(!samples)return {qualified:false,samples:0,hits:0,lowerBound:0};
 // 95% Wilson lower bound: ten wins out of twenty cannot pass as an edge.
 // This is sampling uncertainty, not a displayed future win probability.
 const z=1.959963984540054,p=hits/samples,z2=z*z;
 const lowerBound=(p+z2/(2*samples)-z*Math.sqrt(p*(1-p)/samples+z2/(4*samples*samples)))/(1+z2/samples);
 return {qualified:samples>=6&&lowerBound>.5,samples,hits,lowerBound};
}

export function observedEntryEvidence({quoteHistory=[],now,holdingSeconds,
 context='',predict}={}){
 const span=Number(holdingSeconds)*1000;
 if(!(span>=5000)||typeof predict!=='function')return evidenceFromOutcomes();
 const rows=quoteHistory.filter(q=>Number(q.ts)<=now&&
   Number(q.receivedAt??q.ts)<=now&&Number(q.price)>0)
   .slice().sort((a,b)=>Number(a.ts)-Number(b.ts));
 if(!rows.length)return evidenceFromOutcomes();
 const boundary=Math.floor(now/span)*span;
 const key=context+'|'+span;
 let saved=cache.get(key);
 // Never reuse a different recording/session or a historical replay rewind.
 if(!saved||boundary<saved.boundary||Number(rows[0].ts)>saved.boundary||
   !rows.some(q=>Number(q.ts)===saved.tailAt&&Number(q.price)===saved.tailPrice)){
   saved={boundary:0,outcomes:new Map()};
 }
 const at=t=>{
   let lo=0,hi=rows.length-1,out=-1;
   while(lo<=hi){const m=(lo+hi)>>1;if(Number(rows[m].ts)<=t){out=m;lo=m+1;}else hi=m-1;}
   const q=rows[out];
   return q&&t-Number(q.ts)<=2500&&Number(q.receivedAt??q.ts)<=t?{q,index:out}:null;
 };
 // Three observed holding-period legs describe the current behaviour;
 // they never choose CALL/PUT. Do not use successes in continuous movement
 // as evidence for a retracement or a changing-direction range.
 const behaviourAt=t=>{
   const points=[3,2,1,0].map(i=>at(t-i*span)?.q);
   if(points.some(p=>!p))return null;
   const legs=points.slice(1).map((p,i)=>Math.sign(Number(p.price)-Number(points[i].price)));
   if(legs.every(s=>s!==0&&s===legs[0]))return 'continuous';
   if(legs[0]!==0&&legs[0]===legs[1]&&legs[2]===-legs[1])return 'retracement';
   return 'range';
 };
 const strengthAt=t=>{
   const first=at(t-span),last=at(t);
   if(!first||!last)return null;
   let path=0;
   for(let i=first.index+1;i<=last.index;i++){
     if(Number(rows[i].receivedAt??rows[i].ts)>t)return null;
     path+=Math.abs(Math.log(Number(rows[i].price)/Number(rows[i-1].price)));
   }
   return path>0?Math.abs(Math.log(Number(last.q.price)/Number(first.q.price)))/path:0;
 };
 for(let i=20;i>=1;i--){
   const issuedAt=boundary-i*span,exitAt=issuedAt+span;
   if(saved.outcomes.has(issuedAt))continue;
   const entry=at(issuedAt),exit=at(exitAt);
   if(!entry||!exit)continue;
   const known=rows.slice(0,entry.index+1).filter(q=>Number(q.receivedAt??q.ts)<=issuedAt);
   const result=predict({quoteHistory:known,now:issuedAt,quoteTs:Number(entry.q.ts),price:Number(entry.q.price)});
   const side=result?.side;
   saved.outcomes.set(issuedAt,{issuedAt,exitAt,side,behaviour:behaviourAt(issuedAt),strength:strengthAt(issuedAt),
     correct:side==='CALL'?Number(exit.q.price)>Number(entry.q.price):
       side==='PUT'?Number(exit.q.price)<Number(entry.q.price):null});
 }
 saved.outcomes=new Map([...saved.outcomes].filter(([at])=>at>=boundary-20*span&&at<boundary));
 const fingerprint=at(boundary-span)?.q||rows[0];
 saved.boundary=boundary;saved.tailAt=Number(fingerprint.ts);saved.tailPrice=Number(fingerprint.price);
 cache.delete(key);cache.set(key,saved);
 while(cache.size>24)cache.delete(cache.keys().next().value);
 const behaviour=behaviourAt(now);
 const outcomes=behaviour?[...saved.outcomes.values()].filter(x=>
   x.behaviour===behaviour&&(x.side==='CALL'||x.side==='PUT')):[];
 const strength=strengthAt(now),observed=outcomes.map(x=>x.strength).filter(Number.isFinite);
 // Same direction alone is not sustained force. A weak/noisy leg cannot
 // borrow the record of stronger historical legs. Restrict to the observed
 // strength range; do not invent a universal percentage for every asset.
 const comparable=Number.isFinite(strength)&&observed.length>0&&
   strength>=Math.min(...observed)-1e-12&&strength<=Math.max(...observed)+1e-12;
 const evidence=evidenceFromOutcomes(outcomes);
 return {...evidence,qualified:evidence.qualified&&comparable,observedUntil:boundary,
   strength,comparableStrength:comparable,
   holdingSeconds:Number(holdingSeconds),behaviour,nonOverlapping:true};
}

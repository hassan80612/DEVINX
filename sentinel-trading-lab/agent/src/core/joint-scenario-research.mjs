/**
 * Independent direct future-interval predictor.
 * Learns a shared trajectory and paired ENTRY->EXPIRY return from fully
 * completed historical examples. Tuning is chronological and purged.
 * Research only: one conditional distribution of complete future paths.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):null;
const round=n=>Number(n.toPrecision(12));
function temporalContext(quoteHistory,now){
 const known=new Map();
 for(const q of Array.isArray(quoteHistory)?quoteHistory:[]){
  const ts=Number(q?.ts),p=positive(q?.price),arrival=Number(q?.receivedAt??ts);
  if(!Number.isFinite(ts)||ts<0||ts>now||!p||!Number.isFinite(arrival)||arrival>now)continue;
  const readyAt=Math.max(ts,arrival);
  if(!known.has(ts)||known.get(ts).readyAt>readyAt)known.set(ts,{ts,p,readyAt});
 }
 const events=[...known.values()].sort((a,b)=>a.readyAt-b.readyAt||a.ts-b.ts);
 if(!events.length)return [];
 const earliest=events[0].readyAt;
 const start=now-Math.floor(Math.min(7200000,now-earliest)/1000)*1000;
 let j=0,quote=null,series=[];
 for(let ts=start;ts<=now;ts+=1000){
  // A historical feature sees only quotes already ARRIVED at that time.
  // Later backfills cannot rewrite a previously sampled context.
  while(j<events.length&&events[j].readyAt<=ts){
   if(!quote||events[j].ts>quote.ts)quote=events[j];
   j++;
  }
  if(!quote||ts-quote.ts>2500){series=[];continue;}
  series.push({ts,lp:Math.log(quote.p),quoteAt:quote.ts});
 }
 return series;
}

function fitForest(samples,{depth,halfLife},seed=110310){
 const last=samples.at(-1).i,weights=samples.map(s=>halfLife===Infinity?1:Math.exp(-Math.LN2*(last-s.i)/halfLife));
 let state=seed>>>0;
 const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 const classes=samples.map(s=>s.direction<0?0:s.direction===0?1:2);
 const minLeaf=Math.max(12,Math.min(40,Math.round(samples.length*.025)));
 const counts=ids=>{const c=[0,0,0];for(const id of ids)c[classes[id]]+=weights[id];return c;};
 const impurity=c=>{const total=c.reduce((a,b)=>a+b,0);return total?total-c.reduce((a,b)=>a+b*b,0)/total:0;};
 const splitNode=(ids,level)=>{
  const c=counts(ids),parent=impurity(c),node={ids};
  if(level>=depth||ids.length<2*minLeaf||parent<1e-10)return node;
  const dimensions=samples[0].x.length-1,features=[];
  while(features.length<Math.min(7,dimensions)){
   const f=1+Math.floor(random()*dimensions);if(!features.includes(f))features.push(f);
  }
  let bestGain=0,best=null;
  for(const feature of features){
   const probes=Array.from({length:9},()=>samples[ids[Math.floor(random()*ids.length)]].x[feature]).sort((a,b)=>a-b);
   for(const threshold of [probes[2],probes[4],probes[6]]){
    const left=[],right=[],lc=[0,0,0],rc=[0,0,0];
    for(const id of ids){const l=samples[id].x[feature]<=threshold;
     (l?left:right).push(id);(l?lc:rc)[classes[id]]+=weights[id];}
    if(left.length<minLeaf||right.length<minLeaf)continue;
    const gain=parent-impurity(lc)-impurity(rc);
    if(gain>bestGain+1e-8){bestGain=gain;best={feature,threshold,left,right};}
   }
  }
  if(!best||bestGain/Math.max(1,c.reduce((a,b)=>a+b,0))<.001)return node;
  return {feature:best.feature,threshold:best.threshold,
   left:splitNode(best.left,level+1),right:splitNode(best.right,level+1)};
 };
 const trees=Array.from({length:16},()=>splitNode(samples.map((_,i)=>i),0));
 const total=weights.reduce((a,b)=>a+b,0);
 const distribution=x=>{
  const result=weights.map(w=>.02*w/total);
  for(const tree of trees){let node=tree;while(!node.ids)node=x[node.feature]<=node.threshold?node.left:node.right;
   const sum=node.ids.reduce((v,id)=>v+weights[id],0);
   for(const id of node.ids)result[id]+=.98*weights[id]/sum/trees.length;
  }
  const mass=[0,0,0];for(let i=0;i<result.length;i++)mass[classes[i]]+=result[i];
  return {weights:result,mass};
 };
 return {distribution,minLeaf,trees:trees.length};
}

export function jointScenarioForecasts({
 quoteHistory=[],asOf=Date.now(),entryDelaySeconds=30,holdingSeconds=30
}={}){
 const now=Number(asOf),lead=Number(entryDelaySeconds),hold=Number(holdingSeconds);
 const empty=status=>({status,side:null,issuedAt:now,
  entryAt:now+lead*1000,exitAt:now+(lead+hold)*1000,
  entryDelaySeconds:lead,holdingSeconds:hold,expectedPath:[],
  actionable:false,calibrated:false,modelConfidence:null});
 if(!Number.isFinite(now)||!Number.isInteger(lead)||lead<0||
    !Number.isInteger(hold)||hold<1||lead+hold>1800)return empty('invalid-interval');
 const rows=temporalContext(quoteHistory,now),n=rows.length;
 const endOffset=lead+hold;
 const maxLag=Math.min(600,Math.max(180,hold*2));
 if(n<maxLag+endOffset+40)return empty('insufficient-completed-context');
 const lp=rows.map(q=>q.lp),ret=lp.map((v,i)=>i?v-lp[i-1]:0);
 const sq=[0],abs=[0];
 for(const r of ret){sq.push(sq.at(-1)+r*r);abs.push(abs.at(-1)+Math.abs(r));}
 const sigma=(i,w)=>Math.sqrt(Math.max((sq[i+1]-sq[Math.max(0,i+1-w)])/w,1e-15));
 const lags=[...new Set([2,5,10,15,30,60,90,120,180,240,300,450,600,
  Math.max(1,Math.round(hold/4)),Math.max(1,Math.round(hold/2)),hold,
  Math.round(hold*1.5),hold*2].filter(v=>v<=maxLag))].sort((a,b)=>a-b);
 const features=i=>{
  const s=sigma(i,90),scale=s*Math.sqrt(hold);
  let low=Infinity,high=-Infinity;
  for(let j=i-180;j<=i;j++){low=Math.min(low,lp[j]);high=Math.max(high,lp[j]);}
  const width=high-low;
  const movement=abs[i+1]-abs[i-89];
  const x=[1,...lags.map(lag=>clamp((lp[i]-lp[i-lag])/(s*Math.sqrt(lag)),-15,15)),
   clamp((lp[i]-2*lp[i-30]+lp[i-60])/(s*Math.sqrt(30)),-15,15),
   width>1e-12?2*(lp[i]-low)/width-1:0,
   movement>1e-12?Math.abs(lp[i]-lp[i-90])/movement:0,
   clamp(Math.log((sigma(i,30)+1e-12)/(sigma(i,180)+1e-12)),-4,4)];
  return {x,scale};
 };

 const stride=Math.max(2,Math.round(hold/10)),samples=[];
 for(let i=maxLag;i+endOffset<n;i+=stride){
  const f=features(i),direction=Math.sign(lp[i+endOffset]-lp[i+lead]);
  const path=Array.from({length:endOffset+1},(_,k)=>(lp[i+k]-lp[i])/f.scale);
  samples.push({i,x:f.x,path,direction,outcomeAt:rows[i+endOffset].ts});
 }
 if(samples.length<16)return empty('insufficient-completed-examples');
 const split=Math.floor(samples.length*.75),validation=samples.slice(split),validationStart=samples[split]?.i;
 const training=samples.slice(0,split).filter(s=>s.i+endOffset<validationStart);
 const canTune=training.length>=40&&validation.length>=8;
 const grid=canTune?[3,5].flatMap(depth=>[600,1800,Infinity].map(halfLife=>({depth,halfLife}))):[{depth:3,halfLife:1800}];
 let chosen=grid[0],loss=null,validationHits=null;
 for(const config of grid){
  const model=fitForest(canTune?training:samples,config);
  if(!canTune)continue;
  let error=0,count=0,hits=0;
  for(const s of validation){
   if(!s.direction)continue;
   const p=model.distribution(s.x).mass,probability=p[2]/Math.max(1e-12,p[0]+p[2]);
   error-=Math.log(Math.max(s.direction>0?probability:1-probability,1e-12));
   hits+=(probability>=.5?1:-1)===s.direction;count++;
  }
  if(!count)continue;error/=count;
  if(loss===null||error<loss-1e-12){loss=error;chosen=config;validationHits=hits/count;}
 }
 const model=fitForest(samples,chosen),current=features(n-1),dist=model.distribution(current.x);
 const directionMass=dist.mass[0]+dist.mass[2];
 if(directionMass<=1e-12)return empty('no-completed-directional-outcomes');
 const sign=dist.mass[2]>=dist.mass[0]?1:-1,side=sign>0?'CALL':'PUT';
 const group=samples.map((s,i)=>({s,weight:s.direction===sign?dist.weights[i]:0})).filter(v=>v.weight>0);
 const groupMass=group.reduce((a,b)=>a+b.weight,0),mean=Array(endOffset+1).fill(0);
 for(const {s,weight} of group)for(let k=0;k<=endOffset;k++)mean[k]+=weight*s.path[k]/groupMass;
 const maximumWeight=Math.max(...group.map(s=>s.weight));
 let selected=null,bestDistance=Infinity;
 for(const candidate of group){
  if(candidate.weight<maximumWeight*.25)continue;
  let distance=0;
  for(let k=lead;k<=endOffset;k++)distance+=(candidate.s.path[k]-mean[k])**2;
  distance/=(hold+1);
  if(distance<bestDistance){bestDistance=distance;selected=candidate;}
 }
 const prior=Math.sign(lp.at(-1)-lp.at(-31)),base=lp.at(-1),models={};
 for(const [name,path] of [['conditionalMean',mean],['representativePath',selected.s.path]]){
  const expectedPath=path.map((v,k)=>({secondsFromNow:k,price:round(Math.exp(base+v*current.scale))}));
  const holding=expectedPath.slice(lead,endOffset+1);
  const top=holding.reduce((a,b)=>b.price>a.price?b:a),bottom=holding.reduce((a,b)=>b.price<a.price?b:a);
  const entry=expectedPath[lead].price,exit=expectedPath[endOffset].price;
  const numericSide=exit>entry?'CALL':exit<entry?'PUT':null;
  if(numericSide!==side)return empty('direction-under-price-resolution');
  models[name]={status:'joint-scenario-research',side,issuedAt:now,entryAt:now+lead*1000,exitAt:now+endOffset*1000,
   entryDelaySeconds:lead,holdingSeconds:hold,projectedEntryPrice:entry,projectedExitPrice:exit,
   expectedPath,events:{top,bottom,reversal:{predicted:prior?sign!==prior:null}},
   expectedLow:bottom.price,expectedHigh:top.price,priceProjectionSide:numericSide,directionPriceDisagreement:false,
   rawCallProbability:dist.mass[2]/directionMass,rawDrawMass:dist.mass[1],
   analogs:group.length,effectiveAnalogCount:groupMass*groupMass/group.reduce((sum,v)=>sum+v.weight*v.weight,0),
   representativeTrainingOutcomeAt:name==='representativePath'?selected.s.outcomeAt:null,
   historicalExamples:samples.length,latestTrainingOutcomeAt:samples.at(-1).outcomeAt,
   latestObservedQuoteAt:rows.at(-1).quoteAt,
   tuningTrainLatestOutcomeAt:canTune?training.at(-1).outcomeAt:null,
   tuningValidationFirstIssueAt:canTune?rows[validation[0].i].ts:null,
   validation:{examples:canTune?validation.length:0,purgedTrainingOutcomes:true,logLoss:loss,accuracy:validationHits,
    meaning:'historical tuning evidence; NOT calibrated future win probability'},
   fitted:{...chosen,halfLife:Number.isFinite(chosen.halfLife)?chosen.halfLife:null,trees:model.trees,minLeaf:model.minLeaf},
   actionable:false,calibrated:false,modelConfidence:null,researchOnly:true,modelVersion:'joint-scenario-research-v1'};
 }
 return {status:'joint-scenario-research',researchOnly:true,models};
}

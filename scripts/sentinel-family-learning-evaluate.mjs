import {readFile,writeFile} from 'node:fs/promises';
// Fixed five-family logistic model. Training labels must be known before the
// first chronological boundary. No validation/test fitting or parameter search.
const study=JSON.parse(await readFile('/tmp/sentinel-real-direction-study.json','utf8'));
const sigmoid=x=>1/(1+Math.exp(-Math.max(-40,Math.min(40,x))));
function fit(rows){
 const n=rows.length,d=5,mean=Array.from({length:d},(_,j)=>rows.reduce((s,r)=>s+r.familyValues[j],0)/n);
 const scale=Array.from({length:d},(_,j)=>Math.max(.05,Math.sqrt(rows.reduce((s,r)=>s+(r.familyValues[j]-mean[j])**2,0)/n)));
 const normalized=rows.map(r=>({x:r.familyValues.map((x,j)=>(x-mean[j])/scale[j]),y:r.settledPrice>r.price?1:0}));
 const prevalence=normalized.reduce((s,r)=>s+r.y,0)/n,w=Array(6).fill(0);w[0]=Math.log(Math.max(.001,prevalence)/Math.max(.001,1-prevalence));
 const lambda=1,step=.1;
 for(let epoch=0;epoch<5000;epoch++){
  const gradient=Array(6).fill(0);
  for(const r of normalized){const residual=sigmoid(w[0]+r.x.reduce((s,x,j)=>s+w[j+1]*x,0))-r.y;gradient[0]+=residual;for(let j=0;j<d;j++)gradient[j+1]+=residual*r.x[j];}
  for(let j=1;j<6;j++)gradient[j]+=lambda*w[j];
  for(let j=0;j<6;j++)w[j]-=step*gradient[j]/n;
 }
 return {mean,scale,weights:w,lambda,iterations:5000,trainingSamples:n,trainingCallShare:prevalence};
}
function probability(model,r){return sigmoid(model.weights[0]+r.familyValues.reduce((s,x,j)=>s+model.weights[j+1]*(x-model.mean[j])/model.scale[j],0));}
function score(rows){
 const wins=rows.filter(r=>r.won).length,n=rows.length;
 return {signals:n,wins,losses:n-wins,winRate:n?100*wins/n:null,callSignals:rows.filter(r=>r.side==='CALL').length,putSignals:rows.filter(r=>r.side==='PUT').length,brier:n?rows.reduce((s,r)=>s+(r.p-(r.y?1:0))**2,0)/n:null};
}
const results=[],allRows=[],models=[];
for(const seconds of [30,60]){
 const records=study.scored.filter(r=>r.seconds===seconds&&r.model==='fresh-base'&&r.settledPrice!=null&&Math.abs(r.settledPrice-r.price)>Math.abs(r.price)*1e-10);
 const train=records.filter(r=>r.partition==='first-60pct'&&r.at+seconds*1000<=study.partitionBoundaries.firstEnd&&r.settledAt<=study.partitionBoundaries.firstEnd);
 const model=fit(train);models.push({seconds,...model,trainingEnd:study.partitionBoundaries.firstEnd});
 const actualBase=new Map(study.scored.filter(r=>r.seconds===seconds&&r.model==='current-base').map(r=>[r.at,r]));
 for(const partition of ['next-20pct','last-20pct']){
  const test=records.filter(r=>r.partition===partition);
  const predictions=test.map(r=>({at:r.at,seconds,partition,p:probability(model,r),y:r.settledPrice>r.price,price:r.price,settledPrice:r.settledPrice,baseP:actualBase.get(r.at)?.callProbability,freshP:r.callProbability}));
  for(const threshold of [.50,.55,.60]){
   const approaches=[];
   for(const [label,key] of [['current-direction','baseP'],['fresh-direction','freshP'],['learned-family','p']]){
    const selected=predictions.filter(r=>Number.isFinite(r[key])&&Math.max(r[key],1-r[key])>=threshold&&r[key]!==.5).map(r=>{const side=r[key]>.5?'CALL':'PUT';return {...r,side,p:r[key],won:side==='CALL'?r.y:!r.y};});
    approaches.push({model:label,...score(selected)});
    if(label==='learned-family')allRows.push(...selected.map(r=>({...r,threshold})));
   }
   results.push({seconds,partition,threshold,eligibleOrigins:predictions.length,approaches,constantCall:score(predictions.map(r=>({...r,p:1,side:'CALL',won:r.y}))),constantPut:score(predictions.map(r=>({...r,p:0,side:'PUT',won:!r.y})))});
  }
 }
}
const result={models,results,allRows,limitations:['Previously inspected one-session OTC data; not an unseen holdout or real orders.','Weights fit only first 60% with expiry embargo; later labels never fit weights.','Fixed lambda=1, five families, three predeclared reporting thresholds; no parameter optimization.','Offline sampled direction study; entry setup/timing/confidence not implemented.','Probabilities are model outputs, not calibrated win-rate guarantees.','Constant-direction benchmarks expose gains due merely to a predominantly rising/falling block.']};
await writeFile('/tmp/sentinel-family-learning-study.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({models,results},null,2));

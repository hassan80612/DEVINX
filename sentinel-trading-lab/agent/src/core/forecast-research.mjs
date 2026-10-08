// Forward-only experiments. Predictions are scored before their labels are learned.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
const featureKeys=['micro','reversal','momentum','trend','history','location','setup','strategy','persistence','acceleration','regime','mtf'];
export function forecastFeatures(plan={}){
  const x=featureKeys.map(k=>clamp(Number(plan.evidenceFamilies?.[k]?.signal||0),-1,1));
  for(const regime of ['trend','range','reversal','breakout'])x.push(plan.regime?.label===regime?1:0);
  x.push(clamp(Number(plan.reliability?.microLead||0)/100,-1,1),plan.safety?.chaseBlocked?1:0,plan.safety?.barrierBlocked?1:0);
  return x;
}
export function wilson(wins,total){
  if(!total)return{low:0,high:100};
  const z=1.96,p=wins/total,d=1+z*z/total,c=(p+z*z/(2*total))/d,r=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
  return{low:Math.round((c-r)*1000)/10,high:Math.round((c+r)*1000)/10};
}
export class ForecastResearch{
  constructor(saved={}){this.models=saved.version===1?saved.models||{}:{};this.pending=saved.version===1?saved.pending||[]:[];this.lastQueued=saved.version===1?saved.lastQueued||{}:{};this.outcomes=saved.version===1?saved.outcomes||[]:[];this.events=[];this.unresolved=Number(saved.unresolved||0)}
  key(asset,seconds,provider='',context=''){return (provider?String(provider).toLowerCase()+'|':'')+String(asset).toUpperCase()+'|'+seconds+(context?'|'+context:'')}
  forecast(asset,plan,provider=''){
    const key=this.key(asset,plan.horizonSeconds,provider,plan.researchContext||''),x=forecastFeatures(plan),m=this.models[key];
    const callProbability=Math.round(sigmoid((m?.bias||0)+x.reduce((v,a,i)=>v+a*Number(m?.weights?.[i]||0),0))*100);
    const rows=this.outcomes.filter(r=>r.key===key&&r.draw!==true).slice(-240),samples=rows.length;
    const differences=rows.map(r=>r.baselineLoss-r.modelLoss),mean=samples?differences.reduce((a,b)=>a+b,0)/samples:0;
    const variance=samples>1?differences.reduce((a,b)=>a+(b-mean)**2,0)/(samples-1):0;
    const improvementLowerBound=mean-1.96*Math.sqrt(variance/Math.max(1,samples));
    const sessions=new Set(rows.map(r=>new Date(r.createdAt).toISOString().slice(0,10))).size;
    const qualified=samples>=120&&sessions>=3&&improvementLowerBound>0;
    const candidateRows=rows.filter(r=>Number.isFinite(r.candidateLoss)),candidateDiff=candidateRows.map(r=>r.baselineLoss-r.candidateLoss),candidateMean=candidateDiff.length?candidateDiff.reduce((a,b)=>a+b,0)/candidateDiff.length:0,candidateVariance=candidateDiff.length>1?candidateDiff.reduce((v,d)=>v+(d-candidateMean)**2,0)/(candidateDiff.length-1):0;
    const candidateImprovementLowerBound=candidateMean-1.96*Math.sqrt(candidateVariance/Math.max(1,candidateDiff.length));
    const candidateQualified=candidateRows.length>=120&&new Set(candidateRows.map(r=>new Date(r.createdAt).toISOString().slice(0,10))).size>=3&&candidateImprovementLowerBound>0;
    return{mode:qualified?'qualified':'shadow',qualified,candidateQualified,candidateSamples:candidateRows.length,candidateImprovementLowerBound,callProbability,samples,sessions,improvementLowerBound,modelBrier:samples?rows.reduce((v,r)=>v+r.modelLoss,0)/samples:null,baselineBrier:samples?rows.reduce((v,r)=>v+r.baselineLoss,0)/samples:null,features:x};
  }
  observe({asset,analysis,snap,now}){
    const provider=String(snap.provider||'').toLowerCase(),price=Number(snap.price),quotes=(snap.quoteHistory||[]).filter(q=>Number(q.ts)<=now&&Number.isFinite(Number(q.price)));
    const keep=[];
    for(const p of this.pending){
      if(p.dueAt>now){keep.push(p);continue}
      if(p.asset!==asset||String(p.provider||'')!==provider){if(now-p.dueAt<15000)keep.push(p);else this.unresolved++;continue}
      const q=quotes.filter(q=>Math.abs(Number(q.ts)-p.dueAt)<=1500).sort((a,b)=>Math.abs(a.ts-p.dueAt)-Math.abs(b.ts-p.dueAt))[0];
      if(!q){if(now-p.dueAt<15000)keep.push(p);else this.unresolved++;continue}
      const delta=Number(q.price)-p.price,draw=Math.abs(delta)<=Math.abs(p.price)*1e-10,y=delta>0?1:0;
      const row={...p,settledAt:Number(q.ts),settledPrice:Number(q.price),draw,y,modelLoss:(p.modelProbability-y)**2,baselineLoss:(p.baselineProbability-y)**2,candidateLoss:p.candidateProbability==null?null:(p.candidateProbability-y)**2,baselineWon:draw?null:(p.baselineProbability>=.5?y===1:y===0),modelWon:draw?null:(p.modelProbability>=.5?y===1:y===0)};
      this.outcomes.push(row);this.events.push({type:'forecast-outcome',...row});
      if(!draw){
        const m=this.models[p.key]||{bias:0,weights:p.features.map(()=>0),updates:0};
        const prediction=sigmoid(m.bias+p.features.reduce((v,x,i)=>v+x*m.weights[i],0)),error=prediction-y,rate=.08/Math.sqrt(1+m.updates/100);
        m.bias=clamp(m.bias-rate*error,-4,4);m.weights=m.weights.map((w,i)=>clamp(w-rate*(error*p.features[i]+.002*w),-4,4));m.updates++;this.models[p.key]=m;
      }
    }
    this.pending=keep.slice(-300);this.outcomes=this.outcomes.slice(-6000);
    if(!Number.isFinite(price)||price<=0)return;
    for(const plan of Object.values(analysis?.entryPlanner?.horizons||{})){
      if(!plan?.outlookReady)continue;
      const seconds=Number(plan.horizonSeconds),key=this.key(asset,seconds,provider,plan.researchContext||'');
      if(now-Number(this.lastQueued[key]||0)<seconds*1000)continue;
      this.lastQueued[key]=now;
      const shadow=this.forecast(asset,plan,provider),op=analysis.operationalSignal||{};
      const baselineProbability=clamp(Number(plan.unlearnedCallProbability??plan.callProbability??50)/100,.05,.95);
      const candidate={key,asset,provider,seconds,createdAt:now,dueAt:now+seconds*1000,price,features:shadow.features,modelProbability:shadow.callProbability/100,baselineProbability,candidateProbability:plan.candidate?Number(plan.candidate.callProbability)/100:null,scenario:plan.scenario?.kind||plan.regime?.label||'unknown',blocked:plan.directionReady!==true||op.actionable!==true,blockReason:op.reason||null};
      this.pending.push(candidate);this.events.push({type:'forecast-sample',...candidate});
    }
  }
  summary(){const rows=this.outcomes.filter(x=>!x.draw),missed=rows.filter(x=>x.blocked&&x.baselineWon===true);return{mode:'forward-evaluation',samples:rows.length,blockedDirectionalForecasts:rows.filter(x=>x.blocked).length,blockedForecastsEndingCorrect:missed.length,unresolved:this.unresolved,models:Object.keys(this.models).length,note:'Previsões simuladas; não são operações executadas nem oportunidades garantidas.'}}
  drain(){const rows=this.events;this.events=[];return rows}
  snapshot(){return{version:1,models:this.models,pending:this.pending,lastQueued:this.lastQueued,outcomes:this.outcomes,unresolved:this.unresolved}}
}


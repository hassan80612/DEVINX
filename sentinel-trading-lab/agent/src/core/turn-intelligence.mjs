// Live turning-point observations. A warning is never a PUT/CALL entry.
// An entry requires a barrier test and two fresh opposite price updates;
// both observations and trades are scored only with future quotes.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const n=x=>x==null?null:Number.isFinite(Number(x))?Number(x):null;
const median=xs=>{const a=xs.filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:0};
export function assessTurn({analysis={},snap={},now=Date.now(),durationMs=30000}={}){
  const micro=analysis.metrics?.micro||{},short=analysis.metrics?.shortModel||{},metrics=analysis.metrics||{};
  const qt=n(snap.quoteTs),price=n(snap.price),empty={watchSide:null,confirmed:false,risk:false,reason:'insufficient-live-evidence'};
  if(!qt||qt>now||now-qt>1200||price==null||price<=0||short.ready!==true)return empty;
  const quotes=[...new Map((snap.quoteHistory||[]).filter(q=>Number.isFinite(Number(q.ts))&&Number.isFinite(Number(q.price))&&Number(q.price)>0&&Number(q.ts)<=qt&&Number(q.ts)>=qt-8000).map(q=>[Number(q.ts),{ts:Number(q.ts),price:Number(q.price)}])).values()].sort((a,b)=>a.ts-b.ts);
  if(quotes.length<6||qt-quotes[0].ts<1000)return empty;
  const steps=quotes.slice(1).map((q,i)=>Math.abs(q.price-quotes[i].price));
  const noise=median(steps),expected=Math.max(Math.abs(n(micro.expected2)||0),Math.abs(price)*.000004);
  const buffer=Math.max(Math.abs(price)*.000002,Math.min(noise*.7,expected*.35),expected*.14);
  const up=Number(micro.delta5)>expected*.25,down=Number(micro.delta5)<-expected*.25;
  if(!up&&!down)return empty;
  const side=up?'PUT':'CALL',isPut=side==='PUT';
  const levelCandidates=isPut?[short.sr?.resistance,metrics.srZones?.resistance?.price,metrics.bb?.upper]:
    [short.sr?.support,metrics.srZones?.support?.price,metrics.bb?.lower];
  const levels=levelCandidates.map(n).filter(v=>v!=null&&v>0);
  if(!levels.length)return empty;
  const barrier=levels.sort((a,b)=>Math.abs(a-price)-Math.abs(b-price))[0];
  const tol=Math.max(expected*.80,Math.abs(price)*.00001,Math.abs(n(short.range)||0)*.25);
  const high=Math.max(...quotes.map(q=>q.price)),low=Math.min(...quotes.map(q=>q.price));
  const peak=isPut?high:low,barrierTested=Math.abs(peak-barrier)<=tol*1.5;
  const broken=isPut?price>barrier+tol:price<barrier-tol;
  const recent=quotes.filter(q=>q.ts>=qt-2400);
  const before=quotes.filter(q=>q.ts<qt-2000);
  const leg=isPut?peak-(before.length?Math.min(...before.map(q=>q.price)):low):
    (before.length?Math.max(...before.map(q=>q.price)):high)-peak;
  const extended=leg>=Math.max(expected*.7,buffer*3);
  const slowing=isPut?Number(micro.lead)<-.12||Number(micro.delta2)<Number(micro.delta5)*.24:
    Number(micro.lead)>.12||Number(micro.delta2)>Number(micro.delta5)*.24;
  const near=barrierTested&&!broken&&Math.abs(price-barrier)<=tol*2;
  const risk=near&&extended&&slowing;
  const warning={watchSide:near&&extended?side:null,risk,confirmed:false,
    barrier,peak,tolerance:tol,buffer,extended,slowing,barrierTested,
    reason:risk?'near-structural-barrier-and-decelerating':near?'at-barrier':'no-structural-turn'};
  if(!near||!extended)return warning;
  const peaks=recent.filter(q=>q.price===peak);const top=peaks.at(-1);
  if(!top||top.ts>=qt)return warning;
  const after=recent.filter(q=>q.ts>top.ts);
  const first=after.find(q=>isPut?q.price<=peak-buffer:q.price>=peak+buffer);
  const second=first&&after.find(q=>q.ts>first.ts&&q.ts-first.ts>=40&&
    (isPut?q.price<=first.price-buffer*.4:q.price>=first.price+buffer*.4));
  if(!first||!second||qt-second.ts>1200||second.ts-top.ts>1800)return warning;
  if(after.filter(q=>q.ts>first.ts).some(q=>isPut?q.price>first.price+buffer*.5:q.price<first.price-buffer*.5))return warning;
  const extension=isPut?peak-price:price-peak;
  if(extension>Math.max(expected*.95,buffer*4))return {...warning,reason:'reversal-already-extended'};
  const opposite=isPut?n(short.sr?.support):n(short.sr?.resistance);
  if(opposite!=null&&(isPut?price-opposite:opposite-price)<Math.max(expected*.8,tol))return {...warning,reason:'no-room-to-opposite-barrier'};
  // A reaction must be visible on fresh quotes; don't require 5s/15s to flip.
  const invalidation=isPut?peak+buffer:peak-buffer;
  const reaction={qualified:true,preMapped:true,structuralTurn:true,side,
    id:side+'|early-turn|'+top.ts+'|'+barrier,
    trigger:first.price,invalidation,touchAt:top.ts,confirmedAt:second.ts,
    expiresAt:Math.min(top.ts+3500,now+1200),maxDistance:Math.max(expected*.95,buffer*4),
    advancing:true,roomOk:true,quoteConfirmations:2};
  const evidence={barrier:1,extension:clamp(leg/(expected*2),0,1),
    deceleration:slowing?1:0,confirmation:1};
  const technicalScore=clamp(Math.round(68+evidence.extension*10+evidence.deceleration*6+4),0,90);
  return {...warning,risk:true,confirmed:true,reason:'early-structural-turn-confirmed',
    reaction,side,technicalScore,features:[evidence.barrier,evidence.extension,evidence.deceleration,evidence.confirmation]};
}

const sigmoid=x=>1/(1+Math.exp(-clamp(x,-25,25)));
const wilsonLow=(wins,count)=>{if(!count)return 0;const z=1.96,p=wins/count,den=1+z*z/count;
 return (p+z*z/(2*count)-z*Math.sqrt((p*(1-p)+z*z/(4*count))/count))/den};
export class TurnLearning{
  constructor(saved={}){this.version=1;this.pending=(saved.version===1?saved.pending:[])||[];
    this.outcomes=(saved.version===1?saved.outcomes:[])||[];this.models=(saved.version===1?saved.models:{})||{};
    this.unresolved=Number(saved.unresolved||0);this.lastObserved={};}
  key({provider,asset,durationMs,side}){return [provider||'unknown',asset||'unknown',durationMs,side].join('|')}
  status(key,features=[]){
    const rows=this.outcomes.filter(x=>x.key===key&&!x.draw).slice(-400),wins=rows.filter(x=>x.won).length;
    const sessions=new Set(rows.map(x=>new Date(x.createdAt).toISOString().slice(0,10))).size;
    const lower=wilsonLow(wins,rows.length),model=this.models[key],shadow=model?sigmoid(model.bias+features.reduce((s,x,i)=>s+x*(model.weights[i]||0),0)):.5;
    // Shadow until repeated forward outcomes across days show evidence beyond chance.
    const qualified=rows.length>=120&&sessions>=3&&lower>.56;
    return{samples:rows.length,wins,winRate:rows.length?wins/rows.length:null,lowerBound:lower,
      sessions,qualified,shadowProbability:shadow,probability:qualified?shadow:null};
  }
  observe({turn,provider,asset,durationMs,price,now,quoteTs}){
    if(!turn?.watchSide||!turn?.risk||!Number.isFinite(Number(quoteTs))||now-quoteTs>1200)return null;
    const side=turn.watchSide,key=this.key({provider,asset,durationMs,side}),bucket=Math.floor(now/3000),id=key+'|'+bucket;
    if(this.lastObserved[key]===bucket||this.pending.some(x=>x.id===id)||this.outcomes.some(x=>x.id===id))return this.status(key);
    this.lastObserved[key]=bucket;
    const features=[1,turn.extended?1:0,turn.slowing?1:0,turn.confirmed?1:0];
    const status=this.status(key,features);
    this.pending.push({id,key,provider,asset,durationMs,side,createdAt:now,dueAt:now+durationMs,price:Number(price),
      features,shadowAtObservation:status.shadowProbability});
    if(this.pending.length>700){this.unresolved+=this.pending.length-700;this.pending=this.pending.slice(-700)}
    return status;
  }
  settle({snap,provider,asset,now}){
    const keep=[];for(const p of this.pending){
      if(p.dueAt>now){keep.push(p);continue}
      if(p.provider!==provider||p.asset!==asset){if(now-p.dueAt<=15000)keep.push(p);else this.unresolved++;continue}
      const q=(snap.quoteHistory||[]).filter(x=>Number.isFinite(Number(x.ts))&&Number.isFinite(Number(x.price))&&
        Math.abs(Number(x.ts)-p.dueAt)<=1500).sort((a,b)=>Math.abs(a.ts-p.dueAt)-Math.abs(b.ts-p.dueAt))[0];
      if(!q){if(now-p.dueAt<=15000)keep.push(p);else this.unresolved++;continue}
      const delta=Number(q.price)-p.price,draw=Math.abs(delta)<=Math.abs(p.price)*1e-10;
      const won=!draw&&(p.side==='PUT'?delta<0:delta>0),y=won?1:0;
      this.outcomes.push({...p,settledAt:Number(q.ts),settledPrice:Number(q.price),draw,won:draw?null:won});
      if(!draw){const model=this.models[p.key]||{bias:0,weights:p.features.map(()=>0),updates:0};
        const estimate=sigmoid(model.bias+p.features.reduce((s,x,i)=>s+x*(model.weights[i]||0),0));
        const step=.04/Math.sqrt(1+model.updates/80),error=estimate-y;
        model.bias=clamp(model.bias-step*error,-3,3);
        model.weights=model.weights.map((w,i)=>clamp(w-step*(error*p.features[i]+.005*w),-3,3));
        model.updates++;this.models[p.key]=model;}
    }
    this.pending=keep;this.outcomes=this.outcomes.slice(-6000);
  }
  summary(){return{mode:'shadow-forward-turn-learning',samples:this.outcomes.filter(x=>!x.draw).length,
    unresolved:this.unresolved,pending:this.pending.length,models:Object.keys(this.models).length}}
  snapshot(){return{version:1,pending:this.pending,outcomes:this.outcomes,models:this.models,unresolved:this.unresolved}}
}

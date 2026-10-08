// Sentinel 13.4.15 — experimental PATH appraisal, independent from entry timing.
// A turning-point watch is not a trade and never creates opposite-side scores.
const finite=x=>x!=null&&Number.isFinite(Number(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function median(xs){const a=xs.filter(x=>finite(x)&&Number(x)>0).map(Number).sort((a,b)=>a-b);
  return a.length?a[Math.floor(a.length/2)]:0}
const agePrice=(quotes,ts)=>quotes.filter(x=>x.ts<=ts).at(-1)?.price??quotes[0]?.price;
export function pathEvidence({analysis={},snap={},now=Date.now(),durationMs=30000}={}){
  const micro=analysis?.metrics?.micro||{},short=analysis?.metrics?.shortModel||{};
  const price=Number(snap.price),quoteTs=Number(snap.quoteTs);
  const neutral={ready:false,phase:'WAIT',side:null,watchSide:null,guardedSide:null,
    level:null,riskLevel:'none',reason:'feed-not-qualified',confidenceKind:'structural-evidence-not-probability'};
  if(short.ready!==true||!finite(snap.price)||price<=0||!finite(snap.quoteTs)||quoteTs>now||now-quoteTs>1200)
    return neutral;
  const raw=(snap.quoteHistory||[]).filter(q=>finite(q.ts)&&finite(q.price)&&Number(q.price)>0&&Number(q.ts)<=quoteTs&&quoteTs-q.ts<=10000)
    .map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
  const points=[...new Map(raw.map(q=>[q.ts,q])).values()];
  if(points.length<8||quoteTs-points[0].ts<1500||points.at(-1).ts!==quoteTs)return neutral;
  const d5=Number(micro.delta5)||0,d15=Number(micro.delta15)||0;
  const up=d5>0&&d15>=0,down=d5<0&&d15<=0;
  if(!up&&!down)return {...neutral,ready:true,phase:'MIXED',reason:'mixed-momentum'};
  const currentSide=up?'CALL':'PUT',oppositeSide=up?'PUT':'CALL',barrier=up?short.sr?.resistance:short.sr?.support;
  if(!finite(barrier)||Number(barrier)<=0)return {...neutral,ready:true,phase:'NO_LEVEL',side:currentSide,reason:'missing-closed-structure'};
  const level=Number(barrier),noise=median(points.slice(1).map((q,i)=>Math.abs(q.price-points[i].price)));
  const expected5=Math.abs(Number(micro.expected5)||0),expected30=Math.abs(Number(micro.expected30)||0);
  const tol=Math.max(price*.0000025,noise*2,expected5*.24);
  const peak=up?Math.max(...points.map(q=>q.price)):Math.min(...points.map(q=>q.price));
  const peakQuote=points.filter(q=>q.price===peak).at(-1);
  const distance=Math.abs(price-level),tested=Math.abs(peak-level)<=tol*1.35;
  const broken=up?price>level+tol:price<level-tol;
  const toBarrier=up?level-price:price-level;
  const atBarrier=tested&&distance<=tol*1.6&&!broken;
  const source=agePrice(points,quoteTs-5000);
  const impulse=up?peak-source:source-peak;
  const significantImpulse=impulse>Math.max(noise*5,expected5*.55,price*.000006);
  const retrace=up?peak-price:price-peak;
  const adverse=up?Number(micro.delta2)<0:Number(micro.delta2)>0;
  const weakening=up?short.weakeningUp===true||Number(micro.delta2)<d5*.25:
    short.weakeningDown===true||Number(micro.delta2)>d5*.25;
  const rejection=atBarrier&&significantImpulse&&adverse&&weakening&&
    retrace>=Math.max(noise*2.5,expected5*.12,price*.000003);
  const after=points.filter(q=>q.ts>peakQuote.ts);
  const progress=after.length>=3&&after.slice(-3).every((q,i,a)=>i===0||(up?q.price<a[i-1].price:q.price>a[i-1].price));
  const freshTurn=peakQuote.ts<quoteTs&&quoteTs-peakQuote.ts<=2500&&progress&&
    after.at(-1).ts-after.at(-3).ts>=140&&
    retrace>=Math.max(noise*3,expected5*.18,price*.000004);
  const remainingRoom=Math.max(0,toBarrier);
  const needed=Math.max(expected30*Math.sqrt(Math.max(15,durationMs/1000)/30),noise*5,price*.000006);
  // A previously mapped level with a proven price rejection is different
  // from a transient reverse tick during an otherwise healthy breakout.
  const phase=broken?'BREAKOUT':atBarrier&&rejection&&freshTurn?'REJECTION_CONFIRMED':
    atBarrier&&rejection?'REJECTION_WATCH':atBarrier?'BARRIER_WATCH':'CONTINUATION';
  const riskLevel=phase==='REJECTION_CONFIRMED'?'high':phase==='REJECTION_WATCH'?'elevated':
    phase==='BARRIER_WATCH'&&significantImpulse&&remainingRoom<needed*.55?'watch':'none';
  // The guard suppresses chasing the exhausted prior direction only;
  // it NEVER turns this into an opposite-side entry.
  const guardedSide=phase==='REJECTION_CONFIRMED'?currentSide:null;
  return {ready:true,phase,side:currentSide,watchSide:riskLevel==='none'?null:oppositeSide,guardedSide,
    level,price,quoteTs,distanceToBarrier:distance,remainingRoom,neededRoom:needed,
    observedRetraction:retrace,peak,noise,significantImpulse,weakening,rejection,
    continuationRoomOk:broken||toBarrier>=needed*.55,contextual:true,
    riskLevel,reason:phase==='REJECTION_CONFIRMED'?'rejection-with-progressive-quotes':
      phase==='REJECTION_WATCH'?'early-rejection-no-followthrough':
      phase==='BARRIER_WATCH'?'limited-room-to-closed-barrier':
      phase==='BREAKOUT'?'holding-beyond-prior-barrier':'continuation-room',
    confidenceKind:'structural-evidence-not-probability'};
}
function wilson(wins,n){if(!n)return{low:0,high:1};const z=1.96,p=wins/n,den=1+z*z/n;
  const c=(p+z*z/(2*n))/den,h=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/den;
  return{low:clamp(c-h,0,1),high:clamp(c+h,0,1)}}
export class PathResearch {
  constructor(saved={}){
    this.pending=Array.isArray(saved.pending)?saved.pending:[];
    this.outcomes=Array.isArray(saved.outcomes)?saved.outcomes:[];
    this.unresolved=Number(saved.unresolved||0);this._cachedSummary=null;
  }
  observe({evidence,provider,asset,durationMs,price,now,quoteTs,candidateSide=null}){
    if(!evidence?.ready||!finite(quoteTs)||now-Number(quoteTs)>1200||
        !finite(price)||!Number.isInteger(Number(durationMs))||durationMs<10000)return;
    const side=candidateSide||evidence.side;
    if(!['CALL','PUT'].includes(side))return;
    const bucket=Math.floor(now/Math.max(durationMs,30000));
    const key=[provider,asset,durationMs,side,evidence.phase,candidateSide?'candidate':'watch'].join('|'),id=key+'|'+bucket;
    if(this.pending.some(x=>x.id===id)||this.outcomes.some(x=>x.id===id))return;
    const block=evidence.guardedSide===side;
    this._cachedSummary=null;
    this.pending.push({id,key,provider,asset,side,durationMs,phase:evidence.phase,blocked:!!block,
      originalCandidate:!!candidateSide,observedPrice:Number(price),observedAt:now,
      dueAt:now+Number(durationMs)});
    if(this.pending.length>700){this.unresolved+=this.pending.length-700;this.pending=this.pending.slice(-700)}
  }
  settle({snap,provider,asset,now}){
    const waiting=[];let changed=false;
    for(const p of this.pending){
      if(now<p.dueAt){waiting.push(p);continue}
      if(p.provider!==provider||p.asset!==asset){if(now-p.dueAt<=15000)waiting.push(p);else{this.unresolved++;changed=true}continue}
      const q=(snap.quoteHistory||[]).filter(x=>finite(x.ts)&&finite(x.price)&&Number(x.price)>0&&
        Math.abs(Number(x.ts)-p.dueAt)<=1500)
        .sort((a,b)=>Math.abs(a.ts-p.dueAt)-Math.abs(b.ts-p.dueAt))[0];
      if(!q){if(now-p.dueAt<=15000)waiting.push(p);else{this.unresolved++;changed=true}continue}
      const delta=Number(q.price)-p.observedPrice,draw=Math.abs(delta)<=p.observedPrice*1e-10;
      const won=draw?null:(p.side==='CALL'?delta>0:delta<0);
      this.outcomes.push({...p,settledAt:Number(q.ts),settledPrice:Number(q.price),draw,won});changed=true;
    }
    this.pending=waiting;this.outcomes=this.outcomes.slice(-5000);if(changed)this._cachedSummary=null;
  }
  summary(){
    if(this._cachedSummary)return this._cachedSummary;
    const contexts={};
    for(const x of this.outcomes.filter(x=>!x.draw)){
      const key=[x.provider,x.asset,x.durationMs,x.phase,x.originalCandidate?'candidate':'watch'].join('|');
      const b=contexts[key]||(contexts[key]={samples:0,wins:0,blocked:0,days:new Set()});
      b.samples++;if(x.won)b.wins++;if(x.blocked)b.blocked++;b.days.add(new Date(x.observedAt).toISOString().slice(0,10));
    }
    return this._cachedSummary={mode:'shadow-unvalidated',pending:this.pending.length,unresolved:this.unresolved,
      outcomes:this.outcomes.length,contexts:Object.entries(contexts).map(([key,x])=>({
        key,samples:x.samples,wins:x.wins,winRate:x.samples?x.wins/x.samples:null,
        days:x.days.size,wilson: wilson(x.wins,x.samples),blocked:x.blocked,qualified:false}))};
  }
  snapshot(){return{version:1,pending:this.pending,outcomes:this.outcomes,unresolved:this.unresolved}}
}
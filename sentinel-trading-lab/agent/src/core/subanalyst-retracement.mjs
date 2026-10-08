// Independent, advisory-only subanalyst on top of the validated 13.4.12.
// Do not create entry plans, alter technical scores, or switch the scenario side.
// Trade entries still require the original structural/time/percentage gates.
const num=v=>v==null?null:Number.isFinite(Number(v))?Number(v):null;
const median=values=>{const a=values.filter(v=>v>0&&Number.isFinite(v)).sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:0};
const clip=(v,a,b)=>Math.max(a,Math.min(b,v));

export function retracementWatch({analysis={},snap={},now=Date.now()}={}){
  const short=analysis?.metrics?.shortModel||{},micro=analysis?.metrics?.micro||{};
  const qt=num(snap.quoteTs),price=num(snap.price);
  const empty={state:'NONE',watchSide:null,confirmed:false,reason:'Insufficient live quotes'};
  if(short.ready!==true||qt==null||price==null||price<=0||qt>now||now-qt>1200)return empty;
  const raw=(snap.quoteHistory||[]).filter(q=>num(q.ts)!=null&&num(q.price)>0&&Number(q.ts)<=qt&&Number(q.ts)>=qt-10000)
    .map(q=>({ts:Number(q.ts),price:Number(q.price)})).sort((a,b)=>a.ts-b.ts);
  // Eliminate equal timestamps; repeated DOM samples are not independent ticks.
  const quotes=[...new Map(raw.map(q=>[q.ts,q])).values()];
  if(quotes.length<7||qt-quotes[0].ts<1200||quotes.at(-1).ts!==qt)return empty;
  const rising=Number(micro.delta5)>0,falling=Number(micro.delta5)<0;
  if(!rising&&!falling)return empty;
  const side=rising?'PUT':'CALL',isPut=side==='PUT';
  const resistance=num(short.sr?.resistance),support=num(short.sr?.support);
  const barrier=isPut?resistance:support;
  if(barrier==null||barrier<=0)return empty;
  const changes=quotes.slice(1).map((q,i)=>Math.abs(q.price-quotes[i].price));
  const noise=median(changes),expected2=Math.abs(num(micro.expected2)||0),expected5=Math.abs(num(micro.expected5)||0);
  const significance=Math.max(price*.000004,expected2*.65,noise*2.2);
  const tolerance=Math.max(price*.000007,expected5*.3,Math.abs(num(short.range)||0)*.15);
  const last=quotes.slice(-12),extreme=isPut?Math.max(...last.map(q=>q.price)):Math.min(...last.map(q=>q.price));
  const extremeQuote=last.filter(q=>q.price===extreme).at(-1);
  const approached=isPut?extreme-quotes[0].price:quotes[0].price-extreme;
  const enoughApproach=approached>=Math.max(expected2*1.1,noise*3,price*.000008);
  const levelTested=Math.abs(extreme-barrier)<=tolerance&&enoughApproach;
  const near=Math.abs(price-barrier)<=tolerance*1.5&&levelTested;
  if(!near)return {...empty,reason:'No tested closed-bar barrier'};
  const slow=isPut?Number(micro.lead)<-.15||Number(micro.delta2)<Number(micro.delta5)*.25:
    Number(micro.lead)>.15||Number(micro.delta2)>Number(micro.delta5)*.25;
  const watch={state:'WATCH',watchSide:side,confirmed:false,barrier,
    distanceToBarrier:Math.abs(price-barrier),noise,significance,reason:slow?
      'Barreira testada e aceleração enfraquecendo':'Barreira testada; aguardando evidência de retração'};
  if(!slow||!extremeQuote||qt-extremeQuote.ts>2200||qt<=extremeQuote.ts)return watch;
  const after=quotes.filter(q=>q.ts>extremeQuote.ts);
  // A genuine turning attempt must move by more than local tick noise,
  // and develop a sequence, not just two counter-trend prices.
  if(after.length<3)return watch;
  const last3=after.slice(-3);
  const progression=last3.every((q,i)=>i===0||(isPut?q.price<last3[i-1].price:q.price>last3[i-1].price));
  const elapsed=last3.at(-1).ts-last3[0].ts;
  const actualMove=Math.abs(last3.at(-1).price-extreme);
  const noFreshExtreme=after.every(q=>isPut?q.price<=extreme:q.price>=extreme);
  const notLate=actualMove<=Math.max(expected2*1.8,significance*2.2);
  const oppositeRoom=isPut?support==null||price-support>significance*2:support==null||resistance==null||resistance-price>significance*2;
  if(!progression||elapsed<140||actualMove<significance||!noFreshExtreme||!notLate||!oppositeRoom)return watch;
  return {...watch,state:'CONFIRMED',confirmed:true,confirmedAt:qt,
    // Always informational; never override 13.4.12 entry qualification.
    reason:'Retração estrutural detectada; entrada somente pelo gatilho original'};
}

export class RetracementResearch{
  constructor(saved={}){
    this.pending=Array.isArray(saved.pending)?saved.pending:[];
    this.outcomes=Array.isArray(saved.outcomes)?saved.outcomes:[];
    this.missed=Number(saved.missed||0);
  }
  observe({advisory,provider,asset,durationMs,now,price}){
    if(advisory?.state!=='WATCH'&&advisory?.state!=='CONFIRMED')return;
    const window=Math.floor(now/Math.max(30000,Number(durationMs)||30000));
    const id=[provider,asset,durationMs,advisory.watchSide,window].join('|');
    if(this.pending.some(x=>x.id===id)||this.outcomes.some(x=>x.id===id))return;
    this.pending.push({id,provider,asset,durationMs,side:advisory.watchSide,
      state:advisory.state,price:Number(price),observedAt:now,dueAt:now+Number(durationMs)});
    if(this.pending.length>400){this.missed+=this.pending.length-400;this.pending=this.pending.slice(-400)}
  }
  settle({snap,provider,asset,now}){
    const keep=[];for(const o of this.pending){
      if(now<o.dueAt){keep.push(o);continue}
      if(o.provider!==provider||o.asset!==asset){if(now-o.dueAt<=15000)keep.push(o);else this.missed++;continue}
      const result=(snap.quoteHistory||[]).filter(q=>num(q.ts)!=null&&num(q.price)>0&&
        Math.abs(Number(q.ts)-o.dueAt)<=1500).sort((a,b)=>Math.abs(Number(a.ts)-o.dueAt)-Math.abs(Number(b.ts)-o.dueAt))[0];
      if(!result){if(now-o.dueAt<=15000)keep.push(o);else this.missed++;continue}
      const diff=Number(result.price)-o.price,draw=Math.abs(diff)<o.price*1e-10;
      const won=!draw&&(o.side==='CALL'?diff>0:diff<0);
      this.outcomes.push({...o,settledAt:Number(result.ts),finalPrice:Number(result.price),draw,won:draw?null:won});
    }
    this.pending=keep;this.outcomes=this.outcomes.slice(-4000);
  }
  summary(){const valid=this.outcomes.filter(x=>!x.draw),wins=valid.filter(x=>x.won).length;
    return{mode:'shadow-retracement',observations:valid.length,wins,losses:valid.length-wins,
      winRate:valid.length?wins/valid.length:null,pending:this.pending.length,unresolved:this.missed,qualified:false}}
  snapshot(){return{version:1,pending:this.pending,outcomes:this.outcomes,missed:this.missed}}
}

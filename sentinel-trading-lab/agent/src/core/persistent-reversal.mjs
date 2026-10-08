const BAR_MS=5000,MAX_GAP=2500,HISTORY_MS=180000;
const valid=n=>n!=null&&Number.isFinite(Number(n));

// Quote-derived closed bars only. A chart candle in progress, duplicated
// timestamp, sparse close or future sample cannot confirm a structural turn.
export function reversalBars(snap,now){
  const end=Math.min(now,Number(snap.quoteTs)),unique=new Map();
  for(const q of snap.quoteHistory||[]){
    const ts=Number(q.ts),price=Number(q.price);
    if(valid(q.ts)&&valid(q.price)&&price>0&&ts<=end&&ts>=end-HISTORY_MS&&!unique.has(ts))unique.set(ts,{ts,price});
  }
  const bars=new Map();
  for(const q of [...unique.values()].sort((a,b)=>a.ts-b.ts)){
    const from=Math.floor(q.ts/BAR_MS)*BAR_MS,to=from+BAR_MS;
    if(to>end)continue;
    let b=bars.get(from);
    if(!b){b={from,to,open:q.price,high:q.price,low:q.price,close:q.price,count:0,firstTs:q.ts,lastTs:q.ts,maxGap:0};bars.set(from,b);}
    b.high=Math.max(b.high,q.price);b.low=Math.min(b.low,q.price);b.close=q.price;
    b.maxGap=Math.max(b.maxGap,q.ts-b.lastTs);b.lastTs=q.ts;b.count++;
  }
  return [...bars.values()].filter(b=>b.count>=2&&b.firstTs<=b.from+MAX_GAP&&b.lastTs>=b.to-MAX_GAP&&b.maxGap<=MAX_GAP);
}

function findTurn(bars,price){
  if(bars.length<6)return null;
  const approach=bars.slice(-5,-2),broken=bars.at(-2),held=bars.at(-1);
  const chain=[...approach,broken,held];
  if(chain.some((b,i)=>i&&b.from!==chain[i-1].to))return null;
  const steps=approach.map(b=>b.high-b.low).sort((a,b)=>a-b);
  const buffer=Math.max(Math.abs(price)*.000002,steps[1]*.12,1e-9);
  for(const side of ['CALL','PUT']){
    const sign=side==='CALL'?1:-1,call=side==='CALL';
    const advancing=approach.every((b,i)=>!i||(b.close-approach[i-1].close)*sign<-buffer&&
      (call?b.high<approach[i-1].high:b.low>approach[i-1].low));
    if(!advancing)continue;
    const level=call?approach.at(-1).high:approach.at(-1).low,trigger=level+sign*buffer;
    if((broken.close-trigger)*sign<=0||(held.close-broken.close)*sign<buffer)continue;
    // The following completed bar must preserve the broken structure and
    // form a higher low / lower high, rather than return to the old trend.
    if((call?held.low<level-buffer||held.low<=broken.low:held.high>level+buffer||held.high>=broken.high))continue;
    const extreme=call?Math.min(approach.at(-1).low,broken.low):Math.max(approach.at(-1).high,broken.high);
    const invalidation=extreme-sign*buffer;
    const prior=bars.slice(0,-5),barriers=prior.map(b=>call?b.high:b.low).filter(n=>(n-price)*sign>buffer*2);
    const target=barriers.length?(call?Math.min(...barriers):Math.max(...barriers)):null;
    if(target==null||(target-price)*sign<=Math.max(buffer*2,Math.abs(held.close-broken.close)*2))continue;
    if((price-trigger)*sign<0||(price-target)*sign>=0)continue;
    return{side,level,trigger,invalidation,target,buffer,createdAt:held.to,sourceBarAt:broken.to,
      evidence:{approachBars:3,breakClose:broken.close,holdClose:held.close,holdLow:held.low,holdHigh:held.high,source:'closed-5s-break-and-follow-through'}};
  }
  return null;
}

export class PersistentReversalMonitor{
  constructor(){this.context='';this.alert=null;this.lastBucket=null;this.lastQuoteTs=0;this.contextAfter=0;this.evaluations=0;}
  update({snap,now=Date.now(),asset,provider}={}){
    const context=[provider,asset].join('|'),quoteTs=Number(snap.quoteTs),price=Number(snap.price);
    if(context!==this.context){this.contextAfter=this.context?this.lastQuoteTs:0;this.context=context;this.alert=null;this.lastBucket=null;this.lastQuoteTs=0;}
    const fresh=valid(snap.quoteTs)&&valid(snap.price)&&price>0&&quoteTs<=now&&now-quoteTs<=MAX_GAP;
    if(!fresh||quoteTs<=this.contextAfter)return{mode:'reversal-alert',advisoryOnly:true,active:false,status:'SEM LEITURA',reason:'Aguardando cotações atuais deste ativo.',alert:null};
    if(this.lastQuoteTs&&quoteTs-this.lastQuoteTs>MAX_GAP){
      const received=(snap.quoteHistory||[]).filter(q=>valid(q.ts)&&valid(q.price)&&Number(q.ts)>this.lastQuoteTs&&Number(q.ts)<=quoteTs).map(q=>Number(q.ts)).sort((a,b)=>a-b);
      let previous=this.lastQuoteTs,gap=false;
      for(const ts of received){if(ts-previous>MAX_GAP)gap=true;previous=ts;}
      if(gap||quoteTs-previous>MAX_GAP){this.alert=null;this.lastBucket=null;}
    }
    this.lastQuoteTs=quoteTs;
    const bucket=Math.floor(quoteTs/BAR_MS);
    if(bucket!==this.lastBucket){
      this.lastBucket=bucket;this.evaluations++;
      const bars=reversalBars(snap,now),closed=bars.filter(b=>b.to>Number(this.alert?.createdAt||0));
      if(this.alert&&closed.some(b=>this.alert.side==='CALL'?b.close<=this.alert.invalidation:b.close>=this.alert.invalidation))this.alert=null;
      if(this.alert&&closed.some(b=>this.alert.side==='CALL'?b.close>=this.alert.target:b.close<=this.alert.target))this.alert=null;
      const turn=bars.at(-1)?.to===bucket*BAR_MS?findTurn(bars,price):null;
      if(turn&&(!this.alert||turn.side!==this.alert.side))this.alert={...turn,id:context+'|'+turn.side+'|'+turn.createdAt};
    }
    const alert=this.alert;
    const within=alert&&(alert.side==='CALL'?price>alert.invalidation&&price<alert.target:price<alert.invalidation&&price>alert.target);
    // Preserve the diagnosis through a wick; display it as a tested level,
    // rather than inventing a new opposite signal or an execution window.
    return{mode:'reversal-alert',advisoryOnly:true,active:!!alert,status:alert?'POSSÍVEL REVERSÃO':'OBSERVANDO REVERSÃO',
      reason:alert?(within?'Quebra e continuidade confirmadas em barras fechadas.':'Estrutura em teste; aguardar o fechamento.'):'Aguardando quebra estrutural e continuidade.',
      alert:alert?{...alert,testing:!within}:null};
  }
}

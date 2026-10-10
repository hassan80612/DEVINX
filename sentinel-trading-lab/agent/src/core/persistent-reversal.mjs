import {closedPriceBars} from './closed-price-bars.mjs';
const BAR_MS=5000,MAX_GAP=2500;
const valid=n=>n!=null&&Number.isFinite(Number(n));
export const reversalBars=closedPriceBars;

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
    // This is an advisory structural warning, not entry authorization. A
    // missing distant target must not silence an already persistent reversal.
    const target=barriers.length?(call?Math.min(...barriers):Math.max(...barriers)):null;
    if((price-trigger)*sign<0)continue;
    return{side,level,trigger,invalidation,target,buffer,createdAt:held.to,sourceBarAt:broken.to,
      evidence:{approachBars:3,breakClose:broken.close,holdClose:held.close,holdLow:held.low,holdHigh:held.high,source:'closed-5s-break-and-follow-through'}};
  }
  return null;
}

// An early *advisory* uses a mapped swing from three completed bars, then
// requires two fresh advancing quotes beyond it. A confirmed reversal still
// requires findTurn's break + hold in completed bars.
function findEarlyTurn(bars,snap,now,price){
  const approach=bars.slice(-3);
  if(approach.length!==3||approach.some((b,i)=>i&&b.from!==approach[i-1].to))return null;
  if(now-approach.at(-1).to>BAR_MS+MAX_GAP)return null;
  const quotes=[...new Map((snap.quoteHistory||[]).filter(q=>valid(q.ts)&&valid(q.price)&&Number(q.price)>0&&
    Number(q.ts)<=Number(snap.quoteTs)&&Number(q.ts)>=now-2000)
    .map(q=>[Number(q.ts),{ts:Number(q.ts),price:Number(q.price)}])).values()]
    .sort((a,b)=>a.ts-b.ts);
  if(quotes.length<2)return null;
  const ranges=approach.map(b=>b.high-b.low).sort((a,b)=>a-b);
  const buffer=Math.max(Math.abs(price)*.000002,ranges[1]*.12,1e-9);
  for(const side of ['CALL','PUT']){
    const call=side==='CALL',sign=call?1:-1;
    const approaching=approach.every((b,i)=>!i||(b.close-approach[i-1].close)*sign<-buffer&&
      (call?b.high<approach[i-1].high:b.low>approach[i-1].low));
    if(!approaching)continue;
    const last=approach.at(-1),level=call?last.high:last.low,trigger=level+sign*buffer;
    const confirming=quotes.filter(q=>(q.price-trigger)*sign>0);
    const lastQuote=confirming.at(-1),previous=confirming.slice(0,-1).at(-1);
    if(!lastQuote||!previous||lastQuote.ts-previous.ts<50||lastQuote.ts-previous.ts>MAX_GAP||
       Number(snap.quoteTs)-lastQuote.ts>MAX_GAP||((price-trigger)*sign)<=0)continue;
    const invalidation=call?last.low-buffer:last.high+buffer;
    return{side,level,trigger,invalidation,target:null,createdAt:lastQuote.ts,sourceBarAt:last.to,
      expiresAt:Math.min(now+BAR_MS*2,last.to+BAR_MS*2),testing:true,phase:'forming',
      evidence:{source:'prior-closed-bars-and-live-quote-break',quoteConfirmations:2}};
  }
  return null;
}

export class PersistentReversalMonitor{
  constructor(){this.context='';this.alert=null;this.lastBucket=null;this.lastQuoteTs=0;this.contextAfter=0;this.evaluations=0;this.watch=null;}
  update({snap,now=Date.now(),asset,provider}={}){
    const context=[provider,asset].join('|'),quoteTs=Number(snap.quoteTs),price=Number(snap.price);
    if(context!==this.context){this.contextAfter=this.context?this.lastQuoteTs:0;this.context=context;this.alert=null;this.watch=null;this.lastBucket=null;this.lastQuoteTs=0;}
    const fresh=valid(snap.quoteTs)&&valid(snap.price)&&price>0&&quoteTs<=now&&now-quoteTs<=MAX_GAP;
    if(!fresh||quoteTs<=this.contextAfter)return{mode:'reversal-alert',advisoryOnly:true,active:false,status:'SEM LEITURA',reason:'Aguardando cotações atuais deste ativo.',alert:null};
    if(this.lastQuoteTs&&quoteTs-this.lastQuoteTs>MAX_GAP){
      const received=(snap.quoteHistory||[]).filter(q=>valid(q.ts)&&valid(q.price)&&Number(q.ts)>this.lastQuoteTs&&Number(q.ts)<=quoteTs).map(q=>Number(q.ts)).sort((a,b)=>a-b);
      let previous=this.lastQuoteTs,gap=false;
      for(const ts of received){if(ts-previous>MAX_GAP)gap=true;previous=ts;}
      if(gap||quoteTs-previous>MAX_GAP){this.alert=null;this.watch=null;this.lastBucket=null;}
    }
    this.lastQuoteTs=quoteTs;
    const bucket=Math.floor(quoteTs/BAR_MS);
    if(bucket!==this.lastBucket){
      this.lastBucket=bucket;this.evaluations++;
      const bars=reversalBars(snap,now),closed=bars.filter(b=>b.to>Number(this.alert?.createdAt||0));
      if(this.alert&&closed.some(b=>this.alert.side==='CALL'?b.close<=this.alert.invalidation:b.close>=this.alert.invalidation))this.alert=null;
      if(this.alert&&this.alert.target!=null&&closed.some(b=>this.alert.side==='CALL'?b.close>=this.alert.target:b.close<=this.alert.target))this.alert=null;
      const turn=bars.at(-1)?.to===bucket*BAR_MS?findTurn(bars,price):null;
      if(turn&&(!this.alert||turn.side!==this.alert.side)){this.alert={...turn,id:context+'|'+turn.side+'|'+turn.createdAt};this.watch=null;}
    }
    // Live anticipation expires on its own; it never substitutes for the
    // confirmed structural turn and cannot authorize an entry.
    if(this.watch&&(now>this.watch.expiresAt||
      (this.watch.side==='CALL'?price<=this.watch.invalidation:price>=this.watch.invalidation)))this.watch=null;
    if(!this.alert&&!this.watch)this.watch=findEarlyTurn(reversalBars(snap,now),snap,now,price);
    const alert=this.alert||this.watch;
    const within=!!this.alert&&(this.alert.side==='CALL'?price>this.alert.invalidation:price<this.alert.invalidation);
    // Preserve the diagnosis through a wick; display it as a tested level,
    // rather than inventing a new opposite signal or an execution window.
    return{mode:'reversal-alert',advisoryOnly:true,active:!!alert,status:this.watch&&!this.alert?'REVERSÃO EM TESTE':alert?'POSSÍVEL REVERSÃO':'OBSERVANDO REVERSÃO',checkedAt:quoteTs,structureCheckedAt:bucket*BAR_MS,
      reason:this.watch&&!this.alert?'Rompimento observado em cotações recentes; aguardando barras fechadas.':alert?(within?'Quebra e continuidade confirmadas em barras fechadas.':'Estrutura em teste; aguardar o fechamento.'):'Aguardando quebra estrutural e continuidade.',
      alert:alert?{...alert,testing:!within}:null};
  }
}

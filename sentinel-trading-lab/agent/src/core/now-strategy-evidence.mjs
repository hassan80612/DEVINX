// Strategy evidence from quotes already received. No forecast, legacy score,
// candle-feed prerequisite, confidence gate, or per-cycle history reset.
import {trendLines,fibonacci,candlePatterns} from './indicators.mjs';

const strategies=new Set(['price_action','support_resistance','trend','mean_reversion',
 'breakout','trendline_breakout','fibonacci_retest','smart_confluence']);
const sideOf=v=>v>0?'CALL':v<0?'PUT':null;
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
function at(quotes,time){
 for(let i=quotes.length-1;i>=0;i--)if(quotes[i].ts<=time)
  return time-quotes[i].ts<=2500?quotes[i]:null;
 return null;
}
function barsOf(quotes){
 const bars=[];
 for(const q of quotes){
  const ts=Math.floor(q.ts/1000)*1000;
  let b=bars.at(-1);
  if(!b||b.ts!==ts){b={ts,open:q.price,high:q.price,low:q.price,close:q.price};bars.push(b);}
  else{b.high=Math.max(b.high,q.price);b.low=Math.min(b.low,q.price);b.close=q.price;}
 }
 return bars;
}
export function currentStrategyEvidence({quotes,price,quoteAt,engineId}){
 const wait=reason=>({ready:false,side:null,reason,engineId,strength:null});
 if(!strategies.has(engineId))return wait('unknown-strategy');
 // Anchor all windows to the broker quote, not elapsed worker time. Expiry
 // never changes these windows, and historical arrivals were filtered upstream.
 const rows=quotes.filter(q=>q.ts<=quoteAt&&q.ts>=quoteAt-60000);
 const p3=at(rows,quoteAt-3000),p8=at(rows,quoteAt-8000),p14=at(rows,quoteAt-14000);
 if(!p3||!p8||!p14||rows.filter(q=>q.ts>=quoteAt-14000)
   .some((q,i,a)=>i>0&&q.ts-a[i-1].ts>3500))return wait('current-observation-not-ready');
 const bars=barsOf(rows),recent=rows.filter(q=>q.ts>=quoteAt-6000);
 const prior=rows.filter(q=>q.ts<quoteAt-6000);
 if(prior.length<2)return wait('current-observation-not-ready');
 const changes=bars.slice(1).map((b,i)=>Math.abs(b.close-bars[i].close));
 const step=mean(changes),epsilon=Math.max(price*Number.EPSILON*16,step*.15);
 if(!(step>price*Number.EPSILON*16))return wait('insufficient-quote-variation');
 const impulse=price-p3.price,flow=sideOf(impulse);
 if(Math.abs(impulse)<=epsilon)return wait('current-flow-unconfirmed');
 const lastBars=bars.slice(-4);
 const confirmations=lastBars.slice(1).filter((b,i)=>
   Math.sign(b.close-lastBars[i].close)===Math.sign(impulse)).length;
 if(confirmations<2)return wait('current-flow-unconfirmed');
 const d8=price-p8.price,d14=price-p14.price;
 const aligned=v=>Math.sign(v)===Math.sign(impulse);
 const lo=Math.min(...prior.map(q=>q.price)),hi=Math.max(...prior.map(q=>q.price));
 const span=hi-lo,tolerance=Math.max(step,span*.08);
 const recentLow=Math.min(...recent.map(q=>q.price));
 const recentHigh=Math.max(...recent.map(q=>q.price));
 const upReject=flow==='CALL'&&recentLow<=lo+tolerance&&price-recentLow>epsilon&&
   price>=lo&&price<=lo+tolerance*2;
 const downReject=flow==='PUT'&&recentHigh>=hi-tolerance&&recentHigh-price>epsilon&&
   price<=hi&&price>=hi-tolerance*2;
 const reaction=upReject?'CALL':downReject?'PUT':null;
 const breakout=flow==='CALL'&&price>hi+epsilon?'CALL':
   flow==='PUT'&&price<lo-epsilon?'PUT':null;
 const avg=mean(prior.map(q=>q.price));
 const variance=mean(prior.map(q=>(q.price-avg)**2));
 const sd=Math.sqrt(variance);
 const meanTurn=flow==='CALL'&&p3.price<avg-sd&&price<avg&&price>p3.price?'CALL':
   flow==='PUT'&&p3.price>avg+sd&&price>avg&&price<p3.price?'PUT':null;
 const trend=aligned(d8)&&aligned(d14)?flow:null;
 let side=null,setup=null;
 switch(engineId){
  case 'trend':side=trend;setup='current-trend-follow-through';break;
  case 'support_resistance':side=reaction;setup='current-level-rejection';break;
  case 'mean_reversion':side=meanTurn;setup='current-return-toward-mean';break;
  case 'breakout':side=breakout;setup='current-range-break';break;
  case 'price_action':{
   const pattern=candlePatterns(bars.slice(-4)).find(p=>
     p.side===(flow==='CALL'?'BUY':'SELL'));
   side=reaction||breakout||(pattern?flow:null);
   setup=reaction?'current-price-rejection':breakout?'current-price-break':'current-price-pattern';
   break;
  }
  case 'trendline_breakout':{
   // Confirmed historical pivots define the line. Evaluate it at the two
   // observed times only; no extension into a future entry/expiry is used.
   const lines=trendLines(bars),idx=bars.length-1;
   const oldIndex=bars.findLastIndex(b=>b.ts<=p3.ts);
   const line=flow==='CALL'?lines.resistance:lines.support;
   if(line&&oldIndex>=0){
    const oldValue=line.b.price+line.slope*(oldIndex-line.b.i);
    const current=line.b.price+line.slope*(idx-line.b.i);
    if(flow==='CALL'?p3.price<=oldValue+tolerance&&price>current+epsilon:
      p3.price>=oldValue-tolerance&&price<current-epsilon)side=flow;
   }
   setup='current-confirmed-trendline-break';break;
  }
  case 'fibonacci_retest':{
   // Use the swing before the reaction, with time-ordered low/high anchors.
   const fib=fibonacci(bars.filter(b=>b.ts<quoteAt-6000),60);
   if(fib&&flow===(fib.direction==='up'?'CALL':'PUT')){
    const touched=Object.values(fib.levels).some(level=>flow==='CALL'?
      recentLow<=level+tolerance&&price>level&&recentLow>=level-tolerance:
      recentHigh>=level-tolerance&&price<level&&recentHigh<=level+tolerance);
    if(touched)side=flow;
   }
   setup='current-fibonacci-reaction';break;
  }
  case 'smart_confluence':
   // One context, not a vote between legacy engines. A level reaction
   // combines location + actual turn; continuation combines structure + flow.
   side=reaction||((trend&&breakout===trend)?trend:null);
   setup=reaction?'current-level-and-flow':'current-structure-and-flow';break;
 }
 return side?{ready:true,side,reason:setup,engineId,strength:null,
   observedImpulse:impulse,observedNetMove:d14}:
   wait(`current-${engineId}-setup-unconfirmed`);
}

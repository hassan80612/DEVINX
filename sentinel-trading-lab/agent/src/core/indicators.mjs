const num=v=>Number.isFinite(Number(v))?Number(v):0;
const safe=v=>Number.isFinite(Number(v))?Number(v):null;
export function sma(values,period){if(!Array.isArray(values)||values.length<period||period<=0)return null;const s=values.slice(-period).map(num);return s.reduce((a,b)=>a+b,0)/s.length}
export function ema(values,period){if(!Array.isArray(values)||values.length<period||period<=0)return null;const k=2/(period+1);let out=values.slice(0,period).map(num).reduce((a,b)=>a+b,0)/period;for(const v of values.slice(period))out=num(v)*k+out*(1-k);return out}
export function emaSeries(values,period){if(!Array.isArray(values)||values.length<period||period<=0)return[];const k=2/(period+1);let out=values.slice(0,period).map(num).reduce((a,b)=>a+b,0)/period;const rows=new Array(period-1).fill(null);rows.push(out);for(const v of values.slice(period)){out=num(v)*k+out*(1-k);rows.push(out)}return rows}
export function rsi(values,period=14){if(!Array.isArray(values)||values.length<=period)return null;let g=0,l=0;for(let i=values.length-period;i<values.length;i++){const d=num(values[i])-num(values[i-1]);if(d>=0)g+=d;else l+=Math.abs(d)}const ag=g/period,al=l/period;if(al===0)return 100;const rs=ag/al;return 100-(100/(1+rs))}
export function atr(candles,period=14){if(!Array.isArray(candles)||candles.length<=period)return null;const tr=[];for(let i=1;i<candles.length;i++){const c=candles[i],p=candles[i-1];tr.push(Math.max(num(c.high)-num(c.low),Math.abs(num(c.high)-num(p.close)),Math.abs(num(c.low)-num(p.close))))}return sma(tr,period)}
export function bollinger(values,period=20,mult=2){if(!Array.isArray(values)||values.length<period)return null;const s=values.slice(-period).map(num);const mid=s.reduce((a,b)=>a+b,0)/period;const variance=s.reduce((a,b)=>a+(b-mid)**2,0)/period;const sd=Math.sqrt(variance);return{mid,upper:mid+sd*mult,lower:mid-sd*mult,sd}}
export function momentum(values,period=10){if(!Array.isArray(values)||values.length<=period)return null;const a=num(values.at(-1)),b=num(values.at(-1-period));return b===0?0:((a-b)/b)*100}
export function supportResistance(candles,lookback=50){if(!Array.isArray(candles)||!candles.length)return{support:null,resistance:null};const s=candles.slice(-lookback);return{support:Math.min(...s.map(c=>num(c.low))),resistance:Math.max(...s.map(c=>num(c.high)))}}
export function macd(values,fast=12,slow=26,signal=9){if(!Array.isArray(values)||values.length<slow+signal)return null;const ef=emaSeries(values,fast),es=emaSeries(values,slow);const line=[];for(let i=0;i<values.length;i++)if(ef[i]!=null&&es[i]!=null)line.push(ef[i]-es[i]);if(line.length<signal)return null;const sig=ema(line,signal);const value=line.at(-1);return{value,signal:sig,histogram:value-sig}}
export function stochastic(candles,period=14){if(!Array.isArray(candles)||candles.length<period)return null;const s=candles.slice(-period);const hi=Math.max(...s.map(c=>num(c.high))),lo=Math.min(...s.map(c=>num(c.low))),close=num(s.at(-1).close);if(hi===lo)return 50;return((close-lo)/(hi-lo))*100}
export function aggregateCandles(candles,factor=5){if(!Array.isArray(candles)||factor<2)return candles||[];const out=[];for(let i=Math.max(0,candles.length%factor);i<candles.length;i+=factor){const g=candles.slice(i,i+factor);if(g.length<factor)continue;out.push({ts:g[0].ts??g[0].from??null,open:num(g[0].open),high:Math.max(...g.map(c=>num(c.high))),low:Math.min(...g.map(c=>num(c.low))),close:num(g.at(-1).close),volume:g.reduce((s,c)=>s+num(c.volume),0)})}return out}
export function pivots(candles,left=2,right=2){if(!Array.isArray(candles)||candles.length<left+right+3)return{highs:[],lows:[]};const highs=[],lows=[];for(let i=left;i<candles.length-right;i++){const h=num(candles[i].high),l=num(candles[i].low);let ph=true,pl=true;for(let j=i-left;j<=i+right;j++){if(j===i)continue;if(num(candles[j].high)>=h)ph=false;if(num(candles[j].low)<=l)pl=false}if(ph)highs.push({i,price:h,ts:candles[i].ts??candles[i].from??null});if(pl)lows.push({i,price:l,ts:candles[i].ts??candles[i].from??null})}return{highs,lows}}
export function marketStructure(candles){const p=pivots(candles,2,2),hs=p.highs.slice(-3),ls=p.lows.slice(-3);let bias='range',label='RANGE';if(hs.length>=2&&ls.length>=2){const higherH=hs.at(-1).price>hs.at(-2).price,higherL=ls.at(-1).price>ls.at(-2).price,lowerH=hs.at(-1).price<hs.at(-2).price,lowerL=ls.at(-1).price<ls.at(-2).price;if(higherH&&higherL){bias='bullish';label='HH + HL'}else if(lowerH&&lowerL){bias='bearish';label='LH + LL'}else label='TRANSIÇÃO'}return{bias,label,lastHigh:hs.at(-1)?.price??null,prevHigh:hs.at(-2)?.price??null,lastLow:ls.at(-1)?.price??null,prevLow:ls.at(-2)?.price??null,pivots:p}}
export function trendLines(candles){const p=pivots(candles,2,2),hi=p.highs.slice(-2),lo=p.lows.slice(-2),idx=candles.length-1;const project=(pts)=>{if(pts.length<2)return null;const [a,b]=pts;const slope=(b.price-a.price)/(b.i-a.i||1);return{a,b,slope,value:b.price+slope*(idx-b.i)}};return{resistance:project(hi),support:project(lo)}}
export function fibonacci(candles,lookback=80){if(!Array.isArray(candles)||candles.length<10)return null;const s=candles.slice(-lookback),hi=Math.max(...s.map(c=>num(c.high))),lo=Math.min(...s.map(c=>num(c.low))),range=hi-lo;if(range<=0)return null;const last=num(s.at(-1).close),upIndex=s.findIndex(c=>num(c.low)===lo)<s.findIndex(c=>num(c.high)===hi);const levels=upIndex?{l236:hi-range*.236,l382:hi-range*.382,l500:hi-range*.5,l618:hi-range*.618,l786:hi-range*.786}:{l236:lo+range*.236,l382:lo+range*.382,l500:lo+range*.5,l618:lo+range*.618,l786:lo+range*.786};let nearest=null;for(const [name,price] of Object.entries(levels)){const d=Math.abs(last-price);if(!nearest||d<nearest.distance)nearest={name,price,distance:d}}return{direction:upIndex?'up':'down',high:hi,low:lo,last,levels,nearest}}
export function candlePatterns(candles){if(!Array.isArray(candles)||candles.length<3)return[];const a=candles.at(-2),b=candles.at(-1);const ao=num(a.open),ac=num(a.close),bo=num(b.open),bc=num(b.close),bh=num(b.high),bl=num(b.low);const body=Math.abs(bc-bo),range=Math.max(1e-12,bh-bl),upper=bh-Math.max(bo,bc),lower=Math.min(bo,bc)-bl;const out=[];if(ac<ao&&bc>bo&&bo<=ac&&bc>=ao)out.push({name:'bullish_engulfing',side:'BUY',label:'Engolfo de alta'});if(ac>ao&&bc<bo&&bo>=ac&&bc<=ao)out.push({name:'bearish_engulfing',side:'SELL',label:'Engolfo de baixa'});if(body/range<.12)out.push({name:'doji',side:'WAIT',label:'Doji'});if(lower>body*2.2&&upper<body*.8&&bc>=bo)out.push({name:'hammer',side:'BUY',label:'Martelo'});if(upper>body*2.2&&lower<body*.8&&bc<=bo)out.push({name:'shooting_star',side:'SELL',label:'Estrela cadente'});if(lower>range*.55&&body<range*.3)out.push({name:'bull_pin',side:'BUY',label:'Pin bar de alta'});if(upper>range*.55&&body<range*.3)out.push({name:'bear_pin',side:'SELL',label:'Pin bar de baixa'});return out}
export function breakoutRetest(candles,lookback=40){if(!Array.isArray(candles)||candles.length<lookback+3)return null;const prev=candles.slice(-(lookback+2),-2),last2=candles.slice(-2),sr=supportResistance(prev,lookback),a=last2[0],b=last2[1],tol=Math.max((atr(candles,14)||0)*.25,Math.abs(num(b.close))*.00025);const buyBreak=num(a.close)>num(sr.resistance)&&num(b.low)<=num(sr.resistance)+tol&&num(b.close)>num(sr.resistance);const sellBreak=num(a.close)<num(sr.support)&&num(b.high)>=num(sr.support)-tol&&num(b.close)<num(sr.support);return{side:buyBreak?'BUY':sellBreak?'SELL':'WAIT',support:sr.support,resistance:sr.resistance,tolerance:tol}}
export function nearestLevel(last,levels=[]){let best=null;for(const l of levels){const p=safe(l?.price??l);if(p==null)continue;const d=Math.abs(num(last)-p);if(!best||d<best.distance)best={price:p,distance:d}}return best}


export function supportResistanceZones(candles,lookback=90){
  if(!Array.isArray(candles)||candles.length<12)return{support:null,resistance:null,zones:[],tolerance:null};
  const rows=candles.slice(-lookback),last=num(rows.at(-1).close),vol=atr(rows,14)||Math.abs(last)*.001;
  const tolerance=Math.max(Math.abs(vol)*.22,Math.abs(last)*.00008,1e-12),p=pivots(rows,2,2);
  const cluster=(pts,type)=>{
    const sorted=[...pts].sort((a,b)=>a.price-b.price),groups=[];
    for(const point of sorted){
      let best=null,bestD=Infinity;
      for(const g of groups){const d=Math.abs(point.price-g.price);if(d<=tolerance&&d<bestD){best=g;bestD=d}}
      if(!best){groups.push({type,price:point.price,points:[point]});continue}
      best.points.push(point);best.price=best.points.reduce((a,x)=>a+x.price,0)/best.points.length
    }
    return groups.map(g=>{
      const prices=g.points.map(x=>x.price),lastIndex=Math.max(...g.points.map(x=>x.i)),touches=g.points.length;
      const recency=Math.max(0,1-(rows.length-1-lastIndex)/Math.max(1,rows.length));
      const strength=Math.max(0,Math.min(100,Math.round(28+Math.min(5,touches)*11+recency*22)));
      return{type,price:g.price,low:Math.min(...prices)-tolerance*.45,high:Math.max(...prices)+tolerance*.45,touches,strength,lastIndex,distance:Math.abs(last-g.price)}
    })
  };
  const zones=[...cluster(p.lows,'support'),...cluster(p.highs,'resistance')];
  const supports=zones.filter(z=>z.type==='support'&&z.price<=last+tolerance*.35).sort((a,b)=>a.distance-b.distance||b.strength-a.strength);
  const resistances=zones.filter(z=>z.type==='resistance'&&z.price>=last-tolerance*.35).sort((a,b)=>a.distance-b.distance||b.strength-a.strength);
  const fallback=supportResistance(rows,lookback);
  const support=supports[0]|| (Number.isFinite(Number(fallback.support))?{type:'support',price:Number(fallback.support),low:Number(fallback.support)-tolerance*.45,high:Number(fallback.support)+tolerance*.45,touches:1,strength:25,distance:Math.abs(last-Number(fallback.support))}:null);
  const resistance=resistances[0]|| (Number.isFinite(Number(fallback.resistance))?{type:'resistance',price:Number(fallback.resistance),low:Number(fallback.resistance)-tolerance*.45,high:Number(fallback.resistance)+tolerance*.45,touches:1,strength:25,distance:Math.abs(last-Number(fallback.resistance))}:null);
  return{support,resistance,zones:zones.sort((a,b)=>a.distance-b.distance),tolerance,last,atr:vol}
}

export function trendLineQuality(candles){
  if(!Array.isArray(candles)||candles.length<12)return{support:null,resistance:null};
  const p=pivots(candles,2,2),idx=candles.length-1;
  const fit=(pts,type)=>{
    const rows=pts.slice(-5);if(rows.length<2)return null;
    const n=rows.length,mx=rows.reduce((a,x)=>a+x.i,0)/n,my=rows.reduce((a,x)=>a+x.price,0)/n;
    let nume=0,den=0;for(const x of rows){nume+=(x.i-mx)*(x.price-my);den+=(x.i-mx)**2}
    const slope=den?nume/den:0,intercept=my-slope*mx;
    let ssTot=0,ssRes=0;for(const x of rows){const pred=intercept+slope*x.i;ssTot+=(x.price-my)**2;ssRes+=(x.price-pred)**2}
    const r2=ssTot>0?Math.max(0,Math.min(1,1-ssRes/ssTot)):1;
    const quality=Math.max(0,Math.min(100,Math.round((rows.length>=3?r2*72:r2*28)+Math.min(28,Math.max(0,rows.length-2)*10))));
    return{type,slope,intercept,value:intercept+slope*idx,r2,touches:rows.length,quality,points:rows}
  };
  return{resistance:fit(p.highs,'resistance'),support:fit(p.lows,'support')}
}

export function swingFibonacci(candles,lookback=120){
  if(!Array.isArray(candles)||candles.length<20)return null;
  const rows=candles.slice(-lookback),vol=atr(rows,14)||Math.abs(num(rows.at(-1).close))*.001,p=pivots(rows,2,2);
  const pts=[...p.highs.map(x=>({...x,type:'high'})),...p.lows.map(x=>({...x,type:'low'}))].sort((a,b)=>a.i-b.i);
  let pair=null;
  for(let j=pts.length-1;j>0&&!pair;j--){
    for(let i=j-1;i>=0;i--){
      const a=pts[i],b=pts[j];if(a.type===b.type)continue;
      const distance=Math.abs(b.price-a.price);if(distance<Math.max(Math.abs(vol)*1.5,Math.abs(b.price)*.0002))continue;
      pair={a,b,distance};break
    }
  }
  if(!pair){const f=fibonacci(rows,lookback);return f?{...f,quality:25,confirmed:false}:null}
  const {a,b,distance}=pair,direction=a.type==='low'&&b.type==='high'?'up':a.type==='high'&&b.type==='low'?'down':null;
  if(!direction)return null;
  const hi=Math.max(a.price,b.price),lo=Math.min(a.price,b.price),range=hi-lo,last=num(rows.at(-1).close);
  const levels=direction==='up'
    ?{l236:hi-range*.236,l382:hi-range*.382,l500:hi-range*.5,l618:hi-range*.618,l786:hi-range*.786}
    :{l236:lo+range*.236,l382:lo+range*.382,l500:lo+range*.5,l618:lo+range*.618,l786:lo+range*.786};
  let nearest=null;for(const [name,price] of Object.entries(levels)){const d=Math.abs(last-price);if(!nearest||d<nearest.distance)nearest={name,price,distance:d}}
  const recency=Math.max(0,1-(rows.length-1-b.i)/Math.max(1,rows.length)),magnitude=distance/Math.max(Math.abs(vol),1e-12);
  const quality=Math.max(0,Math.min(100,Math.round(35+Math.min(35,magnitude*8)+recency*30)));
  return{direction,high:hi,low:lo,last,levels,nearest,quality,confirmed:true,anchorStart:a,anchorEnd:b}
}

export function volatilityState(candles){
  if(!Array.isArray(candles)||candles.length<45)return{state:'unknown',ratio:1,shortAtr:null,longAtr:null,expanding:false,contracting:false};
  const shortAtr=atr(candles,10),longAtr=atr(candles,40);
  const ratio=Number.isFinite(shortAtr)&&Number.isFinite(longAtr)&&longAtr>0?shortAtr/longAtr:1;
  return{state:ratio>=1.18?'expanding':ratio<=.82?'contracting':'normal',ratio,shortAtr,longAtr,expanding:ratio>=1.18,contracting:ratio<=.82}
}

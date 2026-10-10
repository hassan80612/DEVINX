/**
 * Specialized, SINGLE-OWNER, quote-history price forecasts.
 * Every model estimates its own future price endpoint. None calls another
 * engine or uses a forming candle's direction / another motor's consensus.
 *
 * Exploratory, uncalibrated models: no empirical win rate is implied.
 * Shared helpers normalize received quote history only, not predictions.
 */
const val=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const safeLog=x=>Math.log(Math.max(1e-15,x));
const round=x=>Number(x.toPrecision(12));
function prepare(quoteHistory,asOf){
 const seen=new Map();
 for(const q of Array.isArray(quoteHistory)?quoteHistory:[]){
  const ts=val(q?.ts),p=val(q?.price);
  if(ts!==null&&p!==null&&p>0&&ts<=asOf&&ts>=0)seen.set(ts,p);
 }
 return [...seen].sort((a,b)=>a[0]-b[0]).map(([ts,p])=>({ts,p,l:safeLog(p)}));
}
const past=(rows,t)=>{
 let a=0,b=rows.length-1,index=-1;
 while(a<=b){const m=(a+b)>>1;if(rows[m].ts<=t){index=m;a=m+1}else b=m-1}
 return index<0?null:rows[index];
};
function regress(rows){
 const n=rows.length;if(n<3)return{a:0,b:0,fit:0};
 const origin=rows[0].ts;
 let sx=0,sy=0,sxx=0,sxy=0;
 for(const r of rows){const x=(r.ts-origin)/1000;sx+=x;sy+=r.l;sxx+=x*x;sxy+=x*r.l}
 const denom=n*sxx-sx*sx;
 const b=denom>0?(n*sxy-sx*sy)/denom:0,a=(sy-b*sx)/n;
 return{a,b,fit:x=>a+b*x};
}
function stats(rows,now,h){
 const current=rows.at(-1),p=current.p;
 const period=Math.max(30,Math.min(900,h*3));
 const pool=rows.filter(x=>x.ts>=current.ts-period*1000);
 const returns=[];
 for(let i=1;i<pool.length;i++){const dt=(pool[i].ts-pool[i-1].ts)/1000;if(dt>0&&dt<=10)returns.push({r:pool[i].l-pool[i-1].l,dt})}
 const perSqrt=returns.length?Math.sqrt(returns.reduce((a,x)=>a+x.r*x.r,0)/returns.reduce((a,x)=>a+x.dt,0)):0;
 const spread=Math.max(perSqrt*Math.sqrt(h),1e-11);
 const slope=seconds=>{const q=past(rows,current.ts-seconds*1000);return q?(current.l-q.l)/seconds:null};
 const mean=pool.reduce((a,x)=>a+x.l,0)/pool.length;
 const variance=pool.reduce((a,x)=>a+(x.l-mean)**2,0)/pool.length;
 const rangeMin=Math.min(...pool.map(x=>x.p)),rangeMax=Math.max(...pool.map(x=>x.p));
 const path=returns.reduce((a,x)=>a+Math.abs(x.r),0);
 const move=Math.abs(pool.at(-1).l-pool[0].l);
 return{p,current,pool,spread,slope,mean,variance,rangeMin,rangeMax,eff:path?clamp(move/path,0,1):0,perSqrt};
}
function result(stats,h,move,reason,extra={}){
 const logMove=clamp(move,-3*stats.spread,3*stats.spread);
 const target=round(stats.p*Math.exp(logMove));
 const lower=round(stats.p*Math.exp(logMove-1.5*stats.spread));
 const upper=round(stats.p*Math.exp(logMove+1.5*stats.spread));
 const side=Math.abs(target-stats.p)<Math.max(1e-12,stats.p*1e-10)?'NEUTRAL':target>stats.p?'CALL':'PUT';
 return {side,projectedPrice:target,expectedLow:lower,expectedHigh:upper,
  modelConfidence:null,evidence:[reason,'horizonte '+h+'s · sem calibração de acerto'],expectedPath:[],
  modelDiagnostics:{...extra,volatility:stats.perSqrt,efficiency:stats.eff}};
}
const required=rows=>rows.length>=15&&rows.at(-1).ts-rows[0].ts>=14000;
function trend(rows,s,h){
 const fast=s.slope(Math.max(5,Math.min(25,h/2)))??0,mid=s.slope(Math.max(20,Math.min(100,h)))??fast,long=s.slope(Math.max(45,Math.min(300,3*h)))??mid;
 const persistence=s.eff*.8+.15;
 const move=(fast*.22+mid*.43+long*.35)*h*persistence;
 return result(s,h,move,'Trend Following: inclinação histórica e persistência',{fast,mid,long,persistence});
}
function meanReversion(rows,s,h){
 const last=Math.log(s.p),pull=s.mean-last;
 const speed=clamp(.13+Math.sqrt(s.variance)/Math.max(s.spread,.000001)*.12,.08,.5);
 const move=pull*(1-Math.exp(-h/Math.max(10,80*(1-speed))))*(1-.42*s.eff);
 return result(s,h,move,'Mean Reversion: retorno estatístico ao centro anterior',{historicalMean:Math.exp(s.mean),speed});
}
function priceAction(rows,s,h){
 const recent=rows.filter(x=>x.ts>=s.current.ts-Math.max(25,h)*1000);
 const split=Math.max(4,Math.floor(recent.length/3));
 const last=recent.slice(-split),previous=recent.slice(-2*split,-split);
 const head=(arr)=>arr[0]?.p||s.p,tail=(arr)=>arr.at(-1)?.p||s.p;
 const currentLeg=Math.log(tail(last)/head(last)),oldLeg=Math.log(tail(previous)/head(previous));
 const range=Math.max(...recent.map(x=>x.p))-Math.min(...recent.map(x=>x.p));
 const rejection=(Math.max(...last.map(x=>x.p))-tail(last))-(tail(last)-Math.min(...last.map(x=>x.p)));
 const rejectionPressure=range>0?clamp(rejection/range,-1,1)*s.spread*.32:0;
 const move=(currentLeg*.44+oldLeg*.16)*Math.min(h/Math.max(5,last.length),3)+rejectionPressure;
 return result(s,h,move,'Price Action: sequência de pernas e rejeições já observadas',{currentLeg,oldLeg,rejectionPressure});
}
function supportResistance(rows,s,h){
 const pastRows=rows.filter(x=>x.ts<=s.current.ts-2000&&x.ts>=s.current.ts-180000);
 if(pastRows.length<10)return result(s,h,0,'Sem histórico suficiente de níveis');
 const lo=Math.min(...pastRows.map(x=>x.p)),hi=Math.max(...pastRows.map(x=>x.p));
 const range=Math.max(hi-lo,s.p*.0000001);
 const highPosition=(s.p-lo)/range,mid=s.slope(Math.max(15,h))??0;
 const boundary=highPosition>.85?-(highPosition-.85)/.15:highPosition<.15?(.15-highPosition)/.15:0;
 const continuation=mid*h*s.eff*.35;
 const move=boundary*s.spread*.75+continuation;
 return result(s,h,move,'Suporte/Resistência: distâncias de extremos históricos',{support:lo,resistance:hi,highPosition});
}
function breakout(rows,s,h){
 const long=rows.filter(x=>x.ts>=s.current.ts-160000&&x.ts<=s.current.ts-2000);
 const prior=long.filter(x=>x.ts>=s.current.ts-65000);
 if(prior.length<15)return result(s,h,0,'Sem faixa prévia suficiente para breakout');
 const hi=Math.max(...prior.map(x=>x.p)),lo=Math.min(...prior.map(x=>x.p)),width=(hi-lo)/s.p;
 const slope=s.slope(20)??0;
 const pressure=clamp(slope*h,-s.spread,s.spread);
 const compression=clamp(s.spread/Math.max(width,1e-12),.1,2);
 const proximity= s.p>=hi?1:s.p<=lo?-1:clamp(((s.p-lo)/(hi-lo||1)-.5)*2,-1,1);
 const move=(pressure*.52+proximity*s.spread*.36)*compression;
 return result(s,h,move,'Breakout: compressão de faixa passada e pressão na borda',{rangeLow:lo,rangeHigh:hi,compression,proximity});
}
function trendlineBreakout(rows,s,h){
 const samples=rows.filter(x=>x.ts>=s.current.ts-240000);
 if(samples.length<15)return result(s,h,0,'Linha de tendência indisponível');
 const chunks=[];for(let i=0;i<samples.length;i+=Math.max(3,Math.floor(samples.length/20))){const a=samples.slice(i,i+Math.max(3,Math.floor(samples.length/20)));if(a.length)chunks.push(a.at(-1))}
 const line=regress(chunks),level=Math.exp(line.fit((s.current.ts-samples[0].ts)/1000));
 const breakPressure=(Math.log(s.p/level))*clamp(h/60,.1,1);
 const trendPressure=line.b*h*.55;
 const move=trendPressure+breakPressure*.28;
 return result(s,h,move,'Trendline Breakout: regressão de pivôs históricos e desvio da linha',{lineLevel:level,lineSlope:line.b});
}
function fibonacciRetest(rows,s,h){
 const prior=rows.filter(x=>x.ts>=s.current.ts-300000&&x.ts<s.current.ts-1000);
 if(prior.length<20)return result(s,h,0,'Sem swing anterior suficiente para Fibonacci');
 const lo=Math.min(...prior.map(x=>x.p)),hi=Math.max(...prior.map(x=>x.p)),span=hi-lo;
 if(span<=0)return result(s,h,0,'Swing sem amplitude');
 const up=prior[0].p<=prior.at(-1).p,retrace=(up?hi-s.p:s.p-lo)/span;
 const bands=[.236,.382,.5,.618,.786],closest=bands.reduce((a,b)=>Math.abs(b-retrace)<Math.abs(a-retrace)?b:a,bands[0]);
 const near=clamp(1-Math.abs(retrace-closest)/.2,0,1);
 const direction=up?1:-1;
 const slope=s.slope(20)??0;
 const move=direction*near*s.spread*.52+slope*h*.22;
 return result(s,h,move,'Fibonacci Retest: retração do último swing passado',{swingLow:lo,swingHigh:hi,retrace,nearestRatio:closest});
}
function smartConfluence(rows,s,h){
 // Confluence here is INTRA-engine analytical evidence, never a vote
 // between strategy motors.
 const rShort=s.slope(Math.min(20,Math.max(5,h/3)))??0;
 const rLong=s.slope(Math.max(30,Math.min(180,h*1.5)))??rShort;
 const meanPull=s.mean-Math.log(s.p);
 const drift=(rShort*.36+rLong*.64)*h*(.2+.6*s.eff);
 const reversion=meanPull*clamp(1-s.eff,0,1)*.24;
 const move=drift+reversion;
 return result(s,h,move,'Smart Confluence: evidências próprias de estrutura, regime e média',{drift,reversion});
}
export const SPECIALIST_FORECASTS=Object.freeze({
 trend,mean_reversion,price_action,support_resistance,
 breakout,trendline_breakout,fibonacci_retest,smart_confluence
});
export function specialistForwardPrediction({engineId,quoteHistory=[],asOf=Date.now(),selectedSeconds=60}={}){
 const h=val(selectedSeconds),t=val(asOf),fn=SPECIALIST_FORECASTS[String(engineId||'')];
 if(!fn)return{status:'unknown-specialist',prediction:null};
 if(h===null||h<=0||t===null)return{status:'invalid-horizon',prediction:null};
 const rows=prepare(quoteHistory,t);
 if(!required(rows))return{status:'insufficient-quoted-history',prediction:null,samples:rows.length};
 const s=stats(rows,t,h);
 const p=fn(rows,s,h);
 return{status:'candidate-forward-prediction',calibrated:false,engineId:String(engineId),prediction:p,
  diagnostic:{horizonSeconds:h,referencePrice:s.p,quoteAt:s.current.ts,quoteAgeMs:t-s.current.ts,samples:rows.length}};
}

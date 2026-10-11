import {timedSlope,localVolatilityChange,priorConfirmedPivots,meanReversionAr1,priorTouches} from './engine-structure-metrics.mjs';
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
 // Keep trend following distinct: regress slope + R² strength and
 // deceleration, rather than extrapolate the last candle's sign.
 const short=timedSlope(rows,Math.max(12,Math.min(75,h*.7)),s.current.ts);
 const medium=timedSlope(rows,Math.max(35,Math.min(260,h*1.6)),s.current.ts);
 const long=timedSlope(rows,Math.max(90,Math.min(650,h*4)),s.current.ts);
 const vol=localVolatilityChange(rows,s.current.ts,h);
 const persistence=clamp(.18+.55*medium.r2+.22*long.r2,0,.95);
 const trendSlope=(.28*short.b+.46*medium.b+.26*long.b)*persistence;
 const deceleration=clamp(short.change,-s.perSqrt*.5,s.perSqrt*.5);
 const shockScale=clamp(1/Math.sqrt(vol.ratio),.45,1.3);
 const horizonScale=65*(1-Math.exp(-h/65))+.08*h;
 const move=(trendSlope+.22*deceleration)*horizonScale*shockScale;
 return result(s,h,move,'Trend Following: regressão temporal, força R², desaceleração e volatilidade local',
  {slope:trendSlope,r2Short:short.r2,r2Medium:medium.r2,
   r2Long:long.r2,deceleration,volatilityRatio:vol.ratio});
}
function meanReversion(rows,s,h){
 // The OU half-life is estimated on 2-second log-price samples. An
 // indiscriminate pull to a rolling average is NOT evidence of reversion.
 const fit=meanReversionAr1(rows,s.current.ts,{
  lookbackSeconds:Math.max(90,Math.min(950,h*4))
 });
 const p=Math.log(s.p),trend=timedSlope(rows,Math.max(30,Math.min(230,h*1.2)),s.current.ts);
 const historicalMean=s.mean;
 let pull=historicalMean-p,halfLifeSeconds=null,ouStrength=0;
 if(fit?.stable&&Number.isFinite(fit.equilibrium)){
  const range=Math.max(1e-8,fit.high-fit.low);
  const equilibrium=clamp(fit.equilibrium,fit.low-range*.25,fit.high+range*.25);
  halfLifeSeconds=fit.halfLifeSeconds;
  // A stable in-range OU fit contributes by its estimated mean-reverting
  // lifetime. It cannot magically reverse a sustained high-R² trend.
  ouStrength=clamp(fit.fit*(1-trend.r2*.45),0,1);
  const ouMove=(equilibrium-p)*(1-Math.pow(fit.phi,h/2));
  pull=ouMove*ouStrength+(historicalMean-p)*
    (1-Math.exp(-h/Math.max(20,h*1.1)))*(1-ouStrength)*.3;
 }else{
  pull=(historicalMean-p)*(1-Math.exp(-h/Math.max(20,h*.85)))*.24;
 }
 const move=pull*(1-.42*trend.r2);
 return result(s,h,move,'Mean Reversion: meia-vida OU estimada, equilíbrio e desvio real',{phi:fit?.phi??null,
  halfLifeSeconds,ouStrength,trendR2:trend.r2,historicalMean:Math.exp(historicalMean)});
}
function priceAction(rows,s,h){
 // A pivot must be CONFIRMED before issue time. Compare two completed
 // legs and the unfinished leg, not two arbitrary fractions of tick count.
 const recent=rows.filter(x=>x.ts>=s.current.ts-Math.max(95,Math.min(900,h*5))*1000);
 const pivots=priorConfirmedPivots(recent,s.current.ts,{
  lookbackSeconds:Math.max(95,Math.min(900,h*5)),
  confirmSeconds:Math.max(2,Math.min(8,h/12)),
  minimumProminence:s.perSqrt*Math.sqrt(Math.min(h,45))*.1
 });
 const last=pivots.at(-1),prior=pivots.at(-2),before=pivots.at(-3);
 const slope=timedSlope(rows,Math.max(22,Math.min(100,h)),s.current.ts);
 const completedLeg=last&&prior?last.l-prior.l:0;
 const olderLeg=prior&&before?prior.l-before.l:0;
 const ongoingLeg=last?Math.log(s.p)-last.l:0;
 const currentVsLeg=last&&prior?clamp(
  ongoingLeg/Math.max(s.spread*.35,Math.abs(completedLeg)),-2,2):0;
 const rejection=last?(last.kind==='high'?-1:1)*
  clamp(1-Math.abs(ongoingLeg)/Math.max(s.spread,.0000001),0,1):0;
 const legSlope=last&&prior?completedLeg/
  Math.max(3,(last.ts-prior.ts)/1000):slope.b;
 const move=(.32*slope.b+.22*legSlope)*h*
    (.3+.7*slope.r2)+rejection*s.spread*.22+
    currentVsLeg*s.spread*.08;
 return result(s,h,move,'Price Action: pernas confirmadas, rejeição de pivô e continuidade',
  {confirmedPivots:pivots.length,ongoingLeg,completedLeg,olderLeg,rejection});
}
function supportResistance(rows,s,h){
 const pivots=priorConfirmedPivots(rows,s.current.ts,{
  lookbackSeconds:Math.max(180,Math.min(1050,h*5)),
  confirmSeconds:Math.max(2,Math.min(9,h/14)),
  minimumProminence:s.perSqrt*Math.sqrt(Math.max(3,h))*.09
 });
 const current=Math.log(s.p);
 const highs=pivots.filter(x=>x.kind==='high'),lows=pivots.filter(x=>x.kind==='low');
 const resistance=highs.slice().sort((a,b)=>Math.abs(a.l-current)-Math.abs(b.l-current))[0];
 const support=lows.slice().sort((a,b)=>Math.abs(a.l-current)-Math.abs(b.l-current))[0];
 const slope=timedSlope(rows,Math.max(22,Math.min(180,h)),s.current.ts);
 if(!resistance&&!support){
  const move=slope.b*h*.12;
  return result(s,h,move,'Suporte/Resistência: sem pivôs anteriores suficientes',
   {confirmedHighs:0,confirmedLows:0});
 }
 const distanceHigh=resistance?(resistance.l-current)/Math.max(s.spread,1e-10):Infinity;
 const distanceLow=support?(current-support.l)/Math.max(s.spread,1e-10):Infinity;
 const hitHigh=resistance?priorTouches(rows,resistance.l,s.current.ts,600000):0;
 const hitLow=support?priorTouches(rows,support.l,s.current.ts,600000):0;
 // Level influence decreases continuously with distance. Crossing a level
 // is treated as a different structural reaction from touching it.
 const pressureHigh=resistance? -Math.exp(-Math.abs(distanceHigh)*1.2)*
  clamp(.65+Math.log1p(hitHigh)*.2,.5,1.25)*(distanceHigh>=0?1:-.38):0;
 const pressureLow=support? Math.exp(-Math.abs(distanceLow)*1.2)*
  clamp(.65+Math.log1p(hitLow)*.2,.5,1.25)*(distanceLow>=0?1:-.38):0;
 const continuation=slope.b*h*(.15+.15*slope.r2);
 const move=(pressureHigh+pressureLow)*s.spread*.65+continuation;
 return result(s,h,move,'Suporte/Resistência: pivôs confirmados, toques e distância aos níveis',
  {confirmedHighs:highs.length,confirmedLows:lows.length,
   priorHighTouches:hitHigh,priorLowTouches:hitLow,distanceHigh,distanceLow});
}
function breakout(rows,s,h){
 const now=s.current.ts;
 const prior=rows.filter(x=>x.ts>=now-Math.max(95,Math.min(420,h*3))*1000
  &&x.ts<=now-Math.max(3,Math.min(16,h*.17))*1000);
 if(prior.length<15)return result(s,h,0,'Breakout: sem intervalo anterior suficiente');
 const hi=Math.max(...prior.map(x=>x.l)),lo=Math.min(...prior.map(x=>x.l));
 const p=Math.log(s.p),width=Math.max(1e-10,hi-lo);
 const short=timedSlope(rows,Math.max(9,Math.min(35,h*.35)),now);
 const vol=localVolatilityChange(rows,now,h);
 const last=rows.filter(x=>x.ts>=now-Math.max(4,Math.min(22,h*.23))*1000);
 const crossedHigh=last.some(x=>x.l>hi),crossedLow=last.some(x=>x.l<lo);
 const failedHigh=crossedHigh&&p<hi?Math.max(0,
  (Math.max(...last.map(x=>x.l))-hi)/Math.max(s.spread,1e-10)):0;
 const failedLow=crossedLow&&p>lo?Math.max(0,
  (lo-Math.min(...last.map(x=>x.l)))/Math.max(s.spread,1e-10)):0;
 const displacement=p>hi?(p-hi)/Math.max(s.spread,1e-10):
  p<lo?(p-lo)/Math.max(s.spread,1e-10):0;
 const breakoutStrength=clamp(Math.abs(displacement)*Math.sqrt(vol.ratio),0,1.9);
 const pressure=short.b*h*(.18+.26*short.r2);
 const follow=Math.sign(displacement)*s.spread*breakoutStrength*.48;
 const failed=s.spread*(clamp(failedLow,0,2)-clamp(failedHigh,0,2))*.72;
 const move=follow+failed+pressure*.5;
 return result(s,h,move,'Breakout: compressão/expansão e retorno ao intervalo após rompimento',
  {rangeWidth:width,displacement,failedHigh,failedLow,volatilityRatio:vol.ratio});
}
function trendlineBreakout(rows,s,h){
 const pivots=priorConfirmedPivots(rows,s.current.ts,{
  lookbackSeconds:Math.max(170,Math.min(1300,h*5)),
  confirmSeconds:Math.max(3,Math.min(15,h/10)),
  minimumProminence:s.perSqrt*Math.sqrt(Math.max(h,4))*.12
 });
 const highs=pivots.filter(x=>x.kind==='high');
 const lows=pivots.filter(x=>x.kind==='low');
 const fitPivots=pivotRows=>{
  if(pivotRows.length<2)return null;
  const pts=pivotRows.slice(-5).map(x=>({ts:x.ts,l:x.l}));
  // Two-or-more pivot points are sufficient for a trendline OLS
  const o=pts[0].ts;let sx=0,sy=0,sxx=0,sxy=0;
  for(const q of pts){let x=(q.ts-o)/1000;sx+=x;sy+=q.l;sxx+=x*x;sxy+=x*q.l}
  const n=pts.length,den=n*sxx-sx*sx;
  const b=den>0?(n*sxy-sx*sy)/den:0;
  const a=(sy-b*sx)/n;
  return {slope:b,level:a+b*(s.current.ts-o)/1000};
 };
 const upper=fitPivots(highs),lower=fitPivots(lows);
 const p=Math.log(s.p);
 const trend=timedSlope(rows,Math.max(30,Math.min(220,h)),s.current.ts);
 if(!upper&&!lower)return result(s,h,trend.b*h*.25,
  'Trendline Breakout: aguardando dois pivôs confirmados da mesma direção',
  {confirmedHighs:highs.length,confirmedLows:lows.length});
 const upperDistance=upper?(p-upper.level)/Math.max(s.spread,1e-10):0;
 const lowerDistance=lower?(p-lower.level)/Math.max(s.spread,1e-10):0;
 const upperPressure=upper?clamp(upperDistance,-2,2)*s.spread*.32:0;
 const lowerPressure=lower?clamp(lowerDistance,-2,2)*s.spread*.32:0;
 const continuation=trend.b*h*.45*Math.max(.15,trend.r2);
 const move=continuation+upperPressure+lowerPressure;
 return result(s,h,move,'Trendline Breakout: linhas de pivôs históricos confirmados',
  {confirmedHighs:highs.length,confirmedLows:lows.length,
   upperSlope:upper?.slope??null,lowerSlope:lower?.slope??null,
   upperDistance,lowerDistance});
}
function fibonacciRetest(rows,s,h){
 const pivots=priorConfirmedPivots(rows,s.current.ts,{
  lookbackSeconds:Math.max(170,Math.min(1200,h*5)),
  confirmSeconds:Math.max(3,Math.min(12,h/10)),
  minimumProminence:s.perSqrt*Math.sqrt(Math.max(h,5))*.17
 });
 const end=pivots.at(-1),start=pivots.at(-2);
 const trend=timedSlope(rows,Math.max(20,Math.min(160,h)),s.current.ts);
 if(!end||!start||start.kind===end.kind){
  return result(s,h,trend.b*h*.12,
   'Fibonacci Retest: swing anterior ainda não confirmado',
   {confirmedPivots:pivots.length});
 }
 const span=Math.abs(end.l-start.l),current=Math.log(s.p);
 if(span<Math.max(s.perSqrt*Math.sqrt(h)*.25,1e-10))
  return result(s,h,trend.b*h*.12,'Fibonacci Retest: swing sem amplitude significativa',
   {confirmedPivots:pivots.length});
 const up=end.l>start.l, retrace=(up?end.l-current:current-end.l)/span;
 const ratios=[.236,.382,.5,.618,.786],nearest=ratios.reduce((a,b)=>
  Math.abs(retrace-b)<Math.abs(retrace-a)?b:a,ratios[0]);
 // A Fibonacci zone is relevant only after a CONFIRMED leg has actually
 // retraced. It is not a forced bounce whenever price is near 0.618.
 const proximity=clamp(1-Math.abs(nearest-retrace)/.12,0,1);
 const rejection=clamp((up?1:-1)*trend.b*h/Math.max(s.spread,1e-10),-1,1);
 const retestStrength=proximity*clamp(.5+.45*rejection,0,1);
 const continuation=(up?1:-1)*s.spread*retestStrength*.45;
 const move=continuation+trend.b*h*.26;
 return result(s,h,move,'Fibonacci Retest: swing confirmado, retração e direção da reação',
  {confirmedPivots:pivots.length,nearestRatio:nearest,retrace,proximity,rejection});
}
function smartConfluence(rows,s,h){
 // Intra-engine evidence only. Uses its own trend, mean and rejection
 // estimates; never imports any of the eight other motors' predictions.
 const trend=timedSlope(rows,Math.max(25,Math.min(230,h*1.8)),s.current.ts);
 const ar=meanReversionAr1(rows,s.current.ts,{
  lookbackSeconds:Math.max(90,Math.min(850,h*4))
 });
 const vol=localVolatilityChange(rows,s.current.ts,h);
 const pivots=priorConfirmedPivots(rows,s.current.ts,{
  lookbackSeconds:Math.max(110,Math.min(720,h*3)),
  confirmSeconds:Math.max(2,Math.min(8,h/12)),
  minimumProminence:s.perSqrt*Math.sqrt(h)*.11
 });
 const pivot=pivots.at(-1);
 const p=Math.log(s.p);
 const trendMove=trend.b*(65*(1-Math.exp(-h/65))+.15*h)*trend.r2;
 const equilibrium=ar?.stable&&ar.equilibrium>=ar.low-.25*(ar.high-ar.low)
  &&ar.equilibrium<=ar.high+.25*(ar.high-ar.low)?
  ar.equilibrium:s.mean;
 const meanMove=(equilibrium-p)*clamp(ar?.stable?1-Math.pow(ar.phi,h/2):h/120,0,1);
 const pivotDistance=pivot?(p-pivot.l)/Math.max(s.spread,1e-10):0;
 const rejection=pivot?(pivot.kind==='high'?-1:1)*
  s.spread*.22*Math.exp(-Math.abs(pivotDistance)):0;
 const trendMix=clamp(.22+.6*trend.r2,0,1);
 const reversionMix=clamp((1-trend.r2)*.38,0,.38);
 const volatilityScaling=clamp(1/Math.sqrt(vol.ratio),.5,1.2);
 const move=(trendMove*trendMix+meanMove*reversionMix+rejection)*volatilityScaling;
 return result(s,h,move,'Smart Confluence: R², equilíbrio estatístico, pivôs e volatilidade próprios',
  {trendR2:trend.r2,volatilityRatio:vol.ratio,arPhi:ar?.phi??null,
   pivots:pivots.length,trendContribution:trendMove,reversionContribution:meanMove});
}
export const SPECIALIST_FORECASTS=Object.freeze({
 trend,mean_reversion:meanReversion,price_action:priceAction,
 support_resistance:supportResistance,breakout,
 trendline_breakout:trendlineBreakout,fibonacci_retest:fibonacciRetest,
 smart_confluence:smartConfluence
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

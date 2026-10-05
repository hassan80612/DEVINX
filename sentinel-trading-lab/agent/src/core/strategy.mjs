import {ema,rsi,atr,bollinger,momentum,supportResistance,macd,stochastic,marketStructure,trendLines,fibonacci,candlePatterns,breakoutRetest,aggregateCandles} from './indicators.mjs';
import {SignalSide} from './types.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const near=(a,b,t)=>a!=null&&b!=null&&Math.abs(a-b)<=Math.max(t,Math.abs(b)*.00015);
function addScore(box,side,points,reason){if(side==='BUY')box.buy+=points;else if(side==='SELL')box.sell+=points;if(reason)box.reasons.push(reason)}
function median(xs=[]){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function candleSeconds(candles=[]){
 const xs=candles.slice(-20).map(c=>{
   const a=Number(c?.from),b=Number(c?.to);
   if(Number.isFinite(a)&&Number.isFinite(b)&&b>a)return b-a;
   return null
 }).filter(Boolean);
 return median(xs)||60
}
function liveMicro(quoteHistory=[],last,vol,baseSeconds,now=Date.now()){
 const points=(Array.isArray(quoteHistory)?quoteHistory:[])
   .map(x=>({ts:Number(x?.ts),price:Number(x?.price)}))
   .filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.price)&&x.price>0&&now-x.ts<=120000)
   .sort((a,b)=>a.ts-b.ts);
 const latest=points.at(-1);
 const current=latest?.price??Number(last);
 const atAgo=(ms)=>{
   const target=(latest?.ts??now)-ms;
   let best=null;
   for(const p of points){if(p.ts<=target)best=p;else break}
   return best?.price??points[0]?.price??current
 };
 const d5=current-atAgo(5000),d15=current-atAgo(15000),d30=current-atAgo(30000);
 const span=points.length>1?points.at(-1).ts-points[0].ts:0;
 const ready=points.length>=8&&span>=5000;
 const safeBase=Math.max(5,Number(baseSeconds||60));
 const expected=(secs)=>Math.max(Math.abs(current)*.000005,Math.abs(vol||0)*Math.sqrt(Math.max(1,secs)/safeBase));
 const p5=d5/expected(5),p15=d15/expected(15),p30=d30/expected(30);
 const pulse=ready?clamp(Math.round(p5*4.5+p15*3.2+p30*2.2),-24,24):0;
 const trend=pulse>=4?'UP':pulse<=-4?'DOWN':'FLAT';
 return{ready,points:points.length,spanMs:span,last:current,delta5:d5,delta15:d15,delta30:d30,pulse,trend}
}
export function analyzeMarket({candles,quoteHistory=[],strategy='smart_confluence',minConfidence=74,durationMs=60000,freshnessMs=5000,quoteTs=Date.now(),now=Date.now()}){
 if(!Array.isArray(candles)||candles.length<35)return{side:SignalSide.WAIT,confidence:0,reasons:['dados insuficientes: mínimo 35 candles'],metrics:{sourceCandles:candles?.length||0}};
 if(now-quoteTs>freshnessMs)return{side:SignalSide.WAIT,confidence:0,reasons:['feed atrasado'],metrics:{sourceCandles:candles.length}};
 const closes=candles.map(c=>Number(c.close));const prior=candles.slice(0,-1);const candleLast=closes.at(-1);const vol=atr(candles,14)||Math.abs(candleLast)*.001;
 const baseSeconds=candleSeconds(candles),micro=liveMicro(quoteHistory,candleLast,vol,baseSeconds,now),last=Number(micro.last||candleLast);
 const higher=aggregateCandles(candles,5),higherCloses=higher.map(c=>Number(c.close));
 const m={
   fast:ema(closes,9),slow:ema(closes,21),ema50:ema(closes,50),ema200:ema(closes,200),rsi:rsi(closes,14),atr:vol,bb:bollinger(closes,20,2),momentum:momentum(closes,10),
   sr:supportResistance(prior,50),last,macd:macd(closes),stoch:stochastic(candles,14),structure:marketStructure(candles),trendlines:trendLines(candles),fib:fibonacci(candles,80),patterns:candlePatterns(candles),retest:breakoutRetest(candles,35),
   higherTF:{fast:ema(higherCloses,9),slow:ema(higherCloses,21),structure:marketStructure(higher),candles:higher.length},sourceCandles:candles.length,baseCandleSeconds:baseSeconds,micro
 };
 const box={buy:0,sell:0,reasons:[]};
 const trendUp=m.fast!=null&&m.slow!=null&&m.fast>m.slow,trendDn=m.fast!=null&&m.slow!=null&&m.fast<m.slow;
 const higherUp=m.higherTF.fast!=null&&m.higherTF.slow!=null&&m.higherTF.fast>m.higherTF.slow,higherDn=m.higherTF.fast!=null&&m.higherTF.slow!=null&&m.higherTF.fast<m.higherTF.slow;
 const applyCore=()=>{
   if(trendUp)addScore(box,'BUY',15,'EMA 9 acima da EMA 21');if(trendDn)addScore(box,'SELL',15,'EMA 9 abaixo da EMA 21');
   if(m.ema50!=null){if(last>m.ema50)addScore(box,'BUY',6,'preço acima da EMA 50');else addScore(box,'SELL',6,'preço abaixo da EMA 50')}
   if(m.macd?.histogram>0)addScore(box,'BUY',11,'MACD com histograma positivo');if(m.macd?.histogram<0)addScore(box,'SELL',11,'MACD com histograma negativo');
   if(m.momentum>0)addScore(box,'BUY',8,'momentum positivo');if(m.momentum<0)addScore(box,'SELL',8,'momentum negativo');
   if(m.structure.bias==='bullish')addScore(box,'BUY',16,'estrutura HH + HL');if(m.structure.bias==='bearish')addScore(box,'SELL',16,'estrutura LH + LL');
   if(higherUp)addScore(box,'BUY',12,'timeframe superior alinhado para alta');if(higherDn)addScore(box,'SELL',12,'timeframe superior alinhado para baixa');
   for(const p of m.patterns){if(p.side==='BUY')addScore(box,'BUY',12,p.label);if(p.side==='SELL')addScore(box,'SELL',12,p.label)}
   if(m.rsi!=null&&m.rsi>=52&&m.rsi<=68)addScore(box,'BUY',5,`RSI confirma força (${m.rsi.toFixed(1)})`);if(m.rsi!=null&&m.rsi<=48&&m.rsi>=32)addScore(box,'SELL',5,`RSI confirma fraqueza (${m.rsi.toFixed(1)})`);
 };
 if(strategy==='trend'||strategy==='smart_confluence'||strategy==='price_action'||strategy==='trendline_breakout'||strategy==='support_resistance'||strategy==='fibonacci_retest')applyCore();
 if(strategy==='mean_reversion'){
   if(m.bb&&last<=m.bb.lower)addScore(box,'BUY',28,'toque/rompimento da banda inferior');if(m.bb&&last>=m.bb.upper)addScore(box,'SELL',28,'toque/rompimento da banda superior');
   if(m.rsi!=null&&m.rsi<30)addScore(box,'BUY',28,`RSI sobrevendido (${m.rsi.toFixed(1)})`);if(m.rsi!=null&&m.rsi>70)addScore(box,'SELL',28,`RSI sobrecomprado (${m.rsi.toFixed(1)})`);
   if(m.stoch!=null&&m.stoch<20)addScore(box,'BUY',18,'Estocástico em sobrevenda');if(m.stoch!=null&&m.stoch>80)addScore(box,'SELL',18,'Estocástico em sobrecompra');
 }
 if(strategy==='breakout'||strategy==='trendline_breakout'||strategy==='smart_confluence'){
   if(m.retest?.side==='BUY')addScore(box,'BUY',24,'rompimento + reteste de resistência');if(m.retest?.side==='SELL')addScore(box,'SELL',24,'rompimento + reteste de suporte');
   const rtl=m.trendlines.resistance,stl=m.trendlines.support;
   if(rtl&&last>rtl.value+vol*.08)addScore(box,'BUY',14,'rompimento de linha de tendência superior');if(stl&&last<stl.value-vol*.08)addScore(box,'SELL',14,'rompimento de linha de tendência inferior');
 }
 if(strategy==='support_resistance'||strategy==='smart_confluence'||strategy==='price_action'){
   if(near(last,m.sr.support,vol*.45))addScore(box,'BUY',14,'reação próxima ao suporte');if(near(last,m.sr.resistance,vol*.45))addScore(box,'SELL',14,'reação próxima à resistência');
 }
 if(strategy==='fibonacci_retest'||strategy==='smart_confluence'){
   const f=m.fib?.nearest;if(f&&f.distance<=vol*.6){if(m.fib.direction==='up'&&trendUp)addScore(box,'BUY',12,`reteste Fibonacci ${f.name.replace('l','')}`);if(m.fib.direction==='down'&&trendDn)addScore(box,'SELL',12,`reteste Fibonacci ${f.name.replace('l','')}`)}
 }
 if(strategy==='price_action'){
   if(m.patterns.some(p=>p.side==='BUY'))addScore(box,'BUY',10,'price action comprador confirmado');if(m.patterns.some(p=>p.side==='SELL'))addScore(box,'SELL',10,'price action vendedor confirmado');
 }
 if(strategy==='trend'){if(trendUp)addScore(box,'BUY',12,'tendência confirmada');if(trendDn)addScore(box,'SELL',12,'tendência confirmada')}

 const horizon=Math.max(30000,Number(durationMs||60000));
 const microWeight=horizon<=60000?1:horizon<=120000?.82:horizon<=300000?.55:.30;
 const rawBuy=box.buy,rawSell=box.sell;
 const conflict=Math.min(rawBuy,rawSell);
 let buyEffective=clamp(Math.round(rawBuy-rawSell*.35),0,100);
 let sellEffective=clamp(Math.round(rawSell-rawBuy*.35),0,100);

 // Timing curto: impede entrar atrasado só porque as EMAs/MACD ainda apontam para o movimento anterior.
 if(micro.ready){
   const bonus=Math.round(Math.abs(micro.pulse)*.85*microWeight);
   const oppose=Math.round(18*microWeight);
   if(micro.pulse>=4){buyEffective=clamp(buyEffective+bonus,0,100);sellEffective=clamp(sellEffective-oppose,0,100);box.reasons.push('microfluxo de preço confirma alta')}
   else if(micro.pulse<=-4){sellEffective=clamp(sellEffective+bonus,0,100);buyEffective=clamp(buyEffective-oppose,0,100);box.reasons.push('microfluxo de preço confirma baixa')}
 }else if(horizon<=60000){
   buyEffective=clamp(buyEffective-12,0,100);sellEffective=clamp(sellEffective-12,0,100);
   box.reasons.push('aguardando microfluxo suficiente para entrada curta')
 }

 // Evita perseguir movimento esticado em cima de suporte/resistência.
 const nearSupport=near(last,m.sr?.support,vol*.55)||(m.bb&&last<=m.bb.lower+vol*.12);
 const nearResistance=near(last,m.sr?.resistance,vol*.55)||(m.bb&&last>=m.bb.upper-vol*.12);
 const sellReversalRisk=nearSupport&&((m.rsi!=null&&m.rsi<=42)||(m.stoch!=null&&m.stoch<=25));
 const buyReversalRisk=nearResistance&&((m.rsi!=null&&m.rsi>=58)||(m.stoch!=null&&m.stoch>=75));
 if(sellReversalRisk){sellEffective=clamp(sellEffective-Math.round(20*microWeight),0,100);box.reasons.push('PUT penalizado: risco de repique em suporte/sobrevenda')}
 if(buyReversalRisk){buyEffective=clamp(buyEffective-Math.round(20*microWeight),0,100);box.reasons.push('CALL penalizado: risco de rejeição em resistência/sobrecompra')}

 const edge=buyEffective-sellEffective;
 const confidence=Math.max(buyEffective,sellEffective);
 const microAlignedForBuy=!micro.ready||micro.pulse>=-1;
 const microAlignedForSell=!micro.ready||micro.pulse<=1;
 let side=SignalSide.WAIT;
 if(confidence>=minConfidence&&Math.abs(edge)>=12){
   if(edge>0&&microAlignedForBuy&&!buyReversalRisk)side=SignalSide.BUY;
   if(edge<0&&microAlignedForSell&&!sellReversalRisk)side=SignalSide.SELL
 }
 if(horizon<=60000&&!micro.ready)side=SignalSide.WAIT;

 // Projeção de 30 s usa o fluxo de preço real dos últimos segundos, não apenas o corpo da candle do gráfico.
 const lastCandle=candles.at(-1)||{},prevCandle=candles.at(-2)||{};
 const openNow=Number(lastCandle.open??candleLast),prevClose=Number(prevCandle.close??candleLast);
 const body=candleLast-openNow,recent=candleLast-prevClose,safeVol=Math.max(Math.abs(vol||0),Math.abs(last)*.00001);
 const candlePulse=clamp(Math.round(((body/safeVol)*4)+((recent/safeVol)*3)),-8,8);
 const microPulse=micro.ready?micro.pulse:candlePulse;
 const projectedBuy=clamp(Math.round(buyEffective*.72+Math.max(0,microPulse)*1.35),0,100);
 const projectedSell=clamp(Math.round(sellEffective*.72+Math.max(0,-microPulse)*1.35),0,100);
 const previewThreshold=Math.max(50,Number(minConfidence||74)-12);
 let forecastSide=SignalSide.WAIT;
 if(micro.ready&&Math.max(projectedBuy,projectedSell)>=previewThreshold&&Math.abs(projectedBuy-projectedSell)>=10)forecastSide=projectedBuy>projectedSell?SignalSide.BUY:SignalSide.SELL;
 const forecastConfidence=Math.max(projectedBuy,projectedSell);
 const callGap=Math.max(0,Math.round(Number(minConfidence||74)-projectedBuy));
 const putGap=Math.max(0,Math.round(Number(minConfidence||74)-projectedSell));

 // Confluência final: contexto técnico + timing real + previsão de 30 s.
 const currentLeader=buyEffective-sellEffective;
 const futureLeader=projectedBuy-projectedSell;
 const alignedCall=currentLeader>=8&&futureLeader>=8;
 const alignedPut=currentLeader<=-8&&futureLeader<=-8;
 const disagreement=currentLeader*futureLeader<0;
 const alignmentBonus=alignedCall||alignedPut?5:0;
 const disagreementPenalty=disagreement?14:0;
 const finalCall=clamp(Math.round(buyEffective*.58+projectedBuy*.42+(alignedCall?alignmentBonus:0)-(futureLeader<0?disagreementPenalty:0)),0,100);
 const finalPut=clamp(Math.round(sellEffective*.58+projectedSell*.42+(alignedPut?alignmentBonus:0)-(futureLeader>0?disagreementPenalty:0)),0,100);
 const finalEdge=finalCall-finalPut;
 const finalStrength=Math.max(finalCall,finalPut);
 const finalSide=finalStrength>=Number(minConfidence||74)&&Math.abs(finalEdge)>=10&&micro.ready?(finalEdge>0?'CALL':'PUT'):'AGUARDAR';

 const plannerHorizons=[30,60,120,300,600,900];
 const upperLevels=[m.sr?.resistance,m.trendlines?.resistance?.value,m.bb?.upper].map(Number).filter(v=>Number.isFinite(v)&&v>last).sort((a,b)=>a-b);
 const lowerLevels=[m.sr?.support,m.trendlines?.support?.value,m.bb?.lower].map(Number).filter(v=>Number.isFinite(v)&&v<last).sort((a,b)=>b-a);
 const nearestUpper=upperLevels[0]??null,nearestLower=lowerLevels[0]??null;
 const reversalMode=strategy==='mean_reversion'||strategy==='support_resistance';
 const planner=Object.fromEntries(plannerHorizons.map(seconds=>{
   const scale=Math.sqrt(Math.max(.5,seconds/60));
   const expectedMove=Math.max(safeVol*.35,safeVol*scale);
   const triggerBuffer=Math.max(safeVol*.08,expectedMove*.24);
   let callTrigger,putTrigger,callInvalidation,putInvalidation,callRule,putRule;
   if(reversalMode){
     const lower=nearestLower??(last-expectedMove),upper=nearestUpper??(last+expectedMove);
     callTrigger=lower+triggerBuffer*.10;putTrigger=upper-triggerBuffer*.10;callInvalidation=lower-triggerBuffer*.40;putInvalidation=upper+triggerBuffer*.40;
     callRule='CALL somente se tocar a região e reagir para cima';putRule='PUT somente se tocar a região e rejeitar para baixo'
   }else{
     const upper=nearestUpper!=null&&nearestUpper<=last+expectedMove*2?nearestUpper:last+expectedMove*.45;
     const lower=nearestLower!=null&&nearestLower>=last-expectedMove*2?nearestLower:last-expectedMove*.45;
     callTrigger=Math.max(last+triggerBuffer*.55,upper+triggerBuffer*.10);putTrigger=Math.min(last-triggerBuffer*.55,lower-triggerBuffer*.10);
     callInvalidation=Math.max(last-triggerBuffer*.50,nearestLower??(last-triggerBuffer*.50));putInvalidation=Math.min(last+triggerBuffer*.50,nearestUpper??(last+triggerBuffer*.50));
     callRule='CALL somente após romper e sustentar acima do gatilho';putRule='PUT somente após romper e sustentar abaixo do gatilho'
   }
   const bias=projectedBuy-projectedSell>=10?'CALL':projectedSell-projectedBuy>=10?'PUT':'NEUTRO';
   return[String(seconds),{horizonSeconds:seconds,currentPrice:last,expectedMove,expectedLow:last-expectedMove,expectedHigh:last+expectedMove,callTrigger,putTrigger,callInvalidation,putInvalidation,callRule,putRule,bias,callStrength:projectedBuy,putStrength:projectedSell,basis:reversalMode?'reação em suporte/resistência':'rompimento + confirmação',automaticExecution:false}]
 }));

 if(side===SignalSide.WAIT)box.reasons.push(`entrada aguardando: CALL ${buyEffective}% · PUT ${sellEffective}% · filtro ${Number(minConfidence||74)}%`);
 return{
   side,confidence,reasons:box.reasons.slice(0,14),
   forecast30:{side:forecastSide,confidence:forecastConfidence,horizonSeconds:30,callStrength:projectedBuy,putStrength:projectedSell,trigger:Number(minConfidence||74),callGap,putGap,microPulse,microReady:micro.ready},
   finalConfluence:{side:finalSide,strength:finalStrength,callStrength:finalCall,putStrength:finalPut,minConfidence:Number(minConfidence||74),aligned:alignedCall||alignedPut,disagreement,basis:'contexto técnico + microfluxo real + projeção de 30 s'},
   entryPlanner:{defaultHorizonSeconds:30,horizons:planner},
   metrics:{...m,rawBuyScore:rawBuy,rawSellScore:rawSell,buyScore:buyEffective,sellScore:sellEffective,buyEffective,sellEffective,projectedBuy,projectedSell,edge,microPulse,strategy}
 };
}

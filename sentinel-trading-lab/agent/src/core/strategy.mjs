import {ema,rsi,atr,bollinger,momentum,supportResistance,macd,stochastic,marketStructure,trendLines,fibonacci,candlePatterns,breakoutRetest,aggregateCandles} from './indicators.mjs';
import {SignalSide} from './types.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const near=(a,b,t)=>a!=null&&b!=null&&Math.abs(a-b)<=Math.max(t,Math.abs(b)*.00015);
function addScore(box,side,points,reason){if(side==='BUY')box.buy+=points;else if(side==='SELL')box.sell+=points;if(reason)box.reasons.push(reason)}
export function analyzeMarket({candles,strategy='smart_confluence',minConfidence=74,freshnessMs=5000,quoteTs=Date.now(),now=Date.now()}){
 if(!Array.isArray(candles)||candles.length<35)return{side:SignalSide.WAIT,confidence:0,reasons:['dados insuficientes: mínimo 35 candles'],metrics:{sourceCandles:candles?.length||0}};
 if(now-quoteTs>freshnessMs)return{side:SignalSide.WAIT,confidence:0,reasons:['feed atrasado'],metrics:{sourceCandles:candles.length}};
 const closes=candles.map(c=>Number(c.close));const prior=candles.slice(0,-1);const last=closes.at(-1);const vol=atr(candles,14)||Math.abs(last)*.001;
 const higher=aggregateCandles(candles,5),higherCloses=higher.map(c=>Number(c.close));
 const m={
   fast:ema(closes,9),slow:ema(closes,21),ema50:ema(closes,50),ema200:ema(closes,200),rsi:rsi(closes,14),atr:vol,bb:bollinger(closes,20,2),momentum:momentum(closes,10),
   sr:supportResistance(prior,50),last,macd:macd(closes),stoch:stochastic(candles,14),structure:marketStructure(candles),trendlines:trendLines(candles),fib:fibonacci(candles,80),patterns:candlePatterns(candles),retest:breakoutRetest(candles,35),
   higherTF:{fast:ema(higherCloses,9),slow:ema(higherCloses,21),structure:marketStructure(higher),candles:higher.length},sourceCandles:candles.length
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
 const raw=Math.max(box.buy,box.sell),conflict=Math.min(box.buy,box.sell);
 const confidence=clamp(Math.round(raw-conflict*.35),0,100);
 const buyEffective=clamp(Math.round(box.buy-box.sell*.35),0,100);
 const sellEffective=clamp(Math.round(box.sell-box.buy*.35),0,100);
 const edge=box.buy-box.sell;
 let side=SignalSide.WAIT;
 if(confidence>=minConfidence&&Math.abs(edge)>=10)side=edge>0?SignalSide.BUY:SignalSide.SELL;

 // Pré-sinal de curtíssimo prazo: usa a confluência atual + impulso do candle corrente.
 // É uma projeção técnica, não uma probabilidade garantida.
 const lastCandle=candles.at(-1)||{},prevCandle=candles.at(-2)||{};
 const openNow=Number(lastCandle.open??last),prevClose=Number(prevCandle.close??last);
 const body=last-openNow,recent=last-prevClose,safeVol=Math.max(Math.abs(vol||0),Math.abs(last)*.00001);
 const microPulse=clamp(Math.round(((body/safeVol)*7)+((recent/safeVol)*5)),-16,16);
 const projectedBuy=clamp(buyEffective+Math.max(0,microPulse),0,100);
 const projectedSell=clamp(sellEffective+Math.max(0,-microPulse),0,100);
 const previewThreshold=Math.max(50,Number(minConfidence||74)-14);
 let forecastSide=SignalSide.WAIT;
 if(Math.max(projectedBuy,projectedSell)>=previewThreshold&&Math.abs(projectedBuy-projectedSell)>=6)forecastSide=projectedBuy>projectedSell?SignalSide.BUY:SignalSide.SELL;
 const forecastConfidence=Math.max(projectedBuy,projectedSell);
 const callGap=Math.max(0,Math.round(Number(minConfidence||74)-projectedBuy));
 const putGap=Math.max(0,Math.round(Number(minConfidence||74)-projectedSell));

 // Planejador de gatilhos por horizonte. Ele não prevê o futuro nem envia ordem:
 // calcula níveis condicionais onde a estratégia atual exigiria nova confirmação.
 const plannerHorizons=[30,60,120,300,600,900];
 const upperLevels=[
   m.sr?.resistance,
   m.trendlines?.resistance?.value,
   m.bb?.upper
 ].map(Number).filter(v=>Number.isFinite(v)&&v>last).sort((a,b)=>a-b);
 const lowerLevels=[
   m.sr?.support,
   m.trendlines?.support?.value,
   m.bb?.lower
 ].map(Number).filter(v=>Number.isFinite(v)&&v<last).sort((a,b)=>b-a);
 const nearestUpper=upperLevels[0]??null,nearestLower=lowerLevels[0]??null;
 const reversalMode=strategy==='mean_reversion'||strategy==='support_resistance';
 const planner=Object.fromEntries(plannerHorizons.map(seconds=>{
   const scale=Math.sqrt(Math.max(.5,seconds/60));
   const expectedMove=Math.max(safeVol*.35,safeVol*scale);
   const triggerBuffer=Math.max(safeVol*.08,expectedMove*.24);
   let callTrigger,putTrigger,callInvalidation,putInvalidation,callRule,putRule;
   if(reversalMode){
     const lower=nearestLower??(last-expectedMove),upper=nearestUpper??(last+expectedMove);
     callTrigger=lower+triggerBuffer*.10;
     putTrigger=upper-triggerBuffer*.10;
     callInvalidation=lower-triggerBuffer*.40;
     putInvalidation=upper+triggerBuffer*.40;
     callRule='CALL somente se tocar a região e reagir para cima';
     putRule='PUT somente se tocar a região e rejeitar para baixo';
   }else{
     const upper=nearestUpper!=null&&nearestUpper<=last+expectedMove*2?nearestUpper:last+expectedMove*.45;
     const lower=nearestLower!=null&&nearestLower>=last-expectedMove*2?nearestLower:last-expectedMove*.45;
     callTrigger=Math.max(last+triggerBuffer*.55,upper+triggerBuffer*.10);
     putTrigger=Math.min(last-triggerBuffer*.55,lower-triggerBuffer*.10);
     callInvalidation=Math.max(last-triggerBuffer*.50,nearestLower??(last-triggerBuffer*.50));
     putInvalidation=Math.min(last+triggerBuffer*.50,nearestUpper??(last+triggerBuffer*.50));
     callRule='CALL somente após romper e sustentar acima do gatilho';
     putRule='PUT somente após romper e sustentar abaixo do gatilho';
   }
   const bias=projectedBuy-projectedSell>=8?'CALL':projectedSell-projectedBuy>=8?'PUT':'NEUTRO';
   return[String(seconds),{
     horizonSeconds:seconds,
     currentPrice:last,
     expectedMove,
     expectedLow:last-expectedMove,
     expectedHigh:last+expectedMove,
     callTrigger,
     putTrigger,
     callInvalidation,
     putInvalidation,
     callRule,
     putRule,
     bias,
     callStrength:projectedBuy,
     putStrength:projectedSell,
     basis:reversalMode?'reação em suporte/resistência':'rompimento + confirmação',
     automaticExecution:false
   }]
 }));

 if(side===SignalSide.WAIT)box.reasons.push(`score ${confidence}% abaixo do filtro ou confluência conflitante`);
 return{
   side,confidence,reasons:box.reasons.slice(0,12),
   forecast30:{
     side:forecastSide,
     confidence:forecastConfidence,
     horizonSeconds:30,
     callStrength:projectedBuy,
     putStrength:projectedSell,
     trigger:Number(minConfidence||74),
     callGap,putGap,
     microPulse
   },
   entryPlanner:{defaultHorizonSeconds:30,horizons:planner},
   metrics:{...m,buyScore:box.buy,sellScore:box.sell,buyEffective,sellEffective,projectedBuy,projectedSell,edge,microPulse,strategy}
 };
}

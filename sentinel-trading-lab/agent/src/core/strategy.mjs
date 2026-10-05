import {ema,rsi,atr,bollinger,momentum,supportResistance,macd,stochastic,marketStructure,trendLines,fibonacci,candlePatterns,breakoutRetest,aggregateCandles} from './indicators.mjs';
import {SignalSide} from './types.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const near=(a,b,t)=>a!=null&&b!=null&&Math.abs(a-b)<=Math.max(t,Math.abs(b)*.00015);
function addScore(box,side,points,reason){if(side==='BUY')box.buy+=points;else if(side==='SELL')box.sell+=points;if(reason)box.reasons.push(reason)}
function median(xs=[]){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function candleSeconds(candles=[]){
 const xs=candles.slice(-20).map(c=>{const a=Number(c?.from),b=Number(c?.to);return Number.isFinite(a)&&Number.isFinite(b)&&b>a?b-a:null}).filter(Boolean);
 return median(xs)||60
}
function liveMicro(quoteHistory=[],last,vol,baseSeconds,now=Date.now()){
 const points=(Array.isArray(quoteHistory)?quoteHistory:[])
   .map(x=>({ts:Number(x?.ts),price:Number(x?.price)}))
   .filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.price)&&x.price>0&&now-x.ts<=180000)
   .sort((a,b)=>a.ts-b.ts);
 const latest=points.at(-1);
 const current=latest?.price??Number(last);
 const atAgo=(ms)=>{
   const target=(latest?.ts??now)-ms;let best=null;
   for(const p of points){if(p.ts<=target)best=p;else break}
   return best?.price??points[0]?.price??current
 };
 const d5=current-atAgo(5000),d15=current-atAgo(15000),d30=current-atAgo(30000),d60=current-atAgo(60000);
 const span=points.length>1?points.at(-1).ts-points[0].ts:0;
 const ready=points.length>=10&&span>=12000;
 const safeBase=Math.max(5,Number(baseSeconds||60));
 const expected=(secs)=>Math.max(Math.abs(current)*.000005,Math.abs(vol||0)*Math.sqrt(Math.max(1,secs)/safeBase));
 const p5=d5/expected(5),p15=d15/expected(15),p30=d30/expected(30);
 const pulse=ready?clamp(Math.round(p5*4.8+p15*3.2+p30*1.8),-24,24):0;
 const trend=pulse>=4?'UP':pulse<=-4?'DOWN':'FLAT';
 return{ready,points:points.length,spanMs:span,last:current,delta5:d5,delta15:d15,delta30:d30,delta60:d60,pulse,trend}
}
function quoteBars(quoteHistory=[],bucketMs=5000,now=Date.now()){
 const pts=(Array.isArray(quoteHistory)?quoteHistory:[])
   .map(x=>({ts:Number(x?.ts),price:Number(x?.price)}))
   .filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.price)&&x.price>0&&now-x.ts<=5*60*1000)
   .sort((a,b)=>a.ts-b.ts);
 const out=[];let cur=null;
 for(const p of pts){
   const k=Math.floor(p.ts/bucketMs)*bucketMs;
   if(!cur||cur.from!==k){
     if(cur)out.push(cur);
     cur={from:k/1000,to:(k+bucketMs)/1000,ts:k,open:p.price,high:p.price,low:p.price,close:p.price,volume:1}
   }else{
     cur.high=Math.max(cur.high,p.price);cur.low=Math.min(cur.low,p.price);cur.close=p.price;cur.volume++
   }
 }
 if(cur)out.push(cur);
 return out.slice(-72)
}
function shortHorizonModel({quoteHistory,micro,last,vol,context={},minConfidence=74,now=Date.now()}){
 const bars=quoteBars(quoteHistory,5000,now);
 if(bars.length<10||!micro.ready)return{ready:false,bars:bars.length,callScore:0,putScore:0,readyCall:false,readyPut:false,reasons:['microestrutura ainda insuficiente']};
 const closes=bars.map(b=>Number(b.close)),lastBar=bars.at(-1),prior=bars.slice(0,-1);
 const fast=ema(closes,3),slow=ema(closes,8),microRsi=rsi(closes,7),microMom=momentum(closes,3),microMacd=macd(closes,5,10,4);
 const structure=marketStructure(bars),sr=supportResistance(prior,Math.min(24,prior.length)),lines=trendLines(bars),patterns=candlePatterns(bars),retest=breakoutRetest(bars,Math.min(12,Math.max(4,bars.length-3)));
 const range=Math.max(1e-12,Number(lastBar.high)-Number(lastBar.low)),body=Number(lastBar.close)-Number(lastBar.open);
 const rejectionUp=(Number(lastBar.close)>Number(lastBar.open)&&Number(lastBar.low)<Number(lastBar.open)-Math.abs(body)*.55);
 const rejectionDown=(Number(lastBar.close)<Number(lastBar.open)&&Number(lastBar.high)>Number(lastBar.open)+Math.abs(body)*.55);
 const tol=Math.max(Math.abs(vol||0)*.18,Math.abs(last)*.00004);
 const nearSupport=near(last,sr.support,tol),nearResistance=near(last,sr.resistance,tol);
 const breakUp=Number.isFinite(sr.resistance)&&last>Number(sr.resistance)+tol*.10;
 const breakDown=Number.isFinite(sr.support)&&last<Number(sr.support)-tol*.10;
 const flowBuy=[micro.delta5>0,micro.delta15>0,micro.delta30>0].filter(Boolean).length;
 const flowSell=[micro.delta5<0,micro.delta15<0,micro.delta30<0].filter(Boolean).length;

 let call=0,put=0;const callReasons=[],putReasons=[];
 // Família 1: fluxo real (máx. 30)
 if(micro.delta5>0){call+=11;callReasons.push('fluxo 5s ↑')}else if(micro.delta5<0){put+=11;putReasons.push('fluxo 5s ↓')}
 if(micro.delta15>0){call+=10;callReasons.push('fluxo 15s ↑')}else if(micro.delta15<0){put+=10;putReasons.push('fluxo 15s ↓')}
 if(micro.delta30>0){call+=6;callReasons.push('fluxo 30s ↑')}else if(micro.delta30<0){put+=6;putReasons.push('fluxo 30s ↓')}
 if(micro.pulse>=8)call+=3;if(micro.pulse<=-8)put+=3;

 // Família 2: tendência/estrutura micro (máx. 25)
 if(fast!=null&&slow!=null&&fast>slow){call+=10;callReasons.push('EMA micro 3>8')}else if(fast!=null&&slow!=null&&fast<slow){put+=10;putReasons.push('EMA micro 3<8')}
 if(structure.bias==='bullish'){call+=10;callReasons.push('micro HH+HL')}else if(structure.bias==='bearish'){put+=10;putReasons.push('micro LH+LL')}
 const slope=closes.length>=6?(closes.at(-1)-closes.at(-6))/5:0;
 if(slope>0)call+=5;else if(slope<0)put+=5;

 // Família 3: momentum micro (máx. 15)
 if(microRsi!=null&&microRsi>=52&&microRsi<=72)call+=6;
 if(microRsi!=null&&microRsi<=48&&microRsi>=28)put+=6;
 if(microMom>0)call+=5;else if(microMom<0)put+=5;
 if(microMacd?.histogram>0)call+=4;else if(microMacd?.histogram<0)put+=4;

 // Família 4: localização/setup (máx. 20)
 if(retest?.side==='BUY'){call+=10;callReasons.push('rompimento+reteste micro')}else if(retest?.side==='SELL'){put+=10;putReasons.push('rompimento+reteste micro')}
 if(patterns.some(p=>p.side==='BUY'))call+=5;if(patterns.some(p=>p.side==='SELL'))put+=5;
 if(nearSupport&&rejectionUp){call+=5;callReasons.push('rejeição de suporte')}
 if(nearResistance&&rejectionDown){put+=5;putReasons.push('rejeição de resistência')}
 if(breakUp){call+=5;callReasons.push('rompimento micro')}if(breakDown){put+=5;putReasons.push('rompimento micro')}

 // Família 5: contexto de 60s/5m, capado em 10 para não dominar entradas de 30s.
 let ctxCall=0,ctxPut=0;
 if(context.trendUp)ctxCall+=3;if(context.trendDn)ctxPut+=3;
 if(context.structure==='bullish')ctxCall+=3;if(context.structure==='bearish')ctxPut+=3;
 if(context.higherUp)ctxCall+=2;if(context.higherDn)ctxPut+=2;
 if(context.aboveEma50)ctxCall+=2;else if(context.belowEma50)ctxPut+=2;
 call+=Math.min(10,ctxCall);put+=Math.min(10,ctxPut);

 // Penalidades de reversão/entrada atrasada.
 const callReversalRisk=(nearResistance&&(microRsi!=null&&microRsi>=68))||flowSell>=2||rejectionDown;
 const putReversalRisk=(nearSupport&&(microRsi!=null&&microRsi<=32))||flowBuy>=2||rejectionUp;
 if(callReversalRisk)call-=24;
 if(putReversalRisk)put-=24;
 if(micro.delta5<0)call-=10;if(micro.delta5>0)put-=10;
 if(flowBuy===3)put-=8;if(flowSell===3)call-=8;

 call=clamp(Math.round(call),0,100);put=clamp(Math.round(put),0,100);
 const edge=call-put,threshold=Math.max(60,Number(minConfidence||74));
 const flowReadyCall=micro.delta5>0&&micro.delta15>0&&micro.delta30>=-tol*.25;
 const flowReadyPut=micro.delta5<0&&micro.delta15<0&&micro.delta30<=tol*.25;
 const structureReadyCall=(fast!=null&&slow!=null&&fast>slow)&&(structure.bias!=='bearish');
 const structureReadyPut=(fast!=null&&slow!=null&&fast<slow)&&(structure.bias!=='bullish');
 const readyCall=call>=threshold&&edge>=15&&flowReadyCall&&structureReadyCall&&!callReversalRisk;
 const readyPut=put>=threshold&&edge<=-15&&flowReadyPut&&structureReadyPut&&!putReversalRisk;
 return{
   ready:true,bars:bars.length,callScore:call,putScore:put,edge,readyCall,readyPut,
   flowReadyCall,flowReadyPut,callReversalRisk,putReversalRisk,
   fast,slow,rsi:microRsi,momentum:microMom,macd:microMacd,structure,sr,trendlines:lines,
   patterns:patterns.map(p=>p.name),retest,range,callReasons:callReasons.slice(0,8),putReasons:putReasons.slice(0,8)
 }
}

export function analyzeMarket({candles,quoteHistory=[],strategy='smart_confluence',minConfidence=74,durationMs=60000,freshnessMs=5000,quoteTs=Date.now(),now=Date.now()}){
 if(!Array.isArray(candles)||candles.length<35)return{side:SignalSide.WAIT,confidence:0,reasons:['dados insuficientes: mínimo 35 candles'],metrics:{sourceCandles:candles?.length||0}};
 if(now-quoteTs>freshnessMs)return{side:SignalSide.WAIT,confidence:0,reasons:['feed atrasado'],metrics:{sourceCandles:candles.length}};

 const closes=candles.map(c=>Number(c.close)),prior=candles.slice(0,-1),candleLast=closes.at(-1),vol=atr(candles,14)||Math.abs(candleLast)*.001;
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
   if(m.macd?.histogram>0)addScore(box,'BUY',11,'MACD positivo');if(m.macd?.histogram<0)addScore(box,'SELL',11,'MACD negativo');
   if(m.momentum>0)addScore(box,'BUY',8,'momentum positivo');if(m.momentum<0)addScore(box,'SELL',8,'momentum negativo');
   if(m.structure.bias==='bullish')addScore(box,'BUY',16,'estrutura HH + HL');if(m.structure.bias==='bearish')addScore(box,'SELL',16,'estrutura LH + LL');
   if(higherUp)addScore(box,'BUY',12,'timeframe superior alta');if(higherDn)addScore(box,'SELL',12,'timeframe superior baixa');
   for(const p of m.patterns){if(p.side==='BUY')addScore(box,'BUY',12,p.label);if(p.side==='SELL')addScore(box,'SELL',12,p.label)}
   if(m.rsi!=null&&m.rsi>=52&&m.rsi<=68)addScore(box,'BUY',5,'RSI confirma alta');if(m.rsi!=null&&m.rsi<=48&&m.rsi>=32)addScore(box,'SELL',5,'RSI confirma baixa')
 };
 if(['trend','smart_confluence','price_action','trendline_breakout','support_resistance','fibonacci_retest'].includes(strategy))applyCore();
 if(strategy==='mean_reversion'){
   if(m.bb&&last<=m.bb.lower)addScore(box,'BUY',28,'banda inferior');if(m.bb&&last>=m.bb.upper)addScore(box,'SELL',28,'banda superior');
   if(m.rsi!=null&&m.rsi<30)addScore(box,'BUY',28,'RSI sobrevendido');if(m.rsi!=null&&m.rsi>70)addScore(box,'SELL',28,'RSI sobrecomprado');
   if(m.stoch!=null&&m.stoch<20)addScore(box,'BUY',18,'estocástico sobrevenda');if(m.stoch!=null&&m.stoch>80)addScore(box,'SELL',18,'estocástico sobrecompra')
 }
 if(['breakout','trendline_breakout','smart_confluence'].includes(strategy)){
   if(m.retest?.side==='BUY')addScore(box,'BUY',24,'rompimento + reteste');if(m.retest?.side==='SELL')addScore(box,'SELL',24,'rompimento + reteste');
   const rtl=m.trendlines.resistance,stl=m.trendlines.support;
   if(rtl&&last>rtl.value+vol*.08)addScore(box,'BUY',14,'rompimento linha superior');if(stl&&last<stl.value-vol*.08)addScore(box,'SELL',14,'rompimento linha inferior')
 }
 if(['support_resistance','smart_confluence','price_action'].includes(strategy)){
   if(near(last,m.sr.support,vol*.45))addScore(box,'BUY',14,'suporte');if(near(last,m.sr.resistance,vol*.45))addScore(box,'SELL',14,'resistência')
 }
 if(['fibonacci_retest','smart_confluence'].includes(strategy)){
   const f=m.fib?.nearest;if(f&&f.distance<=vol*.6){if(m.fib.direction==='up'&&trendUp)addScore(box,'BUY',12,'Fibonacci');if(m.fib.direction==='down'&&trendDn)addScore(box,'SELL',12,'Fibonacci')}
 }

 const horizon=Math.max(30000,Number(durationMs||60000));
 const short=shortHorizonModel({
   quoteHistory,micro,last,vol,minConfidence,now,
   context:{trendUp,trendDn,structure:m.structure.bias,higherUp,higherDn,aboveEma50:m.ema50!=null&&last>m.ema50,belowEma50:m.ema50!=null&&last<m.ema50}
 });
 m.shortModel=short;

 const rawBuy=box.buy,rawSell=box.sell;
 let buyEffective,sellEffective,side=SignalSide.WAIT;

 if(horizon<=60000){
   // Para 30s/1m a microestrutura é a fonte principal; candles de 60s/5m são só contexto.
   buyEffective=short.ready?short.callScore:0;
   sellEffective=short.ready?short.putScore:0;
   if(short.readyCall)side=SignalSide.BUY;
   if(short.readyPut)side=SignalSide.SELL;
   if(!short.ready)box.reasons.push('aguardando microestrutura de 5s')
 }else{
   const conflict=Math.min(rawBuy,rawSell);
   buyEffective=clamp(Math.round(rawBuy-rawSell*.35),0,100);
   sellEffective=clamp(Math.round(rawSell-rawBuy*.35),0,100);
   const microWeight=horizon<=120000?.55:horizon<=300000?.35:.20;
   if(micro.ready){
     const bonus=Math.round(Math.abs(micro.pulse)*.6*microWeight),oppose=Math.round(10*microWeight);
     if(micro.pulse>=4){buyEffective=clamp(buyEffective+bonus,0,100);sellEffective=clamp(sellEffective-oppose,0,100)}
     if(micro.pulse<=-4){sellEffective=clamp(sellEffective+bonus,0,100);buyEffective=clamp(buyEffective-oppose,0,100)}
   }
   const edgeLong=buyEffective-sellEffective,confLong=Math.max(buyEffective,sellEffective);
   if(confLong>=minConfidence&&Math.abs(edgeLong)>=12)side=edgeLong>0?SignalSide.BUY:SignalSide.SELL
 }

 const edge=buyEffective-sellEffective,confidence=Math.max(buyEffective,sellEffective);
 const previewThreshold=Math.max(55,Number(minConfidence||74)-10);
 const projectedBuy=horizon<=60000?buyEffective:clamp(Math.round(buyEffective*.72+Math.max(0,micro.pulse)*1.1),0,100);
 const projectedSell=horizon<=60000?sellEffective:clamp(Math.round(sellEffective*.72+Math.max(0,-micro.pulse)*1.1),0,100);
 let forecastSide=SignalSide.WAIT;
 if(micro.ready&&Math.max(projectedBuy,projectedSell)>=previewThreshold&&Math.abs(projectedBuy-projectedSell)>=12){
   if(projectedBuy>projectedSell&&!short.callReversalRisk)forecastSide=SignalSide.BUY;
   if(projectedSell>projectedBuy&&!short.putReversalRisk)forecastSide=SignalSide.SELL
 }
 const forecastConfidence=Math.max(projectedBuy,projectedSell);
 const callGap=Math.max(0,Math.round(Number(minConfidence||74)-projectedBuy)),putGap=Math.max(0,Math.round(Number(minConfidence||74)-projectedSell));

 const finalCall=clamp(Math.round(buyEffective*.62+projectedBuy*.38),0,100);
 const finalPut=clamp(Math.round(sellEffective*.62+projectedSell*.38),0,100);
 const finalEdge=finalCall-finalPut,finalStrength=Math.max(finalCall,finalPut);
 const finalSide=finalStrength>=Number(minConfidence||74)&&Math.abs(finalEdge)>=12&&micro.ready?(finalEdge>0?'CALL':'PUT'):'AGUARDAR';

 const safeVol=Math.max(Math.abs(vol||0),Math.abs(last)*.00001);
 const plannerHorizons=[30,60,120,300,600,900];
 const upperLevels=[m.sr?.resistance,m.trendlines?.resistance?.value,m.bb?.upper,short.sr?.resistance].map(Number).filter(v=>Number.isFinite(v)&&v>last).sort((a,b)=>a-b);
 const lowerLevels=[m.sr?.support,m.trendlines?.support?.value,m.bb?.lower,short.sr?.support].map(Number).filter(v=>Number.isFinite(v)&&v<last).sort((a,b)=>b-a);
 const nearestUpper=upperLevels[0]??null,nearestLower=lowerLevels[0]??null;
 const reversalMode=strategy==='mean_reversion'||strategy==='support_resistance';
 const planner=Object.fromEntries(plannerHorizons.map(seconds=>{
   const scale=Math.sqrt(Math.max(.5,seconds/60)),expectedMove=Math.max(safeVol*.35,safeVol*scale),triggerBuffer=Math.max(safeVol*.08,expectedMove*.24);
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
   const bias=projectedBuy-projectedSell>=12?'CALL':projectedSell-projectedBuy>=12?'PUT':'NEUTRO';
   return[String(seconds),{horizonSeconds:seconds,currentPrice:last,expectedMove,expectedLow:last-expectedMove,expectedHigh:last+expectedMove,callTrigger,putTrigger,callInvalidation,putInvalidation,callRule,putRule,bias,callStrength:projectedBuy,putStrength:projectedSell,basis:reversalMode?'reação em suporte/resistência':'rompimento + confirmação',automaticExecution:false}]
 }));

 if(side===SignalSide.WAIT)box.reasons.push(`entrada aguardando: CALL ${buyEffective}% · PUT ${sellEffective}% · filtro ${Number(minConfidence||74)}%`);
 if(horizon<=60000&&short.ready){
   if(short.callReversalRisk)box.reasons.push('CALL bloqueado por risco de reversão');
   if(short.putReversalRisk)box.reasons.push('PUT bloqueado por risco de reversão');
   box.reasons.push(...(edge>=0?short.callReasons:short.putReasons))
 }

 return{
   side,confidence,reasons:box.reasons.slice(0,14),
   forecast30:{side:forecastSide,confidence:forecastConfidence,horizonSeconds:30,callStrength:projectedBuy,putStrength:projectedSell,trigger:Number(minConfidence||74),callGap,putGap,microPulse:micro.pulse,microReady:micro.ready},
   finalConfluence:{side:finalSide,strength:finalStrength,callStrength:finalCall,putStrength:finalPut,minConfidence:Number(minConfidence||74),aligned:Math.abs(finalEdge)>=12,disagreement:(buyEffective-sellEffective)*(projectedBuy-projectedSell)<0,basis:horizon<=60000?'microestrutura 5s + fluxo 5/15/30s + contexto 60s':'contexto técnico + microfluxo'},
   entryPlanner:{defaultHorizonSeconds:30,horizons:planner},
   metrics:{...m,rawBuyScore:rawBuy,rawSellScore:rawSell,buyScore:buyEffective,sellScore:sellEffective,buyEffective,sellEffective,projectedBuy,projectedSell,edge,microPulse:micro.pulse,strategy}
 }
}

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
 const expected5=expected(5),expected15=expected(15),expected30=expected(30);
 const p5=d5/expected5,p15=d15/expected15,p30=d30/expected30;
 const pulse=ready?clamp(Math.round(p5*4.8+p15*3.2+p30*1.8),-24,24):0;
 const trend=pulse>=4?'UP':pulse<=-4?'DOWN':'FLAT';
 return{ready,points:points.length,spanMs:span,last:current,delta5:d5,delta15:d15,delta30:d30,delta60:d60,p5,p15,p30,expected5,expected15,expected30,pulse,trend}
}
function quoteBars(quoteHistory=[],bucketMs=5000,now=Date.now()){
 const pts=(Array.isArray(quoteHistory)?quoteHistory:[])
   .map(x=>({ts:Number(x?.ts),price:Number(x?.price)}))
   .filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.price)&&x.price>0&&now-x.ts<=5*60*1000)
   .sort((a,b)=>a.ts-b.ts);
 const out=[];let cur=null;
 for(const p of pts){
   const k=Math.floor(p.ts/bucketMs)*bucketMs;
   if(!cur||cur.bucket!==k){
     if(cur)out.push(cur);
     cur={bucket:k,from:k/1000,to:(k+bucketMs)/1000,ts:k,open:p.price,high:p.price,low:p.price,close:p.price,volume:1}
   }else{
     cur.high=Math.max(cur.high,p.price);cur.low=Math.min(cur.low,p.price);cur.close=p.price;cur.volume++
   }
 }
 if(cur)out.push(cur);
 return out.slice(-72)
}
function shortHorizonModel({quoteHistory,micro,last,vol,context={},minConfidence=74,now=Date.now()}){
 const bars=quoteBars(quoteHistory,5000,now);
 if(bars.length<5||!micro.ready)return{ready:false,bars:bars.length,callScore:null,putScore:null,reversalCallScore:null,reversalPutScore:null,readyCall:false,readyPut:false,reasons:['microestrutura em aquecimento']};
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
 const supportReversalZone=nearSupport&&!breakDown;
 const resistanceReversalZone=nearResistance&&!breakUp;
 const flowBuy=[micro.delta5>0,micro.delta15>0,micro.delta30>0].filter(Boolean).length;
 const flowSell=[micro.delta5<0,micro.delta15<0,micro.delta30<0].filter(Boolean).length;
 const prior10=micro.delta15-micro.delta5;
 const rate5=micro.delta5/5,prior10Rate=prior10/10;
 const accelFloor=Math.max(Math.abs(vol||0)*.006,Math.abs(last)*.0000006);
 const accelUp=micro.delta5>0&&micro.delta30>=-tol*.35&&rate5>Math.max(accelFloor,prior10Rate*1.18);
 const accelDown=micro.delta5<0&&micro.delta30<=tol*.35&&rate5<Math.min(-accelFloor,prior10Rate*1.18);
 const callRoom=Number.isFinite(sr.resistance)?Number(sr.resistance)-last:null;
 const putRoom=Number.isFinite(sr.support)?last-Number(sr.support):null;
 const minRoom=Math.max(tol*1.25,Math.abs(vol||0)*.18);
 const prevBar=prior.at(-1)||null,prev2Bar=prior.at(-2)||null;
 const upperWick=Number(lastBar.high)-Math.max(Number(lastBar.open),Number(lastBar.close));
 const lowerWick=Math.min(Number(lastBar.open),Number(lastBar.close))-Number(lastBar.low);
 const bodyAbs=Math.max(Math.abs(body),range*.08);
 const failedBreakUp=Number.isFinite(sr.resistance)&&Number(lastBar.high)>Number(sr.resistance)+tol*.05&&Number(lastBar.close)<=Number(sr.resistance)+tol*.08&&upperWick>bodyAbs*.8;
 const failedBreakDown=Number.isFinite(sr.support)&&Number(lastBar.low)<Number(sr.support)-tol*.05&&Number(lastBar.close)>=Number(sr.support)-tol*.08&&lowerWick>bodyAbs*.8;
 const turnDown=micro.delta15>0&&micro.delta5<0&&rate5<Math.min(-accelFloor,prior10Rate*.35);
 const turnUp=micro.delta15<0&&micro.delta5>0&&rate5>Math.max(accelFloor,prior10Rate*.35);
 const weakeningUp=micro.delta15>0&&rate5>0&&prior10Rate>0&&rate5<prior10Rate*.45;
 const weakeningDown=micro.delta15<0&&rate5<0&&prior10Rate<0&&rate5>prior10Rate*.45;
 const localHigh=prevBar&&prev2Bar&&Number(lastBar.high)>=Math.max(Number(prevBar.high),Number(prev2Bar.high));
 const localLow=prevBar&&prev2Bar&&Number(lastBar.low)<=Math.min(Number(prevBar.low),Number(prev2Bar.low));

 // Score independente de reversão. Ele mede sinais de exaustão + localização + gatilho,
 // e não é a mesma coisa que o score direcional da entrada.
 let reversalCallScore=0,reversalPutScore=0;
 if(nearSupport)reversalCallScore+=15;
 if(nearResistance)reversalPutScore+=15;
 if(failedBreakDown)reversalCallScore+=25;
 if(failedBreakUp)reversalPutScore+=25;
 if(turnUp)reversalCallScore+=24;
 if(turnDown)reversalPutScore+=24;
 if(weakeningDown)reversalCallScore+=12;
 if(weakeningUp)reversalPutScore+=12;
 if(rejectionUp)reversalCallScore+=12;
 if(rejectionDown)reversalPutScore+=12;
 if(localLow)reversalCallScore+=7;
 if(localHigh)reversalPutScore+=7;
 if(microRsi!=null&&microRsi<=34)reversalCallScore+=10;
 if(microRsi!=null&&microRsi>=66)reversalPutScore+=10;
 if(micro.p15<=-1.65)reversalCallScore+=7;
 if(micro.p15>=1.65)reversalPutScore+=7;
 if(micro.p5>0&&micro.p15<0)reversalCallScore+=8;
 if(micro.p5<0&&micro.p15>0)reversalPutScore+=8;
 reversalCallScore=clamp(Math.round(reversalCallScore),0,100);
 reversalPutScore=clamp(Math.round(reversalPutScore),0,100);

 const reversalPutCandidate=reversalPutScore>=55&&(nearResistance||failedBreakUp||localHigh)&&(rejectionDown||failedBreakUp||turnDown||weakeningUp);
 const reversalCallCandidate=reversalCallScore>=55&&(nearSupport||failedBreakDown||localLow)&&(rejectionUp||failedBreakDown||turnUp||weakeningDown);

 let call=0,put=0;const callReasons=[],putReasons=[];
 // Família 1: fluxo real (máx. 30)
 if(micro.delta5>0){call+=11;callReasons.push('fluxo 5s ↑')}else if(micro.delta5<0){put+=11;putReasons.push('fluxo 5s ↓')}
 if(micro.delta15>0){call+=10;callReasons.push('fluxo 15s ↑')}else if(micro.delta15<0){put+=10;putReasons.push('fluxo 15s ↓')}
 if(micro.delta30>0){call+=6;callReasons.push('fluxo 30s ↑')}else if(micro.delta30<0){put+=6;putReasons.push('fluxo 30s ↓')}
 if(micro.pulse>=8)call+=3;if(micro.pulse<=-8)put+=3;
 if(accelUp){call+=7;callReasons.push('aceleração inicial ↑')}
 if(accelDown){put+=7;putReasons.push('aceleração inicial ↓')}
 if(reversalCallCandidate){call+=14;callReasons.push('possível reversão ↑')}
 if(reversalPutCandidate){put+=14;putReasons.push('possível reversão ↓')}

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

 // Penalidades de reversão e, principalmente, de perseguição do movimento já esticado.
 const callReversalRisk=!reversalCallCandidate&&((resistanceReversalZone&&(microRsi!=null&&microRsi>=68))||flowSell>=2||rejectionDown);
 const putReversalRisk=!reversalPutCandidate&&((supportReversalZone&&(microRsi!=null&&microRsi<=32))||flowBuy>=2||rejectionUp);
 const callOverextended=!reversalCallCandidate&&((micro.p5>=1.8&&micro.p15>=1.8)||micro.p15>=2.6||(microRsi!=null&&microRsi>=74&&micro.p5>.75)||(resistanceReversalZone&&micro.delta5>0));
 const putOverextended=!reversalPutCandidate&&((micro.p5<=-1.8&&micro.p15<=-1.8)||micro.p15<=-2.6||(microRsi!=null&&microRsi<=26&&micro.p5<-.75)||(supportReversalZone&&micro.delta5<0));
 if(callReversalRisk)call-=24;
 if(putReversalRisk)put-=24;
 if(callOverextended)call-=18;
 if(putOverextended)put-=18;
 if(micro.delta5<0)call-=10;if(micro.delta5>0)put-=10;
 if(flowBuy===3)put-=8;if(flowSell===3)call-=8;

 call=clamp(Math.round(call),0,100);put=clamp(Math.round(put),0,100);
 const edge=call-put,threshold=Math.max(60,Number(minConfidence||74));
 const flowReadyCall=(micro.delta5>0&&micro.delta15>=-tol*.10&&micro.delta30>=-tol*.35)||reversalCallCandidate;
 const flowReadyPut=(micro.delta5<0&&micro.delta15<=tol*.10&&micro.delta30<=tol*.35)||reversalPutCandidate;
 const structureReadyCall=((fast!=null&&slow!=null&&fast>=slow*.99998)&&(structure.bias!=='bearish'))||reversalCallCandidate;
 const structureReadyPut=((fast!=null&&slow!=null&&fast<=slow*1.00002)&&(structure.bias!=='bullish'))||reversalPutCandidate;
 const callRoomOk=breakUp||reversalCallCandidate||callRoom==null||callRoom>minRoom;
 const putRoomOk=breakDown||reversalPutCandidate||putRoom==null||putRoom>minRoom;
 const callSetup=reversalCallCandidate||(retest?.side==='BUY')||(nearSupport&&rejectionUp)||(accelUp&&structureReadyCall&&!nearResistance)||(breakUp&&micro.p5>0&&micro.p5<1.55);
 const putSetup=reversalPutCandidate||(retest?.side==='SELL')||(nearResistance&&rejectionDown)||(accelDown&&structureReadyPut&&!nearSupport)||(breakDown&&micro.p5<0&&micro.p5>-1.55);
 const callContinuation=flowReadyCall&&structureReadyCall&&callRoomOk&&micro.p5<1.55&&micro.p15<2.15;
 const putContinuation=flowReadyPut&&structureReadyPut&&putRoomOk&&micro.p5>-1.55&&micro.p15>-2.15;
 const callReversalTrigger=reversalCallCandidate&&micro.delta5>0;
 const putReversalTrigger=reversalPutCandidate&&micro.delta5<0;
 const readyCall=call>=threshold&&edge>=15&&callRoomOk&&((callReversalTrigger)||(!reversalCallCandidate&&flowReadyCall&&structureReadyCall&&(callSetup||callContinuation)))&&!callReversalRisk&&!callOverextended;
 const readyPut=put>=threshold&&edge<=-15&&putRoomOk&&((putReversalTrigger)||(!reversalPutCandidate&&flowReadyPut&&structureReadyPut&&(putSetup||putContinuation)))&&!putReversalRisk&&!putOverextended;
 return{
   ready:true,bars:bars.length,callScore:call,putScore:put,edge,readyCall,readyPut,
   flowReadyCall,flowReadyPut,structureReadyCall,structureReadyPut,callReversalRisk,putReversalRisk,
   callOverextended,putOverextended,callSetup,putSetup,callRoom,putRoom,callRoomOk,putRoomOk,accelUp,accelDown,reversalCallScore,reversalPutScore,reversalCallCandidate,reversalPutCandidate,turnUp,turnDown,weakeningUp,weakeningDown,failedBreakUp,failedBreakDown,
   fast,slow,rsi:microRsi,momentum:microMom,macd:microMacd,structure,sr,trendlines:lines,
   patterns:patterns.map(p=>p.name),retest,range,callReasons:callReasons.slice(0,9),putReasons:putReasons.slice(0,9)
 }
}

export function analyzeMarket({candles,quoteHistory=[],strategy='smart_confluence',minConfidence=74,durationMs=60000,freshnessMs=5000,quoteTs=Date.now(),now=Date.now(),preparedMetrics=null}){
 if(!Array.isArray(candles)||candles.length<35)return{side:SignalSide.WAIT,confidence:0,reasons:['dados insuficientes: mínimo 35 candles'],metrics:{sourceCandles:candles?.length||0}};
 const quoteAgeMs=Math.max(0,now-Number(quoteTs||0)),feedFresh=quoteAgeMs<=freshnessMs;

 const closes=candles.map(c=>Number(c.close)),prior=candles.slice(0,-1),candleLast=closes.at(-1),vol=atr(candles,14)||Math.abs(candleLast)*.001;
 const baseSeconds=preparedMetrics?.baseCandleSeconds||candleSeconds(candles),micro=preparedMetrics?.micro||liveMicro(quoteHistory,candleLast,vol,baseSeconds,now),last=Number(micro.last||candleLast);
 const higher=aggregateCandles(candles,5),higherCloses=higher.map(c=>Number(c.close));
 const m=preparedMetrics?{...preparedMetrics}:{
   fast:ema(closes,9),slow:ema(closes,21),ema50:ema(closes,50),ema200:ema(closes,200),rsi:rsi(closes,14),atr:vol,bb:bollinger(closes,20,2),momentum:momentum(closes,10),
   sr:supportResistance(prior,50),last,macd:macd(closes),stoch:stochastic(candles,14),structure:marketStructure(candles),trendlines:trendLines(candles),fib:fibonacci(candles,80),patterns:candlePatterns(candles),retest:breakoutRetest(candles,35),
   higherTF:{fast:ema(higherCloses,9),slow:ema(higherCloses,21),structure:marketStructure(higher),candles:higher.length},sourceCandles:candles.length,baseCandleSeconds:baseSeconds,micro
 };
 const trendUp=m.fast!=null&&m.slow!=null&&m.fast>m.slow,trendDn=m.fast!=null&&m.slow!=null&&m.fast<m.slow;
 const higherUp=m.higherTF.fast!=null&&m.higherTF.slow!=null&&m.higherTF.fast>m.higherTF.slow,higherDn=m.higherTF.fast!=null&&m.higherTF.slow!=null&&m.higherTF.fast<m.higherTF.slow;
 const lastCandle=candles.at(-1)||{},prevCandle=candles.at(-2)||{};
 const candleRange=Math.max(1e-12,Number(lastCandle.high)-Number(lastCandle.low));
 const candleBody=Number(lastCandle.close)-Number(lastCandle.open),bodyAbs=Math.abs(candleBody),bodyRatio=bodyAbs/candleRange;
 const upperWick=Number(lastCandle.high)-Math.max(Number(lastCandle.open),Number(lastCandle.close));
 const lowerWick=Math.min(Number(lastCandle.open),Number(lastCandle.close))-Number(lastCandle.low);
 const bullishBody=candleBody>0,bearishBody=candleBody<0;
 const bullishReject=bullishBody&&lowerWick>Math.max(bodyAbs*.65,candleRange*.18);
 const bearishReject=bearishBody&&upperWick>Math.max(bodyAbs*.65,candleRange*.18);
 const srNearSupport=near(last,m.sr?.support,vol*.48),srNearResistance=near(last,m.sr?.resistance,vol*.48);
 const failedSupport=Number.isFinite(Number(m.sr?.support))&&Number(lastCandle.low)<Number(m.sr.support)-vol*.05&&Number(lastCandle.close)>=Number(m.sr.support);
 const failedResistance=Number.isFinite(Number(m.sr?.resistance))&&Number(lastCandle.high)>Number(m.sr.resistance)+vol*.05&&Number(lastCandle.close)<=Number(m.sr.resistance);
 const lineResistance=Number(m.trendlines?.resistance?.value),lineSupport=Number(m.trendlines?.support?.value);
 const lineBreakUp=Number.isFinite(lineResistance)&&last>lineResistance+vol*.08;
 const lineBreakDown=Number.isFinite(lineSupport)&&last<lineSupport-vol*.08;
 const srBreakUp=Number.isFinite(Number(m.sr?.resistance))&&last>Number(m.sr.resistance)+vol*.08;
 const srBreakDown=Number.isFinite(Number(m.sr?.support))&&last<Number(m.sr.support)-vol*.08;
 const strongBull=bullishBody&&bodyRatio>=.56,strongBear=bearishBody&&bodyRatio>=.56;
 const mk=()=>({buy:0,sell:0,reasons:[]});
 const add=(b,side,points,reason)=>addScore(b,side,points,reason);
 const patternScore=(b,limit=2,points=16)=>{for(const p of (m.patterns||[]).slice(0,limit)){if(p.side==='BUY')add(b,'BUY',points,p.label);if(p.side==='SELL')add(b,'SELL',points,p.label)}};

 const scoreTrend=()=>{
   const b=mk();
   if(trendUp)add(b,'BUY',24,'EMA 9 acima da EMA 21');if(trendDn)add(b,'SELL',24,'EMA 9 abaixo da EMA 21');
   if(m.ema50!=null){if(last>m.ema50)add(b,'BUY',10,'preço acima da EMA 50');else add(b,'SELL',10,'preço abaixo da EMA 50')}
   if(m.macd?.histogram>0)add(b,'BUY',16,'MACD confirma tendência');if(m.macd?.histogram<0)add(b,'SELL',16,'MACD confirma tendência');
   if(m.momentum>0)add(b,'BUY',10,'momentum acompanha alta');if(m.momentum<0)add(b,'SELL',10,'momentum acompanha baixa');
   if(m.structure.bias==='bullish')add(b,'BUY',20,'estrutura HH + HL');if(m.structure.bias==='bearish')add(b,'SELL',20,'estrutura LH + LL');
   if(higherUp)add(b,'BUY',20,'timeframe superior alta');if(higherDn)add(b,'SELL',20,'timeframe superior baixa');
   return b
 };
 const scorePriceAction=()=>{
   const b=mk();
   if(m.structure.bias==='bullish')add(b,'BUY',24,'estrutura de preço HH + HL');if(m.structure.bias==='bearish')add(b,'SELL',24,'estrutura de preço LH + LL');
   if(strongBull)add(b,'BUY',14,'candle de força compradora');if(strongBear)add(b,'SELL',14,'candle de força vendedora');
   patternScore(b,2,18);
   if(srNearSupport&&bullishReject)add(b,'BUY',26,'rejeição de suporte');if(srNearResistance&&bearishReject)add(b,'SELL',26,'rejeição de resistência');
   if(failedSupport)add(b,'BUY',24,'falso rompimento do suporte');if(failedResistance)add(b,'SELL',24,'falso rompimento da resistência');
   if(m.retest?.side==='BUY')add(b,'BUY',18,'reteste confirmado para cima');if(m.retest?.side==='SELL')add(b,'SELL',18,'reteste confirmado para baixo');
   return b
 };
 const scoreTrendlineBreakout=()=>{
   const b=mk();
   if(lineBreakUp)add(b,'BUY',40,'rompimento da linha superior');if(lineBreakDown)add(b,'SELL',40,'rompimento da linha inferior');
   if(m.retest?.side==='BUY')add(b,'BUY',30,'rompimento + reteste');if(m.retest?.side==='SELL')add(b,'SELL',30,'rompimento + reteste');
   if(Number.isFinite(lineResistance)&&near(last,lineResistance,vol*.35)&&strongBull)add(b,'BUY',14,'pressão na linha de resistência');
   if(Number.isFinite(lineSupport)&&near(last,lineSupport,vol*.35)&&strongBear)add(b,'SELL',14,'pressão na linha de suporte');
   if(lineBreakUp&&m.momentum>0)add(b,'BUY',12,'momentum confirma rompimento');if(lineBreakDown&&m.momentum<0)add(b,'SELL',12,'momentum confirma rompimento');
   if(lineBreakUp&&m.structure.bias!=='bearish')add(b,'BUY',10,'estrutura confirma rompimento');if(lineBreakDown&&m.structure.bias!=='bullish')add(b,'SELL',10,'estrutura confirma rompimento');
   return b
 };
 const scoreSupportResistance=()=>{
   const b=mk();
   if(srNearSupport)add(b,'BUY',34,'preço em suporte');if(srNearResistance)add(b,'SELL',34,'preço em resistência');
   if(srNearSupport&&bullishReject)add(b,'BUY',30,'rejeição compradora no suporte');if(srNearResistance&&bearishReject)add(b,'SELL',30,'rejeição vendedora na resistência');
   if(failedSupport)add(b,'BUY',28,'falso rompimento do suporte');if(failedResistance)add(b,'SELL',28,'falso rompimento da resistência');
   if(srNearSupport&&m.rsi!=null&&m.rsi<=42)add(b,'BUY',14,'RSI favorece reação no suporte');
   if(srNearResistance&&m.rsi!=null&&m.rsi>=58)add(b,'SELL',14,'RSI favorece reação na resistência');
   if(srNearSupport&&(m.patterns||[]).some(p=>p.side==='BUY'))add(b,'BUY',16,'padrão comprador no suporte');
   if(srNearResistance&&(m.patterns||[]).some(p=>p.side==='SELL'))add(b,'SELL',16,'padrão vendedor na resistência');
   return b
 };
 const scoreFibonacci=()=>{
   const b=mk(),fib=m.fib?.nearest;
   if(!fib||!Number.isFinite(Number(fib.distance))||Number(fib.distance)>vol*.90)return b;
   if(m.fib.direction==='up'){
     add(b,'BUY',42,'reteste em nível de Fibonacci');
     if(trendUp)add(b,'BUY',20,'Fibonacci alinhado à tendência');
     if(bullishReject||strongBull)add(b,'BUY',18,'reação compradora no nível');
     if(m.momentum>0)add(b,'BUY',10,'momentum confirma reação')
   }else if(m.fib.direction==='down'){
     add(b,'SELL',42,'reteste em nível de Fibonacci');
     if(trendDn)add(b,'SELL',20,'Fibonacci alinhado à tendência');
     if(bearishReject||strongBear)add(b,'SELL',18,'reação vendedora no nível');
     if(m.momentum<0)add(b,'SELL',10,'momentum confirma reação')
   }
   return b
 };
 const scoreMeanReversion=()=>{
   const b=mk();
   if(m.bb&&last<=m.bb.lower)add(b,'BUY',30,'preço na banda inferior');if(m.bb&&last>=m.bb.upper)add(b,'SELL',30,'preço na banda superior');
   if(m.rsi!=null&&m.rsi<32)add(b,'BUY',26,'RSI sobrevendido');if(m.rsi!=null&&m.rsi>68)add(b,'SELL',26,'RSI sobrecomprado');
   if(m.stoch!=null&&m.stoch<22)add(b,'BUY',18,'estocástico em sobrevenda');if(m.stoch!=null&&m.stoch>78)add(b,'SELL',18,'estocástico em sobrecompra');
   if(m.slow!=null&&last<m.slow-vol*.55)add(b,'BUY',14,'preço afastado abaixo da média');if(m.slow!=null&&last>m.slow+vol*.55)add(b,'SELL',14,'preço afastado acima da média');
   if(srNearSupport)add(b,'BUY',12,'suporte favorece retorno à média');if(srNearResistance)add(b,'SELL',12,'resistência favorece retorno à média');
   return b
 };
 const scoreBreakout=()=>{
   const b=mk();
   if(srBreakUp)add(b,'BUY',38,'rompimento de resistência');if(srBreakDown)add(b,'SELL',38,'rompimento de suporte');
   if(m.retest?.side==='BUY')add(b,'BUY',28,'reteste após rompimento');if(m.retest?.side==='SELL')add(b,'SELL',28,'reteste após rompimento');
   if(srBreakUp&&strongBull)add(b,'BUY',14,'candle confirma rompimento');if(srBreakDown&&strongBear)add(b,'SELL',14,'candle confirma rompimento');
   if(srBreakUp&&m.momentum>0)add(b,'BUY',12,'momentum confirma rompimento');if(srBreakDown&&m.momentum<0)add(b,'SELL',12,'momentum confirma rompimento');
   if(lineBreakUp)add(b,'BUY',10,'linha de tendência rompida');if(lineBreakDown)add(b,'SELL',10,'linha de tendência rompida');
   return b
 };
 const scorers={trend:scoreTrend,price_action:scorePriceAction,trendline_breakout:scoreTrendlineBreakout,support_resistance:scoreSupportResistance,fibonacci_retest:scoreFibonacci,mean_reversion:scoreMeanReversion,breakout:scoreBreakout};
 const scoreSmart=()=>{
   const b=mk();
   for(const name of ['trend','price_action','trendline_breakout','support_resistance','fibonacci_retest','mean_reversion','breakout']){
     const x=scorers[name](),total=x.buy+x.sell;if(total<10)continue;
     const norm=Math.max(1,total),edge=(x.buy-x.sell)/norm,weight=Math.min(18,6+total*.12);
     if(edge>0)add(b,'BUY',Math.round(weight*Math.abs(edge)),`${name}: viés comprador`);
     if(edge<0)add(b,'SELL',Math.round(weight*Math.abs(edge)),`${name}: viés vendedor`)
   }
   return b
 };
 const box=strategy==='smart_confluence'?scoreSmart():(scorers[strategy]?.()||scoreSmart());

 const horizon=Math.max(30000,Number(durationMs||60000));
 const short=preparedMetrics?.shortModel||shortHorizonModel({
   quoteHistory,micro,last,vol,minConfidence,now,
   context:{trendUp,trendDn,structure:m.structure.bias,higherUp,higherDn,aboveEma50:m.ema50!=null&&last>m.ema50,belowEma50:m.ema50!=null&&last<m.ema50}
 });
 m.shortModel=short;

 const rawBuy=box.buy,rawSell=box.sell;
 let buyEffective,sellEffective,side=SignalSide.WAIT;

 if(horizon<=60000){
   // 30s/1m: a estratégia escolhida define o viés; a microestrutura só confirma o timing.
   // Isso evita transformar qualquer estratégia em "subiu = CALL / caiu = PUT".
   const strategyBuy=clamp(Math.round(rawBuy),0,100),strategySell=clamp(Math.round(rawSell),0,100);
   const microBuy=short.ready?Number(short.callScore||0):0,microSell=short.ready?Number(short.putScore||0):0;
   const strategyEdge=strategyBuy-strategySell,microEdge=microBuy-microSell;
   buyEffective=short.ready?clamp(Math.round(strategyBuy*.65+microBuy*.35),0,100):strategyBuy;
   sellEffective=short.ready?clamp(Math.round(strategySell*.65+microSell*.35),0,100):strategySell;
   const blendedEdge=buyEffective-sellEffective,blendedStrength=Math.max(buyEffective,sellEffective);
   const callAligned=strategyEdge>=8&&microEdge>=0&&!short.callReversalRisk&&!short.callOverextended;
   const putAligned=strategyEdge<=-8&&microEdge<=0&&!short.putReversalRisk&&!short.putOverextended;
   if(short.ready&&blendedStrength>=Number(minConfidence||74)&&blendedEdge>=12&&callAligned&&(short.flowReadyCall||short.callSetup||short.readyCall))side=SignalSide.BUY;
   if(short.ready&&blendedStrength>=Number(minConfidence||74)&&blendedEdge<=-12&&putAligned&&(short.flowReadyPut||short.putSetup||short.readyPut))side=SignalSide.SELL;
   if(!short.ready)box.reasons.push('aguardando microestrutura de 5s para confirmar o timing');
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
 const projectedBuy=short.ready?clamp(Math.round(clamp(rawBuy,0,100)*.65+Number(short.callScore||0)*.35),0,100):0;
 const projectedSell=short.ready?clamp(Math.round(clamp(rawSell,0,100)*.65+Number(short.putScore||0)*.35),0,100):0;
 let forecastSide=SignalSide.WAIT;
 if(micro.ready&&Math.max(projectedBuy,projectedSell)>=previewThreshold&&Math.abs(projectedBuy-projectedSell)>=12){
   if(projectedBuy>projectedSell&&!short.callReversalRisk)forecastSide=SignalSide.BUY;
   if(projectedSell>projectedBuy&&!short.putReversalRisk)forecastSide=SignalSide.SELL
 }
 const forecastConfidence=Math.max(projectedBuy,projectedSell);
 const callGap=Math.max(0,Math.round(Number(minConfidence||74)-projectedBuy)),putGap=Math.max(0,Math.round(Number(minConfidence||74)-projectedSell));

 const contextBuy=clamp(Math.round(rawBuy),0,100),contextSell=clamp(Math.round(rawSell),0,100);
 const finalCall=horizon<=60000?clamp(Math.round(contextBuy*.62+buyEffective*.38),0,100):clamp(Math.round(buyEffective*.62+projectedBuy*.38),0,100);
 const finalPut=horizon<=60000?clamp(Math.round(contextSell*.62+sellEffective*.38),0,100):clamp(Math.round(sellEffective*.62+projectedSell*.38),0,100);
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
   const barsBack=Math.max(2,Math.ceil(seconds/baseSeconds));
   const enoughHistory=closes.length>=barsBack*2+1;
   const recent=seconds<=60?micro[seconds===30?'delta30':'delta60']:enoughHistory?last-closes.at(-1-barsBack):0;
   const previous=enoughHistory?closes.at(-1-barsBack)-closes.at(-1-barsBack*2):0;
   const enoughFlow=seconds>60||micro.ready&&(seconds===30?micro.spanMs>=30000:micro.spanMs>=60000);
   const material=Math.max(safeVol*.12*scale,Math.abs(last)*.000005);
   const up=recent>material,down=recent< -material;
   const aligned=seconds<=60?(up&&micro.pulse>=4||down&&micro.pulse<=-4):(up&&previous>0||down&&previous<0);
   const contextUp=seconds<=60?!short.callReversalRisk:trendUp||higherUp;
   const contextDown=seconds<=60?!short.putReversalRisk:trendDn||higherDn;
   const outlookReady=enoughHistory&&enoughFlow&&(seconds>60||short.ready);
   const bias=outlookReady&&aligned&&up&&contextUp?'CALL':outlookReady&&aligned&&down&&contextDown?'PUT':'NEUTRO';
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
   return[String(seconds),{horizonSeconds:seconds,currentPrice:last,expectedMove,expectedLow:last-expectedMove,expectedHigh:last+expectedMove,callTrigger,putTrigger,callInvalidation,putInvalidation,callRule,putRule,bias,outlookReady,observedMove:recent,windowSeconds:barsBack*baseSeconds,basis:reversalMode?'reação em suporte/resistência':'rompimento + confirmação',automaticExecution:false}]
 }));

 if(side===SignalSide.WAIT)box.reasons.push(`entrada aguardando: CALL ${buyEffective}% · PUT ${sellEffective}% · filtro ${Number(minConfidence||74)}%`);
 if(horizon<=60000&&short.ready){
   if(short.callReversalRisk)box.reasons.push('CALL bloqueado por risco de reversão');
   if(short.putReversalRisk)box.reasons.push('PUT bloqueado por risco de reversão');
   box.reasons.push(...(edge>=0?short.callReasons:short.putReasons))
 }

 return{
   side:feedFresh?side:SignalSide.WAIT,confidence,feedFresh,quoteAgeMs,reasons:[...(!feedFresh?['Cotação atrasada; análise técnica preservada, entrada bloqueada.']:[]),...box.reasons].slice(0,14),
   forecast30:{side:forecastSide,confidence:forecastConfidence,horizonSeconds:30,basis:'cenário técnico condicional; força técnica em %, não probabilidade',callStrength:projectedBuy,putStrength:projectedSell,trigger:Number(minConfidence||74),callGap,putGap,microPulse:micro.pulse,microReady:micro.ready},
   finalConfluence:{side:finalSide,strength:finalStrength,callStrength:finalCall,putStrength:finalPut,minConfidence:Number(minConfidence||74),aligned:Math.abs(finalEdge)>=12,disagreement:(buyEffective-sellEffective)*(projectedBuy-projectedSell)<0,basis:horizon<=60000?'contexto técnico 60s/5m + microestrutura curta':'contexto técnico + microfluxo'},
   entryPlanner:{defaultHorizonSeconds:30,horizons:planner},
   metrics:{...m,rawBuyScore:rawBuy,rawSellScore:rawSell,buyScore:buyEffective,sellScore:sellEffective,buyEffective,sellEffective,projectedBuy,projectedSell,edge,microPulse:micro.pulse,strategy}
 }
}


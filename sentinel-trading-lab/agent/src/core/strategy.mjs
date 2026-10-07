import {ema,rsi,atr,bollinger,momentum,supportResistance,macd,stochastic,marketStructure,trendLines,fibonacci,candlePatterns,breakoutRetest,aggregateCandles,supportResistanceZones,trendLineQuality,swingFibonacci,volatilityState} from './indicators.mjs';
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
 const d2=current-atAgo(2000),d5=current-atAgo(5000),d15=current-atAgo(15000),d30=current-atAgo(30000),d60=current-atAgo(60000);
 const span=points.length>1?points.at(-1).ts-points[0].ts:0;
 const ready=points.length>=10&&span>=12000;
 const safeBase=Math.max(5,Number(baseSeconds||60));
 const expected=(secs)=>Math.max(Math.abs(current)*.000005,Math.abs(vol||0)*Math.sqrt(Math.max(1,secs)/safeBase));
 const expected2=expected(2),expected5=expected(5),expected15=expected(15),expected30=expected(30);
 const p2=d2/expected2,p5=d5/expected5,p15=d15/expected15,p30=d30/expected30;
 const fastRate=d2/2,prior3Rate=(d5-d2)/3,leadScale=Math.max(expected5/5*.75,Math.abs(current)*.00000035);
 const lead=ready?clamp((fastRate-prior3Rate)/leadScale,-1,1):0;
 const pulse=ready?clamp(Math.round(p5*4.3+p15*3.0+p30*1.7+lead*2.4),-24,24):0;
 const trend=pulse>=4?'UP':pulse<=-4?'DOWN':'FLAT';
 return{ready,points:points.length,spanMs:span,last:current,delta2:d2,delta5:d5,delta15:d15,delta30:d30,delta60:d60,p2,p5,p15,p30,expected2,expected5,expected15,expected30,lead,fastRate,prior3Rate,pulse,trend}
}
function quoteBars(quoteHistory=[],bucketMs=5000,now=Date.now(),maxAgeMs=5*60*1000){
 const pts=(Array.isArray(quoteHistory)?quoteHistory:[])
   .map(x=>({ts:Number(x?.ts),price:Number(x?.price)}))
   .filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.price)&&x.price>0&&now-x.ts<=Math.max(bucketMs*2,Number(maxAgeMs||5*60*1000)))
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
 return out.slice(-240)
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

export function analyzeMarket({candles,quoteHistory=[],strategy='smart_confluence',minConfidence=74,durationMs=60000,forecastHorizonSeconds=null,freshnessMs=5000,quoteTs=Date.now(),now=Date.now()}){
 if(!Array.isArray(candles)||candles.length<35)return{side:SignalSide.WAIT,confidence:0,reasons:['dados insuficientes: mínimo 35 candles'],metrics:{sourceCandles:candles?.length||0}};
 if(now-quoteTs>freshnessMs)return{side:SignalSide.WAIT,confidence:0,reasons:['feed atrasado'],metrics:{sourceCandles:candles.length}};

 const closes=candles.map(c=>Number(c.close)),prior=candles.slice(0,-1),candleLast=closes.at(-1),vol=atr(candles,14)||Math.abs(candleLast)*.001;
 const baseSeconds=candleSeconds(candles),micro=liveMicro(quoteHistory,candleLast,vol,baseSeconds,now),last=Number(micro.last||candleLast);
 const mergeTf=(a=[],b=[])=>{
   const map=new Map();
   for(const row of [...a,...b]){
     if(!row||![row.open,row.high,row.low,row.close].every(v=>Number.isFinite(Number(v))))continue;
     const key=String(Number(row.from??row.ts??row.to??map.size));
     map.set(key,{...row,open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close)})
   }
   return [...map.values()].sort((x,y)=>Number(x.from||x.ts||0)-Number(y.from||y.ts||0)).slice(-240)
 };
 const tfRows=(seconds)=>{
   const factor=baseSeconds<=seconds&&seconds%baseSeconds===0?Math.max(1,Math.round(seconds/baseSeconds)):0;
   const historical=factor===1?[...candles]:factor>1?aggregateCandles(candles,factor):[];
   const live=quoteBars(quoteHistory,seconds*1000,now,35*60*1000);
   return mergeTf(historical,live)
 };
 const summarizeTf=(rows,seconds)=>{
   if(!Array.isArray(rows)||rows.length<5)return{seconds,candles:rows?.length||0,ready:false,signal:0,direction:'NEUTRO'};
   const xs=rows.map(c=>Number(c.close)).filter(Number.isFinite);
   const fast=ema(xs,Math.min(9,Math.max(3,Math.floor(xs.length/2)))),slow=ema(xs,Math.min(21,Math.max(5,xs.length-1)));
   const structure=marketStructure(rows),tfRsi=rsi(xs,Math.min(14,Math.max(5,xs.length-1)));
   let signal=0;
   if(fast!=null&&slow!=null)signal+=fast>slow?.34:fast<slow?-.34:0;
   signal+=structure?.bias==='bullish'?.34:structure?.bias==='bearish'?-.34:0;
   if(tfRsi!=null)signal+=tfRsi>=56?.16:tfRsi<=44?-.16:0;
   const tail=rows.slice(-Math.min(6,rows.length)),delta=tail.length>=2?Number(tail.at(-1).close)-Number(tail[0].close):0;
   if(delta>0)signal+=.16;else if(delta<0)signal-=.16;
   signal=clamp(signal,-1,1);
   return{seconds,candles:rows.length,ready:rows.length>=5,signal,direction:signal>=.10?'CALL':signal<=-.10?'PUT':'NEUTRO',fast,slow,rsi:tfRsi,structure:structure?.bias||'neutral'}
 };
 const multiTF=Object.fromEntries([60,120,300,600,900].map(seconds=>[String(seconds),summarizeTf(tfRows(seconds),seconds)]));
 const higherRows=tfRows(300),higher=higherRows.length>=5?higherRows:aggregateCandles(candles,5),higherCloses=higher.map(c=>Number(c.close));
 const m={
   fast:ema(closes,9),slow:ema(closes,21),ema50:ema(closes,50),ema200:ema(closes,200),rsi:rsi(closes,14),atr:vol,bb:bollinger(closes,20,2),momentum:momentum(closes,10),
   sr:supportResistance(prior,50),srZones:supportResistanceZones(prior,90),last,macd:macd(closes),stoch:stochastic(candles,14),structure:marketStructure(candles),
   trendlines:trendLines(candles),lineQuality:trendLineQuality(prior),fib:fibonacci(candles,80),swingFib:swingFibonacci(prior,120),volatility:volatilityState(candles),
   patterns:candlePatterns(candles),retest:breakoutRetest(candles,35),
   higherTF:{fast:ema(higherCloses,9),slow:ema(higherCloses,21),structure:marketStructure(higher),candles:higher.length},multiTF,sourceCandles:candles.length,baseCandleSeconds:baseSeconds,micro
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
 const zoneSupport=Number(m.srZones?.support?.price??m.sr?.support),zoneResistance=Number(m.srZones?.resistance?.price??m.sr?.resistance);
 const zoneTolerance=Math.max(Number(m.srZones?.tolerance||0),vol*.34),supportStrength=Number(m.srZones?.support?.strength||25),resistanceStrength=Number(m.srZones?.resistance?.strength||25);
 const srNearSupport=Number.isFinite(zoneSupport)&&near(last,zoneSupport,zoneTolerance),srNearResistance=Number.isFinite(zoneResistance)&&near(last,zoneResistance,zoneTolerance);
 const failedSupport=Number.isFinite(zoneSupport)&&Number(lastCandle.low)<zoneSupport-vol*.05&&Number(lastCandle.close)>=zoneSupport;
 const failedResistance=Number.isFinite(zoneResistance)&&Number(lastCandle.high)>zoneResistance+vol*.05&&Number(lastCandle.close)<=zoneResistance;
 const qualityResistance=m.lineQuality?.resistance?.quality>=45?m.lineQuality.resistance:null,qualitySupport=m.lineQuality?.support?.quality>=45?m.lineQuality.support:null;
 const lineResistance=Number(qualityResistance?.value??m.trendlines?.resistance?.value),lineSupport=Number(qualitySupport?.value??m.trendlines?.support?.value);
 const lineQualityUp=Number(qualityResistance?.quality||0),lineQualityDown=Number(qualitySupport?.quality||0);
 const lineBreakUp=Number.isFinite(lineResistance)&&last>lineResistance+vol*.08;
 const lineBreakDown=Number.isFinite(lineSupport)&&last<lineSupport-vol*.08;
 const srBreakUp=Number.isFinite(zoneResistance)&&last>zoneResistance+vol*.08;
 const srBreakDown=Number.isFinite(zoneSupport)&&last<zoneSupport-vol*.08;
 const strongBull=bullishBody&&bodyRatio>=.56,strongBear=bearishBody&&bodyRatio>=.56;
 const volRatio=Number(m.volatility?.ratio||1),volExpanding=m.volatility?.expanding===true;
 const emaSeparation=m.fast!=null&&m.slow!=null?Math.abs(Number(m.fast)-Number(m.slow))/Math.max(vol,1e-12):0;
 const trendAgreement=[trendUp?1:trendDn?-1:0,m.structure.bias==='bullish'?1:m.structure.bias==='bearish'?-1:0,higherUp?1:higherDn?-1:0].filter(x=>x!==0);
 const trendDirection=trendAgreement.length?Math.sign(trendAgreement.reduce((a,b)=>a+b,0)):0;
 const trendAgreementPct=trendAgreement.length?Math.abs(trendAgreement.reduce((a,b)=>a+b,0))/trendAgreement.length:0;
 const trendRegimeScore=clamp(Math.round(emaSeparation*34+trendAgreementPct*48+(volRatio>=.9&&volRatio<=1.7?8:0)),0,100);
 const rangeRegimeScore=clamp(Math.round((1-Math.min(1,emaSeparation))*42+(m.structure.bias==='range'?34:0)+(m.volatility?.contracting?18:6)),0,100);
 const breakoutRegimeScore=clamp(Math.round(((srBreakUp||srBreakDown||lineBreakUp||lineBreakDown)?46:0)+(volExpanding?30:0)+(bodyRatio>=.62?18:0)),0,100);
 const reversalRegimeScore=clamp(Math.round((srNearSupport||srNearResistance?24:0)+(failedSupport||failedResistance?30:0)+(m.rsi!=null&&(m.rsi<=32||m.rsi>=68)?18:0)+(upperWick>bodyAbs*.9||lowerWick>bodyAbs*.9?16:0)),0,100);
 const chaoticRegimeScore=clamp(Math.round((volRatio>=1.8?45:0)+(trendAgreementPct<.35?30:0)+(bodyRatio<.18&&volRatio>1.25?15:0)),0,100);
 const regimeScores={trend:trendRegimeScore,range:rangeRegimeScore,breakout:breakoutRegimeScore,reversal:reversalRegimeScore,chaotic:chaoticRegimeScore};
 const regimeLabel=Object.entries(regimeScores).sort((a,b)=>b[1]-a[1])[0]?.[0]||'range';
 const regimeConfidence=Number(regimeScores[regimeLabel]||0);
 m.regime={label:regimeLabel,confidence:regimeConfidence,scores:regimeScores,trendDirection,trendAgreementPct:Math.round(trendAgreementPct*100),volatilityRatio:volRatio};
 const mk=()=>({buy:0,sell:0,reasons:[]});
 const add=(b,side,points,reason)=>addScore(b,side,points,reason);
 const patternScore=(b,limit=2,points=16)=>{for(const p of (m.patterns||[]).slice(0,limit)){if(p.side==='BUY')add(b,'BUY',points,p.label);if(p.side==='SELL')add(b,'SELL',points,p.label)}};

 const recentDeltas=closes.slice(-9).map((v,i,a)=>i===0?0:Number(v)-Number(a[i-1])).slice(1);
 const upPersistence=recentDeltas.length?recentDeltas.filter(x=>x>0).length/recentDeltas.length:.5,downPersistence=recentDeltas.length?recentDeltas.filter(x=>x<0).length/recentDeltas.length:.5;
 const persistenceSignal=clamp(upPersistence-downPersistence,-1,1);
 const regimeAffinity={
   trend:{trend:1.22,price_action:1.0,trendline_breakout:1.05,support_resistance:.72,fibonacci_retest:.82,mean_reversion:.42,breakout:1.0},
   range:{trend:.48,price_action:1.0,trendline_breakout:.62,support_resistance:1.24,fibonacci_retest:1.02,mean_reversion:1.28,breakout:.62},
   breakout:{trend:.90,price_action:1.02,trendline_breakout:1.28,support_resistance:.72,fibonacci_retest:.68,mean_reversion:.30,breakout:1.35},
   reversal:{trend:.55,price_action:1.20,trendline_breakout:.72,support_resistance:1.25,fibonacci_retest:.90,mean_reversion:1.18,breakout:.55},
   chaotic:{trend:.55,price_action:.78,trendline_breakout:.70,support_resistance:.78,fibonacci_retest:.60,mean_reversion:.62,breakout:.72}
 };
 const regimeFactor=name=>Number(regimeAffinity[regimeLabel]?.[name]??1);
 const applyRegime=(box,name)=>{
   const factor=regimeFactor(name);
   box.buy=clamp(Math.round(box.buy*factor),0,100);box.sell=clamp(Math.round(box.sell*factor),0,100);
   box.regimeFactor=factor;box.regime=regimeLabel;return box
 };

 const scoreTrend=()=>{
   const b=mk();let buyTrend=0,sellTrend=0,buyMomentum=0,sellMomentum=0,buyStructure=0,sellStructure=0;
   if(trendUp)buyTrend+=16;if(trendDn)sellTrend+=16;
   if(m.ema50!=null){if(last>m.ema50)buyTrend+=8;else sellTrend+=8}
   if(m.macd?.histogram>0)buyMomentum+=10;else if(m.macd?.histogram<0)sellMomentum+=10;
   if(m.momentum>0)buyMomentum+=8;else if(m.momentum<0)sellMomentum+=8;
   if(m.structure.bias==='bullish')buyStructure+=18;else if(m.structure.bias==='bearish')sellStructure+=18;
   if(higherUp)buyStructure+=14;else if(higherDn)sellStructure+=14;
   if(persistenceSignal>.25)buyStructure+=8;if(persistenceSignal<-.25)sellStructure+=8;
   if(buyTrend)add(b,'BUY',Math.min(24,buyTrend),'tendência por médias');if(sellTrend)add(b,'SELL',Math.min(24,sellTrend),'tendência por médias');
   if(buyMomentum)add(b,'BUY',Math.min(18,buyMomentum),'momentum confirma alta');if(sellMomentum)add(b,'SELL',Math.min(18,sellMomentum),'momentum confirma baixa');
   if(buyStructure)add(b,'BUY',Math.min(30,buyStructure),'estrutura/persistência de alta');if(sellStructure)add(b,'SELL',Math.min(30,sellStructure),'estrutura/persistência de baixa');
   if(regimeLabel==='trend'&&trendDirection>0)add(b,'BUY',12,'regime de tendência comprador');if(regimeLabel==='trend'&&trendDirection<0)add(b,'SELL',12,'regime de tendência vendedor');
   return applyRegime(b,'trend')
 };
 const scorePriceAction=()=>{
   const b=mk(),zoneContext=srNearSupport||srNearResistance||failedSupport||failedResistance;
   if(m.structure.bias==='bullish')add(b,'BUY',20,'estrutura de preço HH + HL');if(m.structure.bias==='bearish')add(b,'SELL',20,'estrutura de preço LH + LL');
   if(strongBull)add(b,'BUY',zoneContext?18:10,'candle de força compradora');if(strongBear)add(b,'SELL',zoneContext?18:10,'candle de força vendedora');
   const pattPts=zoneContext?18:9;patternScore(b,2,pattPts);
   if(srNearSupport&&bullishReject)add(b,'BUY',28,'rejeição contextual de suporte');if(srNearResistance&&bearishReject)add(b,'SELL',28,'rejeição contextual de resistência');
   if(failedSupport)add(b,'BUY',26,'falso rompimento do suporte');if(failedResistance)add(b,'SELL',26,'falso rompimento da resistência');
   if(m.retest?.side==='BUY')add(b,'BUY',20,'reteste confirmado para cima');if(m.retest?.side==='SELL')add(b,'SELL',20,'reteste confirmado para baixo');
   return applyRegime(b,'price_action')
 };
 const scoreTrendlineBreakout=()=>{
   const b=mk(),upQuality=Math.max(lineQualityUp,Number(m.lineQuality?.resistance?.quality||0)),downQuality=Math.max(lineQualityDown,Number(m.lineQuality?.support?.quality||0));
   if(lineBreakUp&&upQuality>=45)add(b,'BUY',Math.round(26+upQuality*.18),'rompimento de linha validada');if(lineBreakDown&&downQuality>=45)add(b,'SELL',Math.round(26+downQuality*.18),'rompimento de linha validada');
   if(m.retest?.side==='BUY'&&lineBreakUp)add(b,'BUY',24,'rompimento + reteste');if(m.retest?.side==='SELL'&&lineBreakDown)add(b,'SELL',24,'rompimento + reteste');
   if(lineBreakUp&&volExpanding)add(b,'BUY',16,'volatilidade expande no rompimento');if(lineBreakDown&&volExpanding)add(b,'SELL',16,'volatilidade expande no rompimento');
   if(lineBreakUp&&m.momentum>0&&upPersistence>=.625)add(b,'BUY',14,'rompimento sustentado');if(lineBreakDown&&m.momentum<0&&downPersistence>=.625)add(b,'SELL',14,'rompimento sustentado');
   if((lineBreakUp&&upQuality<45)||(lineBreakDown&&downQuality<45))b.reasons.push('linha sem qualidade suficiente');
   return applyRegime(b,'trendline_breakout')
 };
 const scoreSupportResistance=()=>{
   const b=mk(),supportBase=Math.round(20+Math.min(18,supportStrength*.18)),resistanceBase=Math.round(20+Math.min(18,resistanceStrength*.18));
   if(srNearSupport)add(b,'BUY',supportBase,'zona de suporte validada');if(srNearResistance)add(b,'SELL',resistanceBase,'zona de resistência validada');
   if(srNearSupport&&bullishReject)add(b,'BUY',26,'rejeição compradora na zona');if(srNearResistance&&bearishReject)add(b,'SELL',26,'rejeição vendedora na zona');
   if(failedSupport)add(b,'BUY',30,'falso rompimento da zona de suporte');if(failedResistance)add(b,'SELL',30,'falso rompimento da zona de resistência');
   if(srNearSupport&&m.rsi!=null&&m.rsi<=42)add(b,'BUY',10,'RSI favorece reação');if(srNearResistance&&m.rsi!=null&&m.rsi>=58)add(b,'SELL',10,'RSI favorece reação');
   return applyRegime(b,'support_resistance')
 };
 const scoreFibonacci=()=>{
   const b=mk(),model=m.swingFib?.confirmed?m.swingFib:m.fib,fib=model?.nearest,quality=Number(model?.quality||25);
   if(!fib||!Number.isFinite(Number(fib.distance))||Number(fib.distance)>vol*.90||quality<45)return b;
   const base=Math.round(24+quality*.18);
   if(model.direction==='up'){
     add(b,'BUY',base,'reteste em Fibonacci de swing confirmado');
     if(trendUp&&higherUp)add(b,'BUY',18,'Fibonacci alinhado à tendência');
     if(bullishReject||strongBull)add(b,'BUY',16,'reação compradora no nível');
     if(m.momentum>0)add(b,'BUY',8,'momentum confirma reação')
   }else if(model.direction==='down'){
     add(b,'SELL',base,'reteste em Fibonacci de swing confirmado');
     if(trendDn&&higherDn)add(b,'SELL',18,'Fibonacci alinhado à tendência');
     if(bearishReject||strongBear)add(b,'SELL',16,'reação vendedora no nível');
     if(m.momentum<0)add(b,'SELL',8,'momentum confirma reação')
   }
   return applyRegime(b,'fibonacci_retest')
 };
 const scoreMeanReversion=()=>{
   const b=mk(),trendPenalty=regimeLabel==='trend'||regimeLabel==='breakout';
   if(m.bb&&last<=m.bb.lower)add(b,'BUY',trendPenalty?14:28,'preço na banda inferior');if(m.bb&&last>=m.bb.upper)add(b,'SELL',trendPenalty?14:28,'preço na banda superior');
   if(m.rsi!=null&&m.rsi<32)add(b,'BUY',trendPenalty?12:24,'RSI sobrevendido');if(m.rsi!=null&&m.rsi>68)add(b,'SELL',trendPenalty?12:24,'RSI sobrecomprado');
   if(m.stoch!=null&&m.stoch<22)add(b,'BUY',trendPenalty?8:16,'estocástico em sobrevenda');if(m.stoch!=null&&m.stoch>78)add(b,'SELL',trendPenalty?8:16,'estocástico em sobrecompra');
   if(m.slow!=null&&last<m.slow-vol*.55)add(b,'BUY',12,'preço afastado abaixo da média');if(m.slow!=null&&last>m.slow+vol*.55)add(b,'SELL',12,'preço afastado acima da média');
   if(srNearSupport&&bullishReject)add(b,'BUY',20,'zona confirma retorno à média');if(srNearResistance&&bearishReject)add(b,'SELL',20,'zona confirma retorno à média');
   if(trendPenalty)b.reasons.push('peso reduzido: mercado direcional');
   return applyRegime(b,'mean_reversion')
 };
 const scoreBreakout=()=>{
   const b=mk(),sustainUp=upPersistence>=.625&&m.momentum>0,sustainDown=downPersistence>=.625&&m.momentum<0;
   if(srBreakUp)add(b,'BUY',volExpanding?36:22,'rompimento de resistência');if(srBreakDown)add(b,'SELL',volExpanding?36:22,'rompimento de suporte');
   if(m.retest?.side==='BUY'&&srBreakUp)add(b,'BUY',24,'reteste após rompimento');if(m.retest?.side==='SELL'&&srBreakDown)add(b,'SELL',24,'reteste após rompimento');
   if(srBreakUp&&strongBull)add(b,'BUY',14,'candle confirma rompimento');if(srBreakDown&&strongBear)add(b,'SELL',14,'candle confirma rompimento');
   if(srBreakUp&&sustainUp)add(b,'BUY',18,'rompimento sustentado');if(srBreakDown&&sustainDown)add(b,'SELL',18,'rompimento sustentado');
   if((srBreakUp||lineBreakUp)&&volExpanding)add(b,'BUY',10,'expansão de volatilidade');if((srBreakDown||lineBreakDown)&&volExpanding)add(b,'SELL',10,'expansão de volatilidade');
   if((srBreakUp&&!volExpanding&&!sustainUp)||(srBreakDown&&!volExpanding&&!sustainDown))b.reasons.push('rompimento ainda sem expansão/sustentação');
   return applyRegime(b,'breakout')
 };
 const scorers={trend:scoreTrend,price_action:scorePriceAction,trendline_breakout:scoreTrendlineBreakout,support_resistance:scoreSupportResistance,fibonacci_retest:scoreFibonacci,mean_reversion:scoreMeanReversion,breakout:scoreBreakout};
 const scoreSmart=()=>{
   const b=mk();
   for(const name of ['trend','price_action','trendline_breakout','support_resistance','fibonacci_retest','mean_reversion','breakout']){
     const x=scorers[name](),total=x.buy+x.sell;if(total<8)continue;
     const normTotal=Math.max(1,total),edge=(x.buy-x.sell)/normTotal,baseWeight=Math.min(18,5+total*.11),weight=baseWeight*regimeFactor(name);
     if(edge>0)add(b,'BUY',Math.round(weight*Math.abs(edge)),`${name}: viés comprador · regime ${regimeLabel}`);
     if(edge<0)add(b,'SELL',Math.round(weight*Math.abs(edge)),`${name}: viés vendedor · regime ${regimeLabel}`)
   }
   return b
 };
 const box=strategy==='smart_confluence'?scoreSmart():(scorers[strategy]?.()||scoreSmart());
 box.regime=regimeLabel;box.regimeConfidence=regimeConfidence;
 const horizon=Math.max(30000,Number(durationMs||60000));
 const short=shortHorizonModel({
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

 // Os seis cards continuam descrevendo o estado atual. A previsão futura é calculada
 // separadamente por horizonte e nunca mais é uma cópia de buyEffective/sellEffective.
 const contextBuy=clamp(Math.round(rawBuy),0,100),contextSell=clamp(Math.round(rawSell),0,100);
 const finalCall=clamp(Math.round(contextBuy*.62+buyEffective*.38),0,100);
 const finalPut=clamp(Math.round(contextSell*.62+sellEffective*.38),0,100);
 const finalEdge=finalCall-finalPut,finalStrength=Math.max(finalCall,finalPut);
 const finalSide=finalStrength>=Number(minConfidence||74)&&Math.abs(finalEdge)>=12&&micro.ready?(finalEdge>0?'CALL':'PUT'):'AGUARDAR';

 const safeVol=Math.max(Math.abs(vol||0),Math.abs(last)*.00001);
 const plannerHorizons=[30,60,120,300,600,900,3600];
 const upperLevels=[zoneResistance,qualityResistance?.value,m.bb?.upper,short.sr?.resistance].map(Number).filter(v=>Number.isFinite(v)&&v>last).sort((a,b)=>a-b);
 const lowerLevels=[zoneSupport,qualitySupport?.value,m.bb?.lower,short.sr?.support].map(Number).filter(v=>Number.isFinite(v)&&v<last).sort((a,b)=>b-a);
 const nearestUpper=upperLevels[0]??null,nearestLower=lowerLevels[0]??null;
 const reversalMode=strategy==='mean_reversion'||strategy==='support_resistance'||regimeLabel==='reversal';
 const norm=(v,scale=1)=>Number.isFinite(Number(v))?clamp(Number(v)/Math.max(1e-12,Math.abs(scale)),-1,1):0;
 const emaSignal=trendUp?1:trendDn?-1:0;
 const structureSignal=m.structure?.bias==='bullish'?1:m.structure?.bias==='bearish'?-1:0;
 const higherSignal=higherUp?1:higherDn?-1:0;
 const ema50Signal=m.ema50!=null?(last>Number(m.ema50)?1:last<Number(m.ema50)?-1:0):0;
 const trendSignal=clamp(emaSignal*.24+structureSignal*.30+higherSignal*.30+ema50Signal*.16,-1,1);
 const rsiSignal=m.rsi!=null?norm(Number(m.rsi)-50,20):0;
 const macdSignal=m.macd?.histogram!=null?norm(Number(m.macd.histogram),safeVol*.12):0;
 const momentumSignalValue=m.momentum!=null?norm(Number(m.momentum),.18):0;
 const stochasticSignal=m.stoch!=null?norm(Number(m.stoch)-50,38):0;
 const momentumSignal=clamp(rsiSignal*.24+macdSignal*.34+momentumSignalValue*.28+stochasticSignal*.14,-1,1);
 const rawStrategySignal=norm(Number(rawBuy||0)-Number(rawSell||0),55);
 const patternBuy=(m.patterns||[]).filter(p=>p?.side==='BUY').length,patternSell=(m.patterns||[]).filter(p=>p?.side==='SELL').length;
 const setupSignal=clamp((m.retest?.side==='BUY'?0.65:m.retest?.side==='SELL'?-0.65:0)+clamp((patternBuy-patternSell)*.22,-.44,.44)+(srBreakUp||lineBreakUp?0.25:0)-(srBreakDown||lineBreakDown?0.25:0),-1,1);
 const reversalSignalBase=clamp((Number(short.reversalCallScore||0)-Number(short.reversalPutScore||0))/75,-1,1);
 const reversalSignal=clamp(reversalSignalBase+(short.turnUp?0.28:0)-(short.turnDown?0.28:0)+(short.failedBreakDown||failedSupport?0.24:0)-(short.failedBreakUp||failedResistance?0.24:0)+((short.putOverextended&&(short.turnUp||short.reversalCallCandidate))?0.16:0)-((short.callOverextended&&(short.turnDown||short.reversalPutCandidate))?0.16:0),-1,1);
 const reversalConfirmed=!!(short.reversalCallCandidate||short.reversalPutCandidate||short.turnUp||short.turnDown||short.failedBreakDown||short.failedBreakUp||failedSupport||failedResistance);
 const forecastReversalSignal=clamp(reversalSignal*(reversalConfirmed?1:.35),-1,1);
 const reversalCallVotes=[short.reversalCallCandidate===true,short.turnUp===true,short.failedBreakDown===true,failedSupport===true,srNearSupport&&supportStrength>=38,bullishReject===true,short.putOverextended===true,micro.ready&&Number(micro.p5)>0&&Number(micro.p15)<0].filter(Boolean).length;
 const reversalPutVotes=[short.reversalPutCandidate===true,short.turnDown===true,short.failedBreakUp===true,failedResistance===true,srNearResistance&&resistanceStrength>=38,bearishReject===true,short.callOverextended===true,micro.ready&&Number(micro.p5)<0&&Number(micro.p15)>0].filter(Boolean).length;
 const reversalAuthorityCall=micro.ready&&Number(short.reversalCallScore||0)>=62&&reversalCallVotes>=3&&(short.turnUp||short.failedBreakDown||failedSupport||bullishReject);
 const reversalAuthorityPut=micro.ready&&Number(short.reversalPutScore||0)>=62&&reversalPutVotes>=3&&(short.turnDown||short.failedBreakUp||failedResistance||bearishReject);
 const reversalAuthoritySide=reversalAuthorityCall&&!reversalAuthorityPut?'CALL':reversalAuthorityPut&&!reversalAuthorityCall?'PUT':'NEUTRO';
 const shortSlopeRaw=closes.length>=6?(last-Number(closes.at(-6)))/5:0,mediumSlopeRaw=closes.length>=21?(last-Number(closes.at(-21)))/20:shortSlopeRaw;
 const shortSlopeSignal=norm(shortSlopeRaw,safeVol*.18),mediumSlopeSignal=norm(mediumSlopeRaw,safeVol*.10);
 const candleAccelerationSignal=clamp((shortSlopeSignal-mediumSlopeSignal)*.72,-1,1);
 const microLeadSignal=clamp(Number(micro.lead||0),-1,1);
 const accelerationSignal=clamp(candleAccelerationSignal*.34+microLeadSignal*.66,-1,1);
 const persistenceForecastSignal=clamp(persistenceSignal*.78+mediumSlopeSignal*.22,-1,1);

 // Contexto histórico: somente candles FECHADOS, em três janelas independentes.
 // Serve para evitar que a força da vela atual domine a previsão curta.
 const closedCloses=prior.map(c=>Number(c.close)).filter(Number.isFinite);
 const historyLeg=(bars,scale)=>{
   if(closedCloses.length<bars+1)return null;
   const end=closedCloses.at(-1),start=closedCloses.at(-(bars+1)),move=end-start;
   const seq=closedCloses.slice(-(bars+1)),deltas=seq.slice(1).map((v,i)=>Number(v)-Number(seq[i]));
   const directional=deltas.length?deltas.reduce((a,x)=>a+(x>0?1:x<0?-1:0),0)/deltas.length:0;
   const slope=norm(move/Math.max(1,bars),safeVol*scale);
   return{bars,signal:clamp(slope*.68+directional*.32,-1,1),slope,directional,move}
 };
 const historyLegs=[historyLeg(8,.20),historyLeg(20,.13),historyLeg(50,.08)].filter(Boolean);
 const h8=Number(historyLegs.find(x=>x.bars===8)?.signal||0),h20=Number(historyLegs.find(x=>x.bars===20)?.signal||0),h50=Number(historyLegs.find(x=>x.bars===50)?.signal||0);
 const historySignal=clamp(h8*.30+h20*.40+h50*.30,-1,1);
 const historySigns=historyLegs.filter(x=>Math.abs(x.signal)>=.08).map(x=>Math.sign(x.signal));
 const historyDirection=historySigns.length?Math.sign(historySigns.reduce((a,b)=>a+b,0)):0;
 const historyAgreement=historySigns.length?Math.abs(historySigns.reduce((a,b)=>a+b,0))/historySigns.length:0;
 m.historyContext={signal:historySignal,direction:historyDirection,agreement:Math.round(historyAgreement*100),legs:historyLegs};

 const breakoutDirection=(srBreakUp||lineBreakUp)?1:(srBreakDown||lineBreakDown)?-1:0;
 const regimeSignal=regimeLabel==='trend'?clamp(trendDirection*trendAgreementPct,-1,1)
   :regimeLabel==='breakout'?breakoutDirection
   :regimeLabel==='reversal'?forecastReversalSignal
   :regimeLabel==='range'?clamp(reversalSignal*.65-trendSignal*.15,-1,1)
   :clamp(trendSignal*.25+momentumSignal*.20,-.35,.35);

 const weightsFor=seconds=>seconds<=30
   ?{micro:.16,reversal:.17,momentum:.08,trend:.05,history:.09,location:.10,setup:.07,strategy:.06,persistence:.05,acceleration:.07,regime:.03,mtf:.07}
   :seconds<=60?{micro:.14,reversal:.15,momentum:.09,trend:.07,history:.11,location:.11,setup:.07,strategy:.06,persistence:.05,acceleration:.06,regime:.03,mtf:.06}
   :seconds<=120?{micro:.10,reversal:.12,momentum:.10,trend:.10,history:.14,location:.13,setup:.06,strategy:.05,persistence:.05,acceleration:.03,regime:.04,mtf:.08}
   :seconds<=300?{micro:.04,reversal:.07,momentum:.10,trend:.14,history:.16,location:.16,setup:.05,strategy:.05,persistence:.05,acceleration:.01,regime:.08,mtf:.09}
   :seconds<=600?{micro:.025,reversal:.05,momentum:.09,trend:.17,history:.18,location:.17,setup:.04,strategy:.05,persistence:.055,acceleration:.005,regime:.09,mtf:.075}
   :seconds<=900?{micro:.015,reversal:.04,momentum:.08,trend:.18,history:.19,location:.18,setup:.035,strategy:.045,persistence:.06,acceleration:0,regime:.09,mtf:.085}
   :{micro:0,reversal:.03,momentum:.07,trend:.20,history:.20,location:.18,setup:.03,strategy:.04,persistence:.06,acceleration:0,regime:.09,mtf:.10};

 const featureRegimeMultiplier=(name)=>{
   if(regimeLabel==='trend'&&['trend','persistence','regime'].includes(name))return 1.18;
   if(regimeLabel==='range'&&['location','reversal'].includes(name))return 1.18;
   if(regimeLabel==='breakout'&&['momentum','setup','persistence','regime'].includes(name))return 1.16;
   if(regimeLabel==='reversal'&&['reversal','location','setup'].includes(name))return 1.20;
   if(regimeLabel==='chaotic'&&['micro','acceleration'].includes(name))return .72;
   return 1
 };

 const multiTfFor=(seconds)=>{
   const weights=seconds<=60?{'60':.34,'120':.28,'300':.20,'600':.11,'900':.07}
     :seconds<=120?{'60':.20,'120':.34,'300':.24,'600':.13,'900':.09}
     :seconds<=300?{'60':.10,'120':.15,'300':.34,'600':.25,'900':.16}
     :{'60':.05,'120':.10,'300':.24,'600':.29,'900':.32};
   const rows=Object.entries(weights).map(([k,w])=>({...(multiTF[k]||{}),weight:w})).filter(x=>x.ready&&Number.isFinite(Number(x.signal)));
   const total=rows.reduce((a,x)=>a+x.weight,0);
   const signal=total>0?clamp(rows.reduce((a,x)=>a+Number(x.signal)*x.weight,0)/total,-1,1):0;
   const directional=rows.filter(x=>Math.abs(Number(x.signal))>=.10),aligned=directional.filter(x=>signal===0||Math.sign(Number(x.signal))===Math.sign(signal)).length;
   const agreement=directional.length?aligned/directional.length:.5;
   return{ready:rows.length>=3,signal,agreement,rows:rows.map(x=>({seconds:x.seconds,direction:x.direction,signal:x.signal,candles:x.candles}))}
 };
 const forecastFor=seconds=>{
   const scale=Math.sqrt(Math.max(.5,seconds/60)),expectedMove=Math.max(safeVol*.35,safeVol*scale),triggerBuffer=Math.max(safeVol*.08,expectedMove*.24);
   const barsBack=Math.max(2,Math.ceil(seconds/Math.max(5,baseSeconds)));
   const minHistory=seconds>=3600?90:seconds>=900?55:seconds>=600?45:seconds>=300?35:Math.max(18,Math.min(30,barsBack+10));
   const enoughHistory=closes.length>=minHistory;
   const microSignal=micro.ready?clamp(norm(micro.p5,1.35)*.31+norm(micro.p15,1.65)*.30+norm(micro.p30,2.10)*.23+norm(micro.pulse,18)*.16,-1,1):0;
   const upRoom=nearestUpper!=null?clamp((nearestUpper-last)/Math.max(expectedMove,1e-12),0,3):1.5;
   const downRoom=nearestLower!=null?clamp((last-nearestLower)/Math.max(expectedMove,1e-12),0,3):1.5;
   let locationSignal=clamp((upRoom-downRoom)/2.2,-1,1);
   if(upRoom<.45)locationSignal-=.28;
   if(downRoom<.45)locationSignal+=.28;
   if(m.bb?.upper!=null&&m.bb?.lower!=null&&Number(m.bb.upper)>Number(m.bb.lower)){
     const bbMid=Number(m.bb.mid||((Number(m.bb.upper)+Number(m.bb.lower))/2));
     const bbPos=clamp(((last-bbMid)/(Number(m.bb.upper)-Number(m.bb.lower)))*2,-1,1);
     locationSignal=clamp(locationSignal-bbPos*.12,-1,1)
   }
   const mtf=multiTfFor(seconds);
   const w=weightsFor(seconds),declaredWeight=Object.values(w).reduce((a,b)=>a+Number(b||0),0)||1;
   const features=[
     {name:'microfluxo',key:'micro',value:microSignal,weight:w.micro,available:w.micro>0&&micro.ready},
     {name:'reversão/exaustão',key:'reversal',value:forecastReversalSignal,weight:w.reversal,available:short.ready===true},
     {name:'momentum',key:'momentum',value:momentumSignal,weight:w.momentum,available:m.rsi!=null||m.macd!=null||m.momentum!=null},
     {name:'estrutura/tendência',key:'trend',value:trendSignal,weight:w.trend,available:true},
     {name:'histórico fechado',key:'history',value:historySignal,weight:w.history,available:historyLegs.length>=2},
     {name:'espaço S/R',key:'location',value:locationSignal,weight:w.location,available:true},
     {name:'setup',key:'setup',value:setupSignal,weight:w.setup,available:true},
     {name:'estratégia atual',key:'strategy',value:rawStrategySignal,weight:w.strategy,available:true},
     {name:'persistência',key:'persistence',value:persistenceForecastSignal,weight:w.persistence,available:recentDeltas.length>=5},
     {name:'aceleração',key:'acceleration',value:accelerationSignal,weight:w.acceleration,available:w.acceleration>0&&closes.length>=21},
     {name:'regime '+regimeLabel,key:'regime',value:regimeSignal,weight:w.regime,available:regimeConfidence>=35},
     {name:'multi-timeframe 1m/2m/5m/10m/15m',key:'mtf',value:mtf.signal,weight:w.mtf,available:w.mtf>0&&mtf.ready}
   ].map(x=>({...x,weight:x.weight*featureRegimeMultiplier(x.key)}));
   const available=features.filter(x=>x.available&&x.weight>0),weightTotal=available.reduce((a,x)=>a+x.weight,0)||1;
   let signal=available.reduce((a,x)=>a+x.value*x.weight,0)/weightTotal;

   // Anti-atraso: se o movimento atual já esticou e começa a perder aceleração,
   // a previsão deixa de perseguir a vela atual e antecipa a possibilidade de virada.
   if(short.callOverextended&&signal>0)signal-=Math.min(.30,Math.abs(signal)*.48+.07);
   if(short.putOverextended&&signal<0)signal+=Math.min(.30,Math.abs(signal)*.48+.07);
   if(short.turnDown&&signal>0)signal-=seconds<=60?.18:.10;
   if(short.turnUp&&signal<0)signal+=seconds<=60?.18:.10;
   // Quando o microfluxo vira contra a tendência, 30s/1m precisam reagir antes da vela terminar.
   // Isso reduz CALL no topo/PUT no fundo sem inverter horizontes longos por um único tick.
   if(seconds<=60&&trendSignal>.20&&microSignal<-.25)signal-=Math.min(.28,.05+Math.abs(microSignal)*.16+Math.max(0,-accelerationSignal)*.10);
   if(seconds<=60&&trendSignal<-.20&&microSignal>.25)signal+=Math.min(.28,.05+Math.abs(microSignal)*.16+Math.max(0,accelerationSignal)*.10);
   if(signal>0&&accelerationSignal<-.35)signal-=Math.min(.16,Math.abs(accelerationSignal)*.18);
   if(signal<0&&accelerationSignal>.35)signal+=Math.min(.16,Math.abs(accelerationSignal)*.18);
   if(seconds<=120&&reversalAuthoritySide!=='NEUTRO'){
     const score=reversalAuthoritySide==='CALL'?Number(short.reversalCallScore||0):Number(short.reversalPutScore||0);
     const magnitude=clamp(.38+Math.max(0,score-62)/95,.38,.72),authoritySignal=reversalAuthoritySide==='CALL'?magnitude:-magnitude;
     signal=clamp(signal*.38+authoritySignal*.62,-1,1)
   }
   const historyConflict=historyDirection!==0&&Math.sign(signal)!==0&&Math.sign(signal)!==historyDirection&&Math.abs(historySignal)>=.32;
   if(historyConflict&&!reversalConfirmed)signal*=seconds<=60?.62:seconds<=300?.74:.84;
   if(regimeLabel==='chaotic')signal*=.72;
   signal=clamp(signal,-1,1);

   const directional=available.filter(x=>Math.abs(x.value)>=.08),directionalWeight=directional.reduce((a,x)=>a+x.weight,0);
   const alignedWeight=directional.filter(x=>signal===0||Math.sign(x.value)===Math.sign(signal)).reduce((a,x)=>a+x.weight,0);
   const opposedWeight=directional.filter(x=>signal!==0&&Math.sign(x.value)!==Math.sign(signal)).reduce((a,x)=>a+x.weight,0);
   const agreement=directionalWeight>0?alignedWeight/directionalWeight:.5,conflict=directionalWeight>0?opposedWeight/directionalWeight:0;
   // V13.1: confiança não pode tratar indicadores correlacionados como evidências totalmente independentes.
   // As famílias abaixo preservam o sinal/direção do V4 e só tornam a confiança mais conservadora quando
   // várias leituras estão repetindo essencialmente o mesmo movimento.
   const familyDefs={
     flow:['micro','acceleration'],
     momentum:['momentum','persistence'],
     structure:['trend','history','regime'],
     context:['location','setup','reversal'],
     strategy:['strategy']
   };
   const familyRows=Object.entries(familyDefs).map(([family,keys])=>{
     const rows=available.filter(x=>keys.includes(x.key)&&x.weight>0);
     const weight=rows.reduce((a,x)=>a+x.weight,0);
     const value=weight>0?rows.reduce((a,x)=>a+x.value*x.weight,0)/weight:0;
     return{family,value,weight}
   }).filter(x=>x.weight>0&&Math.abs(x.value)>=.08);
   const familyWeight=familyRows.reduce((a,x)=>a+x.weight,0);
   const familyAlignedWeight=familyRows.filter(x=>signal===0||Math.sign(x.value)===Math.sign(signal)).reduce((a,x)=>a+x.weight,0);
   const familyAgreement=familyWeight>0?familyAlignedWeight/familyWeight:.5;
   const evidenceFamilyCount=familyRows.length;
   const correlationPenalty=Math.round(clamp(Math.max(0,agreement-familyAgreement)*10+Math.max(0,3-evidenceFamilyCount)*1.5,0,6));
   const quality=clamp(weightTotal/declaredWeight,0,1);
   const signalSide=signal>0?'CALL':signal<0?'PUT':'NEUTRO';
   const strongBarrierPut=signalSide==='PUT'&&srNearSupport&&supportStrength>=38&&!srBreakDown&&!lineBreakDown&&reversalAuthoritySide!=='PUT';
   const strongBarrierCall=signalSide==='CALL'&&srNearResistance&&resistanceStrength>=38&&!srBreakUp&&!lineBreakUp&&reversalAuthoritySide!=='CALL';
   const chaseBlocked=seconds<=60&&((signalSide==='CALL'&&short.callOverextended&&!srBreakUp&&!lineBreakUp)||(signalSide==='PUT'&&short.putOverextended&&!srBreakDown&&!lineBreakDown));
   const barrierBlocked=seconds<=120&&(strongBarrierCall||strongBarrierPut);
   const mtfConflict=seconds<=120&&mtf.ready&&Math.abs(Number(mtf.signal||0))>=.18&&Math.sign(Number(mtf.signal||0))!==0&&Math.sign(Number(mtf.signal||0))!==Math.sign(signal)&&Number(mtf.agreement||0)>=.55&&reversalAuthoritySide==='NEUTRO';
   const safetyBlocked=chaseBlocked||barrierBlocked||mtfConflict;
   const rawCallProbability=clamp(Math.round(50+Math.tanh(signal*1.28)*43),5,95),rawPutProbability=100-rawCallProbability;
   const regimeBonus=Math.max(0,(regimeConfidence-50)*.08);
   const baseModelConfidence=Math.round(48+Math.abs(signal)*30+Math.max(0,agreement-.5)*22+Math.max(0,quality-.68)*12+regimeBonus-conflict*10);
   const modelConfidence=clamp(baseModelConfidence-correlationPenalty,45,94);
   const minForecastConfidence=seconds<=60?61:seconds<=300?59:58,enoughFlow=seconds>60||micro.ready;
   const minAgreement=seconds<=60?.54:seconds<=300?.51:.48,minSignal=seconds<=60?.15:seconds<=300?.13:.11;
   const leadAligned=seconds<=60&&Math.abs(microLeadSignal)>=.42&&Math.sign(microLeadSignal)===Math.sign(signal)&&(historyDirection===0||Math.sign(signal)===historyDirection||reversalConfirmed);
   const readyConfidence=leadAligned?minForecastConfidence-2:minForecastConfidence,readyAgreement=leadAligned?minAgreement-.04:minAgreement,readySignal=leadAligned?minSignal*.78:minSignal;
   const outlookReady=enoughHistory&&enoughFlow&&quality>=.66&&historyLegs.length>=2;
   const directionReady=outlookReady&&modelConfidence>=readyConfidence&&Math.abs(signal)>=readySignal&&agreement>=readyAgreement&&regimeLabel!=='chaotic'&&!safetyBlocked;
   const bias=outlookReady&&Math.abs(signal)>=.025?(signal>0?'CALL':'PUT'):'NEUTRO';
   const projectedMove=expectedMove*signal*(.55+modelConfidence/240),projectedPrice=last+projectedMove;
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
   const strongest=features.filter(x=>x.available).sort((a,b)=>Math.abs(b.value*b.weight)-Math.abs(a.value*a.weight)).slice(0,4).map(x=>`${x.name} ${x.value>0?'CALL':x.value<0?'PUT':'neutro'}`);
   const evidenceFamilies=Object.fromEntries(features.filter(x=>x.available).map(x=>[x.key,{signal:x.value,weight:x.weight}]));
   return{
     horizonSeconds:seconds,currentPrice:last,expectedMove,expectedLow:last-expectedMove,expectedHigh:last+expectedMove,
     projectedMove,projectedPrice,signal,rawCallProbability,rawPutProbability,callProbability:rawCallProbability,putProbability:rawPutProbability,
     confidence:modelConfidence,modelConfidence,agreement:Math.round(agreement*100),dataQuality:Math.round(quality*100),
     bias,nextStep:bias,outlookReady,directionReady,callTrigger,putTrigger,callInvalidation,putInvalidation,callRule,putRule,
     regime:m.regime,evidenceFamilies,multiTimeframe:mtf,
     reversalAuthority:{side:reversalAuthoritySide,callVotes:reversalCallVotes,putVotes:reversalPutVotes,callScore:Number(short.reversalCallScore||0),putScore:Number(short.reversalPutScore||0)},
     safety:{blocked:safetyBlocked,chaseBlocked,barrierBlocked,mtfConflict,blockedSide:safetyBlocked?signalSide:null},
     reliability:{evidenceFamilyCount,familyAgreement:Math.round(familyAgreement*100),featureAgreement:Math.round(agreement*100),correlationPenalty,baseModelConfidence,leadAligned,microLead:Math.round(microLeadSignal*100)},
     basis:'previsão futura V4.1 independente do consenso atual por horizonte + multi-timeframe 1m/2m/5m/10m/15m + reversão estrutural + S/R + candles fechados + regime; entrada atual é separada',drivers:strongest,
     automaticExecution:false,modelVersion:'future-v4.1'
   }
 };
 const planner=Object.fromEntries(plannerHorizons.map(seconds=>[String(seconds),forecastFor(seconds)]));
 const selectedSeconds=String(Math.max(30,Math.round(horizon/1000))),selectedForecast=planner[selectedSeconds]||planner['60']||planner['30'];
 const forecast30Plan=planner['30'];
 const projectedBuy=Number(selectedForecast?.callProbability||50),projectedSell=Number(selectedForecast?.putProbability||50);
 const forecastSide=forecast30Plan?.bias==='CALL'?SignalSide.BUY:forecast30Plan?.bias==='PUT'?SignalSide.SELL:SignalSide.WAIT;
 const forecastConfidence=Number(forecast30Plan?.confidence||0);
 const callGap=Math.max(0,Math.round(60-Number(forecast30Plan?.confidence||0))),putGap=callGap;
 if(side===SignalSide.WAIT)box.reasons.push(`entrada aguardando: CALL ${buyEffective} pts · PUT ${sellEffective} pts · filtro ${Number(minConfidence||74)} pts`);
 if(horizon<=60000&&short.ready){
   if(short.callReversalRisk)box.reasons.push('CALL bloqueado por risco de reversão');
   if(short.putReversalRisk)box.reasons.push('PUT bloqueado por risco de reversão');
   box.reasons.push(...(edge>=0?short.callReasons:short.putReasons))
 }

 return{
   side,confidence,reasons:box.reasons.slice(0,14),
   forecast30:{side:forecastSide,confidence:forecastConfidence,horizonSeconds:30,callStrength:Number(forecast30Plan?.callProbability||50),putStrength:Number(forecast30Plan?.putProbability||50),trigger:60,callGap,putGap,microPulse:micro.pulse,microReady:micro.ready,projectedPrice:forecast30Plan?.projectedPrice??null,agreement:forecast30Plan?.agreement??0,modelVersion:'future-v4.1'},
   finalConfluence:{side:finalSide,strength:finalStrength,callStrength:finalCall,putStrength:finalPut,minConfidence:Number(minConfidence||74),aligned:Math.abs(finalEdge)>=12,disagreement:(buyEffective-sellEffective)*(projectedBuy-projectedSell)<0,basis:'estado técnico atual; previsão futura separada'},
   entryPlanner:{defaultHorizonSeconds:30,modelVersion:'future-v4.1',horizons:planner},
   metrics:{...m,rawBuyScore:rawBuy,rawSellScore:rawSell,buyScore:buyEffective,sellScore:sellEffective,buyEffective,sellEffective,projectedBuy,projectedSell,edge,microPulse:micro.pulse,strategy,futureModelVersion:'future-v4.1',selectedForecast}
 }
}

// Sentinel 227: combines CLOSED broker candles and independently received
// quote-derived 5-second bars. Advisory votes; never new fixed waits or
// expiry/trading permissions. A single fast candle is not a direction model.
import {ema,rsi,marketStructure,macd,bollinger,stochastic,fibonacci} from './indicators.mjs';
import {adxDmi,confirmedRsiDivergence} from './market-intelligence-226.mjs';
const numeric=n=>Number.isFinite(Number(n))?Number(n):null;
const side=x=>x>0?'CALL':x<0?'PUT':null;
function closedBrokerCandles(candles,at,now){
 const rows=[];
 for(const c of Array.isArray(candles)?candles:[]){
  const ts=Number(c.to??0),end=ts>1e12?ts:ts*1000;
  const received=Number(c.receivedAt??end);
  const open=numeric(c.open),high=numeric(c.high??c.max),
   low=numeric(c.low??c.min),close=numeric(c.close);
  if(!(end>0&&end<=at&&received<=now&&open>0&&high>=Math.max(open,close)&&
   low>0&&low<=Math.min(open,close)))continue;
  const start=Number(c.from??0),begin=start>1e12?start:start*1000;
  rows.push({from:begin,to:end,open,high,low,close,period:end-begin});
 }
 rows.sort((a,b)=>a.to-b.to);
 const last=rows.at(-1);
 // Historical independent bars never mix 1m and 5m averages.
 return last?rows.filter(c=>c.period===last.period).slice(-105):[];
}
function observedFiveSecondBars(quotes,at,now){
 const buckets=new Map(),rows=Array.isArray(quotes)?quotes:[];
 for(const q of rows){
  const ts=Number(q?.ts),p=Number(q?.price),received=Number(q?.receivedAt??ts);
  if(!(ts>at-210000&&ts<at&&received<=now&&p>0))continue;
  const start=Math.floor(ts/5000)*5000;
  if(start+5000>at)continue;
  const b=buckets.get(start);
  if(!b)buckets.set(start,{from:start,to:start+5000,open:p,high:p,low:p,close:p,first:ts,last:ts});
  else{
   if(ts<b.last)continue;
   b.high=Math.max(b.high,p);b.low=Math.min(b.low,p);
   b.close=p;b.last=ts;
  }
 }
 const all=[...buckets.values()].sort((a,b)=>a.from-b.from);
 const result=[];
 for(let i=all.length-1;i>=0&&result.length<40;i--){
  const b=all[i];
  if(b.first-b.from>2400||b.to-b.last>2400)break;
  if(result.length&&result[0].from!==b.to)break;
  result.unshift(b);
 }
 return result;
}
export function unifiedMarketEvidence227({candles=[],quoteHistory=[],quoteAt,
 now=quoteAt,price,proposedSide=null,reversalSide=null}={}){
 const at=Number(quoteAt),clock=Number(now),spot=Number(price);
 const empty={ready:false,continuationScore:0,reversalScore:0,trendSide:null,
  rsi:null,rsiTrend:null,adx:null,dmiSide:null,divergenceSide:null,emaAlignment:null,
  macdSide:null,stochastic:null,bollingerPosition:null,fibonacciDirection:null,
  evidenceCount:0};
 if(!(at>0&&clock>=at&&clock-at<=2500&&spot>0))return empty;
 const history=closedBrokerCandles(candles,at,clock),
  five=observedFiveSecondBars(quoteHistory,at,clock);
 const fullClose=history.map(x=>x.close),fastClose=five.map(x=>x.close);
 const ema20=ema(fullClose,20),ema50=ema(fullClose,50),
  ema100=ema(fullClose,100),ema9=ema(fastClose,9),ema21=ema(fastClose,21);
 const cRsi=rsi(fullClose,14),shortRsi=rsi(fastClose,7),
  prevRsi=rsi(fastClose.slice(0,-2),7);
 const dmi=adxDmi(five,10),div=confirmedRsiDivergence(five,7),
  structure=history.length>=8?marketStructure(history):null,
  oldMacd=macd(fullClose,12,26,9),bb=bollinger(fullClose,20,2),
  stoch=stochastic(history,14),fib=fibonacci(history,60);
 const longSide=ema20!=null&&ema50!=null?
  side(ema20-ema50):null;
 const shortSide=ema9!=null&&ema21!=null?
  side(ema9-ema21):null;
 const emaAlignment=ema100!=null&&ema20!=null&&ema50!=null?
  ema20>ema50&&ema50>ema100?'CALL':
  ema20<ema50&&ema50<ema100?'PUT':null:longSide;
 const trendSide=emaAlignment||longSide||shortSide;
 const rsiTrend=shortRsi!=null&&prevRsi!=null?side(shortRsi-prevRsi):null;
 // Context is a soft vote, NOT a blanket trend veto on verified reversals:
 // historical EMA can still point DOWN at the FIRST genuine CALL turn.
 let continuationScore=0,reversalScore=0,evidenceCount=0;
 const vote=(direction,weight)=>{
  if(!direction)return;
  evidenceCount++;
  if(proposedSide&&direction===proposedSide)continuationScore+=weight;
  if(reversalSide&&direction===reversalSide)reversalScore+=weight;
 };
 vote(trendSide,1.0);
 vote(shortSide,1.1);
 vote(dmi.ready&&dmi.adx>=19?dmi.direction:null,1.0);
 vote(rsiTrend,.8);
 vote(oldMacd?.histogram==null?null:side(oldMacd.histogram),.65);
 vote(stoch==null||Math.abs(stoch-50)<8?null:side(stoch-50),.35);
 vote(fib?.direction==='up'?'CALL':fib?.direction==='down'?'PUT':null,.25);
 vote(div.side,1.25);
 vote(structure?.bias==='bullish'?'CALL':
  structure?.bias==='bearish'?'PUT':null,.7);
 if(cRsi!=null&&reversalSide==='CALL'&&cRsi<34)reversalScore+=.4;
 if(cRsi!=null&&reversalSide==='PUT'&&cRsi>66)reversalScore+=.4;
 const bbPos=bb?.upper>bb?.lower?(spot-bb.lower)/(bb.upper-bb.lower):null;
 if(bbPos!=null&&reversalSide==='PUT'&&bbPos>.88)reversalScore+=.35;
 if(bbPos!=null&&reversalSide==='CALL'&&bbPos<.12)reversalScore+=.35;
 return {...empty,ready:history.length>=20||five.length>=20,
  continuationScore:Math.round(continuationScore*100)/100,
  reversalScore:Math.round(reversalScore*100)/100,
  trendSide,rsi:cRsi,rsiTrend,adx:dmi.ready?dmi.adx:null,
  dmiSide:dmi.ready?dmi.direction:null,
  divergenceSide:div.ready?div.side:null,emaAlignment,
  macdSide:oldMacd?.histogram==null?null:side(oldMacd.histogram),
  stochastic:stoch,bollingerPosition:bbPos,
  fibonacciDirection:fib?.direction||null,
  evidenceCount,historyBars:history.length,fastBars:five.length};
}

// OUT-OF-SAMPLE QUOTE OUTCOME CHECK, NOT BROKER WIN/LOSS.
// Same fixed user-observed tapes, same causal OHLC aggregation and immediate
// quote-at-expiry scoring against both original historical source revisions.
// Never executes, connects to or modifies a trading account.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.cwd();
const dataFile=p=>JSON.parse(readFileSync(path.join(root,'tests','fixtures',p),'utf8'));
const versions=[['13.9.123','baseline'],['13.9.125','.']];
const modules=await Promise.all(versions.map(async([version,folder])=>({
 version,Runtime:(await import(pathToFileURL(path.resolve(root,folder,'sentinel-trading-lab/agent/src/core/runtime.mjs')).href)).DemoTradingRuntime
})));
const fixtures=[
 {name:'user-video-visible-1Hz',series:dataFile('sentinel-user-video-20261016.json').quoteHistory,asset:'EUR/GBP OTC'},
 {name:'user-video-broker-plot-2Hz',series:dataFile('sentinel-user-video-broker-6dp-20261016.json').quoteHistory,asset:'EUR/GBP OTC'},
 {name:'short-recorded-quotes',series:dataFile('sentinel-continuation-prices.json').quoteHistory,asset:'EUR/USD OTC'}
];
function candleBars(rows,now,period){
 const map=new Map();
 for(const q of rows){
  if(q.ts>now)break;
  const start=Math.floor(q.ts/period)*period;
  let b=map.get(start);
  if(!b){b={from:start,to:start+period,open:q.price,close:q.price,
   high:q.price,low:q.price,firstAt:q.ts,lastAt:q.ts,n:0};map.set(start,b);}
  b.close=q.price;b.high=Math.max(b.high,q.price);b.low=Math.min(b.low,q.price);b.lastAt=q.ts;b.n++;
 }
 return [...map.values()].filter(b=>b.to<=now&&b.n>=2&&
  b.firstAt-b.from<=Math.min(3500,period*.45)&&b.to-b.lastAt<=Math.min(3500,period*.45))
  .slice(-100).map(({firstAt,lastAt,n,...b})=>({...b,from:b.from/1000,to:b.to/1000}));
}
function score(series,due,entry,side){
 const exit=series.find(q=>q.ts>=due&&q.ts<=due+1500);
 if(!exit)return {outcome:'unscored',reason:'no observed quote at expiry'};
 if(exit.price===entry)return {outcome:'draw'};
 const predicted=exit.price>entry?'CALL':'PUT';
 return {outcome:predicted===side?'win':'loss',exitAt:exit.ts,exitPrice:exit.price};
}
function evaluate({Runtime,version},{name,series,asset},expiry,candleMs){
 const rows=series.filter(q=>Number.isFinite(q.ts)&&Number.isFinite(q.price)&&q.price>0)
  .map(q=>({ts:Number(q.ts),receivedAt:Number(q.receivedAt??q.ts),price:Number(q.price)}))
  .sort((a,b)=>a.ts-b.ts);
 const rt=new Runtime({enableVNext:true,forecastModel:'short-probability-v1'});
 rt.patchSettings({engine:'automatic',asset,orderDurationMs:expiry},'read-only-audit');
 const trades=[],reasons={},barsCache=new Map();
 for(let i=0;i<rows.length;i++){
  const q=rows[i];
  if(i&&q.ts-rows[i-1].ts<850)continue; // Evaluate same 1Hz decision cadence for both
  const prior=rows.slice(0,i+1);
  const cacheKey=Math.floor(q.ts/candleMs);
  let bars=barsCache.get(cacheKey);
  if(!bars){bars=candleBars(rows,q.ts,candleMs);barsCache.clear();barsCache.set(cacheKey,bars);}
  if(prior.length<50||bars.length<10)continue;
  const snap={provider:'exnova',price:q.price,quoteTs:q.ts,
   quoteHistory:prior,candles:bars,historicalCandlesVerified:true,payout:.86};
  const out=rt._signalValidationGate({analysis:{},snap,settings:rt.settings,now:q.ts});
  const v=out?.analysis?.vnext;
  if(!v)throw Error('Market decision missing vnext: '+version+' '+name);
  const reason=v.nowObservation?.reason||'unknown';
  reasons[reason]=(reasons[reason]||0)+1;
  const a=v.futureEntryAnchor;
  if(a?.entryReadyNow===true){
   trades.push({signalAt:q.ts,side:a.side,entryPrice:a.entryPrice,expiry:expiry,
    reason,...score(rows,a.exitAt,a.entryPrice,a.side)});
  }
 }
 const wins=trades.filter(t=>t.outcome==='win').length,
  losses=trades.filter(t=>t.outcome==='loss').length,
  draws=trades.filter(t=>t.outcome==='draw').length,
  unscored=trades.filter(t=>t.outcome==='unscored').length,n=wins+losses;
 return {version,source:name,quotedObservations:rows.length,expirySeconds:expiry/1000,
  candlePeriodSeconds:candleMs/1000,signals:trades.length,
  wins,losses,draws,unscored,winRatePct:n?Math.round(10000*wins/n)/100:null,
  theoreticalNetAt86Payout:Math.round((wins*.86-losses)*100)/100,
  firstSignals:trades.slice(0,12),reasonCounts:reasons};
}
const summary=[];
for(const fixture of fixtures)for(const expiry of [30000,60000])
 for(const candleMs of [10000,30000]){
 const results=modules.map(m=>evaluate(m,fixture,expiry,candleMs));
 summary.push({fixture:fixture.name,expiry,bar:candleMs,
  v123:results[0],v125:results[1],deltaWinRatePp:
  results.every(x=>x.winRatePct!==null)?
   Math.round((results[1].winRatePct-results[0].winRatePct)*100)/100:null});
}
console.log('MATCHED_123_125_BEGIN');
for(const row of summary)console.log(JSON.stringify({source:row.fixture,expirySeconds:row.expiry/1000,barSeconds:row.bar/1000,
  old:{n:row.v123.wins+row.v123.losses,w:row.v123.wins,l:row.v123.losses,rate:row.v123.winRatePct,
    signals:row.v123.signals,unscored:row.v123.unscored,pnl:row.v123.theoreticalNetAt86Payout},
  current:{n:row.v125.wins+row.v125.losses,w:row.v125.wins,l:row.v125.losses,rate:row.v125.winRatePct,
    signals:row.v125.signals,unscored:row.v125.unscored,pnl:row.v125.theoreticalNetAt86Payout},
  deltaPp:row.deltaWinRatePp}));
console.log('MATCHED_123_125_END');
console.log('LIMITATION: 1Hz and 2Hz fixtures record the SAME earlier video; not independent samples. Reconstructed 10/30-second bars are aggregates of visible OBSERVATIONS, not full broker OHLC. Different future-fill/click latency not modeled. The tiny observed samples cannot establish superiority.');

import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {VolatilityPivotStructure} from '../experiments/volatility-pivot-structure.mjs';
const source=resolve(process.argv[2]??new URL('..',import.meta.url).pathname);
const read=p=>JSON.parse(existsSync(resolve(source,p))?readFileSync(resolve(source,p)):gunzipSync(readFileSync(resolve(source,p+'.gz'))));
function expiry(qs,at,policy){
 if(!qs.length||at>qs.at(-1).ts)return null;let lo=0,hi=qs.length;
 const asof=policy==='asof-complete-bid-stream'||policy==='asof-observed-within-1s';
 while(lo<hi){const m=(lo+hi)>>>1;if(asof?qs[m].ts<=at:qs[m].ts<at)lo=m+1;else hi=m;}
 if(asof){const q=lo?qs[lo-1]:null;return policy==='asof-observed-within-1s'&&q&&at-q.ts>1000?null:q;}
 return qs[lo]?.ts<=at+1000?qs[lo]:null;
}
export function score(es){let streak=0,maxLossStreak=0;for(const e of es){if(e.result==='loss')maxLossStreak=Math.max(maxLossStreak,++streak);else if(e.result==='win')streak=0;}
 const win=es.filter(e=>e.result==='win').length,loss=es.filter(e=>e.result==='loss').length;
 return {win,loss,tie:es.filter(e=>e.result==='tie').length,missing:es.filter(e=>e.result==='missing').length,completed:win+loss,winRate:win+loss?win/(win+loss):null,maxLossStreak,netAt86Percent:win*.86-loss};
}
export function replayPivots(data){
 const model=new VolatilityPivotStructure(),qs=data.quotes,targets=data.targets??qs,allowed=new Set(targets.map(q=>q.ts)),start=targets[0]?.ts??Infinity;
 let activeUntil=-Infinity,discardedDuringHold=0,signals=0;const entries=[],lag=[];const began=performance.now();
 for(const q of qs){
  const target=allowed.has(q.ts),now=Number(q.receivedAt??q.ts);
  const e=model.observe({context:data.asset??'same-source',quote:q,now,emit:q.ts<start||target});
  if(!e||!target)continue;signals++;
  if(now<activeUntil){discardedDuringHold++;continue;}
  const at=now,dueAt=at+30000,exit=expiry(qs,dueAt,data.metadata?.expiryQuotePolicy);
  const delta=exit?exit.price-e.entryPrice:null;
  entries.push({at,side:e.side,price:e.entryPrice,dueAt,result:delta==null?'missing':delta===0?'tie':(delta>0?'CALL':'PUT')===e.side?'win':'loss',pivotAt:e.pivot.at,confirmationAt:e.pivot.confirmedAt,structuralBreakAt:e.quoteAt,threshold:e.pivot.threshold,atr:e.atr});
  lag.push((at-e.pivot.at)/1000);activeUntil=dueAt;
 }
 const ordered=lag.sort((a,b)=>a-b),percentile=p=>ordered.length?ordered[Math.min(ordered.length-1,Math.floor(ordered.length*p))]:null;
 return {entries,metrics:score(entries),signals,discardedDuringHold,pivotToEntrySeconds:{median:percentile(.5),p95:percentile(.95)},computeMs:performance.now()-began};
}
async function baselineControl(data,expected){
 const {DemoTradingRuntime}=await import('../sentinel-trading-lab/agent/src/core/runtime.mjs');
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'}),realNow=Date.now,entries=[];
 let ci=0,end=0,start=0;const candles=[];
 try{for(const q of data.targets??data.quotes){
  const now=q.ts;Date.now=()=>now;
  while(ci<(data.candles?.length??0)&&data.candles[ci].to*1000<=now)candles.push(data.candles[ci++]);
  while(end<data.quotes.length&&data.quotes[end].ts<=now)end++;
  while(start<end&&data.quotes[start].ts<now-300000)start++;
  const settings={...r.settings,engine:'automatic',asset:data.asset,orderDurationMs:30000};
  const snap={provider:'iq_option',quoteHistory:data.quotes.slice(start,end),price:q.price,quoteTs:q.ts,candles:candles.slice(-100),historicalCandlesVerified:true};
  const e=r._signalValidationGate({analysis:{asset:settings.asset},snap,settings,now}).analysis.vnext.futureEntryAnchor;
  if(e?.entryReadyNow){const x=expiry(data.quotes,e.exitAt,data.metadata?.expiryQuotePolicy),d=x?x.price-e.entryPrice:null;
   entries.push({at:e.entryAt,side:e.side,price:e.entryPrice,dueAt:e.exitAt,result:d==null?'missing':d===0?'tie':(d>0?'CALL':'PUT')===e.side?'win':'loss'});}
 }}finally{Date.now=realNow;}
 const normalized=expected.map(({at,side,price,dueAt,result})=>({at,side,price,dueAt,result}));
 if(JSON.stringify(entries)!==JSON.stringify(normalized))throw Error('Cached baseline does not match released 13.9.45 at the replay timestamps');
 return {exactMatch:true,entries:entries.length};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===resolve(process.argv[1])){
 const manifests=[['forex-known','sentinel-final-conflict-audit-20261018-known.json'],['crypto-known','sentinel-accuracy-repair-ab-20261018-crypto.json'],['crypto-screen','sentinel-actual-entry-reference-ab-20261018-validation.json']];
 const baselineCache=JSON.parse(gunzipSync(readFileSync(new URL('../reports/volatility-pivot-baseline-cache.json.gz',import.meta.url))));
 const results=[],controls=[];
 for(const [set,file] of manifests){
  let first=true;
  for(const old of baselineCache[set]){
   const name=old.name,fixture='tests/fixtures/external/'+(name.startsWith('binance-')?'':'dukascopy-eurusd-')+name+'.json';
   const data=read(fixture),base=old.entries[0],candidate=replayPivots(data);
   if(first){controls.push({set,name,...await baselineControl(data,base)});first=false;}
   const fixtureSha256=createHash('sha256').update(readFileSync(resolve(source,fixture))).digest('hex');
   results.push({set,name,fixtureSha256,source:data.metadata,baseline:score(base),candidate:candidate.metrics,signals:candidate.signals,discardedDuringHold:candidate.discardedDuringHold,pivotToEntrySeconds:candidate.pivotToEntrySeconds,computeMs:candidate.computeMs,entries:candidate.entries});
   console.log(JSON.stringify({set,name,baseline:score(base),candidate:candidate.metrics}));
  }
 }
 const summary={};
 for(const [set] of manifests){const rows=results.filter(r=>r.set===set);const sum=k=>{const es=rows.map(r=>r[k]),win=es.reduce((s,m)=>s+m.win,0),loss=es.reduce((s,m)=>s+m.loss,0);return {win,loss,tie:es.reduce((s,m)=>s+m.tie,0),missing:es.reduce((s,m)=>s+m.missing,0),completed:win+loss,winRate:win+loss?win/(win+loss):null,maxLossStreak:Math.max(...es.map(m=>m.maxLossStreak)),netAt86Percent:win*.86-loss};};
  const baseline=sum('baseline'),candidate=sum('candidate'),coverage=baseline.completed?candidate.completed/baseline.completed:null;
  summary[set]={baseline,candidate,coverage,passed:candidate.winRate>baseline.winRate&&candidate.netAt86Percent>0&&coverage>=.25&&candidate.maxLossStreak<=baseline.maxLossStreak};}
 const report={spec:JSON.parse(readFileSync(new URL('../reports/volatility-pivot-spec.json',import.meta.url))),method:'Candidate uses its own causal, non-overlapping entry lifecycle on the same original evaluation timestamps. ATR observes intervening historical source quotes; entries use the current evaluation quote. Reference entries are cached released results, checked against the current released core on one full window per cohort. Prices after a decision are accessed only by the separate scorer.',controls,summary,results};
 writeFileSync(new URL('../reports/volatility-pivot-comparison.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary},null,2));
}

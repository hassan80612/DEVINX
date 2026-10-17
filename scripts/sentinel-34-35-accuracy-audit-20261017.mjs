import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const referenceRoot=process.env.SENTINEL_34_SOURCE_ROOT;
if(!referenceRoot)throw new Error('Set SENTINEL_34_SOURCE_ROOT to the extracted approved 13.9.34 agent directory.');
const {DemoTradingRuntime:Before}=await import(pathToFileURL(resolve(referenceRoot,'src/core/runtime.mjs')));
import {DemoTradingRuntime as After} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const {LocalPlaywrightDriver:OldDriver}=await import(pathToFileURL(resolve(referenceRoot,'worker/local-playwright-driver.mjs')));
import {LocalPlaywrightDriver as NewDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {runtimeMarketFromLive} from '../sentinel-trading-lab/agent/worker/runtime-market.mjs';
const results=[];
function compare(rows,settingsFor,makeSnap){
 const states=[new Before({enableVNext:true,forecastModel:'now-structural-v1'}),new After({enableVNext:true,forecastModel:'now-structural-v1'})];
 const entries=[[],[]],differentObservations=[];
 for(let i=0;i<rows.length;i++){
  const q=rows[i],seen=[];
  for(let n=0;n<2;n++){
   const r=states[n],settings=settingsFor(r),snap=makeSnap(r,n,i);
   const v=r._signalValidationGate({analysis:{asset:settings.asset},snap,settings,now:q.ts}).analysis.vnext;
   seen.push([v.nowObservation.ready,v.nowObservation.side,v.nowObservation.reason]);
   const e=v.futureEntryAnchor;
   if(e?.entryReadyNow){
    const end=rows.find(x=>x.ts>=e.exitAt&&x.ts<=e.exitAt+1000),d=end?end.price-e.entryPrice:null;
    entries[n].push({at:e.entryAt,side:e.side,entryPrice:e.entryPrice,exitAt:e.exitAt,result:d==null?'missing':d===0?'tie':(d>0?'CALL':'PUT')===e.side?'win':'loss'});
   }
  }
  if(JSON.stringify(seen[0])!==JSON.stringify(seen[1]))differentObservations.push({at:q.ts,before:seen[0],after:seen[1]});
 }
 return {sameEntries:JSON.stringify(entries[0])===JSON.stringify(entries[1]),differentObservations:differentObservations.length,examples:differentObservations.slice(0,8),counts:entries.map(es=>Object.fromEntries(['win','loss','tie','missing'].map(k=>[k,es.filter(e=>e.result===k).length]))),entries};
}
for(const file of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
 const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url))),rows=fixture.quoteHistory;
 const r=compare(rows,r=>({...r.settings,engine:'automatic',asset:'EUR/GBP OTC',orderDurationMs:30000}),(_,n,i)=>({provider:'iq_option',quoteHistory:rows.slice(0,i+1),price:rows[i].price,quoteTs:rows[i].ts}));
 results.push({kind:'previously-used-video',file,...r});console.log(JSON.stringify({file,sameEntries:r.sameEntries,differentObservations:r.differentObservations,counts:r.counts}));
}
const T=1792250040000,realNow=Date.now;
const price=t=>1.1+.0002*Math.sin(t/(19+3*Math.sin(t/155)))+.00006*Math.sin(t/4.7)+.00000003*t;
const candles=[];
for(let t=-6000;t<480;t+=60){const values=Array.from({length:241},(_,i)=>price(t+i*.25));candles.push({from:(T+t*1000)/1000,to:(T+(t+60)*1000)/1000,open:values[0],close:values.at(-1),high:Math.max(...values),low:Math.min(...values)});}
try{
 for(const hz of [1,10,40]){
  const ds=[new OldDriver(),new NewDriver()],rows=Array.from({length:481},(_,i)=>({ts:T+i*1000,price:price(i)}));
  for(const d of ds){const s=d.state('iq_option');s.activeId=1;s.candleActiveId=1;s.symbol='EUR/USD';}
  const historyAt=Array.from({length:481},()=>[null,null]);
  for(let tick=-180*hz;tick<=480*hz;tick++){
   const t=tick/hz,ts=T+t*1000,p=price(t);Date.now=()=>ts;
   for(const d of ds)d.ingest('iq_option',{name:'quote-generated',msg:{active_id:1,price:p,time:ts/1000}},'direct-in');
   if(t<0||tick%hz!==0)continue;
   for(let n=0;n<2;n++){
    const state=ds[n].state('iq_option');state.candles=candles.filter(c=>c.to*1000<=ts).slice(-100);state.lastCandleAt=ts;
    const m=ds[n].liveStatus('iq_option');historyAt[t][n]=runtimeMarketFromLive('iq_option',m,'EUR/USD');
   }
  }
  const r=compare(rows,r=>({...r.settings,engine:'automatic',asset:'EUR/USD',orderDurationMs:30000}),(r,n,i)=>{Date.now=()=>rows[i].ts;r.setExternalMarket(historyAt[i][n]);return r._marketSnapshot();});
  results.push({kind:'controlled-long-session-not-live-accuracy',hz,seconds:480,...r});console.log(JSON.stringify({hz,sameEntries:r.sameEntries,differentObservations:r.differentObservations,counts:r.counts,examples:r.examples}));
 }
}finally{Date.now=realNow;}
mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});
writeFileSync(new URL('../reports/sentinel-34-35-accuracy-audit-20261017.json',import.meta.url),JSON.stringify({reference34:'fa0343e9df66511072d51efa7b39d5c40fca5443',candidate35:'406c8f6b7ffa6fa90cad6575c0903ba78205b697',purpose:'Read-only comparison of released runtimes. Known video is not independent validation; controlled sessions are not live accuracy. Both receive identical decision times. User Windows timing, selected asset and actual order receipts are unavailable.',results},null,2)+'\n');

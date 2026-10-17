// Counterfactual input sensitivity, not accuracy measurement. No future price
// is used, no broker OHLC is invented, and the learned selector is held fixed.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const core=process.argv[2];if(!core)throw Error('Pass the pinned production core directory');
const {DemoTradingRuntime}=await import(pathToFileURL(core+'/runtime.mjs'));
const {CompletedExpiryDirection}=await import(pathToFileURL(core+'/completed-expiry-direction.mjs'));
const {analyzeNowOpportunity}=await import(pathToFileURL(core+'/now-opportunity-engine.mjs'));
const rows=JSON.parse(readFileSync(new URL('../tests/fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
const settings={...runtime.settings,engine:'fibonacci_retest',asset:'EUR/GBP OTC',orderDurationMs:30000};
const entries=[];
const median=values=>{const s=[...values].sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:0;};
for(let i=0;i<rows.length;i++){
 const q=rows[i],history=rows.slice(0,i+1);
 const v=runtime._signalValidationGate({analysis:{asset:settings.asset},settings,now:q.ts,
  snap:{provider:'iq_option',quoteHistory:history,price:q.price,quoteTs:q.ts}}).analysis.vnext;
 if(!v.futureEntryAnchor?.entryReadyNow)continue;
 const past=history.filter(p=>p.ts>=q.ts-60000),prior=past.slice(0,-1);
 const movements=past.slice(1).map((p,j)=>Math.abs(p.price-past[j].price)).filter(d=>d>0);
 const step=Math.max(.000001,median(movements));
 const snapshot=structuredClone({...runtime.expiryDirectionSelector,cache:null});
 const analyze=quotes=>{
  const selector=new CompletedExpiryDirection();Object.assign(selector,structuredClone(snapshot));
  const price=quotes.at(-1).price;
  const input={quoteHistory:quotes,price,quoteAt:q.ts,now:q.ts,durationMs:30000,engineId:settings.engine};
  const structural=analyzeNowOpportunity({...input,qualityPolicy:'adaptive-market-v1'});
  const final=analyzeNowOpportunity({...input,qualityPolicy:'adaptive-market-v17',expiryDirectionSelector:selector,expiryDirectionContext:snapshot.context});
  return {structural,final};
 };
 const base=analyze(history);
 if(base.final.ready!==v.nowObservation.ready||base.final.side!==v.nowObservation.side)throw Error('Clone must reproduce the actual decision');
 const variants=[];
 for(const seconds of [0,3,10,30,60])for(const multiplier of [-1,-.5,-.25,.25,.5,1]){
  const delta=step*multiplier,start=q.ts-seconds*1000;
  const changed=history.map(p=>p.ts>start||p.ts===q.ts?{...p,price:p.price+delta*(seconds?Math.max(0,(p.ts-start)/(seconds*1000)):1)}:p);
  const current=changed.at(-1).price;
  const insideObserved60s=current>=Math.min(...prior.map(p=>p.price))&&current<=Math.max(...prior.map(p=>p.price));
  const result=analyze(changed);
  variants.push({seconds,multiplier,delta,insideObserved60s,
   structural:{ready:result.structural.ready,side:result.structural.side,reason:result.structural.reason},
   final:{ready:result.final.ready,side:result.final.side,reason:result.final.reason}});
 }
 const prefixAblations=[30,60,120].map(seconds=>({seconds,...analyze(history.filter(p=>p.ts>=q.ts-seconds*1000))}));
 const bodyAgreement=Object.fromEntries([5,10,30,60].map(seconds=>{
  const origin=[...history].reverse().find(p=>p.ts<=q.ts-seconds*1000);
  const direction=origin?(q.price>origin.price?'CALL':q.price<origin.price?'PUT':null):null;
  return [seconds,{direction,agrees:direction?direction===base.final.side:null}];
 }));
 entries.push({at:q.ts,videoOffsetSeconds:(q.ts-rows[0].ts)/1000,step,base,variants,prefixAblations,bodyAgreement});
}
const summarize=seconds=>{
 const variants=entries.flatMap(e=>e.variants.filter(v=>v.seconds===seconds&&v.insideObserved60s).map(v=>({base:e.base,...v})));
 return {seconds,insideObservedRange:variants.length,
  sideFlips:variants.filter(v=>v.final.ready&&v.final.side!==v.base.final.side).length,
  admissionRemoved:variants.filter(v=>!v.final.ready).length,
  structureSideFlips:variants.filter(v=>v.structural.ready&&v.structural.side!==v.base.structural.side).length,
  structureAdmissionRemoved:variants.filter(v=>!v.structural.ready).length};
};
const report={purpose:'Counterfactual quote sensitivity, NOT market accuracy. Same recorded video, no pre-video historical candles, selector outcomes frozen.',
 baselineVersion:'13.9.33',entries:entries.length,windows:[0,3,10,30,60].map(summarize),
 bodyAgreement:Object.fromEntries([5,10,30,60].map(seconds=>[seconds,{
  aligned:entries.filter(e=>e.bodyAgreement[seconds].agrees===true).length,
  opposed:entries.filter(e=>e.bodyAgreement[seconds].agrees===false).length,
  neutralOrUnavailable:entries.filter(e=>e.bodyAgreement[seconds].agrees==null).length}])),details:entries};
writeFileSync(new URL('../reports/sentinel-current-candle-influence-20261017.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,details:undefined},null,2));

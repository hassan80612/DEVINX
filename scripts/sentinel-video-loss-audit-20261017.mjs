// Audit production decisions on an already-seen recorded quote extraction.
// Post-entry prices below are evaluation ONLY; runtime receives past quotes.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const core=process.argv[2];if(!core)throw Error('Pass the production core directory');
const {DemoTradingRuntime}=await import(pathToFileURL(core+'/runtime.mjs'));
const {analyzeNowOpportunity}=await import(pathToFileURL(core+'/now-opportunity-engine.mjs'));
const {thirtySecondCycleForecast}=await import(pathToFileURL(core+'/thirty-second-expiry-direction.mjs'));
const results=[];
for(const name of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
 const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/'+name,import.meta.url))),rows=fixture.quoteHistory;
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 const settings={...runtime.settings,engine:'fibonacci_retest',asset:'EUR/GBP OTC',orderDurationMs:30000};
 let choice;
 const observe=runtime.expiryDirectionSelector.observe.bind(runtime.expiryDirectionSelector);
 runtime.expiryDirectionSelector.observe=args=>{
  const selected=observe(args);
  choice={baseline:{...args.baseline},selected:{...selected},completed:runtime.expiryDirectionSelector.completed,
   loss:{...runtime.expiryDirectionSelector.loss}};
  return selected;
 };
 const entries=[];
 const at=t=>rows.find(q=>q.ts>=t&&q.ts<=t+1000)??null;
 for(let i=0;i<rows.length;i++){
  const q=rows[i],history=rows.slice(0,i+1);
  const args={quoteHistory:history,price:q.price,quoteAt:q.ts,now:q.ts,durationMs:30000,engineId:settings.engine};
  const v=runtime._signalValidationGate({analysis:{asset:settings.asset},settings,now:q.ts,
   snap:{provider:'iq_option',quoteHistory:history,price:q.price,quoteTs:q.ts}}).analysis.vnext;
  const entry=v.futureEntryAnchor;if(!entry?.entryReadyNow)continue;
  const end=at(entry.exitAt),delta=end?end.price-entry.entryPrice:null;
  const actualSide=delta==null||delta===0?null:delta>0?'CALL':'PUT';
  const future=rows.filter(p=>p.ts>=q.ts&&p.ts<=entry.exitAt);
  const past=history.filter(p=>p.ts>=q.ts-60000);
  const movements=Object.fromEntries([2,5,10,20,30,60,120].map(s=>{
   const origin=[...history].reverse().find(p=>p.ts<=q.ts-s*1000&&p.ts>=q.ts-s*1000-1500);
   return [s,origin?q.price-origin.price:null];
  }));
  entries.push({at:q.ts,videoOffsetSeconds:(q.ts-rows[0].ts)/1000,side:entry.side,price:q.price,exitAt:entry.exitAt,
   exitPrice:end?.price??null,result:delta==null?'missing':delta===0?'tie':actualSide===entry.side?'win':'loss',
   actualSide,observation:v.nowObservation,selector:choice,
   structural:analyzeNowOpportunity({...args,qualityPolicy:'adaptive-market-v1'}),
   narrow:thirtySecondCycleForecast(args),wide:thirtySecondCycleForecast({...args,periodSearch:'wide'}),
   pastMoves:movements,past60:{high:Math.max(...past.map(p=>p.price)),low:Math.min(...past.map(p=>p.price))},
   afterEntry:Object.fromEntries([5,10,15,20,25,30].map(s=>[s,at(q.ts+s*1000)?.price??null])),
   excursion:{high:Math.max(...future.map(p=>p.price)),low:Math.min(...future.map(p=>p.price))}});
 }
 const scored=entries.filter(e=>e.actualSide);
 const matched=Object.fromEntries(['structural','narrow','wide'].map(kind=>[kind,{
  ready:scored.filter(e=>e[kind].ready).length,
  wins:scored.filter(e=>e[kind].ready&&e[kind].side===e.actualSide).length,
  changes:scored.filter(e=>e[kind].ready&&e[kind].side!==e.side).map(e=>({at:e.at,was:e.result,wouldBe:e[kind].side===e.actualSide?'win':'loss'}))
 }]));
 results.push({file:name,sourceSha256:fixture.sourceSha256,historicalCandlesAvailable:false,matched,entries});
 console.log(JSON.stringify({file:name,matched,losses:entries.filter(e=>e.result==='loss')},null,2));
}
writeFileSync(new URL('../reports/sentinel-video-loss-audit-20261017.json',import.meta.url),JSON.stringify({
 purpose:'Retrospective diagnostic of the same recorded prices; no measured live accuracy or reconstructed historical candles.',results},null,2)+'\n');

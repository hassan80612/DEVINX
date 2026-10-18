// Isolated instrumentation and one registered conflict-priority candidate.
// Production code is copied unchanged; all instrumentation stays in tmpdir.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function decisionPriorityResearchRuntime({preserveConflict=false}={}){
 const path=mkdtempSync(join(tmpdir(),'sentinel-decision-priority-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 const file=join(path,'now-opportunity-engine.mjs'),source=readFileSync(file,'utf8');
 const marker='delete located.pendingForecast;';
 if(source.split(marker).length!==2)throw Error('Unexpected decision engine');
 const extra=`
  const veto=['historical-level-reactions-conflict','historical-level-versus-expiry-conflict','historical-level-pressure-unconfirmed'].includes(historical.reason)&&!historical.ready;
  const bypass=veto&&located.ready&&!located.priceStructure?.observedSequence?.structureChange;
  const stage=x=>({ready:x.ready,side:x.side??null,reason:x.reason});
  lastDecisionTrace={original:stage(original),decision:stage(decision),historical:stage(historical),candle:stage(candleLocated),sequence:stage(located),
   bypass,historicalCandles:structure.candles,
   reactionZone:located.priceStructure?.candleRoute?.event?.zone??located.priceStructure?.reaction?.zone??null};
  ${preserveConflict?"if(bypass)located={...located,ready:false,side:null,reason:historical.reason};":''}
  lastDecisionTrace.final=stage(located);
  lastHistoryAlternative=alternateCandles=>{
   const other=historicalPriceStructure({candles:alternateCandles,now});
   const h=applyHistoricalPriceStructure({candidate:{...decision,pendingForecast:selectedForecast},structure:other,...input});
   const c=applyCandleLevelRoute({candidate:h,map:other.candleLevelMap,...input});
   return stage(applyObservedLevelSequence({candidate:c,map:other.candleLevelMap,...input}));
  };
  ${marker}`;
 writeFileSync(file,'export let lastDecisionTrace=null,lastHistoryAlternative=null;\n'+source
  .replace('const located=applyObservedLevelSequence(','let located=applyObservedLevelSequence(')
  .replace(marker,extra));
 const module=await import(pathToFileURL(file));
 const {DemoTradingRuntime:Base}=await import(pathToFileURL(join(path,'runtime.mjs')));
 const entries=[];
 class DemoTradingRuntime extends Base{
  _signalValidationGate(input){
   const result=super._signalValidationGate(input),entry=result.analysis.vnext?.futureEntryAnchor;
   if(entry?.entryReadyNow){
    const latest=input.snap.candles?.at(-1);
    const side=d=>d>0?'CALL':d<0?'PUT':null;
    const start=Math.floor(input.now/60000)*60000;
    const first=input.snap.quoteHistory.find(q=>q.ts>=start);
    entries.push({at:entry.entryAt,...module.lastDecisionTrace,
     historyAlternatives:Object.fromEntries([0,1,3,10,20,50].map(n=>[n,module.lastHistoryAlternative(n?input.snap.candles.slice(-n):[])])),
     lastClosedCandle:latest?side(latest.close-latest.open):null,
     formingCandle:first&&first.ts-start<=2500?side(input.snap.price-first.price):null});
   }
   return result;
  }
 }
 return {DemoTradingRuntime,entries,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}

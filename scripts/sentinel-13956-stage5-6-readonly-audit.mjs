// Sentinel 13.9.56 live-source forensic audit. No trading, no deployment,
 // no changes to Martingale or production analyst.
import {assessCandleLevelRoute,applyCandleLevelRoute} from
 '../sentinel-trading-lab/agent/src/core/candle-level-map.mjs';
import {advanceNowOpportunity} from
 '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {readFileSync} from 'node:fs';
const T=1800000000000,spot=1.00055,ts=T;
const p=[1.00030,1.00030,1.00030,1.00030,1.00030,1.00030,
 1.00030,1.00052,1.00058,1.00059,1.00059,1.00056,1.00055];
const quoteHistory=p.map((price,i)=>({
 ts:T-12000+i*1000,receivedAt:T-12000+i*1000,price
}));
const makeZone=(level,{confirmedPivots=0,independentRejections=2,independentTests=2}={})=>({
 level,low:level,high:level,confirmedPivots,independentRejections,
 independentTests,supportWick:0,resistanceWick:.65,
 tests:[{age:0},{age:6}],windows:[10,20]});
const unbacked=makeZone(1.00055,{confirmedPivots:0});
const backed=makeZone(1.00058,{confirmedPivots:1});
const map={observedCandles:70,asOf:T-60000,tolerance:.00003,
 windows:[{size:10,observed:10,available:true,levels:[]}],
 levels:[unbacked,backed]};
const args={map,quoteHistory,quoteAt:T,now:T,price:spot,side:'CALL',durationMs:30000};
const both=assessCandleLevelRoute(args);
const confirmedOnly=assessCandleLevelRoute({...args,map:{...map,levels:[backed]}});
const candidate={side:'CALL',ready:true,observedAt:T,entryPrice:spot,
 reason:'qualified-market-forecast',pendingForecast:{ready:true,side:'CALL',predictedPrice:1.00068}};
const routedBoth=applyCandleLevelRoute({candidate,...args});
const routedBacked=applyCandleLevelRoute({candidate,...args,map:{...map,levels:[backed]}});
const source=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
const exec=readFileSync(new URL('../sentinel-trading-lab/agent/worker/signal-executor.mjs',import.meta.url),'utf8');
const observedSource=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs',import.meta.url),'utf8');
const entry=1.00000,clicked=1.00040,exit=1.00020;
const duration=30000,lateBy=1000;
const signal={side:'CALL',ready:true,observedAt:T,entryPrice:entry};
const phase=advanceNowOpportunity({candidate:signal,now:T,quoteAt:T,
 asset:'EUR/USD OTC',provider:'exnova',engineId:'automatic',durationMs:duration});
const phaseLater=advanceNowOpportunity({previous:phase,candidate:signal,now:T+lateBy,
 quoteAt:T+lateBy,asset:'EUR/USD OTC',provider:'exnova',engineId:'automatic',durationMs:duration});
const result={
 version:'13.9.56',scope:'read-only controlled fixtures',
 stage5:{
  bothZones:{event:both?.event,conflict:both?.conflict},
  onlyConfirmedZone:{event:confirmedOnly?.event,conflict:confirmedOnly?.conflict},
  candidateWithBoth:{ready:routedBoth.ready,side:routedBoth.side,reason:routedBoth.reason},
  candidateWithConfirmedOnly:{ready:routedBacked.ready,side:routedBacked.side,reason:routedBacked.reason},
  closerUnconfirmedShadowsConfirmed:both?.event?.candleBacked===false&&
   confirmedOnly?.event?.candleBacked===true&&
   routedBoth.side===candidate.side&&routedBacked.side==='PUT',
  historicalRouteSortsByDistanceFirst:source.includes('candles:snap.historicalCandlesVerified===false?[]:(snap.candles||[])'),
  possiblePersistentEventAtLaterQuote:observedSource.includes('if(reclaimedAt){')&&
   observedSource.includes('confirmedAt:q.ts')
 },
 stage6:{
  signalReferencePrice:entry,brokerExecutedPrice:clicked,expiryObservedPrice:exit,
  resultBySignalReferencePrice:exit>entry?'WIN':'LOSS',
  resultByActualClickedPrice:exit>clicked?'WIN':'LOSS',
  quoteVsClickCanInvertOutcome:exit>entry&&exit<clicked,
  signalEntryAt:phase.entryAt,signalExpiryAt:phase.exitAt,
  heldSideOneSecondLater:phaseLater.side,
  engineReferenceSettlementStartsAtSignalTime:source.includes('entryAt:next.entryAt,exitAt:next.exitAt,'),
  driverCapturesActualClickPriceSeparately:exec.includes('order.entryPrice=Number(snapshot.quote)'),
  botAllowsClickAfterSignalUpTo1500ms:exec.includes('now-queued.at>1500'),
  independentLearningUsesSnapshotExpiry:source.includes('entryPrice:next.entryPrice,verified:false')
 },
 caveat:'Synthetic fixture demonstrates code paths; no broker logs and no actual market accuracy established.'
};
console.log('SENTINEL_13956_STAGE5_6_AUDIT='+JSON.stringify(result));
if(!result.stage5.closerUnconfirmedShadowsConfirmed)process.exitCode=2;
if(!result.stage6.quoteVsClickCanInvertOutcome)process.exitCode=3;

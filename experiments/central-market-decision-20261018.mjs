import {assessCandleLevelRoute} from './candle-level-map.mjs';
import {observedLevelSequence} from './observed-level-sequence.mjs';
import {closedCandleDmi} from './closed-candle-dmi-20261018.mjs';

// Single decision point. Historical/candle/sequence observations are evidence,
// not independent votes or successive writers of an already issued signal.
export function resolveCentralMarketDecision({decision,historical,structure,candles=[],
 quoteHistory,price,quoteAt,now,durationMs=30000,regimePolicy=true,regimeOverride=null}={}){
 if(durationMs!==30000)return historical;
 const input={quoteHistory,price,quoteAt,now},map=structure.candleLevelMap;
 const pending=historical.pendingForecast;
 const route=assessCandleLevelRoute({map,...input,side:historical.side??pending?.side,targetPrice:pending?.predictedPrice});
 const sequence=observedLevelSequence({map,...input});
 const regime=regimeOverride??closedCandleDmi({candles,now});
 const event=route?.event;
 const candleRejection=durationMs===30000&&event?.kind==='rejection'&&event.candleBacked&&!route.conflict;
 const reaction=candleRejection?event:historical.reason==='historical-level-rejection'?historical.priceStructure?.reaction:null;
 const provisionalReady=candleRejection||historical.ready;
 const structuralEvent=sequence?.structureChange??(provisionalReady?sequence?.continuation:null);
 const priceStructure={...historical.priceStructure,...(route?{candleRoute:route}:{}),...(sequence?{observedSequence:sequence}:{})};
 const basis={regime,projectionSide:decision?.side??null,reactionSide:reaction?.side??null,
  source:'base',structuralEvent:structuralEvent?.kind??null};
 // A confirmed reclaim/retest is a change in price structure. ADX is lagging
 // and cannot veto an actual confirmed change merely because the old trend is strong.
 if(durationMs===30000&&structuralEvent)return {...historical,ready:true,side:structuralEvent.side,
  observedAt:Number(quoteAt),entryPrice:Number(price),predictedPrice:null,expectedLogMove:null,
  reason:structuralEvent.kind,priceStructure,decisionBasis:{...basis,source:'observed-structure-change'}};
 const strongRising=regime.ready&&regime.regime==='trend'&&regime.side&&
  (regime.previousAdx===null||regime.adx>=regime.previousAdx);
 if(regimePolicy&&reaction&&strongRising&&reaction.side!==regime.side)
  return {...historical,ready:false,side:null,reason:'countertrend-rejection-without-structure-change',
   priceStructure,decisionBasis:{...basis,source:'unresolved-reversal'}};
 if(candleRejection){
  const contradicted=pending?.ready&&pending.side!==event.side;
  if(route.side!==event.side){
   const departure=assessCandleLevelRoute({map,...input,side:event.side,targetPrice:contradicted?undefined:pending?.predictedPrice});
   route.side=event.side;route.nextLevels=departure.nextLevels;
  }
  if(contradicted)route.discardedProjection={side:pending.side,predictedPrice:pending.predictedPrice};
  return {...historical,...(contradicted?{predictedPrice:null,expectedLogMove:null}:{}),ready:true,side:event.side,
   observedAt:Number(quoteAt),entryPrice:Number(price),reason:'multiscale-candle-rejection',priceStructure,
   decisionBasis:{...basis,source:'confirmed-level-reaction'}};
 }
 return {...historical,priceStructure,decisionBasis:{...basis,source:reaction?'historical-reaction':'base'}};
}

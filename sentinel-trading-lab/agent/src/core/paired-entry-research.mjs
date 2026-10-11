/**
 * Sentinel 13.4.74 research-only complementary two-strategy evaluation.
 * The production single-owner VNext remains unchanged. These are ANALYSES,
 * not orders, calibrated probabilities, or retrospectively confirmed signals.
 */
import {singleEngineForecast as forecast67} from './research-baseline-13467/vnext-single-engine.mjs';
import {singleEngineForecast as forecast70} from './vnext-single-engine.mjs';
import {historicalFuturePath,conditionalPathWindow} from './forward-path-research.mjs';

export const RESEARCH_PAIRS=Object.freeze([
 Object.freeze({id:'reversal',label:'Reversão e estrutura',first:{engine:'mean_reversion',version:70},second:{engine:'smart_confluence',version:67},default:true}),
 Object.freeze({id:'levels_breakout',label:'Níveis e rompimento',first:{engine:'support_resistance',version:67},second:{engine:'breakout',version:67}}),
 Object.freeze({id:'retest',label:'Retração e reteste',first:{engine:'mean_reversion',version:70},second:{engine:'fibonacci_retest',version:70}})
]);
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export function researchPair(id='reversal'){return RESEARCH_PAIRS.find(p=>p.id===String(id))||RESEARCH_PAIRS[0]}
function projectedWindow({strategy,snap,now,leadSeconds,holdingSeconds,settings}){
 const predict=strategy.version===67?forecast67:forecast70;
 const run=seconds=>predict({
  snap,now,provider:snap.provider,
  settings:{...settings,engine:strategy.engine,orderDurationMs:seconds*1000}
 }).receipt;
 const entry=run(leadSeconds),exit=run(leadSeconds+holdingSeconds);
 if(!entry||!exit||entry.engineId!==strategy.engine||exit.engineId!==strategy.engine||
   entry.issuedAt!==exit.issuedAt||entry.asset!==exit.asset||
   entry.targetAt!==now+leadSeconds*1000||exit.targetAt!==now+(leadSeconds+holdingSeconds)*1000)
  return {strategy,side:null,status:'unavailable'};
 const priceAtEntry=positive(entry.projectedPrice),priceAtExit=positive(exit.projectedPrice);
 const logDelta=priceAtEntry&&priceAtExit?Math.log(priceAtExit/priceAtEntry):null;
 const side=logDelta!=null&&Math.abs(logDelta)>1e-11?(logDelta>0?'CALL':'PUT'):null;
 return {strategy,side,logDelta,
  priceAtEntry,priceAtExit,status:side?'estimate':'no-movement',
  quoteTime:entry.quoteReceivedAt,asOf:entry.issuedAt,verified:false};
}
export function pairedEntryResearch({settings={},snap={},now=Date.now(),mode='fixed',pairId='reversal',
 leadSeconds=30,holdingSeconds=60,autoDelays=[5,10,30,60,120]}={}){
 const pair=researchPair(pairId),hold=positive(holdingSeconds);
 const entryMode=mode==='automatic'?'automatic':'fixed';
 const lead=positive(leadSeconds);
 if(!hold||hold>900||(entryMode==='fixed'&&(!lead||lead>900)))
  return {status:'invalid-entry-or-holding-time',actionable:false};
 const leads=entryMode==='fixed'?[lead]:
  [...new Set(autoDelays.map(Number).filter(v=>v>=5&&v<=300))].sort((a,b)=>a-b);
 if(!leads.length)return {status:'no-entry-candidates',actionable:false};
 const path=historicalFuturePath({quoteHistory:snap.quoteHistory,asOf:now,
  horizonSeconds:Math.max(...leads)+hold});
 const alternatives=[];
 for(const delay of leads){
  const first=projectedWindow({strategy:pair.first,snap,now,leadSeconds:delay,holdingSeconds:hold,settings});
  const second=projectedWindow({strategy:pair.second,snap,now,leadSeconds:delay,holdingSeconds:hold,settings});
  const trajectory=conditionalPathWindow(path,delay,hold);
  let side=null,decision='INSUFFICIENT_EVIDENCE';
  if(first.side&&first.side===second.side){
   // Two correlated models can share the same error. A trajectory with
   // strong contrary evidence blocks the apparent agreement.
   const contrary=trajectory.referenceSide&&trajectory.referenceSide!==first.side&&
       trajectory.observedNeighborShare>=.66;
   if(!contrary){side=first.side;decision='AGREEMENT_UNCALIBRATED'}
   else decision='CONTRADICTED_BY_HISTORICAL_PATH'
  }else if(first.side&&second.side&&first.side!==second.side){
   // A measured-in-the-past independent path, not addition of percentages,
   // chooses one owner only when its comparison is unusually strong.
   if(trajectory.side&&trajectory.observedNeighborShare>=.75&&
       (trajectory.side===first.side||trajectory.side===second.side)){
    side=trajectory.side;decision='HISTORICAL_PATH_TIEBREAK_UNCALIBRATED'
   }else decision='CONFLICT_ABSTAIN';
  }
  // A reliable future-path estimate is mandatory for automatic timing;
  // a fixed forecast remains visible as research when path history is sparse.
  if(entryMode==='automatic'&&(!trajectory.side||side!==trajectory.side)){
   side=null;decision='AUTO_TIMING_UNQUALIFIED';
  }
  const base=trajectory.projectedEntryPrice,exit=trajectory.projectedExitPrice;
  const logAdvantage=base>0&&exit>0?Math.abs(Math.log(exit/base)):0;
  const directionalAgreement=Number(trajectory.observedNeighborShare||0);
  const ranking=side?logAdvantage*clamp(directionalAgreement-.5,0,1):0;
  alternatives.push({pairId:pair.id,leadSeconds:delay,holdingSeconds:hold,side,decision,
   first,second,trajectory,ranking,entryAt:now+delay*1000,exitAt:now+(delay+hold)*1000});
 }
 // Automatic timing is selected from evidence available at issuance.
 // No guessed timestamp is promoted when every candidate fails.
 const eligible=alternatives.filter(x=>x.side);
 eligible.sort((a,b)=>b.ranking-a.ranking);
 const selected=entryMode==='fixed'?alternatives[0]:(eligible[0]||null);
 return {status:selected?.side?'research-candidate':'no-qualified-forecast',
  mode:entryMode,pairId:pair.id,pairLabel:pair.label,
  selected,alternatives,referenceAt:now,holdingSeconds:hold,
  historyStatus:path.status,historyComparisons:path.comparisons||0,
  extremeTimes:path.ready?path.extremeTimes:null,
  futurePath:path.ready?path.expectedPath:[],
  actionable:false,calibrated:false,
  reason:'Experimento sem assertividade calibrada; nenhuma ordem automática.'};
}
/**
 * Read-only transition logic. A revision/cancellation is not a rewrite:
 * return the ORIGINAL anchor separately for honest future scoring.
 */
export function reconcileEntryPreview({previous=null,research=null,now=Date.now()}={}){
 const selected=research?.selected||null;
 const mode=research?.mode||'fixed';
 if(previous&&now>=previous.entryAt)
  return {current:null,archived:previous,event:'ENTRY_TIME_REACHED'};
 if(!previous)return selected?.side?{current:{...selected,issuedAt:now,mode},archived:null,event:'CREATED'}:
  {current:null,archived:null,event:'AWAITING_EVIDENCE'};
 if(mode==='fixed'){
  // Preserve the selected CLOCK time. Reversal may invalidate its direction,
  // but cannot move the scheduled timestamp or mutate previous forecast.
  const valid=selected?.side===previous.side;
  return {current:{...previous,invalidated:!valid},archived:null,
   event:valid?'FIXED_CLOCK_PRESERVED':'FIXED_WARNING_DIRECTION_INVALIDATED'};
 }
 const same=selected?.side===previous.side&&research?.pairId===previous.pairId&&
   selected?.holdingSeconds===previous.holdingSeconds;
 if(same)return {current:previous,archived:null,event:'UNCHANGED'};
 return {current:selected?.side?{...selected,issuedAt:now,mode}:null,
  archived:previous,event:selected?.side?'REVISED_WITH_ARCHIVE':'CANCELLED_WITH_ARCHIVE'};
}

/**
 * Three-minute (180s) SHADOW forecast guard for the user-selected strategy.
 * Each of Sentinel's nine independent strategies keeps its original VNext
 * model; evidence from complete analogous FUTURE paths is a second opinion.
 * Nothing here asserts a win probability or authorizes broker execution.
 */
import {selectedScenarioEngine} from './scenario-engine-catalog.mjs';
import {singleEngineForecast} from './vnext-single-engine.mjs';
import {historicalFuturePath,conditionalPathWindow} from './forward-path-research.mjs';
export const GENERAL_FORECAST_HORIZON_SECONDS=180;

export function threeMinuteGeneralResearch({
 settings={},snap={},now=Date.now(),baseline=null,precomputedPath=null
}={}){
 const selected=selectedScenarioEngine(settings).id;
 const seconds=GENERAL_FORECAST_HORIZON_SECONDS;
 const original=baseline?.engineId===selected&&
     Number(baseline?.expirySeconds)===seconds?
   baseline:singleEngineForecast({settings:{...settings,engine:selected,
     orderDurationMs:seconds*1000},snap,now,provider:snap.provider});
 const reference=original?.receipt||null;
 const history=Array.isArray(snap?.researchQuoteHistory)&&snap.researchQuoteHistory.length?
    snap.researchQuoteHistory:snap.quoteHistory;
 const trajectory=precomputedPath||historicalFuturePath({
  quoteHistory:history,asOf:now,horizonSeconds:seconds,
  requestedOffsets:[0,seconds]
 });
 const conditional=conditionalPathWindow(trajectory,0,seconds);
 const baselineSide=['CALL','PUT'].includes(reference?.side)?reference.side:null;
 const pathSide=['CALL','PUT'].includes(conditional.side)?conditional.side:null;
 const agreed=!!baselineSide&&!!pathSide&&baselineSide===pathSide;
 const reason=!baselineSide?'baseline-unavailable':
  !trajectory.ready?'historical-path-unavailable':
  !pathSide?'path-does-not-have-qualified-direction':
  baselineSide!==pathSide?'trajectory-disagrees-with-strategy':
  'independent-historical-confirmation';
 return {
  engineId:selected,horizonSeconds:seconds,referenceAt:now,
  baselineSide,baselineProjectedPrice:reference?.projectedPrice??null,
  baselineIssuedAt:reference?.issuedAt??null,
  baselineTargetAt:reference?.targetAt??null,
  pathSide,confirmedSide:agreed?baselineSide:null,
  status:agreed?'research-confirmed':'research-abstain',
  reason,
  // Raw analogous outcome share is not a win rate, and is NOT shown as one.
  historicalDirectionalShare:conditional.observedNeighborShare??null,
  historicalNeighbors:conditional.independentNeighbors??0,
  historicalStatus:trajectory.status,possibleExtremes:trajectory.ready?
    trajectory.extremeTimes:null,
  projectedPath:trajectory.ready?trajectory.expectedPath:[],
  baselineUnmodified:true,actionable:false,calibrated:false,
  probability:null,
  qualification:'Requer amostras DEMO futuras e auditoria por prazo antes de validar.'
 };
}

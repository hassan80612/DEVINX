/**
 * Sentinel automatic scenario OWNER: changes the actual model used for
 * price/expiry predictions, not merely a UI recommendation.
 *
 * Experimental, versioned and auditable. It never sends orders and never
 * overrides a manually selected strategy.
 */
import {selectedScenarioEngine} from './scenario-engine-catalog.mjs';
import {strategyHorizonAdvisor} from './strategy-horizon-advisor.mjs';
export function resolveForecastOwner({settings={},snap={},now=Date.now()}={}){
 const selected=selectedScenarioEngine(settings).id;
 const base={requestedEngine:selected,effectiveEngine:selected,
  active:false,switched:false,reason:'manual-choice',phase:null,
  evaluatedHorizonSeconds:Number(settings.orderDurationMs)/1000,
  requiresOutcomeValidation:true,actionable:false};
 if(selected!=='automatic')return base;
 if(settings.autoRoutingEnabled!==true)return {...base,reason:'automatic-routing-disabled'};
 const quotes=Array.isArray(snap.researchQuoteHistory)&&snap.researchQuoteHistory.length>0?
  snap.researchQuoteHistory:snap.quoteHistory;
 const advice=strategyHorizonAdvisor({settings:{...settings,
  engine:'automatic',strategyAdvisorMode:'automatic_advisory'},
  quoteHistory:quotes||[],asOf:now});
 const recommended=advice.recommended?.engineId;
 const safe=advice.status==='experimental-advice'&&!advice.volatilityShift&&
  advice.marketPhase!=='mixed'&&Number(advice.requestedHoldingSeconds)>0;
 const effective=safe&&recommended&&recommended!=='automatic'?recommended:'automatic';
 return {...base,active:true,effectiveEngine:effective,switched:effective!=='automatic',
  reason:effective!=='automatic'?'qualified-context-route':'automatic-native-fallback',
  phase:advice.marketPhase,marketLabel:advice.marketPhaseLabel,
  evaluatedHorizonSeconds:advice.requestedHoldingSeconds,
  rationale:effective!=='automatic'?'Estratégia escolhida pelo prazo e comportamento histórico':null,
  sourceQuoteAt:quotes?.at(-1)?.ts??null};
}

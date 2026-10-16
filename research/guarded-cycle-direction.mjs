// OFFLINE ONLY. Fixed follow-up to the 71.4% candidate's observed failure:
// a fitted old wave must explain current observed movement before it may
// override the existing direction. Reuse the baseline, never block an entry.
import {analyzeNowOpportunity as published} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {thirtySecondCycleForecast} from './thirty-second-cycle-forecast.mjs';
export const guardHypothesis=Object.freeze({
 velocity:'Retain published side when actual 3s AND 10s moves both oppose fitted moves over those SAME past intervals.',
 residual:'Retain published side when current price residual exceeds twice the fitted historical RMS residual.',
 combined:'Retain published side when either fixed condition is met.',
 timing:'Same published admission and entry time; no time confirmation, cooldown, confidence threshold or deletion of calls.',
 thresholds:'No optimization against video outcomes; all guard variants retained in report.'
});
export function phaseInvalidity(d,guard='velocity'){
 if(!['velocity','residual','combined'].includes(guard))throw Error('Unknown phase guard');
 const available=d&&['observed3','observed10','fitted3','fitted10','currentResidual','residualRms'].every(k=>Number.isFinite(d[k]));
 if(!available)return 'missing-current-phase-observations';
 const velocity=d.observed3*d.fitted3<0&&d.observed10*d.fitted10<0;
 const residual=Math.abs(d.currentResidual)>2*d.residualRms;
 if((guard==='velocity'||guard==='combined')&&velocity)return 'old-phase-opposes-observed-3s-and-10s';
 if((guard==='residual'||guard==='combined')&&residual)return 'current-price-outside-fitted-residual-range';
 return null;
}
export function guardedCycleDirection(input,{guard='velocity'}={}){
 const base=published(input);if(!base.ready)return base;
 const f=thirtySecondCycleForecast(input,{withDiagnostics:true});if(!f.ready)return base;
 const reason=phaseInvalidity(f.diagnostics,guard);
 return reason?{...base,researchGuard:reason}:
  {...base,...f,reason:'research-30s-cycle-'+guard+'-guard'};
}

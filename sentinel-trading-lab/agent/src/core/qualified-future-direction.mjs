/**
 * Prospective confirmation filter for ONE selected horizon.
 * The underlying Sentinel forecast is still evaluated in the audit ledger.
 * No training on quotes after issuance, broker actions, or win-rate claim.
 */
import {historicalFuturePath,conditionalPathWindow} from './forward-path-research.mjs';
export function qualifyFutureDirection({receipt=null,quoteHistory=[],asOf=Date.now()}={}){
 const h=Number(receipt?.expirySeconds);
 if(!receipt||!['CALL','PUT'].includes(receipt.side)||!Number.isFinite(h)||h<5||h>1800)
  return {enabled:true,confirmed:false,side:null,status:'no-reference-forecast',actionable:false,calibrated:false};
 const path=historicalFuturePath({quoteHistory,asOf,horizonSeconds:h,requestedOffsets:[0,h]});
 const window=conditionalPathWindow(path,0,h);
 const confirmed=path.ready&&window.side===receipt.side;
 return {enabled:true,confirmed,side:confirmed?receipt.side:null,
  originalSide:receipt.side,expirySeconds:h,
  status:confirmed?'confirmed-by-historical-path':path.ready?'awaiting-confirmation':'warming-up-history',
  referenceAt:Number(asOf),referenceTargetAt:receipt.targetAt,
  historicalNeighbors:window.independentNeighbors||0,
  // This is the observed SHARE among past analogs, not trading accuracy.
  historyShare:window.observedNeighborShare??null,
  actionable:false,calibrated:false};
}
export function applyQualifiedDisplay({model=null,qualification=null}={}){
 if(!model||qualification?.enabled!==true||qualification.confirmed===true)return model;
 return {...model,
  computedStatus:'awaiting-historical-confirmation',
  receipt:null,plan:null,projection:null,scenarioProjection:null,
  operational:{...model.operational,side:'AGUARDAR',ready:false,actionable:false,
    scenarioProjection:null,
    reason:'Previsão não confirmada pelo histórico. Aguardar; não operar por este sinal.'},
  reason:'Previsão não confirmada pelo histórico. Aguardar.',
  // Never discard the true original receipt in the INTERNAL ledger.
  qualifiedDisplayOnly:true
 };
}

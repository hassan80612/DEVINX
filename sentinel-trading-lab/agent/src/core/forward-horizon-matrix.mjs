import {singleEngineForecast} from './vnext-single-engine.mjs';

// Each horizon runs the SAME user-selected engine against the SAME historical
// quote snapshot. Forecast side is derived from an expected FUTURE price,
// never from the colour/direction of the current candle or the other motors.
export const FORWARD_HORIZONS=Object.freeze([5,10,30,60,120,300]);
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
export function forwardHorizonMatrix({settings={},snap={},now=Date.now(),primary=null,previous=null}={}){
  const selected=positive(settings.orderDurationMs)&&Number(settings.orderDurationMs)/1000;
  const horizon=selected||60;
  const quoteAt=positive(snap.quoteTs);
  const last=Array.isArray(snap.quoteHistory)?snap.quoteHistory.at(-1):null;
  const context=JSON.stringify([
    settings.engine,settings.asset,horizon,quoteAt,Number(last?.ts)||0,
    Number(last?.price)||0,Array.isArray(snap.quoteHistory)?snap.quoteHistory.length:0
  ]);
  const horizons=[...new Set([...FORWARD_HORIZONS,horizon])].sort((a,b)=>a-b);
  // No arbitrary delay: re-evaluate as soon as the source quote or selected
  // context changes, not every redundant 400ms worker tick.
  if(previous?.context===context&&Array.isArray(previous.rows)){
    const rows=previous.rows.map(row=>row.horizonSeconds===horizon?
      rowFor(primary,horizon):row).filter(Boolean);
    return {context,rows,computedAt:previous.computedAt,reused:true};
  }
  const rows=[];
  for(const seconds of horizons){
    const model=seconds===horizon&&primary?
      primary:singleEngineForecast({
        settings:{...settings,orderDurationMs:seconds*1000},
        snap,now,provider:snap.provider
      });
    rows.push(rowFor(model,seconds));
  }
  return {context,rows,computedAt:now,reused:false};
}
function rowFor(model,h){
  const receipt=model?.receipt;
  if(!receipt||receipt.expirySeconds!==h||!['CALL','PUT'].includes(receipt.side)){
    return {horizonSeconds:h,side:null,projectedPrice:null,
      referencePrice:null,issuedAt:null,targetAt:null,status:model?.computedStatus||'unavailable'};
  }
  return {horizonSeconds:h,side:receipt.side,
    referencePrice:receipt.referencePrice,projectedPrice:receipt.projectedPrice,
    issuedAt:receipt.issuedAt,targetAt:receipt.targetAt,status:'forecast',
    // Indicates a future-price estimate. Not an order, entry, or win-rate.
    actionable:false};
}

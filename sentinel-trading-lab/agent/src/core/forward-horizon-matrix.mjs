import {singleEngineForecast} from './vnext-single-engine.mjs';
import {futureEntrySchedule} from './future-entry-schedule.mjs';

// Each horizon runs the SAME user-selected engine against the SAME historical
// quote snapshot. Forecast side is derived from an expected FUTURE price,
// never from the colour/direction of the current candle or the other motors.
export const FORWARD_HORIZONS=Object.freeze([5,10,30,60,120,300]);
const positive=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
export function forwardHorizonMatrix({settings={},snap={},now=Date.now(),primary=null,previous=null,forecastModel='original-67',adaptiveHistory=null,activeWindow=null}={}){
  const selected=positive(settings.orderDurationMs)&&Number(settings.orderDurationMs)/1000;
  const horizon=selected||60;
  const quoteAt=positive(snap.quoteTs);
  const locked=activeWindow?.phase&&now<Number(activeWindow.windowEndsAt)&&['open','fired','cancelled'].includes(activeWindow.phase)?activeWindow:null;
  const last=Array.isArray(snap.quoteHistory)?snap.quoteHistory.at(-1):null;
  const context=JSON.stringify([
    forecastModel,settings.forecastMode||'continuous',settings.engine,settings.asset,horizon,quoteAt,Number(last?.ts)||0,
    adaptiveHistory?.length||0,Number(adaptiveHistory?.[0]?.ts)||0,
    Number(last?.price)||0,Array.isArray(snap.quoteHistory)?snap.quoteHistory.length:0
  ]);
  // Both modes expose auxiliary entry times. Seletiva evaluates each with
  // its own estimator once, without five entry-window searches per cell.
  const selective=settings.forecastMode==='selective';
  const horizons=[...new Set([...FORWARD_HORIZONS,horizon])].sort((a,b)=>a-b);
  // No arbitrary delay: re-evaluate as soon as the source quote or selected
  // context changes, not every redundant 400ms worker tick.
  if(previous?.context===context&&Array.isArray(previous.rows)){
    const rows=previous.rows.map(row=>row.horizonSeconds===horizon?
      rowFor(primary,horizon):row).filter(Boolean);
    const scheduled=previous.entryRows?.find(r=>Number(r?.delaySeconds)===horizon);
    // A same-quote cache must NEVER freeze the next-entry plan after its
    // actual deadline. Re-evaluate the chosen entry at the deadline using
    // only a currently fresh broker quote and the existing selected model.
    // No fictitious ticks, timer-based trade permission or broker reads.
    const expired=!locked&&Number(scheduled?.entryAt)>0&&Number(scheduled.entryAt)<=now;
    if(locked)return {context,rows,entryRows:[locked,...(selective?
      (previous.entryRows||[]).filter(r=>Number(r.delaySeconds)!==horizon):[])],
      computedAt:previous.computedAt,reused:true};
    if(!expired||!(quoteAt>0&&now>=quoteAt&&now-quoteAt<=2500)){
      return {context,rows,entryRows:previous.entryRows||[],computedAt:previous.computedAt,reused:true};
    }
    const entryRows=futureEntrySchedule({
      settings,snap,now,delays:horizons,knownForecasts:rows,forecastModel,adaptiveHistory,activeWindow
    });
    return {context,rows,entryRows,computedAt:now,reused:false};
  }
  const rows=[];
  for(const seconds of selective?[horizon]:horizons){
    const model=seconds===horizon&&primary?
      primary:singleEngineForecast({
        settings:{...settings,orderDurationMs:seconds*1000},
        snap,now,provider:snap.provider,
        // The selected forecast remains unchanged. During selective analysis,
        // auxiliary chart slots use the original lightweight estimator instead
        // of repeating six structural regressions on every broker quote.
        forecastModel:seconds===horizon||forecastModel==='causal-interval-1371'?
          forecastModel:'original-67',
        adaptiveHistory
      });
    rows.push(rowFor(model,seconds));
  }
  const entryRows=locked&&!selective?[locked]:futureEntrySchedule({
    settings,snap,now,delays:horizons,knownForecasts:rows,forecastModel,adaptiveHistory,activeWindow
  });
  return {context,rows,entryRows,computedAt:now,reused:false};
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

import {singleEngineForecast} from './vnext-single-engine.mjs';
import {historicalFutureEntryAnalogs} from './historical-future-entry-analogs.mjs';

// A future-entry prediction is NOT the price direction from now to entryAt.
// It is the conditional price move from estimated ENTRY price at now + H
// to estimated EXIT price at now + H + holding period.
// Until a separate holding-time input exists, holding period = chosen lead
// time (H); this assumption is clearly displayed and never sent as an order.
// The selected engine's own forward estimator is used at BOTH timestamps.
const num=x=>Number.isFinite(Number(x))?Number(x):null;
const valid=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;

export function futureEntrySchedule({
  settings={},snap={},now=Date.now(),delays=[30],knownForecasts=[],focusDelaySeconds=null
}={}){
  const engineId=String(settings.engine||'automatic');
  const asset=String(settings.asset||'UNKNOWN').toUpperCase();
  const cached=new Map();
  for(const r of knownForecasts){
    const h=Number(r?.horizonSeconds);
    if(h>0&&Number(r.projectedPrice)>0&&Number(r.issuedAt)>0&&
       Number(r.issuedAt)<=now+2000&&Number(r.targetAt)>now)
      cached.set(h,r);
  }
  const predict=(seconds)=>{
    if(cached.has(seconds))return cached.get(seconds);
    const forecast=singleEngineForecast({settings:{
      ...settings,orderDurationMs:seconds*1000
    },snap,now,provider:snap.provider});
    const r=forecast.receipt?{
      horizonSeconds:seconds,side:forecast.receipt.side,
      projectedPrice:forecast.receipt.projectedPrice,
      issuedAt:forecast.receipt.issuedAt,targetAt:forecast.receipt.targetAt
    }:null;
    cached.set(seconds,r);
    return r;
  };
  return [...new Set(delays.map(Number).filter(h=>h>0&&h<=3600))]
    .sort((a,b)=>a-b).map(delaySeconds=>{
      const holdingSeconds=delaySeconds;
      const entry=predict(delaySeconds),exit=predict(delaySeconds+holdingSeconds);
      const entryPrice=valid(entry?.projectedPrice),exitPrice=valid(exit?.projectedPrice);
      const issuedAt=num(entry?.issuedAt);
      const consistent=entryPrice!==null&&exitPrice!==null&&issuedAt!==null&&
        Number(exit?.issuedAt)===issuedAt&&Number(entry?.targetAt)===issuedAt+delaySeconds*1000&&
        Number(exit?.targetAt)===issuedAt+(delaySeconds+holdingSeconds)*1000;
      // Baseline 13.4.67 is the difference between two endpoint forecasts.
      // The chosen horizon is additionally assessed using observed PAIRS:
      // how price actually moved between future entry and future expiry.
      // Other horizons remain lightweight until explicitly selected; this
      // avoids CPU spikes in the broker overlay and keeps each motor unique.
      const baselineReturn=consistent?Math.log(exitPrice/entryPrice):null;
      const isSelected=Number(focusDelaySeconds||settings.orderDurationMs/1000)===delaySeconds;
      const observed=consistent&&isSelected?historicalFutureEntryAnalogs({
        quoteHistory:snap.quoteHistory,asOf:now,delaySeconds,
        holdingSeconds,engineId
      }):null;
      // Smooth evidence contribution, not a hard regime gate or cross-engine
      // vote. If there are too few independent historical outcomes, preserve
      // the previous model's own estimate rather than inventing certainty.
      const contribution=observed?Math.min(.55,
        observed.independentExamples/(observed.independentExamples+7))*
        (.45+.55*observed.directionalAgreement):0;
      const relative=consistent?
        baselineReturn*(1-contribution)+(observed?.returnLog||0)*contribution:0;
      const side=!consistent||Math.abs(relative)<=1e-10?null:
        relative>0?'CALL':'PUT';
      return {
        engineId,asset,delaySeconds,holdingSeconds,side,
        issuedAt:consistent?issuedAt:null,
        entryAt:consistent?issuedAt+delaySeconds*1000:null,
        exitAt:consistent?issuedAt+(delaySeconds+holdingSeconds)*1000:null,
        projectedEntryPrice:consistent?entryPrice:null,
        // Internal consistency: displayed exit price must agree with the
        // actual future-entry direction calculated above, not with the old
        // independently projected 2H endpoint.
        projectedExitPrice:consistent?
          Number((entryPrice*Math.exp(relative)).toPrecision(12)):null,
        baselineSide:baselineReturn===null||Math.abs(baselineReturn)<=1e-10?null:
          baselineReturn>0?'CALL':'PUT',
        expectedLogReturn:consistent?relative:null,
        researchRegime:observed?.regime||'unclassified',
        historicalPairCases:observed?.comparisonCount||0,
        independentHistoricalCases:observed?.independentExamples||0,
        researchOnly:true,
        status:side?'forecast':'insufficient-future-evidence',
        actionable:false,calibrated:false
      };
    });
}

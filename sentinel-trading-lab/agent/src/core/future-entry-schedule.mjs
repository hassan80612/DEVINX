import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
import {selectiveIntervalForecast,qualifyStrategyInterval} from './selective-forward-model.mjs';
import {singleEngineForecast} from './vnext-single-engine.mjs';

// A future-entry prediction is NOT the price direction from now to entryAt.
// It is the conditional price move from estimated ENTRY price at now + H
// to estimated EXIT price at now + H + holding period.
// Until a separate holding-time input exists, holding period = chosen lead
// time (H); this assumption is clearly displayed and never sent as an order.
// The selected engine's own forward estimator is used at BOTH timestamps.
const num=x=>Number.isFinite(Number(x))?Number(x):null;
const valid=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;

function continuousFutureEntrySchedule({
  settings={},snap={},now=Date.now(),delays=[30],knownForecasts=[],forecastModel='original-67',adaptiveHistory=null
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
    },snap,now,provider:snap.provider,forecastModel,adaptiveHistory});
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
      if(engineId==='selective_forecast'){
        const forecast=selectiveIntervalForecast({quoteHistory:adaptiveHistory||snap.quoteHistory,asOf:now,entryDelaySeconds:delaySeconds,holdingSeconds});
        return {engineId,asset,delaySeconds,holdingSeconds,side:forecast.side,
          issuedAt:now,entryAt:now+delaySeconds*1000,exitAt:now+(delaySeconds+holdingSeconds)*1000,
          projectedEntryPrice:forecast.projectedEntryPrice??null,projectedExitPrice:forecast.projectedExitPrice??null,
          status:forecast.status,actionable:false,calibrated:false,modelVersion:forecast.modelVersion,
          qualification:forecast.qualification,reason:forecast.reason};
      }
      if((forecastModel==='adaptive-direct-trajectory-v1'||forecastModel==='selected-strengths-67.5')&&engineId==='automatic'){
        const quoteAt=Number(snap.quoteTs);
        const learned=quoteAt>0&&quoteAt<=now&&now-quoteAt<=2500?
          adaptiveDirectTrajectory({quoteHistory:adaptiveHistory||snap.quoteHistory,asOf:now,
            entryDelaySeconds:delaySeconds,holdingSeconds}):null;
        if(learned?.status==='adaptive-direct-trajectory'&&learned.side){
          return {engineId,asset,delaySeconds,holdingSeconds,side:learned.side,
            issuedAt:learned.issuedAt,entryAt:learned.entryAt,exitAt:learned.exitAt,
            projectedEntryPrice:learned.projectedEntryPrice,
            projectedExitPrice:learned.projectedExitPrice,
            status:'forecast',actionable:false,calibrated:false,
            modelVersion:learned.modelVersion,expectedPath:learned.expectedPath,
            expectedLow:learned.expectedLow,expectedHigh:learned.expectedHigh};
        }
        // Preserve original 67 behavior while the learned context is incomplete.
        // Both fallback endpoints come from the ORIGINAL model, never mixed.
        return futureEntrySchedule({settings,snap,now,delays:[delaySeconds],
          knownForecasts:[],forecastModel:'original-67'})[0];
      }
      const entry=predict(delaySeconds),exit=predict(delaySeconds+holdingSeconds);
      const entryPrice=valid(entry?.projectedPrice),exitPrice=valid(exit?.projectedPrice);
      const issuedAt=num(entry?.issuedAt);
      const consistent=entryPrice!==null&&exitPrice!==null&&issuedAt!==null&&
        Number(exit?.issuedAt)===issuedAt&&Number(entry?.targetAt)===issuedAt+delaySeconds*1000&&
        Number(exit?.targetAt)===issuedAt+(delaySeconds+holdingSeconds)*1000;
      // Never manufacture CALL/PUT when independent future estimates tie.
      const relative=consistent?Math.log(exitPrice/entryPrice):0;
      const side=!consistent||Math.abs(relative)<=1e-10?null:relative>0?'CALL':'PUT';
      return {
        engineId,asset,delaySeconds,holdingSeconds,side,
        issuedAt:consistent?issuedAt:null,
        entryAt:consistent?issuedAt+delaySeconds*1000:null,
        exitAt:consistent?issuedAt+(delaySeconds+holdingSeconds)*1000:null,
        projectedEntryPrice:consistent?entryPrice:null,
        projectedExitPrice:consistent?exitPrice:null,
        status:side?'forecast':'insufficient-future-evidence',
        actionable:false,calibrated:false
      };
    });
}
export function futureEntrySchedule(input={}){
 const legacy=input.settings?.engine==='selective_forecast';
 const settings=legacy?{...input.settings,engine:'automatic',forecastMode:'selective'}:input.settings||{};
 const continuous=continuousFutureEntrySchedule({...input,settings:{...settings,forecastMode:'continuous'}});
 if(settings.forecastMode!=='selective')return continuous;
 return continuous.map(forecast=>qualifyStrategyInterval({forecast,quoteHistory:input.adaptiveHistory||input.snap?.quoteHistory||[],asOf:input.now??Date.now()}));
}

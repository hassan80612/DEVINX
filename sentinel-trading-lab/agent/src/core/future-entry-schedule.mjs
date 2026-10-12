import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
import {selectiveIntervalForecast,qualifyStrategyInterval,selectiveEvidence} from './selective-forward-model.mjs';
import {singleEngineForecast} from './vnext-single-engine.mjs';
import {autonomousSelectiveEntry} from './selective-autonomous.mjs';
import {coherentInterval,observedNoise} from './forward-direction-quality.mjs';
import {planEntryWindow} from './entry-window-planner.mjs';

// A future-entry prediction is NOT the price direction from now to entryAt.
// It is the conditional price move from estimated ENTRY price at now + H
// to estimated EXIT price at now + H + holding period.
// Until a separate holding-time input exists, holding period = chosen lead
// time (H); this assumption is clearly displayed and never sent as an order.
// The selected engine's own forward estimator is used at BOTH timestamps.
const num=x=>Number.isFinite(Number(x))?Number(x):null;
const valid=x=>Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;

function continuousFutureEntrySchedule({
  settings={},snap={},now=Date.now(),delays=[30],knownForecasts=[],forecastModel='original-67',adaptiveHistory=null,
  historicalQuoteGapMs=2500,selectiveLeadSeconds=null
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
        // Fit the historical trajectory ONLY for the user-selected selective
        // horizon. Auxiliary horizons remain displayed using the unchanged
        // original-67 fallback; they must not block the live result.
        const selected=selectiveLeadSeconds==null||Number(selectiveLeadSeconds)===delaySeconds;
        const learned=selected&&quoteAt>0&&quoteAt<=now&&now-quoteAt<=2500?
          adaptiveDirectTrajectory({quoteHistory:adaptiveHistory||snap.quoteHistory,asOf:now,
            entryDelaySeconds:delaySeconds,holdingSeconds,historicalQuoteGapMs}):null;
        if(learned?.status==='adaptive-direct-trajectory'){
          return {engineId,asset,delaySeconds,holdingSeconds,side:learned.side,
            issuedAt:learned.issuedAt,entryAt:learned.entryAt,exitAt:learned.exitAt,
            projectedEntryPrice:learned.projectedEntryPrice,
            projectedExitPrice:learned.projectedExitPrice,
            status:learned.side?'forecast':'low-directional-edge',actionable:false,calibrated:false,
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
// An ACTUAL forward price-path is fitted ONCE, then sampled at different
// candidate entry instants within the chosen opportunity window. The
// selected motor is preserved; unqualified specialists use only their own
// lightweight price estimator. No extra broker requests, DB writes or trades.
function continuousWindow({input,settings,chosen}){
 const snap=input.snap||{},now=input.now??Date.now();
 const asset=String(settings.asset||'UNKNOWN').toUpperCase();
 const engineId=String(settings.engine||'automatic');
 const history=input.adaptiveHistory||snap.quoteHistory||[];
 const noise=observedNoise({quotes:history,now,horizonSeconds:chosen});
 const quoteAt=Number(snap.quoteTs);
 if(!(quoteAt>0&&quoteAt<=now&&now-quoteAt<=2500))
  return {...planEntryWindow({windowSeconds:chosen,holdingSeconds:chosen,now,
   engineId,asset,evaluateLead:()=>null}),status:'waiting-fresh-quote'};
 let path=null;
 if(engineId==='automatic'&&
   ['adaptive-direct-trajectory-v1','selected-strengths-67.5'].includes(input.forecastModel)){
   const learned=adaptiveDirectTrajectory({quoteHistory:history,asOf:now,
    entryDelaySeconds:chosen,holdingSeconds:chosen,historicalQuoteGapMs:2500});
   if(learned.status==='adaptive-direct-trajectory'&&Array.isArray(learned.expectedPath))
    path=learned.expectedPath;
 }
 const priceAt=seconds=>{
   if(!path)return null;
   const points=path.filter(x=>Number(x.price)>0&&Number(x.secondsFromNow)>=0)
     .sort((a,b)=>a.secondsFromNow-b.secondsFromNow);
   if(!points.length||seconds>points.at(-1).secondsFromNow)return null;
   const exact=points.find(x=>x.secondsFromNow===seconds);
   if(exact)return Number(exact.price);
   let a=null,b=null;
   for(let i=0;i<points.length-1;i++)if(points[i].secondsFromNow<=seconds&&
    points[i+1].secondsFromNow>=seconds){a=points[i];b=points[i+1];break;}
   if(!a||!b||a.secondsFromNow===b.secondsFromNow)return null;
   const fraction=(seconds-a.secondsFromNow)/(b.secondsFromNow-a.secondsFromNow);
   return Math.exp(Math.log(a.price)*(1-fraction)+Math.log(b.price)*fraction);
 };
 const forecastCache=new Map();
 const projectedAt=seconds=>{
  if(path)return priceAt(seconds);
  if(forecastCache.has(seconds))return forecastCache.get(seconds);
  const forecast=singleEngineForecast({settings:{...settings,forecastMode:'continuous',
    orderDurationMs:seconds*1000},snap,now,forecastModel:'original-67',
    adaptiveHistory:history});
  const price=Number(forecast.receipt?.projectedPrice)||null;
  forecastCache.set(seconds,price);
  return price;
 };
 return planEntryWindow({windowSeconds:chosen,holdingSeconds:chosen,now,
  engineId,asset,forecastMode:'continuous',
  evaluateLead:seconds=>{
   const first=projectedAt(seconds),last=projectedAt(seconds+chosen);
   if(!(first>0&&last>0))return null;
   const check=coherentInterval({entryPrice:first,exitPrice:last,noise,
     noiseFraction:.15});
   if(!check.qualified)return null;
   return {side:check.side,projectedEntryPrice:first,projectedExitPrice:last,
    selectionStrength:Math.min(3,Math.abs(check.relativeMove)/
      Math.max(noise||1e-12,1e-12))};
  }});
}
export function futureEntrySchedule(input={}){
 const legacy=input.settings?.engine==='selective_forecast';
 const settings=legacy?{...input.settings,engine:'automatic',forecastMode:'selective'}:input.settings||{};
 const inSelective=settings.forecastMode==='selective';
 const chosen=Number(settings.orderDurationMs||60000)/1000;
 // Selective has its OWN causal estimator, no motor vote and no bar gate.
 // Preserve settings.engine as the user preference for switching back to
 // Contínua, and as the transport identity used by existing PC/mobile cards.
 const requested=[...new Set((input.delays||[chosen]).map(Number).filter(h=>h>0&&h<=3600))];
 if(inSelective){
   const snap=input.snap||{},at=input.now??Date.now();
   // All candidates use the same completed historical state but DIFFERENT
   // observed entry->expiry outcomes. Three candles are descriptive only.
   return requested.filter(h=>h===chosen).map(h=>{
     const fresh=Number(snap.quoteTs)>0&&Number(snap.quoteTs)<=at&&
       at-Number(snap.quoteTs)<=2500;
     const result=planEntryWindow({
     windowSeconds:h,holdingSeconds:h,now:at,engineId:String(settings.engine||'automatic'),
     asset:String(settings.asset||'UNKNOWN').toUpperCase(),forecastMode:'selective',
     evaluateLead:seconds=>{
       const p=autonomousSelectiveEntry({quoteHistory:input.adaptiveHistory||
         snap.quoteHistory||[],now:at,quoteTs:snap.quoteTs,
         delaySeconds:seconds,holdingSeconds:h,
         asset:String(settings.asset||'UNKNOWN').toUpperCase(),
         engineId:String(settings.engine||'automatic')});
       if(!p?.side)return null;
       const reliability=p.validationExamples>=6?
        p.validationCorrect/Math.max(1,p.validationExamples):.5;
       return {...p,selectionStrength:
         Math.max(.01,p.historicalAgreement*.7+reliability*.3)};
     }
   });
   return fresh?result:{...result,side:null,entryAt:null,exitAt:null,
     entryOffsetSeconds:null,projectedEntryPrice:null,
     projectedExitPrice:null,status:'waiting-fresh-quote'};
   });
 }
 // Only the chosen timeframe scans entry moments. Auxiliary projections
 // remain display-only and do not force repeated costly learned fits.
 const others=continuousFutureEntrySchedule({...input,
   delays:requested.filter(h=>h!==chosen),
   settings:{...settings,forecastMode:'continuous'},
   historicalQuoteGapMs:2500,selectiveLeadSeconds:chosen
 });
 const chosenForecast=requested.includes(chosen)?
   [continuousWindow({input,settings,chosen})]:[];
 const continuous=[...others,...chosenForecast].sort((a,b)=>a.delaySeconds-b.delaySeconds);
 // The original adaptive motor and fallback may not agree internally:
 // CALL/PUT is only valid when it points from its OWN entry to exit prices.
 // A price move smaller than normal observed noise remains informational.
 return continuous.map(row=>{
   if(!['CALL','PUT'].includes(row?.side))return row;
   const noise=observedNoise({quotes:input.adaptiveHistory||input.snap?.quoteHistory||[],
     now:input.now??Date.now(),horizonSeconds:row.holdingSeconds});
   const check=coherentInterval({entryPrice:row.projectedEntryPrice,
     exitPrice:row.projectedExitPrice,side:row.side,noise});
   return check.qualified?row:{...row,side:null,
     status:check.reason,actionable:false,calibrated:false};
 });
}

/**
 * Confirm the ORIGINAL scheduled entry at its real market timestamp. This
 * evaluates t=now -> t+expiry using the selected mode's estimator; it NEVER
 * chooses a new offset or modifies the original window's CALL/PUT.
 */
export function confirmWindowEntry({
 settings={},snap={},now=Date.now(),adaptiveHistory=null,
 forecastModel='original-67'
}={}){
 const H=Number(settings.orderDurationMs||0)/1000;
 const quotes=adaptiveHistory||snap.quoteHistory||[];
 if(!(H>=5&&H<=3600)||!(Number(snap.quoteTs)>0&&
  Number(snap.quoteTs)<=now&&now-Number(snap.quoteTs)<=2500))
  return {side:null,status:'waiting-fresh-quote'};
 if(settings.forecastMode==='selective'){
  return autonomousSelectiveEntry({quoteHistory:quotes,now,quoteTs:snap.quoteTs,
    delaySeconds:0,holdingSeconds:H,
    asset:String(settings.asset||'UNKNOWN').toUpperCase(),
    engineId:String(settings.engine||'automatic')});
 }
 const engineId=String(settings.engine||'automatic');
 if(engineId==='automatic'&&
   ['adaptive-direct-trajectory-v1','selected-strengths-67.5'].includes(forecastModel)){
  const learned=adaptiveDirectTrajectory({quoteHistory:quotes,asOf:now,
   entryDelaySeconds:0,holdingSeconds:H,historicalQuoteGapMs:2500});
  if(learned.status==='adaptive-direct-trajectory'){
   const check=coherentInterval({entryPrice:learned.projectedEntryPrice,
    exitPrice:learned.projectedExitPrice,side:learned.side,
    noise:observedNoise({quotes,now,horizonSeconds:H})});
   return check.qualified?learned:{...learned,side:null,status:check.reason};
  }
 }
 const estimated=singleEngineForecast({settings:{...settings,forecastMode:'continuous'},
   snap,now,forecastModel:engineId==='automatic'?'original-67':forecastModel,
   adaptiveHistory:quotes});
 const receipt=estimated.receipt;
 if(!receipt)return {side:null,status:'no-directional-evidence'};
 const noise=observedNoise({quotes,now,horizonSeconds:H});
 const checked=coherentInterval({entryPrice:receipt.referencePrice,
   exitPrice:receipt.projectedPrice,side:receipt.side,noise});
 return {...checked,side:checked.qualified?receipt.side:null,
  projectedEntryPrice:receipt.referencePrice,
  projectedExitPrice:receipt.projectedPrice};
}

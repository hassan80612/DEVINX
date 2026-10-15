import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
import {quoteScopedCausalPath} from './quote-scoped-causal-path.mjs';
import {selectedFixedBrokerExpiry,futurePriceExitSeconds} from './broker-fixed-expiry-1376.mjs';
import {observedBuyWindow,brokerAllowsEntry} from './broker-buy-window-1378.mjs';
import {selectiveIntervalForecast,qualifyStrategyInterval,selectiveEvidence} from './selective-forward-model.mjs';
import {singleEngineForecast} from './vnext-single-engine.mjs';
import {autonomousSelectiveEntry} from './selective-autonomous.mjs';
import {coherentInterval,observedNoise} from './forward-direction-quality.mjs';
import {planEntryWindow} from './entry-window-planner.mjs';
import {oppositeTurnPressure} from './turn-pressure.mjs';
import {observedStreakRejection} from './completed-streak-stage.mjs';

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
 const fixedExpiry=selectedFixedBrokerExpiry({snap,settings,now});
 const buyWindow=observedBuyWindow({snap,settings,now});
 const maxForecastSeconds=fixedExpiry.verified?
   Math.max(chosen*2,Math.ceil(fixedExpiry.remainingSeconds)):chosen*2;
 const noise=observedNoise({quotes:history,now,horizonSeconds:chosen});
 const quoteAt=Number(snap.quoteTs);
 if(!(quoteAt>0&&quoteAt<=now&&now-quoteAt<=2500))
  return {...planEntryWindow({windowSeconds:chosen,holdingSeconds:chosen,now,
   engineId,asset,evaluateLead:()=>null}),status:'waiting-fresh-quote'};
 let path=null;
 let causal=null;
 if(engineId==='automatic'&&['causal-interval-1371','causal-closed-structure-1379'].includes(input.forecastModel)){
   causal=quoteScopedCausalPath({forecastModel:input.forecastModel,
     quoteHistory:history,candles:snap.candles||[],asOf:now,holdingSeconds:chosen,maxSeconds:maxForecastSeconds});
 }
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
  if(causal)return causal.priceAt(seconds);
  if(path)return priceAt(seconds);
  if(forecastCache.has(seconds))return forecastCache.get(seconds);
  const forecast=singleEngineForecast({settings:{...settings,forecastMode:'continuous',
    orderDurationMs:seconds*1000},snap,now,forecastModel:'original-67',
    adaptiveHistory:history});
  const price=Number(forecast.receipt?.projectedPrice)||null;
  forecastCache.set(seconds,price);
  return price;
 };
 // In Contínua the 30s/60s opportunity is anchored by evolveOpportunity.
 // A new quote may update the candidate, but cannot move its original end.
 // Require one normal source-quote interval to confirm before that deadline.
 // Seletiva retains its independent estimator and countdown unchanged.
 const window= ['scanning','open'].includes(input.activeWindow?.phase)&&
   input.activeWindow?.context?input.activeWindow:null;
 const recentTicks=history.slice(-20).map(x=>Number(x.ts)).filter(Number.isFinite);
 const gaps=recentTicks.slice(1).map((x,i)=>x-recentTicks[i]).filter(n=>n>0&&n<=4000).sort((a,b)=>a-b);
 const typicalGap=gaps.length?gaps[Math.floor(gaps.length/2)]:1000;
 const confirmationQuoteGapMs=window?Math.max(200,Math.min(1500,typicalGap)):0;
 const planned=planEntryWindow({windowSeconds:chosen,holdingSeconds:chosen,now,
  engineId,asset,forecastMode:'continuous',
  realWindowEndsAt:window?Number(window.windowEndsAt):null,
  confirmationQuoteGapMs,
  lateEntryRisk:causal?.streakStage?.lateRisk||0,
  evaluateLead:seconds=>{
   // A qualified prediction is not tradable after the broker's observed
   // purchase deadline. This is only active in synchronized-clock mode.
   if(!brokerAllowsEntry({buyWindow,entryAt:now+seconds*1000}))return null;
   const exitLead=futurePriceExitSeconds({brokerExpiry:fixedExpiry,now,
     leadSeconds:seconds,holdingSeconds:chosen});
   if(exitLead===null)return null;
   const first=projectedAt(seconds),last=projectedAt(exitLead);
   if(!(first>0&&last>0))return null;
   // A Digital fixed-clock option is evaluated at its selected expiry,
   // not at entry + the opportunity window length.
   const held=exitLead-seconds;
   const actualNoise=observedNoise({quotes:history,now,horizonSeconds:held})||noise;
   const check=coherentInterval({entryPrice:first,exitPrice:last,noise:actualNoise,
     // A 2-tick projected edge inside ordinary market fluctuation is not
     // a stable 60-second CALL/PUT forecast. Use the measured noise scale,
     // not an arbitrary candle-count or waiting time.
     noiseFraction:.35});
   if(!check.qualified)return null;
   // Streak alone never rejects a strong trend; verified live retreat can.
   if(observedStreakRejection({stage:causal?.streakStage,side:check.side}))return null;
   return {side:check.side,projectedEntryPrice:first,projectedExitPrice:last,
    selectionStrength:Math.min(3,Math.abs(check.relativeMove)/
      Math.max(actualNoise||1e-12,1e-12))};
  }});
 if(!planned.side||!fixedExpiry.verified)return planned;
 return {...planned,brokerExpiresAt:fixedExpiry.expiresAt,
   exitAt:fixedExpiry.expiresAt,
   actualHoldingSeconds:(fixedExpiry.expiresAt-planned.entryAt)/1000,
   expirySource:'broker-visible-readonly'};
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
   // Auxiliary cells describe fixed future entry times. Only the selected
   // horizon searches for an entry within its running opportunity window.
   return requested.map(h=>{
     const identity={asset:String(settings.asset||'UNKNOWN').toUpperCase(),
       engineId:String(settings.engine||'automatic')};
     if(h!==chosen)return autonomousSelectiveEntry({
       quoteHistory:input.adaptiveHistory||snap.quoteHistory||[],now:at,
       quoteTs:snap.quoteTs,delaySeconds:h,holdingSeconds:h,...identity});
     const active=input.activeWindow;
     if(active&&at<Number(active.windowEndsAt)&&
       ['open','fired','cancelled'].includes(active.phase))return active;
     const scanning=active?.phase==='scanning'&&active?.context?active:null;
     const ticks=(input.adaptiveHistory||snap.quoteHistory||[]).slice(-20)
       .map(q=>Number(q.ts));
     const gaps=ticks.slice(1).map((t,i)=>t-ticks[i])
       .filter(ms=>ms>0&&ms<=4000).sort((a,b)=>a-b);
     const typicalGap=gaps.length?gaps[Math.floor(gaps.length/2)]:1000;
     const fresh=Number(snap.quoteTs)>0&&Number(snap.quoteTs)<=at&&
       at-Number(snap.quoteTs)<=2500;
     const result=planEntryWindow({
     windowSeconds:h,holdingSeconds:h,now:at,engineId:String(settings.engine||'automatic'),
     asset:String(settings.asset||'UNKNOWN').toUpperCase(),forecastMode:'selective',
     realWindowEndsAt:scanning?Number(scanning.windowEndsAt):null,
     confirmationQuoteGapMs:scanning?Math.max(200,Math.min(1500,typicalGap)):0,
     evaluateLead:seconds=>{
       const p=autonomousSelectiveEntry({quoteHistory:input.adaptiveHistory||
         snap.quoteHistory||[],now:at,quoteTs:snap.quoteTs,
         delaySeconds:seconds,holdingSeconds:h,
         asset:String(settings.asset||'UNKNOWN').toUpperCase(),
         engineId:String(settings.engine||'automatic')});
       if(!p?.side)return null;
       if(oppositeTurnPressure({quoteHistory:input.adaptiveHistory||snap.quoteHistory||[],
         now:at,quoteTs:snap.quoteTs,side:p.side}).blocked)return null;
       const reliability=p.validationExamples>=4?
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
 forecastModel='original-67',entryAt=now,brokerExpiresAt=null
}={}){
 const H=Number(settings.orderDurationMs||0)/1000;
 const lead=Math.max(0,Math.ceil((Number(entryAt)-now)/1000));
 const quotes=adaptiveHistory||snap.quoteHistory||[];
 const buyWindow=observedBuyWindow({snap,settings,now});
 if(!brokerAllowsEntry({buyWindow,entryAt:now}))
  return {side:null,status:'broker-purchase-closed'};
 if(!(H>=5&&H<=3600)||!(Number(snap.quoteTs)>0&&
  Number(snap.quoteTs)<=now&&now-Number(snap.quoteTs)<=2500))
  return {side:null,status:'waiting-fresh-quote'};
 if(settings.forecastMode==='selective'){
  const forecast=autonomousSelectiveEntry({quoteHistory:quotes,now,quoteTs:snap.quoteTs,
    delaySeconds:lead,holdingSeconds:H,
    asset:String(settings.asset||'UNKNOWN').toUpperCase(),
    engineId:String(settings.engine||'automatic')});
  return forecast.side&&oppositeTurnPressure({quoteHistory:quotes,now,
    quoteTs:snap.quoteTs,side:forecast.side}).blocked?
    {...forecast,side:null,status:'counterpressure-before-entry'}:forecast;
 }
 const engineId=String(settings.engine||'automatic');
 const noise=observedNoise({quotes,now,horizonSeconds:H});
 if(engineId==='automatic'&&['causal-interval-1371','causal-closed-structure-1379'].includes(forecastModel)){
  const fixedExpiry=brokerExpiresAt>now?{verified:true,expiresAt:Number(brokerExpiresAt)}:
    selectedFixedBrokerExpiry({snap,settings,now});
  const exitLead=futurePriceExitSeconds({brokerExpiry:fixedExpiry,now,
    leadSeconds:lead,holdingSeconds:H});
  if(exitLead===null)return {side:null,status:'selected-expiry-already-reached'};
  const causal=quoteScopedCausalPath({forecastModel,quoteHistory:quotes,candles:snap.candles||[],asOf:now,
    holdingSeconds:H,maxSeconds:Math.max(H*2,Math.ceil(exitLead))});
  const entry=causal.priceAt(lead),exit=causal.priceAt(exitLead);
  const actualNoise=observedNoise({quotes,now,horizonSeconds:exitLead-lead})||noise;
  const check=coherentInterval({entryPrice:entry,exitPrice:exit,noise:actualNoise,
   noiseFraction:.35});
  const observedRejection=check.qualified?
    observedStreakRejection({stage:causal?.streakStage,side:check.side}):null;
  return {...check,qualified:check.qualified&&!observedRejection,
    side:check.qualified&&!observedRejection?check.side:null,
    projectedEntryPrice:entry,projectedExitPrice:exit,
    ...(fixedExpiry.verified?{brokerExpiresAt:fixedExpiry.expiresAt}:{}),
    status:observedRejection?'observed-streak-rejection':
      check.qualified?'causal-future-interval':causal.status};
 }
 if(engineId==='automatic'&&
   ['adaptive-direct-trajectory-v1','selected-strengths-67.5'].includes(forecastModel)){
  const learned=adaptiveDirectTrajectory({quoteHistory:quotes,asOf:now,
   entryDelaySeconds:lead,holdingSeconds:H,historicalQuoteGapMs:2500});
  if(learned.status==='adaptive-direct-trajectory'){
   const check=coherentInterval({entryPrice:learned.projectedEntryPrice,
    exitPrice:learned.projectedExitPrice,side:learned.side,noise});
   return check.qualified?learned:{...learned,side:null,status:check.reason};
  }
 }
 // Fallback and specialists use their OWN selected motor at both actual
 // timestamps. Never substitute the direction of the current candle.
 const forecastAt=seconds=>{
   if(seconds===0)return {projectedPrice:Number(snap.price),issuedAt:now};
   const model=singleEngineForecast({settings:{...settings,
     forecastMode:'continuous',orderDurationMs:seconds*1000},snap,now,
     forecastModel:engineId==='automatic'?'original-67':forecastModel,
     adaptiveHistory:quotes});
   return model.receipt;
 };
 const first=forecastAt(lead),last=forecastAt(lead+H);
 const check=coherentInterval({entryPrice:first?.projectedPrice,
   exitPrice:last?.projectedPrice,noise});
 return {...check,side:check.qualified?check.side:null,
  projectedEntryPrice:Number(first?.projectedPrice)||null,
  projectedExitPrice:Number(last?.projectedPrice)||null};
}

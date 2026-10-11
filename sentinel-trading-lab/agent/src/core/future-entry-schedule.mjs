import {selectedForecast} from './unified-strategy-forecast.mjs';
import {historicalFuturePath,conditionalPathWindow} from './forward-path-research.mjs';

/**
 * Independent clocks:
 *  E = entry lead (fixed by user or estimated automatically).
 *  D = selected operation HOLDING time (orderDurationMs).
 *  Exit must be evaluated at E+D, NOT at E or 2*E.
 * This is prediction research only; it never authorizes an order.
 */
const valid=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
const integer=(v,min,max)=>{const x=Number(v);return Number.isInteger(x)&&x>=min&&x<=max?x:null};
const AUTO_LEADS=Object.freeze([5,15,30,60,120]);
export function futureEntrySchedule({settings={},snap={},now=Date.now(),delays=[],knownForecasts=[]}={}){
 const engineId=String(settings.engine||'automatic'),asset=String(settings.asset||'UNKNOWN').toUpperCase();
 const holdingSeconds=integer(Number(settings.orderDurationMs)/1000,5,1800);
 const mode=settings.entryTimeMode==='automatic'?'automatic':'fixed';
 const lead=integer(settings.entryLeadSeconds??30,5,900);
 const quoteRows=Array.isArray(snap.researchQuoteHistory)&&snap.researchQuoteHistory.length>100?
  snap.researchQuoteHistory:snap.quoteHistory;
 const empty=(reason)=>({engineId,asset,mode,delaySeconds:mode==='fixed'?lead:null,
  holdingSeconds,side:null,issuedAt:null,entryAt:null,exitAt:null,
  projectedEntryPrice:null,projectedExitPrice:null,status:reason,
  confidenceNotCalibrated:true,actionable:false,calibrated:false});
 if(!holdingSeconds||mode==='fixed'&&!lead)return [empty('invalid-timing')];
 const known=new Map();
 for(const r of knownForecasts){
  const h=Number(r?.horizonSeconds);
  if(h>0&&valid(r.projectedPrice)!==null&&valid(r.issuedAt)!==null&&
     Number(r.issuedAt)<=now+2000&&Number(r.targetAt)>now&&
     Number(r.targetAt)===Number(r.issuedAt)+h*1000)known.set(h,r);
 }
 const forecasts=new Map();
 const predict=(seconds)=>{
  if(forecasts.has(seconds))return forecasts.get(seconds);
  const prior=known.get(seconds);
  if(prior){forecasts.set(seconds,prior);return prior}
  const model=selectedForecast({settings:{...settings,orderDurationMs:seconds*1000},snap,now,provider:snap.provider});
  const r=model?.receipt?{horizonSeconds:seconds,side:model.receipt.side,
   projectedPrice:model.receipt.projectedPrice,
   issuedAt:model.receipt.issuedAt,targetAt:model.receipt.targetAt}:null;
  forecasts.set(seconds,r);
  return r;
 };
 const forecastFor=E=>{
  const entry=predict(E),exit=predict(E+holdingSeconds);
  const entryPrice=valid(entry?.projectedPrice),exitPrice=valid(exit?.projectedPrice),
   issuedAt=valid(entry?.issuedAt);
  const consistent=entryPrice!==null&&exitPrice!==null&&issuedAt!==null&&
    Number(exit.issuedAt)===issuedAt&&Number(entry.targetAt)===issuedAt+E*1000&&
    Number(exit.targetAt)===issuedAt+(E+holdingSeconds)*1000;
  const logReturn=consistent?Math.log(exitPrice/entryPrice):null;
  const side=logReturn!==null&&Math.abs(logReturn)>1e-11?(logReturn>0?'CALL':'PUT'):null;
  return {engineId,asset,mode,delaySeconds:E,holdingSeconds,side,
    issuedAt:consistent?issuedAt:null,entryAt:consistent?issuedAt+E*1000:null,
    exitAt:consistent?issuedAt+(E+holdingSeconds)*1000:null,
    projectedEntryPrice:consistent?entryPrice:null,
    projectedExitPrice:consistent?exitPrice:null,
    forecastLogReturn:logReturn,status:side?'forecast':'insufficient-future-evidence',
    confidenceNotCalibrated:true,actionable:false,calibrated:false};
 };
 if(mode==='fixed')return [forecastFor(lead)];
 const leads=AUTO_LEADS.filter(E=>E+holdingSeconds<=1800);
 if(!leads.length)return [empty('holding-exceeds-history-window')];
 const maxH=Math.max(...leads)+holdingSeconds;
 // No path evidence means waiting, NOT a disguised fixed lead or a random time.
 const path=historicalFuturePath({quoteHistory:quoteRows||[],asOf:now,
  horizonSeconds:maxH,minNeighbors:8,requestedOffsets:leads.flatMap(E=>[E,E+holdingSeconds])});
 if(!path.ready)return [empty('waiting-complete-trajectory-history')];
 const scored=[];
 for(const E of leads){
  const conditional=conditionalPathWindow(path,E,holdingSeconds);
  if(conditional.status!=='candidate'||!['CALL','PUT'].includes(conditional.side)||
   conditional.independentNeighbors<8)continue;
  const projection=forecastFor(E);
  if(projection.side!==conditional.side)continue;
  const median=Math.abs(Number(conditional.conditionalMedianLogReturn||0));
  const spread=Math.abs(Number(conditional.conditionalHighLogReturn||0)-
   Number(conditional.conditionalLowLogReturn||0));
  const agreement=Number(conditional.observedNeighborShare||0);
  // Not a probability of success; ranks plausible windows only.
  const score=(agreement-.5)*Math.min(2,median/Math.max(spread,1e-9)) -
    E*.00001;
  if(!Number.isFinite(score)||score<=0)continue;
  scored.push({...projection,score,neighbors:conditional.independentNeighbors,
    status:'automatic-trajectory-window'});
 }
 scored.sort((a,b)=>b.score-a.score||a.delaySeconds-b.delaySeconds);
 if(!scored.length)return [empty('no-confirmed-automatic-window')];
 const winner=scored[0];
 const {score,...display}=winner;
 return [display];
}

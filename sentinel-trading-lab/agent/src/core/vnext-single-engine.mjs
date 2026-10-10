import {selectedEngineForecastRequest} from './scenario-engine-catalog.mjs';
import {automaticForwardPrediction} from './automatic-forward-model.mjs';
import {specialistForwardPrediction} from './specialist-forward-models.mjs';
import {recordForwardForecast,evaluateForwardForecast} from './forward-forecast-receipt.mjs';
import {lightweightDashboard} from './vnext-market-cards.mjs';
import {historicalForwardAnalogs} from './historical-forward-analogs.mjs';

/**
 * VNext main-scenario signal adapter. Computes only the selected motor;
 * no cross-engine votes, no broker expiration extraction and no old strategy
 * ensemble. Entries are informational until forward performance is measured.
 */
export function singleEngineForecast({
 settings={},snap={},now=Date.now(),provider=snap.provider||'unknown'
}={}){
 const asset=String(settings.asset||'UNKNOWN').toUpperCase();
 const request=selectedEngineForecastRequest({settings,provider,asset,
   broker:{instrument:String(snap.instrument||'manual')},now});
 const seconds=request.forecastHorizonSeconds;
 const quotes=Array.isArray(snap.quoteHistory)?snap.quoteHistory:[];
 const options={quoteHistory:quotes,asOf:now,selectedSeconds:seconds};
 const computed=request.engineId==='automatic'?
   automaticForwardPrediction(options):
   specialistForwardPrediction({...options,engineId:request.engineId});
 // Unlike pure momentum extrapolation, these independently observed outcomes
 // are prices that followed comparable PAST quote patterns by the SELECTED
 // expiration. No last/current candle direction is a decision gate.
 const analog=historicalForwardAnalogs({
   quoteHistory:quotes,asOf:now,selectedSeconds:seconds,
   engineId:request.engineId
 });
 let forecastPrediction=computed?.prediction||null;
 if(analog&&forecastPrediction&&Number(computed?.diagnostic?.referencePrice)>0){
   const base=Number(computed.diagnostic.referencePrice);
   const oldLog=Math.log(Number(forecastPrediction.projectedPrice)/base);
   if(Number.isFinite(oldLog)&&Number.isFinite(analog.estimatedLogReturn)){
     // A smooth historical evidence contribution; never a cross-strategy
     // veto, fixed wait, win-rate assertion, or trading authorization.
     const mix=Math.min(.75,analog.neighbors/(analog.neighbors+12));
     const futureLog=oldLog*(1-mix)+analog.estimatedLogReturn*mix;
     const lowBase=Math.max(1e-12,Number(forecastPrediction.expectedLow)||base);
     const highBase=Math.max(lowBase,Number(forecastPrediction.expectedHigh)||base);
     const formerWidth=Math.max(1e-11,Math.log(highBase/lowBase)/3);
     const futureWidth=Math.max(formerWidth*.4,analog.returnDispersion);
     const project=Number((base*Math.exp(futureLog)).toPrecision(12));
     const futureSide=futureLog>1e-13?'CALL':futureLog< -1e-13?'PUT':'NEUTRAL';
     forecastPrediction={...forecastPrediction,
       side:futureSide,
       projectedPrice:project,
       expectedLow:Number((base*Math.exp(futureLog-1.5*futureWidth)).toPrecision(12)),
       expectedHigh:Number((base*Math.exp(futureLog+1.5*futureWidth)).toPrecision(12)),
       modelConfidence:null,
       evidence:[
         ...(Array.isArray(forecastPrediction.evidence)?forecastPrediction.evidence.slice(0,4):[]),
         'Padrões históricos completos: '+analog.comparisons+
          ' casos, '+analog.neighbors+' similares, horizonte exato '+seconds+'s',
         'Peso histórico '+Math.round(mix*100)+'% na projeção; desempenho real ainda não validado'
       ]
     };
   }
 }
 const freshQuote=Number(snap.quoteTs)>0&&Number(snap.quoteTs)<=now&&now-Number(snap.quoteTs)<=2500;
 const recentQuote=quotes.filter(q=>Number(q.ts)<=now).at(-1);
 // The receipt must pin the quote the model ACTUALLY used, even when
 // a newer broker-screen quote reaches the UI milliseconds earlier.
 const quotePrice=Number(computed?.diagnostic?.referencePrice||recentQuote?.price||0);
 const quoteTime=Number(computed?.diagnostic?.quoteAt||recentQuote?.ts||snap.quoteTs||0);
 const modelQuoteFresh=quoteTime>0&&quoteTime<=now&&now-quoteTime<=2500;
 const report=freshQuote&&modelQuoteFresh&&forecastPrediction?
   recordForwardForecast({request:{...request,asset,provider},
     referenceQuote:{at:quoteTime,price:quotePrice},
     prediction:forecastPrediction,createdAt:now}):
   {status:freshQuote?'historical-quote-delayed':'stale-live-quote',receipt:null};
 const receipt=report.receipt||null,side=receipt?.side||null;
 // Market NOW remains a historical momentum display. Future projection
 // is calculated separately by exactly the selected motor. No counterfeit
 // instantaneous CALL/PUT created from the forecast.
 const dashboard=lightweightDashboard({quoteHistory:quotes,receipt,now});
 const cards=dashboard.cards,projection=dashboard.projection;
 const predictedPrice=receipt?.projectedPrice??null;
 const horizon=Number(seconds||0),durationMs=Math.round(horizon*1000);
 const plan=receipt?{
   asset,horizonSeconds:horizon,rawBias:side,bias:side,displayBias:side,
   callProbability:null,putProbability:null,rawCallProbability:null,
   modelConfidence:null,confidence:null,projectedPrice:predictedPrice,
   expectedLow:receipt.expectedLow,expectedHigh:receipt.expectedHigh,
   currentPrice:receipt.referencePrice,modelVersion:'vnext-single-owner-v1',
   outlookReady:true,directionReady:true,
   actionable:false,
   forecastIssuedAt:receipt.issuedAt,forecastTargetAt:receipt.targetAt,
   evidence:receipt.evidence,entryTiming:{},safety:{blocked:false}
 }:null;
 // This is a future-price forecast, not a manufactured trade entry.
 const scenarioProjection=receipt?{
   side,status:'PROJETANDO',confirmed:false,actionable:false,
   horizonSeconds:horizon,asOf:Number(snap.quoteTs),
   issuedAt:receipt.issuedAt,targetAt:receipt.targetAt,
   price:receipt.referencePrice,projectedPrice:predictedPrice,
   expectedLow:receipt.expectedLow,expectedHigh:receipt.expectedHigh,
   engineId:request.engineId,modelVersion:'vnext-single-owner-v1',
   reason:'Estimativa futura ainda não validada por operações.'
 }:null;
 const operational={
   asset,side:'AGUARDAR',state:'PROJETANDO',ready:false,actionable:false,
   confidence:null,forecastHorizonSeconds:horizon,durationMs,
   entryDecisionHorizonSeconds:horizon,entryAnalyst:{independent:true,
     qualification:{allowed:false},signal:{actionable:false}},
   scenario:null,scenarioProjection,
   reason:receipt?'Projeção '+side+' até '+new Date(receipt.targetAt).toISOString()+
     ' · preço esperado '+(predictedPrice??'—')+' · análise experimental sem sinal de entrada.':
     'Aguardando cotações válidas para previsão '+horizon+'s.',
   engineId:request.engineId,experimental:true
 };
 return{
   engineId:request.engineId,engineFamily:request.engineFamily,
   expirySeconds:horizon,
   source:'user-selected-expiry',modelVersion:'vnext-single-owner-v1',
   timestamp:now,price:quotePrice,quoteAgeMs:now-Number(snap.quoteTs||0),
   computedStatus:computed?.status||'unavailable',receipt,cards,projection,
   forecastFoundation:analog?'historical-forward-outcomes':'extrapolation-pending-outcomes',
   historicalComparisons:analog?.comparisons||0,similarCases:analog?.neighbors||0,
   plan,operational,scenarioProjection,
   evaluation:evaluateForwardForecast,
   calibrationKey:request.calibrationKey,
   reason:operational.reason
 };
}

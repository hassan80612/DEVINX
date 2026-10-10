import {selectedEngineForecastRequest} from './scenario-engine-catalog.mjs';
import {automaticForwardPrediction} from './automatic-forward-model.mjs';
import {specialistForwardPrediction} from './specialist-forward-models.mjs';
import {recordForwardForecast,evaluateForwardForecast} from './forward-forecast-receipt.mjs';

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
 const freshQuote=Number(snap.quoteTs)>0&&Number(snap.quoteTs)<=now&&now-Number(snap.quoteTs)<=2500;
 const recentQuote=quotes.filter(q=>Number(q.ts)<=now).at(-1);
 const quotePrice=Number(snap.price||recentQuote?.price||0);
 // Keep the recorded source quote synchronized with the actual model input.
 const quoteTime=Number(computed?.diagnostic?.quoteAt||recentQuote?.ts||snap.quoteTs||0);
 const quoteMatches=Number(computed?.diagnostic?.referencePrice||0)>0&&
   Math.abs(Number(computed.diagnostic.referencePrice)-quotePrice)<=
   Math.max(1e-10,quotePrice*1e-7);
 const report=freshQuote&&quoteMatches&&computed?.prediction?
   recordForwardForecast({request:{...request,asset,provider},
     referenceQuote:{at:quoteTime,price:quotePrice},
     prediction:computed.prediction,createdAt:now}):
   {status:freshQuote?'quote-not-synchronized':'stale-live-quote',receipt:null};
 const receipt=report.receipt||null,side=receipt?.side||null;
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
   computedStatus:computed?.status||'unavailable',receipt,
   plan,operational,scenarioProjection,
   evaluation:evaluateForwardForecast,
   calibrationKey:request.calibrationKey,
   reason:operational.reason
 };
}

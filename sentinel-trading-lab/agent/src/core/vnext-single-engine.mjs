import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
import {causalForwardPath} from './causal-interval-forecast-1371.mjs';
import {selectedEngineForecastRequest} from './scenario-engine-catalog.mjs';
import {automaticForwardPrediction} from './automatic-forward-model.mjs';
import {specialistForwardPrediction} from './specialist-forward-models.mjs';
import {recordForwardForecast,evaluateForwardForecast} from './forward-forecast-receipt.mjs';
import {lightweightDashboard} from './vnext-market-cards.mjs';
import {historicalForwardAnalogs} from './historical-forward-analogs.mjs';
import {structureForecast} from './automatic-structure-forecast.mjs';
import {specialistStructurePrediction} from './specialist-structure-models.mjs';
import {selectiveIntervalForecast} from './selective-forward-model.mjs';
import {coherentInterval,observedNoise} from './forward-direction-quality.mjs';

/**
 * VNext main-scenario signal adapter. Computes only the selected motor;
 * no cross-engine votes, no broker expiration extraction and no old strategy
 * ensemble. Entries are informational until forward performance is measured.
 */
export function singleEngineForecast({
 settings={},snap={},now=Date.now(),provider=snap.provider||'unknown',forecastModel='original-67',adaptiveHistory=null
}={}){
 const asset=String(settings.asset||'UNKNOWN').toUpperCase();
 const request=selectedEngineForecastRequest({settings,provider,asset,
   broker:{instrument:String(snap.instrument||'manual')},now});
 const seconds=request.forecastHorizonSeconds;
 const quotes=Array.isArray(snap.quoteHistory)?snap.quoteHistory:[];
 const options={quoteHistory:quotes,asOf:now,selectedSeconds:seconds};
 const autonomous=settings.forecastMode==='selective';
 const selective=!autonomous&&request.engineId==='selective_forecast'?selectiveIntervalForecast({quoteHistory:adaptiveHistory||quotes,asOf:now,entryDelaySeconds:0,holdingSeconds:seconds}):null;
 const selectedStrengths=!autonomous&&forecastModel==='selected-strengths-67.5';
 const causal=!autonomous&&request.engineId==='automatic'&&forecastModel==='causal-interval-1371'?
   causalForwardPath({quoteHistory:adaptiveHistory||quotes,asOf:now,
     holdingSeconds:seconds,maxSeconds:seconds}):null;
 const selectedSpecialist=selectedStrengths&&['breakout','fibonacci_retest'].includes(request.engineId);
 const specialistCandidate=!autonomous&&request.engineId!=='automatic'&&(forecastModel==='specialist-structure-v2'||selectedSpecialist)?
   specialistStructurePrediction({...options,engineId:request.engineId}):null;
 const useSpecialist=!!specialistCandidate?.prediction;
 const structure=!autonomous&&request.engineId==='automatic'&&(forecastModel==='structure-context-v2'||selectedStrengths)?
   structureForecast(options):null;
 const useStructure=!!structure&&(!!structure.cycle||
   (structure.meanReversionEvidence.rate>.004&&structure.meanReversionEvidence.tStatistic>3.5));
 const learned=!autonomous&&request.engineId==='automatic'&&forecastModel==='adaptive-direct-trajectory-v1'?
   adaptiveDirectTrajectory({quoteHistory:adaptiveHistory||quotes,asOf:now,
     entryDelaySeconds:0,holdingSeconds:seconds}):null;
 const useAdaptive=learned?.status==='adaptive-direct-trajectory';
 const modelVersion=autonomous?'selective-historical-outcomes-v2':causal?'causal-interval-1371':selective?'selective-interval-v1':useSpecialist?'specialist-structure-v2':useStructure?'structure-context-v2':useAdaptive?'adaptive-direct-trajectory-v1':'vnext-single-owner-v1';
 // The selective decision belongs only to the HISTORICAL future-entry
 // estimator (T+H to T+2H). Never show the unrelated trend extrapolator
 // (now to T+H) as a second CALL/PUT in the same selective card.
 const computed=autonomous?{status:'selective-historical-analysis',
   diagnostic:{referencePrice:quotes.at(-1)?.price,quoteAt:snap.quoteTs},
   prediction:null}:selective?{
   status:selective.status,
   diagnostic:{referencePrice:selective.expectedPath?.[0]?.price,quoteAt:selective.latestObservedQuoteAt},
   prediction:selective.qualified?{side:selective.side,projectedPrice:selective.projectedExitPrice,
     expectedLow:selective.expectedLow,expectedHigh:selective.expectedHigh,modelConfidence:null,
     evidence:[selective.reason,'Margem sobre volatilidade e resultados históricos concluídos']}:null
 }:causal?{
   status:causal.status,
   diagnostic:{referencePrice:causal.referencePrice,quoteAt:causal.latestQuoteAt},
   prediction:causal.status==='causal-forward-path'?(()=>{
     const base=Number(causal.referencePrice),predicted=causal.priceAt(seconds);
     if(!(base>0&&predicted>0))return null;
     return {side:predicted>base?'CALL':predicted<base?'PUT':'NEUTRAL',
       projectedPrice:predicted,
       expectedLow:predicted*Math.exp(-1.5*causal.sigmaPerSqrtSecond*Math.sqrt(seconds)),
       expectedHigh:predicted*Math.exp(1.5*causal.sigmaPerSqrtSecond*Math.sqrt(seconds)),
       modelConfidence:null,evidence:[
         'Projection of the real future price using 15s/30s/60s/90s causal structure',
         'Completed independent past intervals '+causal.analogExamples+'; regime '+causal.regime,
         'No current-candle veto, no old-67 extrapolation and no claimed win rate']};
    })():null
 }:useStructure?{
   status:'candidate-forward-prediction',
   diagnostic:{referencePrice:structure.referencePrice,quoteAt:structure.latestTrainingOutcomeAt},
   prediction:{side:structure.side,projectedPrice:structure.projectedPrice,
     expectedLow:structure.expectedLow,expectedHigh:structure.expectedHigh,modelConfidence:null,
     evidence:['Histórico concluído: '+structure.trainingExamples+' exemplos para o prazo exato '+seconds+'s',
       structure.cycle?'Ciclo validado em trecho histórico posterior ao ajuste':'Retorno à média sustentado pelo histórico',
       'Regressão regularizada, três janelas anteriores e validação cronológica; não é taxa de acerto real']}
 }:useAdaptive?{
   status:'candidate-forward-prediction',
   diagnostic:{referencePrice:learned.expectedPath[0].price,quoteAt:learned.latestObservedQuoteAt},
   prediction:{side:learned.side||'NEUTRAL',projectedPrice:learned.projectedExitPrice,
     expectedLow:learned.expectedLow,expectedHigh:learned.expectedHigh,modelConfidence:null,
     evidence:['Trajetória futura aprendida de resultados históricos já concluídos',
       'Entrada e vencimento calculados em tempos próprios; validação cronológica sem cotações futuras']}
 }:request.engineId==='automatic'?
   automaticForwardPrediction(options):
   useSpecialist?specialistCandidate:
     specialistForwardPrediction({...options,engineId:request.engineId});
 // Unlike pure momentum extrapolation, these independently observed outcomes
 // are prices that followed comparable PAST quote patterns by the SELECTED
 // expiration. No last/current candle direction is a decision gate.
 const analog=autonomous||selective||useAdaptive||useStructure||causal?null:historicalForwardAnalogs({
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
 // The current market-context display must not assert an almost-zero
 // directional move as a meaningful CALL/PUT. The same check also verifies
 // that the side agrees with its projected price.
 if(forecastPrediction){
   const base=Number(computed?.diagnostic?.referencePrice||quotes.at(-1)?.price);
   const noise=observedNoise({quotes:adaptiveHistory||quotes,now,horizonSeconds:seconds});
   const coherence=coherentInterval({entryPrice:base,
     exitPrice:forecastPrediction.projectedPrice,side:forecastPrediction.side,noise});
   if(!coherence.qualified)forecastPrediction=null;
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
   currentPrice:receipt.referencePrice,modelVersion,
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
   engineId:request.engineId,modelVersion,
   reason:'Estimativa de preço para o prazo selecionado.'
 }:null;
 const operational={
   asset,side:'AGUARDAR',state:'PROJETANDO',ready:false,actionable:false,
   confidence:null,forecastHorizonSeconds:horizon,durationMs,
   entryDecisionHorizonSeconds:horizon,entryAnalyst:{independent:true,
     qualification:{allowed:false},signal:{actionable:false}},
   scenario:null,scenarioProjection,
   reason:receipt?'Projeção '+side+' até '+new Date(receipt.targetAt).toISOString()+
     ' · preço esperado '+(predictedPrice??'—')+' · projeção futura.':
     request.engineId==='selective_forecast'?'Aguardando entrada futura qualificada pela previsão seletiva.':
     'Aguardando cotações válidas para previsão '+horizon+'s.',
   engineId:request.engineId,experimental:true
 };
 return{
   engineId:request.engineId,engineFamily:request.engineFamily,
   expirySeconds:horizon,
   source:'user-selected-expiry',modelVersion,
   timestamp:now,price:quotePrice,quoteAgeMs:now-Number(snap.quoteTs||0),
   computedStatus:computed?.status||'unavailable',receipt,cards,projection,
   forecastFoundation:autonomous?'selective-historical-outcomes':selective?'selective-interval-v1':useStructure?'structure-context-v2':useAdaptive?'adaptive-direct-trajectory':analog?'historical-forward-outcomes':'extrapolation-pending-outcomes',
   historicalComparisons:useStructure?structure.trainingExamples:useAdaptive?learned.historicalExamples:analog?.comparisons||0,
   similarCases:useStructure?structure.trainingExamples:useAdaptive?learned.historicalExamples:analog?.neighbors||0,
   plan,operational,scenarioProjection,
   evaluation:evaluateForwardForecast,
   calibrationKey:request.calibrationKey,
   reason:operational.reason
 };
}

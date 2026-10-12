import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
import {structureForecast} from './automatic-structure-forecast.mjs';
export function qualifyStrategyInterval({forecast,quoteHistory=[],asOf=Date.now()}={}){
 const h=Number(forecast?.holdingSeconds),known=quoteHistory.filter(q=>Number(q.ts)<=asOf&&Number(q.receivedAt??q.ts)<=asOf);
 const diagnostics={};
 const structure=structureForecast({quoteHistory:known,asOf,selectedSeconds:h,diagnostics});
 const historicalEvidence=!!structure?.cycle||(structure?.meanReversionEvidence.rate>.004&&structure?.meanReversionEvidence.tStatistic>3.5);
 const recent=known.filter(q=>Number(q.ts)>=asOf-180000).sort((a,b)=>a.ts-b.ts);let square=0,seconds=0;
 for(let i=1;i<recent.length;i++){const dt=(recent[i].ts-recent[i-1].ts)/1000;if(dt>0&&dt<=10&&recent[i].price>0&&recent[i-1].price>0){square+=Math.log(recent[i].price/recent[i-1].price)**2;seconds+=dt;}}
 const sigma=seconds?Math.sqrt(square/seconds):0,threshold=h<=30?1:h<=60?1.5:h<=180?.5:1;
 const margin=forecast?.projectedEntryPrice>0&&forecast?.projectedExitPrice>0&&sigma>0?Math.abs(Math.log(forecast.projectedExitPrice/forecast.projectedEntryPrice))/(sigma*Math.sqrt(h)):0;
 const qualified=['CALL','PUT'].includes(forecast?.side)&&historicalEvidence&&margin>=threshold;
 return {...forecast,forecastMode:'selective',rawSide:forecast?.side||null,side:qualified?forecast.side:null,
   status:qualified?'forecast':'waiting-selective-entry',qualification:{qualified,historicalEvidence,margin,threshold,...diagnostics},
   reason:qualificationReason({qualified,historicalEvidence,margin,threshold,diagnostics})};
}
// Own interval forecast. Selection uses information known at issuance, never
// the outcome; model confidence remains uncalibrated and is not a win rate.
export function selectiveIntervalForecast({quoteHistory=[],asOf=Date.now(),entryDelaySeconds=0,holdingSeconds=30}={}){
 const known=quoteHistory.filter(q=>Number(q.ts)<=asOf&&Number(q.receivedAt??q.ts)<=asOf);
 const recent=known.filter(q=>Number(q.ts)>=asOf-180000).sort((a,b)=>Number(a.ts)-Number(b.ts));
 let sq=0,seconds=0;for(let i=1;i<recent.length;i++){const dt=(recent[i].ts-recent[i-1].ts)/1000;if(dt>0&&dt<=10&&recent[i].price>0&&recent[i-1].price>0){sq+=Math.log(recent[i].price/recent[i-1].price)**2;seconds+=dt;}}
 const learned=adaptiveDirectTrajectory({quoteHistory:known,asOf,entryDelaySeconds,holdingSeconds});
 const diagnostics={};
 const structure=structureForecast({quoteHistory:known,asOf,selectedSeconds:holdingSeconds,diagnostics});
 const historicalEvidence=!!structure?.cycle||(structure?.meanReversionEvidence.rate>.004&&structure?.meanReversionEvidence.tStatistic>3.5);
 const threshold=holdingSeconds<=30?1:holdingSeconds<=60?1.5:holdingSeconds<=180?.5:1;
 const sigma=seconds>0?Math.sqrt(sq/seconds):0;
 const margin=learned.projectedEntryPrice>0&&learned.projectedExitPrice>0&&sigma>0?
   Math.abs(Math.log(learned.projectedExitPrice/learned.projectedEntryPrice))/(sigma*Math.sqrt(holdingSeconds)):0;
 const qualified=learned.status==='adaptive-direct-trajectory'&&!!learned.side&&historicalEvidence&&margin>=threshold;
 return {...learned,side:qualified?learned.side:null,rawSide:learned.side,qualified,
   modelVersion:'selective-interval-v1',status:qualified?'forecast':'waiting-selective-entry',
   qualification:{historicalEvidence,margin,threshold,qualified,...diagnostics},
   reason:qualificationReason({qualified,historicalEvidence,margin,threshold,diagnostics})};
}

function qualificationReason({qualified,historicalEvidence,margin,threshold,diagnostics}){
 if(qualified)return 'Entrada futura qualificada.';
 if(diagnostics.status==='waiting-quote')return 'Aguardando cotação atual do PC.';
 if(diagnostics.status==='waiting-history')return `Formando histórico: ${Math.floor(diagnostics.historySeconds/60)}min ${diagnostics.historySeconds%60}s de ${Math.floor(diagnostics.requiredSeconds/60)}min ${diagnostics.requiredSeconds%60}s.`;
 if(!historicalEvidence)return 'Analisando: sem padrão histórico confirmado.';
 if(margin<threshold)return 'Analisando: projeção abaixo da margem seletiva.';
 return 'Aguardando projeção da estratégia selecionada.';
}

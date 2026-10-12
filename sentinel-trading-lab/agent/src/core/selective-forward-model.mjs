import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
import {structureForecast} from './automatic-structure-forecast.mjs';
// Own interval forecast. Selection uses information known at issuance, never
// the outcome; model confidence remains uncalibrated and is not a win rate.
export function selectiveIntervalForecast({quoteHistory=[],asOf=Date.now(),entryDelaySeconds=0,holdingSeconds=30}={}){
 const known=quoteHistory.filter(q=>Number(q.ts)<=asOf&&Number(q.receivedAt??q.ts)<=asOf);
 const recent=known.filter(q=>Number(q.ts)>=asOf-180000).sort((a,b)=>Number(a.ts)-Number(b.ts));
 let sq=0,seconds=0;for(let i=1;i<recent.length;i++){const dt=(recent[i].ts-recent[i-1].ts)/1000;if(dt>0&&dt<=10&&recent[i].price>0&&recent[i-1].price>0){sq+=Math.log(recent[i].price/recent[i-1].price)**2;seconds+=dt;}}
 const learned=adaptiveDirectTrajectory({quoteHistory:known,asOf,entryDelaySeconds,holdingSeconds});
 const structure=structureForecast({quoteHistory:known,asOf,selectedSeconds:holdingSeconds});
 const historicalEvidence=!!structure?.cycle||(structure?.meanReversionEvidence.rate>.004&&structure?.meanReversionEvidence.tStatistic>3.5);
 const threshold=holdingSeconds<=30?1:holdingSeconds<=60?1.5:holdingSeconds<=180?.5:1;
 const sigma=seconds>0?Math.sqrt(sq/seconds):0;
 const margin=learned.projectedEntryPrice>0&&learned.projectedExitPrice>0&&sigma>0?
   Math.abs(Math.log(learned.projectedExitPrice/learned.projectedEntryPrice))/(sigma*Math.sqrt(holdingSeconds)):0;
 const qualified=learned.status==='adaptive-direct-trajectory'&&!!learned.side&&historicalEvidence&&margin>=threshold;
 return {...learned,side:qualified?learned.side:null,rawSide:learned.side,qualified,
   modelVersion:'selective-interval-v1',status:qualified?'forecast':'waiting-selective-entry',
   qualification:{historicalEvidence,margin,threshold,qualified},
   reason:qualified?'Entrada futura qualificada pela previsão seletiva.':'Aguardando entrada futura qualificada.'};
}

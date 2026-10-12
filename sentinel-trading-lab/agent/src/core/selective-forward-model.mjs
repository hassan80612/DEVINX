import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
import {structureForecast} from './automatic-structure-forecast.mjs';
// One causal evidence pass is shared by every future interval in a matrix.
export function strategyEvidence({quoteHistory=[],asOf=Date.now()}={}){
 const known=quoteHistory.filter(q=>Number(q.ts)<=asOf&&Number(q.receivedAt??q.ts)<=asOf&&Number(q.price)>0).sort((a,b)=>a.ts-b.ts);
 const recent=known.filter(q=>Number(q.ts)>=asOf-180000);let square=0,seconds=0;
 for(let i=1;i<recent.length;i++){const dt=(recent[i].ts-recent[i-1].ts)/1000;if(dt>0&&dt<=10){square+=Math.log(recent[i].price/recent[i-1].price)**2;seconds+=dt;}}
 const sigma=seconds?Math.sqrt(square/seconds):0;
 // Use three completed 30s intervals, never just the forming candle.
 const endpoint=at=>{const q=known.findLast(q=>q.ts<=at);return q&&at-q.ts<=3000?q.price:null;};
 const prices=[90,60,30,0].map(s=>endpoint(asOf-s*1000));
 const ready=prices.every(p=>p>0)&&seconds>=60&&sigma>0;
 const moves=ready?prices.slice(1).map((p,i)=>Math.log(p/prices[i])):[];
 const total=moves.reduce((a,b)=>a+b,0),trendSide=total>0?'CALL':'PUT';
 const trend=ready&&moves.filter(m=>Math.sign(m)===Math.sign(total)).length>=2&&Math.abs(total)/(sigma*Math.sqrt(90))>=1.5;
 // Cycles/reversion remain a second source of evidence; compute once, not
 // once per horizon. Trend evidence also works during the initial warmup.
 const structure=trend?null:structureForecast({quoteHistory:known,asOf,selectedSeconds:30});
 const structural=!!structure?.cycle||(structure?.meanReversionEvidence.rate>.004&&structure?.meanReversionEvidence.tStatistic>3.5);
 return {ready,sigma,trend,trendSide,structural};
}
export function qualifyStrategyInterval({forecast,quoteHistory=[],asOf=Date.now(),evidence=null}={}){
 const h=Number(forecast?.holdingSeconds),context=evidence||strategyEvidence({quoteHistory,asOf});
 const historicalEvidence=context.structural||(context.trend&&context.trendSide===forecast?.side);
 const threshold=h<=30?1:h<=60?1.5:h<=180?.5:1;
 const margin=forecast?.projectedEntryPrice>0&&forecast?.projectedExitPrice>0&&context.sigma>0?Math.abs(Math.log(forecast.projectedExitPrice/forecast.projectedEntryPrice))/(context.sigma*Math.sqrt(h)):0;
 const qualified=['CALL','PUT'].includes(forecast?.side)&&context.ready&&historicalEvidence&&margin>=threshold;
 return {...forecast,forecastMode:'selective',rawSide:forecast?.side||null,side:qualified?forecast.side:null,
   status:qualified?'forecast':context.ready?'waiting-selective-entry':'insufficient-selective-history',
   qualification:{qualified,historicalEvidence,margin,threshold,historyReady:context.ready,evidence:context.structural?'structure':historicalEvidence?'trend':null},
   reason:qualified?'Entrada futura qualificada.':context.ready?'Aguardando entrada futura qualificada.':'Aguardando histórico para previsão seletiva.'};
}
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

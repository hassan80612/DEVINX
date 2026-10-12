import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
import {structureForecast} from './automatic-structure-forecast.mjs';
// Shared causal evidence. Three COMPLETED 30-second bars allow the selected
// strategy to qualify early when the direction is corroborated; this never
// converts the current forming candle directly into an entry signal.
export function selectiveEvidence({quoteHistory=[],asOf=Date.now()}={}){
 const known=quoteHistory.filter(q=>Number.isFinite(Number(q.ts))&&Number(q.ts)<=asOf&&
   Number(q.receivedAt??q.ts)<=asOf&&Number.isFinite(Number(q.price))&&Number(q.price)>0)
   .sort((a,b)=>Number(a.ts)-Number(b.ts));
 const last=known.at(-1),quoteAge=last?asOf-Number(last.ts):Infinity;
 let start=known.length?known.length-1:0;
 // Same causal 8s historical tolerance as the learned selective estimator.
 // This counts OBSERVED historical quotes only. Live entry freshness remains 2.5s.
 while(start>0&&Number(known[start].ts)-Number(known[start-1].ts)<=8000)start--;
 // Keep the exact uninterrupted count for the long evidence model.
 const historySeconds=last?Math.max(1,Math.floor((Number(last.ts)-Number(known[start].ts))/1000)+1):0;
 const recent=known.filter(q=>Number(q.ts)>=asOf-180000);
 let squared=0,seconds=0;
 for(let i=1;i<recent.length;i++){
  const dt=(Number(recent[i].ts)-Number(recent[i-1].ts))/1000;
  // Actual observed returns, standardized by elapsed seconds: no made-up ticks.
  if(dt>0&&dt<=10){squared+=Math.log(Number(recent[i].price)/Number(recent[i-1].price))**2;seconds+=dt;}
 }
 const sigma=seconds>0?Math.sqrt(squared/seconds):0;
 const closedAt=Math.floor(asOf/30000)*30000;
 const endpoint=at=>{const q=known.findLast(p=>Number(p.ts)<=at);
  return q&&at-Number(q.ts)<=8000?Number(q.price):null;};
 const boundaries=[3,2,1,0].map(x=>closedAt-x*30000);
 const prices=boundaries.map(endpoint);
 // Three completed 30s periods need real updates throughout EACH interval.
 // Brokerage quotes arriving every 3–7s remain valid historical observations.
 const barsCovered=boundaries.slice(1).every((end,i)=>{
   const begin=boundaries[i],bar=known.filter(q=>Number(q.ts)>begin&&Number(q.ts)<=end);
   return bar.length>=3&&Number(bar[0].ts)-begin<=8000&&
     end-Number(bar.at(-1).ts)<=8000&&Number(bar.at(-1).ts)-Number(bar[0].ts)>=14000;
 });
 const ready=quoteAge>=0&&quoteAge<=2500&&seconds>=60&&sigma>0&&
   barsCovered&&prices.every(p=>p>0);
 const moves=ready?prices.slice(1).map((p,i)=>Math.log(p/prices[i])):[];
 const total=moves.reduce((a,b)=>a+b,0),direction=total>0?'CALL':total<0?'PUT':null;
 const agreeing=moves.filter(x=>direction==='CALL'?x>0:x<0).length;
 const normalized=ready?Math.abs(total)/(sigma*Math.sqrt(90)):0;
 const earlyTrend=ready&&agreeing>=2&&normalized>=1.5&&
   !(moves.at(-1)*total<0&&Math.abs(moves.at(-1))>Math.abs(total)*.5);
 return {known,sigma,historySeconds,quoteAge,earlyReady:ready,earlyTrend,earlyDirection:earlyTrend?direction:null,
   earlyStrength:normalized,longByHorizon:new Map()};
}
export function qualifyStrategyInterval({forecast,quoteHistory=[],asOf=Date.now(),evidence=null,checkLong=true}={}){
 const h=Number(forecast?.holdingSeconds);
 const ctx=evidence||selectiveEvidence({quoteHistory,asOf});
 const requiredSeconds=Math.max(720+h,601+h+29*Math.max(5,Math.floor(h/6)));
 const diagnostics={status:ctx.quoteAge>2500?'waiting-quote':'waiting-history',
   historySeconds:ctx.historySeconds,requiredSeconds};
 let structure=null;
 if(checkLong&&ctx.quoteAge<=2500&&Number.isFinite(h)&&h>0&&ctx.historySeconds>=requiredSeconds){
  if(ctx.longByHorizon.has(h)){
   const cached=ctx.longByHorizon.get(h);structure=cached.structure;Object.assign(diagnostics,cached.diagnostics);
  }else{
   const longDiagnostic={};
   structure=structureForecast({quoteHistory:ctx.known,asOf,selectedSeconds:h,diagnostics:longDiagnostic,historicalQuoteGapMs:8000});
   Object.assign(diagnostics,longDiagnostic);
   ctx.longByHorizon.set(h,{structure,diagnostics:longDiagnostic});
  }
 }
 const structural=!!structure?.cycle||(structure?.meanReversionEvidence.rate>.004&&structure?.meanReversionEvidence.tStatistic>3.5);
 const earlyAligned=ctx.earlyTrend&&ctx.earlyDirection===forecast?.side;
 const historicalEvidence=!!structural||!!earlyAligned;
 const threshold=h<=30?1:h<=60?1.5:h<=180?.5:1;
 const margin=forecast?.projectedEntryPrice>0&&forecast?.projectedExitPrice>0&&ctx.sigma>0?
   Math.abs(Math.log(forecast.projectedExitPrice/forecast.projectedEntryPrice))/(ctx.sigma*Math.sqrt(h)):0;
 const qualified=ctx.quoteAge>=0&&ctx.quoteAge<=2500&&['CALL','PUT'].includes(forecast?.side)&&
   historicalEvidence&&Number.isFinite(h)&&h>0&&margin>=threshold;
 return {...forecast,forecastMode:'selective',rawSide:forecast?.side||null,side:qualified?forecast.side:null,
   status:qualified?'forecast':'waiting-selective-entry',
   qualification:{qualified,historicalEvidence,margin,threshold,evidence:earlyAligned?'three-completed-bars':structural?'historical-structure':null,...diagnostics},
   reason:qualified?'Entrada futura qualificada.':ctx.quoteAge>2500?
     'Aguardando cotação atual do PC.':!['CALL','PUT'].includes(forecast?.side)?
     'Estratégia ainda sem previsão calculada para este intervalo.':earlyAligned&&margin<threshold?
     'Três velas fechadas confirmadas; projeção abaixo da margem seletiva.':
     qualificationReason({qualified,historicalEvidence,margin,threshold,diagnostics})};
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

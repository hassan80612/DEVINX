import {adaptiveDirectTrajectory} from './adaptive-direct-trajectory.mjs';
// Shared causal evidence. Three COMPLETED 30-second bars allow the selected
// strategy to qualify early when the direction is corroborated; this never
// converts the current forming candle directly into an entry signal.
export function selectiveEvidence({quoteHistory=[],asOf=Date.now(),selectedSeconds=30}={}){
 // A 5s entry does not need 90s candles, while 30s+ retains the proven
 // closed 30-second structure. At least three COMPLETE bars are mandatory.
 const period=Math.max(10,Math.min(30,Math.round(Number(selectedSeconds)||30)));
 const barMs=period*1000;
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
 const closedAt=Math.floor(asOf/barMs)*barMs;
 const endpoint=at=>{const q=known.findLast(p=>Number(p.ts)<=at);
  return q&&at-Number(q.ts)<=8000?Number(q.price):null;};
 const boundaries=[3,2,1,0].map(x=>closedAt-x*barMs);
 const prices=boundaries.map(endpoint);
 // Three completed 30s periods need real updates throughout EACH interval.
 // Brokerage quotes arriving every 3–7s remain valid historical observations.
 const barsCovered=boundaries.slice(1).every((end,i)=>{
   const begin=boundaries[i],bar=known.filter(q=>Number(q.ts)>begin&&Number(q.ts)<=end);
   return bar.length>=(period<=15?2:3)&&Number(bar[0].ts)-begin<=8000&&
     end-Number(bar.at(-1).ts)<=8000&&
     Number(bar.at(-1).ts)-Number(bar[0].ts)>=(period<=15?3000:14000);
 });
 // Completed-candle evidence is historical and must not vanish between two
 // genuine broker ticks. Live quote eligibility stays at <=2.5s in the
 // separate qualification gate below; this never authorizes a stale entry.
 const ready=seconds>=Math.min(60,period*2)&&sigma>0&&barsCovered&&prices.every(p=>p>0);
 const moves=ready?prices.slice(1).map((p,i)=>Math.log(p/prices[i])):[];
 const total=moves.reduce((a,b)=>a+b,0),direction=total>0?'CALL':total<0?'PUT':null;
 const agreeing=moves.filter(x=>direction==='CALL'?x>0:x<0).length;
 const normalized=ready?Math.abs(total)/(sigma*Math.sqrt(period*3)):0;
 const earlyTrend=ready&&agreeing>=2&&normalized>=(period<=15?.85:1.05)&&
   !(moves.at(-1)*total<0&&Math.abs(moves.at(-1))>Math.abs(total)*.5);
 return {known,sigma,historySeconds,quoteAge,earlyReady:ready,earlyTrend,barSeconds:period,earlyDirection:earlyTrend?direction:null,
   earlyStrength:normalized,longByHorizon:new Map()};
}
export function qualifyStrategyInterval({forecast,quoteHistory=[],asOf=Date.now(),evidence=null,checkLong=true}={}){
 const h=Number(forecast?.holdingSeconds);
 const ctx=evidence||selectiveEvidence({quoteHistory,asOf});
 // The obsolete 12-minute statistical regression is NOT a prerequisite for
 // any selected horizon. Use three completed, time-scaled bars plus a real
 // projected entry/exit difference. The independent live quote gate remains.
 const requiredSeconds=3*Number(ctx.barSeconds||Math.max(10,Math.min(30,h)));
 const earlyAligned=ctx.earlyTrend&&ctx.earlyDirection===forecast?.side;
 const historicalEvidence=!!earlyAligned;
 const diagnostics={status:ctx.quoteAge>2500?'waiting-quote':
   ctx.earlyReady?'ready':'waiting-history',historySeconds:ctx.historySeconds,
   requiredSeconds,barSeconds:ctx.barSeconds||30};
 const threshold=h<=15?.65:h<=30?.8:h<=60?1:h<=180?.75:1;
 const margin=forecast?.projectedEntryPrice>0&&forecast?.projectedExitPrice>0&&ctx.sigma>0?
   Math.abs(Math.log(forecast.projectedExitPrice/forecast.projectedEntryPrice))/(ctx.sigma*Math.sqrt(h)):0;
 const qualified=ctx.quoteAge>=0&&ctx.quoteAge<=2500&&['CALL','PUT'].includes(forecast?.side)&&
   historicalEvidence&&Number.isFinite(h)&&h>0&&margin>=threshold;
 return {...forecast,forecastMode:'selective',rawSide:forecast?.side||null,side:qualified?forecast.side:null,
   status:qualified?'forecast':'waiting-selective-entry',
   qualification:{qualified,historicalEvidence,margin,threshold,evidence:earlyAligned?'three-completed-bars':null,...diagnostics},
   reason:qualified?'Entrada futura qualificada.':ctx.quoteAge>2500?
     'Aguardando cotação atual do PC.':!['CALL','PUT'].includes(forecast?.side)?
     'Estratégia ainda sem previsão calculada para este intervalo.':earlyAligned&&margin<threshold?
     'Três velas fechadas confirmadas; projeção abaixo da margem seletiva.':
     qualificationReason({qualified,historicalEvidence,margin,threshold,diagnostics})};
}
// Own interval forecast. Selection uses information known at issuance, never
// the outcome; model confidence remains uncalibrated and is not a win rate.
// Legacy entry-point delegates to the same short-history gate. No hidden
// 12-minute model may reintroduce an impossible startup delay.
export function selectiveIntervalForecast({quoteHistory=[],asOf=Date.now(),entryDelaySeconds=0,holdingSeconds=30}={}){
 const learned=adaptiveDirectTrajectory({quoteHistory,asOf,entryDelaySeconds,
   holdingSeconds,historicalQuoteGapMs:8000});
 return qualifyStrategyInterval({forecast:learned,quoteHistory,asOf,checkLong:false,
   evidence:selectiveEvidence({quoteHistory,asOf,selectedSeconds:holdingSeconds})});
}

function qualificationReason({qualified,historicalEvidence,margin,threshold,diagnostics}){
 if(qualified)return 'Entrada futura qualificada.';
 if(diagnostics.status==='waiting-quote')return 'Aguardando cotação atual do PC.';
 if(diagnostics.status==='waiting-history')return `Formando histórico: ${Math.floor(diagnostics.historySeconds/60)}min ${diagnostics.historySeconds%60}s de ${Math.floor(diagnostics.requiredSeconds/60)}min ${diagnostics.requiredSeconds%60}s.`;
 if(!historicalEvidence)return 'Analisando: sem padrão histórico confirmado.';
 if(margin<threshold)return 'Analisando: projeção abaixo da margem seletiva.';
 return 'Aguardando projeção da estratégia selecionada.';
}

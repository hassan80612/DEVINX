/**
 * Three lightweight information-only PC cards, derived from the SAME quote
 * history already consumed by the selected independent forecast motor.
 * No legacy strategy calculations or third motor voting.
 *
 * The displayed percentages are NORMALIZED DIRECTIONAL PRESSURE; they are
 * NOT model success probabilities or historical win rate.
 */
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function sampleBefore(quotes,ts){
 for(let i=quotes.length-1;i>=0;i--){
  if(Number(quotes[i]?.ts)<=ts&&Number(quotes[i]?.price)>0)return Number(quotes[i].price);
 }return null;
}
function card(id,label,logMovement,noise,display){
 const ratio=Number.isFinite(logMovement)?logMovement/Math.max(1e-12,Number(noise)):0;
 const callPct=Math.round(clamp(50+42*Math.tanh(ratio),8,92));
 const side=callPct>51?'CALL':callPct<49?'PUT':'NEUTRO';
 return Object.freeze({id,label,side,strength:callPct,hint:display,
  callPct,putPct:100-callPct,kind:'directional-pressure-not-probability'});
}
export function lightweightReadings({quoteHistory=[],receipt=null,now=Date.now()}={}){
 const seen=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(q=>
  Number.isFinite(Number(q?.ts))&&Number(q.ts)<=now&&Number(q?.price)>0)
  .sort((a,b)=>Number(a.ts)-Number(b.ts)).slice(-900);
 const last=seen.at(-1),p=Number(last?.price||0);
 if(!(p>0))return [];
 const previous8=sampleBefore(seen,Number(last.ts)-8000);
 const previous60=sampleBefore(seen,Number(last.ts)-60000);
 const p8=previous8??p,p60=previous60??p;
 const log8=Math.log(p/p8),log60=Math.log(p/p60);
 let square=0,count=0;
 for(let i=1;i<seen.length;i++){
  const dt=(Number(seen[i].ts)-Number(seen[i-1].ts))/1000;
  if(dt<=0||dt>10)continue;
  const r=Math.log(Number(seen[i].price)/Number(seen[i-1].price));
  square+=r*r;count+=dt;
 }
 const perSqrt=count>0?Math.sqrt(square/count):1e-12;
 const forecastMs=Number(receipt?.expirySeconds||30);
 const projected=Number(receipt?.projectedPrice);
 const projectedLog=receipt&&projected>0&&Number(receipt.referencePrice)>0?
   Math.log(projected/Number(receipt.referencePrice)):0;
 return Object.freeze([
  card('pulse','MERCADO AGORA',log8,perSqrt*Math.sqrt(8),'Impulso de 8 segundos'),
  card('history','ESTRUTURA ANTERIOR',log60,perSqrt*Math.sqrt(60),'Movimento histórico de 60 segundos'),
  card('forward','PREVISÃO DO MOTOR',projectedLog,perSqrt*Math.sqrt(forecastMs),'Preço projetado para '+forecastMs+' segundos')
 ]);
}

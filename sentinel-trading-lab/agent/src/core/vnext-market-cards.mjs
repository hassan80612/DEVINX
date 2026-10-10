/**
 * Lightweight TOTALS from a single selected forecasting motor.
 *
 * TOTAL MERCADO: present market pressure derived from received price history.
 * TOTAL MOTOR: projected direction of ONLY the selected motor.
 * TOTAL PRESENTE + FUTURO: descriptive blend of those two readings.
 * MÉDIA: arithmetic mean of the three totals, displayed separately.
 *
 * These are DIRECTIONAL STRENGTH INDICES, NOT win probabilities; no third
 * strategy, no duplicate price forecasts, no broker expiry reads or DB IO.
 */
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
function past(quotes,t){
 let a=0,b=quotes.length-1,k=-1;
 while(a<=b){const i=(a+b)>>1;if(quotes[i].ts<=t){k=i;a=i+1;}else b=i-1}
 return k<0?null:quotes[k];
}
function total(id,label,call,detail){
 const callPct=Number.isFinite(call)?Math.round(clamp(call,0,100)):null;
 const putPct=callPct===null?null:100-callPct;
 const side=callPct===null?'AGUARDAR':callPct>51?'CALL':callPct<49?'PUT':'NEUTRO';
 return Object.freeze({
  id,label,side,strength:callPct,callPct,putPct,hint:detail,
  kind:'directional-strength-index-not-accuracy'
 });
}
export function lightweightReadings({quoteHistory=[],receipt=null,now=Date.now()}={}){
 const valid=new Map();
 for(const row of Array.isArray(quoteHistory)?quoteHistory:[]){
  const ts=Number(row?.ts),price=Number(row?.price);
  if(!Number.isFinite(ts)||ts>now||!Number.isFinite(price)||price<=0)continue;
  valid.set(ts,price);
 }
 const q=[...valid].sort((a,b)=>a[0]-b[0]).slice(-900)
  .map(([ts,price])=>({ts,price}));
 const current=q.at(-1);
 if(!current)return Object.freeze([]);
 const earlier8=past(q,current.ts-8000),earlier60=past(q,current.ts-60000);
 let sumSquares=0,seconds=0;
 for(let i=1;i<q.length;i++){
  const dt=(q[i].ts-q[i-1].ts)/1000;
  if(dt<=0||dt>10)continue;
  const r=Math.log(q[i].price/q[i-1].price);
  sumSquares+=r*r;seconds+=dt;
 }
 const sigma=seconds>0?Math.sqrt(sumSquares/seconds):null;
 const ready=!!(sigma&&earlier8&&earlier60);
 const momentum8=earlier8?Math.log(current.price/earlier8.price):0;
 const momentum60=earlier60?Math.log(current.price/earlier60.price):0;
 const marketPressure=ready?
   50+42*Math.tanh((momentum8*.4+momentum60*.6)/(sigma*Math.sqrt(60))):null;
 const futureSeconds=Number(receipt?.expirySeconds);
 const futurePrice=Number(receipt?.projectedPrice);
 const priceNow=Number(receipt?.referencePrice);
 const validReceipt=receipt?.status==='forecast-created'&&
   ['CALL','PUT'].includes(receipt?.side)&&
   futureSeconds>0&&futurePrice>0&&priceNow>0&&
   Number(receipt?.issuedAt)<=now&&now-Number(receipt?.issuedAt)<=3500;
 const futureChange=validReceipt?Math.log(futurePrice/priceNow):null;
 const futurePressure=validReceipt&&sigma?
   50+42*Math.tanh(futureChange/(sigma*Math.sqrt(futureSeconds))):null;
 const market=total('market','TOTAL MERCADO',marketPressure,'Pressão histórica do preço');
 const engine=total('strategy','TOTAL MOTOR SELECIONADO',futurePressure,'Somente o motor ativo · '+(Number.isFinite(futureSeconds)?futureSeconds+'s':'—'));
 const combined=total('combined','TOTAL PRESENTE + FUTURO',
   market.callPct!==null&&engine.callPct!==null?
    market.callPct*.5+engine.callPct*.5:null,
   'Composição das duas leituras');
 return Object.freeze([market,engine,combined]);
}
export function totalsAverage(cards=[]){
 if(!Array.isArray(cards)||cards.length!==3||
    !cards.every(c=>Number.isFinite(c?.callPct)))return null;
 return total('average','MÉDIA DOS 3 TOTAIS',
   cards.reduce((sum,c)=>sum+c.callPct,0)/3,'Resumo visual; não é ordem de entrada');
}

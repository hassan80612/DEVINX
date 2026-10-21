/**
 * VNext causal, quote-only historic market pressure readings.
 *
 * TOTAL MERCADO AGORA: recent 8-second quote movement.
 * TOTAL ESTRUTURA ANTERIOR: previous 60-second quote movement.
 * TOTAL DOS TOTAIS: the simple average of those two market readings.
 *
 * Only the selected independent engine forecasts the future; its direction,
 * price and expiry belong in Projeção Futura, not in these cards.
 *
 * These are normalized observational indices, NOT win rates, calibrated
 * probabilities, or trading directions. A separate, expiry-verified safety
 * policy MAY use a verified conflict to veto a weak entry. The raw card
 * percentages must never be mistaken for independent success probabilities.
 */
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function quoteBefore(rows,at){
  let l=0,r=rows.length-1,found=-1;
  while(l<=r){const m=(l+r)>>1;if(rows[m].ts<=at){found=m;l=m+1}else r=m-1}
  return found>=0?rows[found]:null;
}
function reading(id,label,value,hint){
  const callPct=Number.isFinite(value)?Math.round(clamp(value,8,92)):null;
  const putPct=callPct===null?null:100-callPct;
  return Object.freeze({
    id,label,callPct,putPct,strength:callPct,
    side:callPct===null?'AGUARDAR':callPct>51?'CALL':callPct<49?'PUT':'NEUTRO',
    hint,kind:'directional-pressure-not-probability'
  });
}
export function lightweightDashboard({quoteHistory=[],receipt=null,now=Date.now(),quoteAt=now}={}){
  const map=new Map();
  for(const x of Array.isArray(quoteHistory)?quoteHistory:[]){
    const ts=Number(x?.ts),p=Number(x?.price),received=Number(x?.receivedAt??ts);
    if(Number.isFinite(ts)&&ts<=Math.min(now,quoteAt)&&received<=now&&Number.isFinite(p)&&p>0)map.set(ts,p);
  }
  const rows=[...map].sort((a,b)=>a[0]-b[0]).slice(-900)
    .map(([ts,price])=>({ts,price}));
  const current=rows.at(-1);
  if(!current)return Object.freeze({cards:Object.freeze([]),projection:null});
  let sumSq=0,seconds=0;
  for(let i=1;i<rows.length;i++){
    const dt=(rows[i].ts-rows[i-1].ts)/1000;
    if(dt<=0||dt>10)continue;
    const move=Math.log(rows[i].price/rows[i-1].price);
    sumSq+=move*move;seconds+=dt;
  }
  const sigma=seconds>0?Math.sqrt(sumSq/seconds):0;
  const pressure=(past,horizon)=>past&&sigma>0?
    50+42*Math.tanh(Math.log(current.price/past.price)/(sigma*Math.sqrt(horizon))):null;
  const market=reading('market-now','TOTAL MERCADO AGORA',
    pressure(quoteBefore(rows,current.ts-8000),8),
    'Força atual observada em 8 segundos');
  const history=reading('prior-structure','TOTAL ESTRUTURA ANTERIOR',
    pressure(quoteBefore(rows,current.ts-60000),60),
    'Movimento anterior observado em 60 segundos');
  const total=reading('total-of-totals','ESTRUTURA ANTERIOR + MERCADO AGORA',
    market.callPct!==null&&history.callPct!==null?
      (market.callPct+history.callPct)/2:null,
    'Média das duas leituras anteriores');
  // The selected engine alone supplies projected price, not these totals.
  const h=Number(receipt?.expirySeconds),future=Number(receipt?.projectedPrice);
  const ref=Number(receipt?.referencePrice);
  const receiptValid=receipt?.status==='forecast-created'&&
    ['CALL','PUT'].includes(receipt?.side)&&
    Number(receipt?.issuedAt)>0&&Number(receipt.issuedAt)<=now&&
    now-Number(receipt.issuedAt)<=3500&&h>0&&future>0&&ref>0;
  const projectedCallPct=receiptValid&&sigma>0?
    50+42*Math.tanh(Math.log(future/ref)/(sigma*Math.sqrt(h))):null;
  const projection=reading('forecast','PROJEÇÃO FUTURA',projectedCallPct,
    'Índice do preço projetado pela estratégia selecionada');
  return Object.freeze({cards:Object.freeze([market,history,total]),projection});
}
export const lightweightReadings=options=>lightweightDashboard(options).cards;

// View-only fixed slots for the broker PC and the linked phone.
// When a new cycle momentarily has no completed market readings,
// render current empty readings in the SAME slots. Do not cache the old
// direction, synthesize percentages, delay a signal or change the engine.
export const MARKET_READING_SLOTS=Object.freeze([
 Object.freeze({id:'market-now',label:'TOTAL MERCADO AGORA',
  hint:'Força atual observada em 8 segundos'}),
 Object.freeze({id:'prior-structure',label:'TOTAL ESTRUTURA ANTERIOR',
  hint:'Movimento anterior observado em 60 segundos'}),
 Object.freeze({id:'total-of-totals',label:'ESTRUTURA ANTERIOR + MERCADO AGORA',
  hint:'Média das duas leituras anteriores'})
]);
export function presentableMarketCards(cards=[]){
 const incoming=Array.isArray(cards)?cards:[];
 return MARKET_READING_SLOTS.map(slot=>{
  const c=incoming.find(x=>x?.id===slot.id);
  const call=Number(c?.callPct),put=Number(c?.putPct);
  const available=c?.callPct!=null&&c?.putPct!=null&&
    Number.isFinite(call)&&Number.isFinite(put);
  return {
   ...slot,
   side:available&&['CALL','PUT','NEUTRO'].includes(c?.side)?c.side:'AGUARDAR',
   callPct:available?call:null,putPct:available?put:null
  };
 });
}

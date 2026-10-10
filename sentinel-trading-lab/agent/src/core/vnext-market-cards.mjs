/**
 * VNext presentation-only historic market totals.
 *
 * TOTAL MERCADO AGORA: recent 8-second quote movement.
 * TOTAL ESTRUTURA ANTERIOR: previous 60-second quote movement.
 * TOTAL DOS TOTAIS: the simple average of those two market readings.
 *
 * Only the selected independent engine forecasts the future; its direction,
 * price and expiry belong in Projeção Futura, not in these cards.
 *
 * These are normalized observational indices, NOT win rates, calibrated
 * probabilities, trading signals or weighted votes on any strategy engine.
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
export function lightweightDashboard({quoteHistory=[],receipt=null,now=Date.now()}={}){
  const map=new Map();
  for(const x of Array.isArray(quoteHistory)?quoteHistory:[]){
    const ts=Number(x?.ts),p=Number(x?.price);
    if(Number.isFinite(ts)&&ts<=now&&Number.isFinite(p)&&p>0)map.set(ts,p);
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
  const total=reading('total-of-totals','TOTAL DOS TOTAIS',
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
    'Índice do preço projetado pelo único motor selecionado');
  return Object.freeze({cards:Object.freeze([market,history,total]),projection});
}
export const lightweightReadings=options=>lightweightDashboard(options).cards;

/**
 * Sentinel VNext: the historic TOTALS layout with ONE selected engine.
 *
 * Mercado: observed 8-second price pressure.
 * Motor selecionado: the selected model's projected direction/strength.
 * Presente + Futuro: transparent combination of those TWO readings.
 * Média dos 3 totais: their display-only arithmetic average.
 *
 * This is NOT three active strategies or a new model. Every percentage is
 * a normalized directional pressure INDEX, never win rate, calibrated trade
 * probability or authorization for CALL/PUT NOW. Projection's price and
 * target time remain in the separate Projeção Futura panel.
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
export function lightweightDashboard({quoteHistory=[],receipt=null,now=Date.now(),engineId=null}={}){
  const map=new Map();
  for(const x of Array.isArray(quoteHistory)?quoteHistory:[]){
    const ts=Number(x?.ts),p=Number(x?.price);
    if(Number.isFinite(ts)&&ts<=now&&Number.isFinite(p)&&p>0)map.set(ts,p);
  }
  const rows=[...map].sort((a,b)=>a[0]-b[0]).slice(-900)
    .map(([ts,price])=>({ts,price}));
  const current=rows.at(-1);
  if(!current)return Object.freeze({cards:Object.freeze([]),average:null,projection:null});
  let sumSq=0,seconds=0;
  for(let i=1;i<rows.length;i++){
    const dt=(rows[i].ts-rows[i-1].ts)/1000;
    if(dt<=0||dt>10)continue;
    const move=Math.log(rows[i].price/rows[i-1].price);
    sumSq+=move*move;seconds+=dt;
  }
  const sigma=seconds>0?Math.sqrt(sumSq/seconds):0;
  const pressure=(logReturn,horizon)=>{
    if(!(sigma>0)||!Number.isFinite(logReturn)||!(horizon>0))return null;
    return 50+42*Math.tanh(logReturn/(sigma*Math.sqrt(horizon)));
  };
  const p8=quoteBefore(rows,current.ts-8000);
  const market=reading('market','TOTAL MERCADO',
    p8?pressure(Math.log(current.price/p8.price),8):null,
    'Impulso observado nos últimos 8 segundos');
  const h=Number(receipt?.expirySeconds),future=Number(receipt?.projectedPrice);
  const ref=Number(receipt?.referencePrice);
  const receiptValid=receipt?.status==='forecast-created'&&
    ['CALL','PUT'].includes(receipt?.side)&&
    (!engineId||receipt.engineId===engineId)&&
    Number(receipt?.issuedAt)>0&&Number(receipt.issuedAt)<=now&&
    now-Number(receipt.issuedAt)<=3500&&h>0&&future>0&&ref>0;
  const forecastPressure=receiptValid?pressure(Math.log(future/ref),h):null;
  const engine=reading('engine','TOTAL MOTOR SELECIONADO',
    forecastPressure,'Somente o motor escolhido; projeção por '+(h>0?h+'s':'prazo selecionado'));
  // No cross-strategy vote. Combined and average totals are visual math
  // calculated from the two available data streams, not model decisions.
  const combined=reading('combined','TOTAL PRESENTE + FUTURO',
    market.callPct!==null&&engine.callPct!==null?
      (market.callPct+engine.callPct)/2:null,
    'Índice visual: mercado atual + motor escolhido');
  const totals=[market,engine,combined];
  const allReady=totals.every(c=>c.callPct!==null);
  const average=reading('average','MÉDIA DOS 3 TOTAIS',
    allReady?totals.reduce((sum,c)=>sum+c.callPct,0)/3:null,
    'Média visual sem influência nas decisões do motor');
  const projection=reading('forecast','PROJEÇÃO FUTURA',forecastPressure,
    'Pressão projetada pelo motor até '+h+'s, não probabilidade');
  return Object.freeze({cards:Object.freeze(totals),average,projection});
}
export const lightweightReadings=options=>lightweightDashboard(options).cards;

/**
 * Unified forecast selector: 9 original independent strategies + 3 independent
 * two-strategy agreements. A selected pair actually OWNS the main displayed
 * forecast, not an optional commentary / settings switch.
 *
 * This module does NOT place orders or assert any live-market success rate.
 */
import {singleEngineForecast} from './vnext-single-engine.mjs';
import {singleEngineForecast as singleEngineForecast67} from './research-baseline-13467/vnext-single-engine.mjs';
import {PAIR_STRATEGIES} from './pair-strategy-catalog.mjs';
import {recordForwardForecast} from './forward-forecast-receipt.mjs';
import {lightweightDashboard} from './vnext-market-cards.mjs';
const PAIRS=new Map(PAIR_STRATEGIES.map(p=>[p.id,p]));
export function isPairedStrategy(id){return PAIRS.has(String(id||''))}
export function selectedForecast({settings={},snap={},now=Date.now(),provider=snap.provider||'unknown'}={}){
 const id=String(settings.engine||'automatic');
 const pair=PAIRS.get(id);
 if(!pair)return singleEngineForecast({settings,snap,now,provider});
 const run=(index)=>(pair.versions[index]===67?singleEngineForecast67:singleEngineForecast)({
  settings:{...settings,engine:pair.engines[index]},snap,now,provider
 });
 const a=run(0),b=run(1);
 const x=a?.receipt,y=b?.receipt;
 const coherent=!!(x&&y&&['CALL','PUT'].includes(x.side)&&x.side===y.side&&
  x.asset===y.asset&&x.targetAt===y.targetAt&&x.issuedAt===y.issuedAt&&
  x.expirySeconds===y.expirySeconds&&x.referencePrice>0&&y.referencePrice>0&&
  x.projectedPrice>0&&y.projectedPrice>0&&
  Math.abs(Math.log(x.referencePrice/y.referencePrice))<1e-5);
 const seconds=Number(settings.orderDurationMs)/1000;
 const asset=String(settings.asset||'UNKNOWN').toUpperCase();
 const marketReadings=lightweightDashboard({quoteHistory:snap.quoteHistory,receipt:null,now});
 const base={...a,engineId:pair.id,engineFamily:'two-independent-strategies',
  modelVersion:'unified-pair-owner-1',source:'selected-pair',
  pairMembers:[...pair.engines],expirySeconds:Number(a?.expirySeconds||seconds),
  cards:marketReadings.cards,projection:null,plan:null,scenarioProjection:null,
  actionable:false,calibrated:false};
 if(!coherent)return {...base,receipt:null,computedStatus:'pair-disagreement',
  forecastFoundation:'two-independent-predictions',
  reason:'As duas estratégias não concordam sobre o preço futuro. AGUARDAR.',
  operational:{...a?.operational,engineId:pair.id,side:'AGUARDAR',ready:false,
   actionable:false,scenarioProjection:null,
   reason:'As estratégias não concordam. AGUARDAR.'}};
 // Fuse relative moves, not absolute quotes from different chart anchors.
 const mu=(Math.log(x.projectedPrice/x.referencePrice)+
   Math.log(y.projectedPrice/y.referencePrice))/2;
 const project=Number((x.referencePrice*Math.exp(mu)).toPrecision(12));
 const low=Math.min(Number(x.expectedLow||x.projectedPrice),
   Number(y.expectedLow||y.projectedPrice));
 const high=Math.max(Number(x.expectedHigh||x.projectedPrice),
   Number(y.expectedHigh||y.projectedPrice));
 const doc=recordForwardForecast({
  request:{engineId:pair.id,asset,provider,
   calibrationKey:'unified-pair:'+pair.id+':'+x.expirySeconds,
   forecastHorizonMs:Number(x.expirySeconds)*1000},
  referenceQuote:{at:x.quoteReceivedAt,price:x.referencePrice},
  prediction:{side:x.side,projectedPrice:project,
   expectedLow:low,expectedHigh:high,
   evidence:['Concordância independente: '+pair.engines.join(' + '),
    'Estimativa experimental; sem percentual de acerto validado']},createdAt:now
 });
 const receipt=doc?.receipt||null;
 const dashboard=lightweightDashboard({quoteHistory:snap.quoteHistory,receipt,now});
 const side=receipt?.side||null;
 return {...base,receipt,computedStatus:receipt?'pair-agreement':'pair-estimate-unavailable',
  cards:dashboard.cards,projection:dashboard.projection,
  forecastFoundation:'independent-pair-price-agreement',
  plan:receipt?{...a.plan,asset,horizonSeconds:receipt.expirySeconds,
   rawBias:side,bias:side,displayBias:side,projectedPrice:receipt.projectedPrice,
   expectedLow:receipt.expectedLow,expectedHigh:receipt.expectedHigh,
   forecastIssuedAt:receipt.issuedAt,forecastTargetAt:receipt.targetAt,
   actionable:false,modelConfidence:null,confidence:null}:null,
  scenarioProjection:receipt?{side,status:'PROJETANDO',confirmed:false,
   actionable:false,horizonSeconds:receipt.expirySeconds,issuedAt:receipt.issuedAt,
   targetAt:receipt.targetAt,price:receipt.referencePrice,
   projectedPrice:receipt.projectedPrice,expectedLow:receipt.expectedLow,
   expectedHigh:receipt.expectedHigh,engineId:pair.id,
   modelVersion:'unified-pair-owner-1'}:null,
  operational:{...a?.operational,engineId:pair.id,side:'AGUARDAR',
   ready:false,actionable:false,
   scenarioProjection:receipt?{side,projectedPrice:receipt.projectedPrice,
    horizonSeconds:receipt.expirySeconds,issuedAt:receipt.issuedAt,
    targetAt:receipt.targetAt,actionable:false}:null},
  reason:receipt?'As duas estratégias confirmam a mesma previsão futura.':
   'Não foi possível confirmar a previsão da dupla.'};
}

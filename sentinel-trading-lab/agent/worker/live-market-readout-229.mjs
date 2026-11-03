// READ-ONLY broker quote interpretation for the PC/phone blue line.
// Unlike the trading engine, this status may become provisional after just
// a few seconds. It NEVER enters the executor or the trade runtime.
import {liveVisualPhase229} from '../src/core/live-visual-phase-229.mjs';
import {marketReading} from '../src/core/market-reading.mjs';
const waiting=/^(AGUARDANDO|ANALISANDO|COLETANDO MICROESTRUTURA|HISTÓRICO NÃO VALIDADO|LEITURA EM ATUALIZAÇÃO)/i;
const phaseLabels={
 continuing:'CONTINUIDADE',weakening:'CONTINUIDADE PERDENDO FORÇA',
 'reversal-testing':'REVERSÃO EM TESTE',range:'LATERAL',mixed:'INCONCLUSIVO'
};
export function presentLiveMarketReadout229({view,analysis,now=Date.now(),asset}={}){
 const old=analysis?.vnext||null;
 if(view?.state!=='running'||!view?.settings?.engine)return old;
 // A classified analyst reading has priority, even while no operation
 // is executing. We supplement ONLY the insufficient/no-readout case.
 const previous=String(old?.nowObservation?.marketReading||'');
 if(previous&&!waiting.test(previous))return old;
 const broker=view?.liveBroker;
 const actualAsset=String(broker?.validatedSymbol||broker?.symbol||'').trim().toUpperCase();
 if(!broker||broker.quoteFeedValidated!==true||broker.assetValidated!==true||
  !actualAsset||String(asset||'').trim().toUpperCase()!==actualAsset)return old;
 const quoteAt=Number(broker.lastQuoteAt||broker.quoteTs);
 const price=Number(broker.quote);
 const state=liveVisualPhase229({quoteHistory:broker.quoteHistory||[],
  quoteAt,price,now,durationMs:view.settings.orderDurationMs});
 if(!state.ready||!['continuing','weakening','reversal-testing','range','mixed'].includes(state.phase))
  return old;
 const display=marketReading({phase:state.phase,label:phaseLabels[state.phase],
  trendSide:state.legSide,candidate:state.turnSide?{
   ready:false,provisionalSide:state.turnSide,reason:'visual-only-observed-first-turn'
  }:{ready:false,reason:'visual-only-observed-movement'}});
 return {...old,mode:old?.mode||'now',engineId:old?.engineId||view.settings.engine,
  nowObservation:{...(old?.nowObservation||{}),marketReading:display,
   marketPhase:state.phase,marketPhaseLabel:phaseLabels[state.phase],
   marketTrendSide:state.legSide,visualOnly:true,quoteAt,observedAt:quoteAt,
   evaluatedAt:now}};
}

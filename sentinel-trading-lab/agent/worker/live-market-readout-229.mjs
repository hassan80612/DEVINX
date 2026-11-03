// READ-ONLY broker quote interpretation for the PC/phone blue line.
// Unlike the trading engine, this status may become provisional after just
// a few seconds. It NEVER enters the executor or the trade runtime.
import {liveVisualPhase229} from '../src/core/live-visual-phase-229.mjs';
import {marketReading} from '../src/core/market-reading.mjs';
// The blue line is a continuous observation, not just a placeholder for
// missing history. It follows the latest VERIFIED tick as long as an entry
// has not been confirmed, while never changing the real analyst decision.
const phaseLabels={
 continuing:'CONTINUIDADE',weakening:'CONTINUIDADE PERDENDO FORÇA',
 'reversal-testing':'REVERSÃO EM TESTE',range:'LATERAL',mixed:'INCONCLUSIVO'
};
export function presentLiveMarketReadout229({view,analysis,now=Date.now(),asset}={}){
 const old=analysis?.vnext||null;
 if(view?.state!=='running'||!view?.settings?.engine)return old;
 // A genuine actionable analyst signal retains priority, including its
 // CALL/PUT and historical reversal evidence. Otherwise update the BLUE
 // visual market phase on every fresh broker quote, even if its prior text
 // was "OBSERVANDO" or the previous provisional "CONTINUIDADE CALL".
 // This NEVER mutates the real engine result or authorizes an entry.
 if(old?.nowObservation?.ready===true)return old;
 const broker=view?.liveBroker;
 // The same real OTC instrument can be written EUR/GBP (OTC) in
 // the broker and EURGBP-OTC in the analyst. Preserve OTC identity while
 // comparing; never allow a different instrument or unvalidated feed.
 const instrumentKey=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const actualAsset=instrumentKey(broker?.validatedSymbol||broker?.symbol);
 if(!broker||broker.quoteFeedValidated!==true||broker.assetValidated!==true||
  !actualAsset||instrumentKey(asset)!==actualAsset)return old;
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

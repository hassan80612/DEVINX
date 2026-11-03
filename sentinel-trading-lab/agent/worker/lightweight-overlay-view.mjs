import {presentLiveMarketReadout229} from './live-market-readout-229.mjs';

// A broker-facing overlay only needs the most recent computed prediction,
// validated feed, and already-selected settings. Building Runtime.status()
// every screen frame unnecessarily reads balances, research histories and
// status aggregates. Keep the authenticated /status API unchanged.
export function lightweightOverlayView(runtime){
  const settings=runtime.settings||{};
  // Runtime.status() historically enforced this safety invariant.
  settings.demoAutopilot=false;
  const external=runtime.externalMarket||null;
  const brokerMode=String(external?.brokerMode||external?.mode||'').toLowerCase();
  const eligible=settings.mode==='demo'&&brokerMode==='demo'&&external?.executionReady===true;
  // Only the read-only overlay result is supplemented. Runtime.lastResult,
  // SignalExecutor, signed trade anchors and native expiry are unchanged.
  const original=runtime.lastResult;
  const realAsset=String(original?.asset||original?.analysis?.asset||'').trim().toUpperCase();
  const visual=presentLiveMarketReadout229({
   view:{state:runtime.stateName,settings,liveBroker:external},
   analysis:original?.analysis||null,asset:realAsset
  });
  const shownResult=visual&&visual!==original?.analysis?.vnext?
   {...original,analysis:{...(original?.analysis||{}),asset:realAsset,vnext:visual}}:
   original;
  return {
    state:runtime.stateName,
    mode:settings.mode,
    settings,
    lastResult:shownResult,
    lastEvalMs:runtime.lastEvalMs,
    nextEvalMs:runtime.nextEvalMs,
    liveBroker:external?{...external,mode:brokerMode}:null,
    feed:{
      price:external?.quote??null,
      quoteTs:external?.quoteTs||external?.lastQuoteAt||0
    },
    signalValidation:runtime.lastResult?.analysis?.quality||null,
    autopilot:{enabled:false,eligible}
  };
}

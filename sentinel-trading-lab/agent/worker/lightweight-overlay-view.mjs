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
  return {
    state:runtime.stateName,
    mode:settings.mode,
    settings,
    lastResult:runtime.lastResult,
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

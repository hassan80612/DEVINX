// One explicitly requested in-memory sample. No file, quote stream, browser
// command, credentials, account balance or additional broker connection.
export function marketDiagnostic(runtime,market={},now=Date.now()){
 const a=runtime.lastResult?.analysis||{};
 return {capturedAt:now,state:runtime.stateName,asset:market.symbol||runtime.settings.asset,
  activeId:market.activeId,quoteTs:market.quoteTs,price:market.quote,
  settings:{engine:runtime.settings.engine,forecastMode:runtime.settings.forecastMode,
   forecastHorizonSeconds:runtime.settings.forecastHorizonSeconds,orderDurationMs:runtime.settings.orderDurationMs},
  candles:(market.candles||[]).slice(-12).map(({from,to,open,high,low,close})=>({from,to,open,high,low,close})),
  quotes:(market.quoteHistory||[]).slice(-600).map(({ts,price,receivedAt,source})=>({ts,price,receivedAt,source})),
  analysis:{asset:a.asset,side:a.side,reasons:a.reasons,
   vnext:{opportunityWindow:a.vnext?.opportunityWindow,futureEntryAnchor:a.vnext?.futureEntryAnchor}}};
}

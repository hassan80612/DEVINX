// Quote validity for structural checks. The 1m executor already accepts 1950ms;
// its level/turn checks must not silently disappear during the last 500ms.
// Keep all other horizons and independent event-confirmation deadlines intact.
export function structuralQuoteMaxAgeMs(durationMs){
 return Number(durationMs)===60000?1950:1450;
}

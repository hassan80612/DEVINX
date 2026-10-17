// Preserve native OHLC periods from the already maintained forecast pool.
// HistoricalPriceStructure still validates closed bars, groups by period,
// deduplicates by start and chooses one homogeneous series. Current rows
// follow the pool so later received corrections retain precedence.
export function structuralCandleInput(snap={}){
 if(snap.historicalCandlesVerified===false)return [];
 const current=Array.isArray(snap.candles)?snap.candles:[];
 const preserved=Array.isArray(snap.predictionCandles)?snap.predictionCandles:[];
 return preserved.length?[...preserved,...current]:current;
}

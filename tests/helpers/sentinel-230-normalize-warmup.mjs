// Exact audit normalization for the single additive 230 warmup expression.
// Every other baseline runtime byte is still verified by the existing SHA
// regression tests 196/201. Fails closed if the reviewed expression drifts.
export function normalize230RuntimeWarmup(text){
 const addedImport="import {marketWarmup230} from './verified-market-warmup-230.mjs';\n";
 const changed="const legacyHistoryReady=this.settings.engine?quotes.length>=15&&quoteSpan>=14000:this.externalMarket.candles?.length>=50;const earlyHistory=this.settings.engine?marketWarmup230({broker:this.externalMarket,quoteHistory:quotes}):null;const historyReady=legacyHistoryReady||earlyHistory?.ready===true;";
 const original="const historyReady=this.settings.engine?quotes.length>=15&&quoteSpan>=14000:this.externalMarket.candles?.length>=50;";
 if(!text.includes(addedImport)||text.split(changed).length!==2)
  throw Error('sentinel_230_warmup_normalization_mismatch');
 return text.replace(addedImport,'').replace(changed,original);
}

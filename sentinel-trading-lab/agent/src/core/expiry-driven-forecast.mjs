/**
 * Expiry-driven MAIN forecast clock for Sentinel VNext.
 *
 * The user's selected expiration or the broker's verified expiration defines
 * which future outcome is predicted. Chart candle period is NOT the horizon.
 * Broker capabilities vary by account/asset: a listed duration is never
 * assumed to be available without explicit broker evidence.
 *
 * Pure configuration module. Does not change the installed 13.4.58 engine,
 * authorize any trade, or estimate prediction accuracy.
 */
export const FORECAST_DURATION_PRESETS=Object.freeze([
  5,10,15,30,45,60,120,180,300,600,900,3600
]);
const finitePositive=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0;
const durationMs=v=>finitePositive(v)?Number(v):null;
function availableSeconds(input){
  if(!Array.isArray(input))return null;
  return [...new Set(input.map(Number).filter(s=>Number.isFinite(s)&&s>0))].sort((a,b)=>a-b);
}
export function expiryDrivenForecast({
  selectedSeconds=null,
  brokerVerified=false,
  brokerDurationMs=null,
  brokerExpiresAt=null,
  brokerAvailableSeconds=null,
  brokerInstrument='unknown',
  now=Date.now()
}={}){
  const selectedMs=finitePositive(selectedSeconds)?Number(selectedSeconds)*1000:null;
  const confirmedDuration=brokerVerified===true?durationMs(brokerDurationMs):null;
  const confirmedDeadline=brokerVerified===true&&finitePositive(brokerExpiresAt)?Number(brokerExpiresAt):null;
  const available=availableSeconds(brokerAvailableSeconds);
  const timestamp=Number(now);
  if(!Number.isFinite(timestamp))throw new Error('invalid_timestamp');
  // For fixed-duration Blitz, use the broker-confirmed fixed duration.
  // For deadline-based options, predict exactly to the broker expiration;
  // remaining time is NOT the original duration selected earlier.
  const deadlineMs=confirmedDeadline==null?null:confirmedDeadline-timestamp;
  const staleDeadline=confirmedDeadline!==null&&deadlineMs<=0;
  const finalMs=confirmedDeadline!==null?deadlineMs:
    confirmedDuration!==null?confirmedDuration:selectedMs;
  const source=confirmedDeadline!==null?'broker-deadline':
    confirmedDuration!==null?'broker-duration':
    selectedMs!==null?'user-selection':'not-selected';
  const selectedAvailable=selectedMs===null||available===null?null:
    available.some(s=>Math.abs(s*1000-selectedMs)<1);
  const differentDuration=selectedMs!==null&&confirmedDuration!==null&&
    Math.abs(selectedMs-confirmedDuration)>1;
  const result={
    instrument:String(brokerInstrument||'unknown').toLowerCase(),
    source,selectedDurationMs:selectedMs,brokerDurationMs:confirmedDuration,
    brokerExpiresAt:confirmedDeadline,forecastHorizonMs:finalMs!==null&&finalMs>0?finalMs:null,
    forecastHorizonSeconds:finalMs!==null&&finalMs>0?finalMs/1000:null,
    expiresAt:confirmedDeadline!==null?confirmedDeadline:
      finalMs!==null&&finalMs>0?timestamp+finalMs:null,
    selectionAvailable:selectedAvailable,
    durationMismatch:differentDuration,
    expired:staleDeadline,
    // An unavailable or unknown expiry is a truth/status indicator,
    // never silent substitution with a 30-second prediction.
    reason:staleDeadline?'broker-expiration-passed':
      finalMs===null?'select-expiration':
      selectedAvailable===false?'selected-expiration-not-offered-by-broker':
      differentDuration?'broker-expiration-differs-from-selection':
      confirmedDeadline!==null?'broker-deadline-confirmed':
      confirmedDuration!==null?'broker-duration-confirmed':'manual-expiration'
  };
  return Object.freeze(result);
}
export function expiryForecastIdentity({engine='automatic',provider='unknown',asset='unknown',instrument='unknown',forecast}={}){
  if(!forecast?.forecastHorizonMs)return null;
  const fixedDuration=forecast.brokerDurationMs??forecast.selectedDurationMs;
  const expiryType=forecast.brokerExpiresAt!=null?'absolute-deadline':'fixed-duration';
  return [
    'vnext-expiry-driven',String(engine),String(provider).toLowerCase(),String(asset).toUpperCase(),
    String(instrument).toLowerCase(),expiryType,
    // A clock-expiry model is a moving remaining horizon, not a nominal
    // 1-minute label; a per-second bucket prevents fake exact matching.
    Math.round(Number(forecast.forecastHorizonMs)/1000),
    expiryType==='absolute-deadline'?Math.round(Number(forecast.brokerExpiresAt)/1000):Math.round(Number(fixedDuration||0))
  ].join('|');
}

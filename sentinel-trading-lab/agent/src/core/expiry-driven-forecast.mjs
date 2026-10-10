/**
 * Forecast horizon VNext: the USER-selected expiration is authoritative.
 *
 * Broker expiry information, if already available, is DIAGNOSTIC ONLY.
 * No automatic broker expiration lookup, no inferred switch to 30/60s,
 * no implicit model blocking or entry rule changes.
 * This is not a forecast engine, a trade signal, or a timer pretending
 * to predict the market. It defines a future prediction target.
 */
export const FORECAST_DURATION_PRESETS=Object.freeze([5,10,15,30,45,60,120,180,300,600,900,3600]);
const numberOrNull=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const positive=x=>{const v=numberOrNull(x);return v!==null&&v>0?v:null};
const availableSeconds=x=>Array.isArray(x)?[...new Set(x.map(Number).filter(v=>Number.isFinite(v)&&v>0))].sort((a,b)=>a-b):null;

export function expiryDrivenForecast({
  selectedSeconds=null,
  brokerVerified=false,
  brokerDurationMs=null,
  brokerExpiresAt=null,
  brokerAvailableSeconds=null,
  brokerInstrument='unknown',
  now=Date.now()
}={}){
  const timestamp=numberOrNull(now);
  if(timestamp===null)throw new Error('invalid_timestamp');
  const selectedMs=positive(selectedSeconds)!==null?positive(selectedSeconds)*1000:null;
  // Observations NEVER change the requested forecast horizon, target time,
  // or direction. This matters especially for 5s/10s/15s Blitz.
  const observedDuration=brokerVerified===true?positive(brokerDurationMs):null;
  const observedDeadline=brokerVerified===true?positive(brokerExpiresAt):null;
  const available=availableSeconds(brokerAvailableSeconds);
  const selectedAvailable=selectedMs===null||available===null?null:
    available.some(s=>Math.abs(s*1000-selectedMs)<1);
  const durationMismatch=selectedMs!==null&&observedDuration!==null&&
    Math.abs(selectedMs-observedDuration)>1;
  const deadlineMismatch=selectedMs!==null&&observedDeadline!==null&&
    Math.abs(timestamp+selectedMs-observedDeadline)>1000;
  return Object.freeze({
    instrument:String(brokerInstrument||'unknown').toLowerCase(),
    source:selectedMs!==null?'user-selection':'not-selected',
    selectedDurationMs:selectedMs,
    // Observation fields are informational, not the source of truth.
    observedBrokerDurationMs:observedDuration,
    observedBrokerExpiresAt:observedDeadline,
    forecastHorizonMs:selectedMs,
    forecastHorizonSeconds:selectedMs===null?null:selectedMs/1000,
    issuedAt:timestamp,
    targetAt:selectedMs===null?null:timestamp+selectedMs,
    expiresAt:selectedMs===null?null:timestamp+selectedMs,
    selectionAvailable:selectedAvailable,
    durationMismatch,
    deadlineMismatch,
    expired:false,
    reason:selectedMs===null?'select-expiration':
      selectedAvailable===false?'broker-availability-observation-differs':
      durationMismatch||deadlineMismatch?'broker-observation-differs-from-selected-expiration':
      'selected-expiration-authoritative'
  });
}

export function expiryForecastIdentity({engine='automatic',provider='unknown',asset='unknown',instrument='unknown',forecast}={}){
  if(!forecast?.forecastHorizonMs)return null;
  return ['vnext-user-expiry-v1',String(engine),String(provider).toLowerCase(),String(asset).toUpperCase(),
    String(instrument).toLowerCase(),Number(forecast.forecastHorizonMs)].join('|');
}

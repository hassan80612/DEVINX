/**
 * Forward-only FORECAST RECEIPT for a single Sentinel VNext engine.
 *
 * The clock alone CANNOT generate a forecast. A real engine must provide
 * its OWN predicted direction AND projected price/price range, derived from
 * quotes known on or before issuance. This receipt pins that prediction to
 * an immutable target time to prevent hindsight rewriting.
 *
 * This is an audit/evaluation contract, NOT a trading entry decision.
 * No network calls, broker expiration detection, database or safety gates.
 */
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const positive=x=>{const y=num(x);return y!==null&&y>0?y:null};
const inSide=x=>['CALL','PUT','NEUTRAL'].includes(String(x||'').toUpperCase())?String(x).toUpperCase():null;
const freezeDeep=x=>{
  if(Array.isArray(x)){for(const item of x)if(item&&typeof item==='object')freezeDeep(item);}
  else if(x&&typeof x==='object')for(const value of Object.values(x))if(value&&typeof value==='object')freezeDeep(value);
  return Object.freeze(x);
};

export function recordForwardForecast({
  request,referenceQuote={},prediction={},createdAt=Date.now()
}={}){
  const issuedAt=num(createdAt);
  const horizonMs=positive(request?.forecastHorizonMs);
  const price=positive(referenceQuote.price),quoteAt=num(referenceQuote.at);
  if(issuedAt===null||horizonMs===null||price===null||quoteAt===null||
     quoteAt>issuedAt||!request?.engineId){
    return freezeDeep({status:'missing-forecast-input',actionable:false,receipt:null});
  }
  const side=inSide(prediction.side),projectedPrice=positive(prediction.projectedPrice);
  const expectedLow=positive(prediction.expectedLow),expectedHigh=positive(prediction.expectedHigh);
  const rangeValid=expectedLow!==null&&expectedHigh!==null&&expectedLow<=expectedHigh;
  const hasPriceProjection=projectedPrice!==null||rangeValid;
  if(!side||side==='NEUTRAL'||!hasPriceProjection){
    // Side-only CALL/PUT + a countdown must NEVER be displayed as a
    // fully-specified forward price forecast.
    return freezeDeep({status:'no-measurable-forward-forecast',actionable:false,receipt:null});
  }
  const expectedPath=Array.isArray(prediction.expectedPath)?prediction.expectedPath
    .map(point=>({secondsFromNow:num(point.secondsFromNow),price:positive(point.price)}))
    .filter(p=>p.secondsFromNow!==null&&p.secondsFromNow>0&&p.secondsFromNow*1000<=horizonMs&&p.price!==null)
    .sort((a,b)=>a.secondsFromNow-b.secondsFromNow):[];
  const receipt={
    status:'forecast-created',actionable:false,
    engineId:String(request.engineId),asset:String(request.asset||'UNKNOWN').toUpperCase(),
    provider:String(request.provider||'unknown').toLowerCase(),
    forecastCalibrationKey:String(request.calibrationKey||''),
    side,referencePrice:price,quoteReceivedAt:quoteAt,
    quoteAgeAtForecastMs:issuedAt-quoteAt,
    issuedAt,expirySeconds:horizonMs/1000,targetAt:issuedAt+horizonMs,
    projectedPrice,expectedLow:rangeValid?expectedLow:null,expectedHigh:rangeValid?expectedHigh:null,
    expectedPath,
    // A confidence score or estimated probability is NOT an observed
    // historical win rate. Never show one as actual accuracy.
    modelConfidence:num(prediction.modelConfidence),
    evidence:Array.isArray(prediction.evidence)?prediction.evidence.map(x=>String(x)).slice(0,8):[],
    predictionStatus:'unverified'
  };
  return freezeDeep({status:'forecast-created',actionable:false,receipt});
}

export function evaluateForwardForecast({receipt,actualQuote={},maxOutcomeLagMs=1000}={}){
  if(!receipt||receipt.status!=='forecast-created')
    return freezeDeep({status:'no-forecast-to-evaluate',verified:false});
  const quoteAt=num(actualQuote.at),observedPrice=positive(actualQuote.price);
  const targetAt=Number(receipt.targetAt),lag=quoteAt===null?null:quoteAt-targetAt;
  if(lag===null||lag<0)return freezeDeep({status:'awaiting-future-outcome',verified:false});
  if(observedPrice===null||lag>Math.max(0,Number(maxOutcomeLagMs)||0))
    return freezeDeep({status:'outcome-not-verifiable',verified:false,lagMs:lag});
  const entry=Number(receipt.referencePrice);
  const difference=observedPrice-entry;
  const actualSide=difference===0?'DRAW':difference>0?'CALL':'PUT';
  const correct=actualSide==='DRAW'?null:actualSide===receipt.side;
  const predicted=num(receipt.projectedPrice);
  const rangeLow=num(receipt.expectedLow),rangeHigh=num(receipt.expectedHigh);
  return freezeDeep({
    status:'evaluated-market-price',verified:true,source:'market-quote-not-broker-settlement',
    side:receipt.side,actualSide,correct,
    observedAt:quoteAt,targetAt,quoteLagMs:lag,
    referencePrice:entry,observedPrice,
    projectedPrice:predicted,
    predictionError:predicted===null?null:observedPrice-predicted,
    inProjectedRange:rangeLow===null||rangeHigh===null?null:observedPrice>=rangeLow&&observedPrice<=rangeHigh
  });
}

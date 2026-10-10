/**
 * AUTOMÁTICO VNext — independent forward-price research prototype.
 *
 * Uses historical quote paths sampled up to asOf. Never reads live candle
 * direction, other engines, broker expiration fields, or a 30s substitute.
 * The horizon changes statistical projection itself — not just a countdown.
 *
 * Returns UNCALIBRATED estimates. This is NOT deployed as a signal engine;
 * evaluate chronologically out-of-sample before enabling.
 */
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const value=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const positive=x=>{const a=value(x);return a!==null&&a>0?a:null;};
const rounded=(n,d=12)=>Number(Number(n).toPrecision(d));

export function automaticForwardPrediction({quoteHistory=[],asOf=Date.now(),selectedSeconds=60}={}){
  const horizon=positive(selectedSeconds),now=value(asOf);
  if(horizon===null||now===null)return{status:'missing-horizon-or-time',prediction:null};
  // Forward-only: never include a quote beyond issue time. Deduplicate only
  // by timestamp; a late / future tick is not retrospective evidence.
  const known=new Map();
  for(const x of quoteHistory){
    const ts=value(x?.ts),price=positive(x?.price);
    if(ts===null||price===null||ts>now||ts<0)continue;
    known.set(ts,price);
  }
  const quotes=[...known].sort((a,b)=>a[0]-b[0]).map(([ts,price])=>({ts,price}));
  const last=quotes.at(-1),first=quotes[0];
  if(quotes.length<8||!last||!first||last.ts-first.ts<Math.min(15,horizon)*1000){
    return{status:'insufficient-quoted-history',prediction:null,samples:quotes.length};
  }
  // Use the latest quote AT OR BEFORE the requested historical timestamp.
  // No future prices, no forming candle close and no chart-period alias.
  const historicalAt=(ms)=>{
    let lo=0,hi=quotes.length-1,match=-1;
    while(lo<=hi){
      const mid=(lo+hi)>>1;
      if(quotes[mid].ts<=ms){match=mid;lo=mid+1;}else hi=mid-1;
    }
    return match<0?null:quotes[match].price;
  };
  const p=last.price,lp=Math.log(p),period=Math.min(900,horizon);
  const samples=quotes.filter(q=>q.ts>=last.ts-Math.max(60000,Math.min(900000,period*2000)));
  let squareReturns=0,observedSeconds=0;
  for(let i=1;i<samples.length;i++){
    const dt=(samples[i].ts-samples[i-1].ts)/1000;
    if(dt<=0||dt>30)continue;
    const r=Math.log(samples[i].price/samples[i-1].price);
    squareReturns+=r*r;observedSeconds+=dt;
  }
  if(observedSeconds<=0)return{status:'insufficient-volatility-data',prediction:null,samples:quotes.length};
  // Realized one-second volatility (price-scaled, not a win rate).
  const sigma=Math.sqrt(squareReturns/observedSeconds);
  const windowShort=Math.max(3,Math.min(15,horizon*.25));
  const windowMid=Math.max(10,Math.min(90,horizon));
  const windowLong=Math.max(30,Math.min(300,horizon*3));
  const velocity=(seconds)=>{
    const prev=historicalAt(last.ts-seconds*1000);
    return prev===null?null:Math.log(p/prev)/seconds;
  };
  const vShort=velocity(windowShort),vMid=velocity(windowMid),vLong=velocity(windowLong);
  const speeds=[vShort,vMid,vLong].filter(x=>x!==null);
  if(speeds.length===0)return{status:'insufficient-history-windows',prediction:null,samples:quotes.length};
  let pathLength=0;
  const structureWindow=Math.min(120,Math.max(30,horizon));
  const structured=quotes.filter(q=>q.ts>=last.ts-structureWindow*1000);
  for(let i=1;i<structured.length;i++)pathLength+=Math.abs(Math.log(structured[i].price/structured[i-1].price));
  const netMove=structured.length>1?Math.abs(Math.log(p/structured[0].price)):0;
  // Price-path efficiency is close to 1 when movement is persistent, near
  // zero in a noisy/mean-reverting regime.
  const efficiency=pathLength>0?clamp(netMove/pathLength,0,1):0;
  const levelHistory=quotes.filter(q=>q.ts>=last.ts-120000&&q.ts<=last.ts-2000);
  const support=levelHistory.length?Math.min(...levelHistory.map(x=>x.price)):null;
  const resistance=levelHistory.length?Math.max(...levelHistory.map(x=>x.price)):null;
  const meanLog=structured.reduce((sum,q)=>sum+Math.log(q.price),0)/Math.max(1,structured.length);
  const latestSlope=vShort??vMid??vLong??0,mediumSlope=vMid??latestSlope,longSlope=vLong??mediumSlope;
  const shortMix=horizon<=15?.62:horizon<=60?.45:horizon<=300?.24:.1;
  const longMix=horizon<=15?.08:horizon<=60?.19:horizon<=300?.40:.60;
  const midMix=1-shortMix-longMix;
  const driftPerSecond=latestSlope*shortMix+mediumSlope*midMix+longSlope*longMix;
  // Time-scaling applies to the predicted price path. A 5s objective
  // cannot be reproduced from a 1m endpoint by changing only a label.
  const persistence=clamp(efficiency*.88+.15,.15,.9);
  const effectiveTrendSeconds=60*(1-Math.exp(-horizon/60))+.07*horizon;
  const trendProjection=driftPerSecond*effectiveTrendSeconds*persistence;
  const meanReversion=-((lp-meanLog))*clamp((1-efficiency)*.5,0,.5)*Math.min(1,horizon/45);
  // Support/resistance can contribute anticipatory weakening; they NEVER
  // veto or force a CALL/PUT, nor depend on a current candle's closing sign.
  const uncertainty=Math.max(sigma*Math.sqrt(horizon),1e-12);
  const nearResistance=resistance!==null&&p>=resistance-uncertainty*.4&&latestSlope<mediumSlope;
  const nearSupport=support!==null&&p<=support+uncertainty*.4&&latestSlope>mediumSlope;
  const levelPressure=(nearResistance?-1:nearSupport?1:0)*uncertainty*.14*(1-efficiency);
  const rawExpected=trendProjection+meanReversion+levelPressure;
  // Numerical stability is NOT an entry gate; it prevents unrealistic
  // exponential extrapolations from short-term noisy derivatives.
  const bounded=clamp(rawExpected,-3*uncertainty,3*uncertainty);
  const projectedPrice=rounded(p*Math.exp(bounded));
  const expectedLow=rounded(p*Math.exp(bounded-1.5*uncertainty));
  const expectedHigh=rounded(p*Math.exp(bounded+1.5*uncertainty));
  const priceDelta=projectedPrice-p;
  // If the model has no measured directional edge it stays neutral.
  const neutral=Math.abs(bounded)<=1e-15;
  const side=neutral?'NEUTRAL':priceDelta>0?'CALL':priceDelta<0?'PUT':'NEUTRAL';
  const regime=efficiency>=.62?'persistent-trend':efficiency<=.27?'range-or-reversion':'mixed';
  return{
    status:'candidate-forward-prediction',calibrated:false,
    prediction:{
      side,projectedPrice,expectedLow,expectedHigh,
      // Not an empirically calibrated win probability.
      modelConfidence:null,expectedPath:[],
      evidence:[
        'history-only price slopes at '+rounded(windowShort,5)+'s / '+rounded(windowMid,5)+'s / '+rounded(windowLong,5)+'s',
        'price-path efficiency '+rounded(efficiency,5)+' ('+regime+')',
        nearResistance?'approaching previously observed resistance':nearSupport?'approaching previously observed support':'no special nearby level pressure',
        'realized 1s volatility '+rounded(sigma,5)+'; projected '+horizon+'s'
      ]
    },
    diagnostic:{
      horizonSeconds:horizon,referencePrice:p,quoteAt:last.ts,quoteAgeMs:now-last.ts,
      samples:quotes.length,historySpanMs:last.ts-first.ts,regime,
      efficiency,sigmaPerSqrtSecond:sigma,support,resistance
    }
  };
}

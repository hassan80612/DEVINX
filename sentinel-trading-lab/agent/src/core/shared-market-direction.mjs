// EXPERIMENTAL SHARED MARKET ENGINE. Offline research only until validated.
// Analyze a broker quote once and expose phase/direction to EVERY strategy.
// Strategies are market-context specialists, not competing signal owners.
// No timeouts, bars-to-close, second confirmation or downstream veto.
// All calculations use quotes with ts/receivedAt <= quoteAt.
const signOf=n=>n>0?'CALL':n<0?'PUT':null;
function sampleAt(quotes,t,maxGap=1600){
 for(let i=quotes.length-1;i>=0;i--)
  if(quotes[i].ts<=t)return t-quotes[i].ts<=maxGap?quotes[i]:null;
 return null;
}
const safeLog=(a,b)=>a>0&&b>0?Math.log(a/b):0;
function knownQuotes(history,time){
 const byTime=new Map();
 for(const item of Array.isArray(history)?history:[]){
  const ts=Number(item?.ts),receivedAt=Number(item?.receivedAt??ts),price=Number(item?.price);
  if(!(ts>0&&ts<=time&&receivedAt>0&&receivedAt<=time&&price>0&&ts>=time-90000))continue;
  if(!byTime.has(ts))byTime.set(ts,{ts,receivedAt,price});
 }
 return [...byTime.values()].sort((a,b)=>a.ts-b.ts);
}
// The 'automatic' policy chooses a CONTEXT specialist based on what is
// observed in the base. A manual selection only changes the specialist label;
// it does not introduce a veto or replace the authoritative base direction.
export function sharedMarketDirection({quoteHistory=[],price=null,quoteAt=null,now=Date.now(),
 durationMs=30000,requestedStrategy='automatic'}={}){
 const at=Number(quoteAt),spot=Number(price);
 if(!(at>0&&at<=now&&now-at<=2500&&spot>0))
  return {ready:false,side:null,reason:'unverified-current-quote'};
 const rows=knownQuotes(quoteHistory,at);
 if(!rows.length||rows.at(-1).ts!==at||rows.at(-1).price!==spot)
  return {ready:false,side:null,reason:'unverified-current-quote'};
 const q2=sampleAt(rows,at-2000),q4=sampleAt(rows,at-4000),
  q8=sampleAt(rows,at-8000),q16=sampleAt(rows,at-16000),
  q24=sampleAt(rows,at-24000);
 // This is a data requirement, not an artificial wait imposed after expiry.
 // Until enough prices have been seen, the existing algorithm remains
 // available to the research harness.
 if(!q2||!q4||!q8||!q16||!q24)
  return {ready:false,side:null,reason:'insufficient-observed-price-history'};
 const r2=safeLog(spot,q2.price),r4=safeLog(spot,q4.price),
  r8=safeLog(spot,q8.price),r16=safeLog(spot,q16.price),
  r24=safeLog(spot,q24.price);
 const older12=safeLog(q4.price,q16.price);
 const side2=signOf(r2),side4=signOf(r4),side8=signOf(r8),
  former=signOf(older12);
 // Scale by recently observed quote variation; no fabricated probability.
 const diffs=[];
 for(let i=1;i<rows.length;i++){
  const dt=(rows[i].ts-rows[i-1].ts)/1000;
  if(dt>0&&dt<=3&&rows[i].ts>=at-24000)
   diffs.push((safeLog(rows[i].price,rows[i-1].price)**2)/dt);
 }
 const noise=Math.sqrt(diffs.reduce((v,x)=>v+x,0)/Math.max(1,diffs.length))*2;
 // Initial reversal evidence: 2s and 4s agree in direction opposite the
 // preceding 12s, while the NEW 2s pace is no weaker than early 4s pace.
 const earlyTurn=Boolean(side2&&side2===side4&&former&&side2!==former&&
  Math.abs(r4)>noise*.22&&Math.abs(r2)>=Math.abs(r4-r2)*.70);
 // Momentum continuation starts prior to waiting for four completed bars.
 const established=Boolean(side2&&side2===side4&&side4===side8&&
  Math.abs(r4)>noise*.24);
 const direction=earlyTurn?side2:established?side4:null;
 const oldSpeed=Math.abs(older12)/12,latestSpeed=Math.abs(r2)/2;
 const decelerating=Boolean(direction&&!earlyTurn&&side4===side8&&
  oldSpeed>0&&latestSpeed<oldSpeed*.40);
 const phase=earlyTurn?'emerging-reversal':established?'developing-trend':'unresolved';
 const automaticContext=earlyTurn?'support_resistance':
   established?'trend':'price_action';
 const selectedStrategy=requestedStrategy==='automatic'?automaticContext:
  String(requestedStrategy||'automatic');
 return {ready:Boolean(direction),side:direction,phase,
  reason:earlyTurn?'early-directional-turn':established?'early-directional-continuation':'no-observed-direction-yet',
  observedAt:at,entryPrice:direction?spot:null,expirySeconds:Number(durationMs)/1000,
  selectedStrategy,contextMode:requestedStrategy==='automatic'?'adaptive':'manual',
  micro:{r2,r4,r8,r16,r24,older12,noise,decelerating,earlyTurn},
  signalOwner:'shared-market-base'};
}

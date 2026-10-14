// Align a READ-ONLY Continuous forecast to the option's actual fixed-clock
// Digital expiry when the selected broker expiration is observed and current.
// No order execution, change to broker selection or new UI controls.
export function selectedFixedBrokerExpiry({snap={},settings={},now=Date.now()}={}){
 const timing=snap.brokerTiming;
 const expiration=timing?.selectedExpiration;
 const captured=Number(timing?.capturedAt),expiresAt=Number(expiration?.expiresAt);
 const symbol=String(settings?.asset||'').trim().toUpperCase();
 const observedSymbol=String(timing?.symbol||'').trim().toUpperCase();
 // Do not borrow a time from another instrument, especially Digital vs OTC.
 if(observedSymbol&&symbol&&symbol!==observedSymbol)
  return {verified:false,reason:'different-asset',expiresAt:null};
 if(timing?.source!=='broker-visible-readonly'||timing?.instrumentKind!=='digital'||
    expiration?.kind!=='fixed-clock'||Number(expiration?.confidence)<.95)
  return {verified:false,reason:'no-fixed-digital-expiry',expiresAt:null};
 if(!Number.isFinite(captured)||captured<=0||now<captured||now-captured>7000)
  return {verified:false,reason:'stale-broker-expiry',expiresAt:null};
 const remaining=expiresAt-now;
 if(!Number.isFinite(remaining)||remaining<5000||remaining>3600000)
  return {verified:false,reason:'expiry-outside-supported-interval',expiresAt:null};
 return {verified:true,expiresAt,remainingSeconds:remaining/1000,
  source:'broker-visible-readonly',capturedAt:captured};
}
export function futurePriceExitSeconds({brokerExpiry=null,now=Date.now(),
 leadSeconds=0,holdingSeconds=60}={}){
 const lead=Number(leadSeconds),holding=Number(holdingSeconds);
 if(!(lead>=0&&holding>=5&&holding<=3600))return null;
 const fixed=brokerExpiry?.verified===true?Number(brokerExpiry.expiresAt):null;
 if(fixed!==null){
  const exitLead=(fixed-now)/1000;
  // A candidate entry at or after the expiry is impossible. Require enough
  // actual remaining time to permit a meaningful binary-option outcome.
  return Number.isFinite(exitLead)&&exitLead-lead>=5?exitLead:null;
 }
 return lead+holding;
}
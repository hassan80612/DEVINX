// A single, read-only presentation contract for the PC overlay.
// NEVER rewrites the analyst's window deadline, entry or option expiry.
const valid=x=>Number.isFinite(Number(x))&&Number(x)>0;
export function brokerClockView({timing=null,now=Date.now()}={}){
 const clock=timing?.brokerClock;
 const received=Number(clock?.capturedAt);
 const age=now-received;
 const ageLimit=clock?.source==='broker-protocol-timesync'?30000:7000;
 const verified=clock?.verified===true&&valid(received)&&age>=0&&age<=ageLimit;
 if(!verified)return {verified:false,kind:'unavailable',source:null,reason:'broker-time-not-fresh'};
 let timeSeconds=null,wallTimeMs=null;
 if(clock.source==='broker-protocol-timesync'&&valid(clock.brokerNowMs)){
  wallTimeMs=Number(clock.brokerNowMs)+age;
  const x=new Date(wallTimeMs);
  timeSeconds=x.getHours()*3600+x.getMinutes()*60+x.getSeconds();
 }else if(clock.source==='visible-broker-clock'&&
    Number.isFinite(Number(clock.clockSeconds))&&Number(clock.clockSeconds)>=0){
  timeSeconds=(Number(clock.clockSeconds)+Math.floor(age/1000))%86400;
 }else return {verified:false,kind:'unavailable',source:null,reason:'unsupported-broker-clock'};
 // A broker purchase cutoff is a DIFFERENT event from the option expiry
 // and from the Sentinel's own opportunity window.
 const observedAt=Number(timing?.capturedAt);
 const deadline=Number(timing?.purchaseWindow?.closesAt);
 const observationAge=now-observedAt;
 const purchaseVerified=timing?.source==='broker-visible-readonly'&&
  valid(observedAt)&&observationAge>=0&&observationAge<=4500&&
  valid(deadline)&&deadline>now&&deadline-now<=360000;
 return {verified:true,source:clock.source,
  kind:purchaseVerified?'purchase':'time',
  timeSeconds,wallTimeMs,
  purchaseEndsAt:purchaseVerified?deadline:null,
  capturedAt:now,clockCapturedAt:received,
  forecastWindowIndependent:true};
}
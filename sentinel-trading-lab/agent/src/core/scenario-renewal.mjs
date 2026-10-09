// Re-arm an expired forecast only when a NEW completed price source and a
// materially changed structural level support another qualified scenario.
// The independent entry analyst is unaffected by this display lifecycle.
export function canRenewExpiredScenario({main,plan,inputQuality,quoteTs,qualified}={}){
  if(main?.status!=='JANELA ENCERRADA'||qualified!==true||!plan)return false;
  const quote=Number(quoteTs),deadline=Number(main.deadline);
  if(!Number.isFinite(quote)||!Number.isFinite(deadline)||quote<=deadline)return false;
  const structuralSource=Number(plan.entryTiming?.sourceBarAt||0);
  // Some valid forecasts are computed from completed 1m history without a
  // recent 5s setup bar. Using only sourceBarAt could lock them forever.
  const verifiedSource=inputQuality?.ready===true?Number(inputQuality.latestTo||0):0;
  const sourceAt=Math.max(structuralSource,verifiedSource);
  if(!Number.isFinite(sourceAt)||sourceAt<=deadline||sourceAt>quote)return false;
  const price=Number(plan.currentPrice);
  const tolerance=Math.max(Math.abs(Number.isFinite(price)?price:0)*.000002,1e-9);
  const side=String(plan.rawBias||plan.bias||main.side);
  if(!['CALL','PUT'].includes(side))return false;
  const trigger=Number(side==='CALL'?plan.callTrigger:plan.putTrigger);
  const previousTrigger=Number(main.trigger);
  const changedTrigger=Number.isFinite(trigger)&&Number.isFinite(previousTrigger)&&Math.abs(trigger-previousTrigger)>tolerance;
  const nextInvalidation=side==='CALL'?plan.callInvalidation:plan.putInvalidation;
  const originalInvalidation=main.invalidation;
  const changedInvalidation=nextInvalidation!=null&&originalInvalidation!=null&&Number.isFinite(Number(nextInvalidation))&&Number.isFinite(Number(originalInvalidation))&&Math.abs(Number(nextInvalidation)-Number(originalInvalidation))>tolerance;
  return changedTrigger||changedInvalidation;
}
